// OpenAI-compatible chat completions on kie.ai, billed on the token usage kie reports (worker/kie-chat.js translates
// the request and the reply, including streams). Upstream errors and replies without usage are never charged.
import { fail, json, newId, nowIso, toMicros } from "./util.js";
import { chatModel } from "./catalog.js";
import { keySpentToday } from "./tasks.js";
import { KIE_CHAT_BASE, toUpstream, fromResponse, streamState, costOf, openaiUsage, errorOf } from "./kie-chat.js";

const MIN_BALANCE = toMicros(0.05);
const PER_MINUTE = 60;

// Stored with the task: kie's raw usage and the credits kie says it consumed, so charges can be audited against kie.
async function charge(env, { id, user, keyId, model, usage, billed, credits, status, error }) {
  const cost = status === "succeeded" ? costOf(model, billed || usage) : 0;
  const stmts = [env.DB.prepare("INSERT INTO tasks (id, user_id, key_id, model, kind, status, cost, usage_json, error, finished_at) VALUES (?, ?, ?, ?, 'chat', ?, ?, ?, ?, ?)")
    .bind(id, user.id, keyId, model.id, status, cost, usage ? JSON.stringify({ kie: usage, ...(billed ? { billed } : {}), kie_credits: credits ?? null }) : null, error || null, nowIso())];
  if (cost > 0) stmts.push(
    env.DB.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").bind(cost, user.id),
    env.DB.prepare("INSERT INTO ledger (user_id, amount, kind, ref) VALUES (?, ?, 'charge', ?)").bind(user.id, -cost, "chat:" + id));
  await env.DB.batch(stmts);
}

function upstreamFail(status, msg) {
  if (status === 400 || status === 422) fail(422, "invalid_input", msg || "The provider rejected the request.");
  if (status === 429) fail(429, "rate_limited", "The provider is busy. Retry shortly.", { "retry-after": "5" });
  fail(502, "upstream_error", "The model provider returned an error. Safe to retry; you were not charged.");
}

export async function chatCompletions(env, ctx, { user, keyId, body }) {
  const model = chatModel(body.model);
  if (!model) fail(404, "model_not_found", `Unknown chat model '${String(body.model ?? "")}'. See GET /v1/models.`);
  if (!Array.isArray(body.messages) || !body.messages.length) fail(422, "invalid_input", "messages must be a non-empty array.");
  if (!env.KIE_API_KEY) fail(503, "upstream_error", "Chat models are not available yet. Media models work now.");
  const upstreamBody = toUpstream(model, body);
  if (user.balance < MIN_BALANCE) fail(402, "insufficient_credits", "Chat requests need at least $0.05 of credit. Top up in the dashboard.");
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND kind = 'chat' AND created_at > ?").bind(user.id, nowIso(-6e4)).first();
  if (recent.n >= PER_MINUTE) fail(429, "rate_limited", `Chat is limited to ${PER_MINUTE} requests per minute.`, { "retry-after": "20" });
  if (keyId) {
    const key = await env.DB.prepare("SELECT daily_cap FROM api_keys WHERE id = ?").bind(keyId).first();
    if ((await keySpentToday(env, keyId)) >= key.daily_cap) fail(402, "spend_cap_reached", "This key has reached its daily spend cap.");
  }

  const id = newId("chat"), created = Math.floor(Date.now() / 1000);
  const stream = upstreamBody.stream;
  let res;
  try {
    res = await fetch(KIE_CHAT_BASE + model.path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.KIE_API_KEY}` },
      body: JSON.stringify(upstreamBody),
    });
  } catch { fail(502, "upstream_error", "The model provider is unreachable. Safe to retry; you were not charged."); }

  const failed = (status, msg) => {
    console.error("kie chat", model.id, status, msg);
    ctx.waitUntil(charge(env, { id, user, keyId, model, status: "failed", error: `upstream ${status}: ${msg}`.slice(0, 300) }));
    upstreamFail(status, msg);
  };
  // kie reports some errors as HTTP 200 with a JSON { code, msg } body, also when a stream was requested.
  const isJson = (res.headers.get("content-type") || "").includes("json");
  if (!res.ok || (stream && isJson)) {
    let d = null; try { d = await res.json(); } catch {}
    failed(res.ok ? Number(d?.code) || 502 : res.status, errorOf(d));
  }

  if (!stream) {
    let d = null; try { d = await res.json(); } catch {}
    const r = fromResponse(model, d);
    if (r.error) failed(Number(d?.code) || 502, r.error);
    ctx.waitUntil(charge(env, { id, user, keyId, model, usage: r.usage, credits: r.credits, status: "succeeded" }));
    return json({ id, object: "chat.completion", created, model: model.id,
      choices: [{ index: 0, message: r.message, finish_reason: r.finish }], usage: openaiUsage(model, r.usage) });
  }

  // Translate kie's stream to OpenAI chunks. If the client goes away we keep reading so the usage kie bills is still billed.
  const includeUsage = body.stream_options?.include_usage === true;
  const chunk = (delta, finish_reason = null) => ({ id, object: "chat.completion.chunk", created, model: model.id, choices: [{ index: 0, delta, finish_reason }] });
  const { readable, writable } = new TransformStream();
  ctx.waitUntil((async () => {
    const reader = res.body.getReader(), writer = writable.getWriter();
    const dec = new TextDecoder(), enc = new TextEncoder(), st = streamState(model);
    let buf = "", open = true;
    const send = async obj => { if (!open) return; try { await writer.write(enc.encode(typeof obj === "string" ? obj : `data: ${JSON.stringify(obj)}\n\n`)); } catch { open = false; } };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          let d; try { d = JSON.parse(line.slice(5).trim()); } catch { continue; }
          for (const o of st.event(d)) await send(o.finish ? chunk({}, o.finish) : chunk(o.delta));
        }
      }
    } catch (e) { st.error ||= e?.message || "stream read failed"; }
    if (st.usage && includeUsage) await send({ id, object: "chat.completion.chunk", created, model: model.id, choices: [], usage: openaiUsage(model, st.usage) });
    if (!st.usage) await send({ error: { code: "upstream_error", message: "The model provider stopped before finishing. You were not charged." } });
    await send("data: [DONE]\n\n");
    try { await writer.close(); } catch {}
    if (st.error) console.error("kie chat stream", id, st.error);
    await charge(env, { id, user, keyId, model, usage: st.usage, billed: st.billed, credits: st.credits, status: st.usage ? "succeeded" : "failed",
      error: st.usage ? null : (st.error || "stream ended without usage").slice(0, 300) });
  })());
  return new Response(readable, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } });
}
