// OpenAI-compatible chat completions, proxied to an OpenAI-compatible upstream (OpenRouter by default)
// and billed on the token usage the upstream reports.
import { fail, json, newId, nowIso, toMicros, MICRO } from "./util.js";
import { chatModel } from "./catalog.js";
import { keySpentToday } from "./tasks.js";

const MIN_BALANCE = toMicros(0.05);
const PER_MINUTE = 60;

function costOf(model, usage) {
  const inTok = Number(usage?.prompt_tokens) || 0, outTok = Number(usage?.completion_tokens) || 0;
  return Math.ceil((inTok * model.input + outTok * model.output) * MICRO / 1e6);
}

async function charge(env, { id, user, keyId, model, usage, status, error }) {
  const cost = status === "succeeded" ? costOf(model, usage) : 0;
  const stmts = [env.DB.prepare("INSERT INTO tasks (id, user_id, key_id, model, kind, status, cost, usage_json, error, finished_at) VALUES (?, ?, ?, ?, 'chat', ?, ?, ?, ?, ?)")
    .bind(id, user.id, keyId, model.id, status, cost, usage ? JSON.stringify(usage) : null, error || null, nowIso())];
  if (cost > 0) stmts.push(
    env.DB.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").bind(cost, user.id),
    env.DB.prepare("INSERT INTO ledger (user_id, amount, kind, ref) VALUES (?, ?, 'charge', ?)").bind(user.id, -cost, "chat:" + id));
  await env.DB.batch(stmts);
}

export async function chatCompletions(env, ctx, { user, keyId, body }) {
  const model = chatModel(body.model);
  if (!model) fail(404, "model_not_found", `Unknown chat model '${String(body.model ?? "")}'. See GET /v1/models.`);
  if (!Array.isArray(body.messages) || !body.messages.length) fail(422, "invalid_input", "messages must be a non-empty array.");
  if (!env.CHAT_UPSTREAM_KEY) fail(503, "upstream_error", "Chat models are not available yet. Media models work now.");
  if (user.balance < MIN_BALANCE) fail(402, "insufficient_credits", "Chat requests need at least $0.05 of credit. Top up in the dashboard.");
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND kind = 'chat' AND created_at > ?").bind(user.id, nowIso(-6e4)).first();
  if (recent.n >= PER_MINUTE) fail(429, "rate_limited", `Chat is limited to ${PER_MINUTE} requests per minute.`, { "retry-after": "20" });
  if (keyId) {
    const key = await env.DB.prepare("SELECT daily_cap FROM api_keys WHERE id = ?").bind(keyId).first();
    if ((await keySpentToday(env, keyId)) >= key.daily_cap) fail(402, "spend_cap_reached", "This key has reached its daily spend cap.");
  }

  const id = newId("chat");
  const stream = body.stream === true;
  const upstreamBody = { ...body, model: model.upstream };
  if (stream) upstreamBody.stream_options = { ...(body.stream_options || {}), include_usage: true };
  let res;
  try {
    res = await fetch(`${env.CHAT_UPSTREAM_BASE || "https://openrouter.ai/api/v1"}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.CHAT_UPSTREAM_KEY}`, "x-title": "EasyToken", "http-referer": "https://easytoken.si" },
      body: JSON.stringify(upstreamBody),
    });
  } catch { fail(502, "upstream_error", "The model provider is unreachable. Safe to retry; you were not charged."); }

  if (!res.ok) {
    let msg = ""; try { msg = (await res.json())?.error?.message || ""; } catch {}
    ctx.waitUntil(charge(env, { id, user, keyId, model, status: "failed", error: `upstream ${res.status}: ${msg}`.slice(0, 300) }));
    if (res.status === 400 || res.status === 422) fail(422, "invalid_input", msg || "The provider rejected the request.");
    if (res.status === 429) fail(429, "rate_limited", "The provider is busy. Retry shortly.", { "retry-after": "5" });
    fail(502, "upstream_error", "The model provider returned an error. Safe to retry; you were not charged.");
  }

  if (!stream) {
    const data = await res.json();
    data.model = model.id; data.id = id;
    ctx.waitUntil(charge(env, { id, user, keyId, model, usage: data.usage, status: "succeeded" }));
    return json(data);
  }

  // Stream through unchanged except the model name, while reading the final usage chunk for billing.
  const { readable, writable } = new TransformStream();
  ctx.waitUntil((async () => {
    const reader = res.body.getReader(), writer = writable.getWriter();
    const dec = new TextDecoder(), enc = new TextEncoder();
    let buf = "", usage = null;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          let out = line;
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try { const c = JSON.parse(line.slice(6)); if (c.usage) usage = c.usage; c.model = model.id; c.id = id; out = "data: " + JSON.stringify(c); } catch {}
          }
          await writer.write(enc.encode(out + "\n"));
        }
      }
      if (buf) await writer.write(enc.encode(buf));
    } catch (e) { console.error("stream", id, e?.message); }
    finally { try { await writer.close(); } catch {} }
    await charge(env, { id, user, keyId, model, usage, status: usage ? "succeeded" : "failed", error: usage ? null : "stream ended without usage" });
  })());
  return new Response(readable, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } });
}
