// Media tasks: reserve credits, submit to kie.ai, track status, refund failures, deliver webhooks.
import { fail, json, newId, nowIso, hmac, safeEqual, toUsd, safeCallbackUrl, sha256, canonicalJson, parseUsd } from "./util.js";
import { mediaModel, quote, MAX_RUNNING_PER_MODEL } from "./catalog.js";
import { submitUpstream, pollUpstream } from "./kie.js";

const OPEN = ["queued", "running"];
const TASK_TIMEOUT_MS = 2 * 3600e3;
const CALLBACK_BACKOFF_S = [10, 60, 300, 1800, 7200];

export function startOfUtcDay() { return new Date().toISOString().slice(0, 10) + "T00:00:00Z"; }

// Spend charged to a key today, net of refunds (failed tasks carry cost 0 after refund).
export async function keySpentToday(env, keyId) {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(cost), 0) AS s FROM tasks WHERE key_id = ? AND created_at >= ? AND status != 'failed'").bind(keyId, startOfUtcDay()).first();
  return r.s;
}

// Atomically take `amount` from the balance. Returns false when the balance is too low.
export async function debit(env, userId, amount, ref) {
  const r = await env.DB.prepare("UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?").bind(amount, userId, amount).run();
  if (!r.meta.changes) return false;
  await env.DB.prepare("INSERT INTO ledger (user_id, amount, kind, ref) VALUES (?, ?, 'charge', ?)").bind(userId, -amount, ref).run();
  return true;
}

export function publicTask(t) {
  const out = { id: t.id, object: "task", model: t.model, status: t.status, cost_usd: toUsd(t.cost), created_at: t.created_at };
  if (t.finished_at) out.finished_at = t.finished_at;
  if (t.result_json) out.result = JSON.parse(t.result_json);
  if (t.error) out.error = { message: t.error, ...(t.submit_error_code ? { code: t.submit_error_code } : {}) };
  if (t.metadata_json) out.metadata = JSON.parse(t.metadata_json);
  return out;
}

function replay(existing, hash) {
  if (existing.request_hash !== hash) fail(409, "idempotency_conflict", "Idempotency-Key was used for a different request.");
  return { ...existing, replayed: true };
}

export async function createTask(env, ctx, { user, keyId, body, origin, idempotencyKey = null }) {
  const model = mediaModel(body.model);
  if (!model) fail(404, "model_not_found", `Unknown model '${String(body.model ?? "")}'. See GET /v1/models.`);
  const input = body.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) fail(422, "invalid_input", "input must be an object, e.g. { \"prompt\": \"…\" }.");
  const callbackUrl = safeCallbackUrl(body.callback_url);
  let metadata = null;
  if (body.metadata != null) {
    metadata = JSON.stringify(body.metadata);
    if (typeof body.metadata !== "object" || metadata.length > 4096) fail(422, "invalid_input", "metadata must be an object under 4 KB.");
  }
  const id = newId("task");
  const { up, micros: cost } = quote(model, input); // throws 422 on bad input; price depends on resolution, duration, etc.
  const upstream = up(`${origin}/api/upstream/kie?task=${id}&sig=${await hmac(env.INTERNAL_SECRET, id)}`);

  let idemHash = null, requestHash = null;
  if (idempotencyKey != null) {
    if (!keyId) fail(422, "invalid_input", "Idempotency-Key requires an API key.");
    if (typeof idempotencyKey !== "string" || !/^[\x20-\x7e]{1,128}$/.test(idempotencyKey)) fail(422, "invalid_input", "Idempotency-Key must be 1–128 printable ASCII characters.");
    idemHash = await sha256(`POST /v1/tasks\n${idempotencyKey}`);
    requestHash = await sha256(canonicalJson(body));
    const existing = await env.DB.prepare("SELECT * FROM tasks WHERE key_id = ? AND idempotency_hash = ?").bind(keyId, idemHash).first();
    if (existing) return replay(existing, requestHash);
  }
  const ceiling = body.max_cost_usd == null ? null : parseUsd(body.max_cost_usd);
  if (ceiling !== null && cost > ceiling) fail(402, "budget_exceeded", "Quoted cost exceeds the requested maximum.");
  try {
    await env.DB.prepare("INSERT INTO tasks (id, user_id, key_id, model, kind, status, cost, quoted_cost, input_json, metadata_json, callback_url, polled_at, idempotency_hash, request_hash) VALUES (?, ?, ?, ?, 'media', 'queued', ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, user.id, keyId, model.id, cost, cost, JSON.stringify(input), metadata, callbackUrl, nowIso(), idemHash, requestHash).run();
  } catch (e) {
    if (idemHash) {
      const existing = await env.DB.prepare("SELECT * FROM tasks WHERE key_id = ? AND idempotency_hash = ?").bind(keyId, idemHash).first();
      if (existing) return replay(existing, requestHash);
    }
    const message = String(e?.message || "");
    if (message.includes("budget_exceeded")) fail(402, "budget_exceeded", "Key budget exceeded.");
    if (message.includes("insufficient_balance")) fail(402, "insufficient_balance", "Insufficient balance.");
    if (message.includes("rate_limited")) fail(429, "rate_limited", "Concurrent task limit reached.", { "retry-after": "15" });
    if (message.includes("key_revoked")) fail(401, "invalid_api_key", "This key has been revoked.");
    throw e;
  }

  let res;
  try { res = await submitUpstream(env, upstream); }
  catch { res = { uncertain: true }; }
  // An ambiguous create may already be running at Kie. Never submit it a second time.
  if (res.uncertain) return { ...(await getTaskRow(env, id)), reserved: true, submitTimeout: true };
  if (!res.ok) {
    const code = res.clientError ? "invalid_input" : "upstream_error";
    await finishTask(env, ctx, id, { status: "failed", error: res.message || "The provider rejected the task.", submitErrorCode: code });
    fail(res.clientError ? 422 : 502, code, "The provider rejected the task. You were not charged.");
  }
  await env.DB.prepare("UPDATE tasks SET upstream_id = ?, status = 'running' WHERE id = ? AND status = 'queued'").bind(res.upstreamId, id).run();
  return { ...(await getTaskRow(env, id)), reserved: true };
}

export async function getTaskRow(env, id, userId) {
  const t = await env.DB.prepare(userId ? "SELECT * FROM tasks WHERE id = ? AND user_id = ?" : "SELECT * FROM tasks WHERE id = ?").bind(...(userId ? [id, userId] : [id])).first();
  return t;
}

// Fetch the upstream state for an open task and apply it. Safe to call concurrently.
export async function refreshTask(env, ctx, t) {
  if (!OPEN.includes(t.status) || !t.upstream_id) return t;
  await env.DB.prepare("UPDATE tasks SET polled_at = ? WHERE id = ?").bind(nowIso(), t.id).run();
  const model = mediaModel(t.model);
  let state;
  try { state = await pollUpstream(env, model, t.upstream_id); }
  catch (e) { console.error("poll failed", t.id, e?.message); return t; }
  if (state.status === "succeeded") await finishTask(env, ctx, t.id, { status: "succeeded", result: state.result });
  else if (state.status === "failed") await finishTask(env, ctx, t.id, { status: "failed", error: state.error || "Generation failed." });
  else if (Date.now() - Date.parse(t.created_at) > TASK_TIMEOUT_MS) await finishTask(env, ctx, t.id, { status: "failed", error: "Timed out after 2 hours." });
  return getTaskRow(env, t.id);
}

// Move an open task to a final state exactly once. Failed tasks are refunded in full.
export async function finishTask(env, ctx, id, { status, result, error, submitErrorCode = null }) {
  const t = await getTaskRow(env, id);
  if (!t || !OPEN.includes(t.status)) return;
  const r = await env.DB.prepare("UPDATE tasks SET status = ?, cost = CASE WHEN ? = 'failed' THEN 0 ELSE cost END, result_json = ?, error = ?, submit_error_code = ?, finished_at = ?, callback_due_at = ? WHERE id = ? AND status IN ('queued','running')")
    .bind(status, status, result ? JSON.stringify(result) : null, error ? String(error).slice(0, 500) : null, submitErrorCode, nowIso(), t.callback_url ? nowIso() : null, id).run();
  if (!r.meta.changes) return;
  if (t.callback_url) ctx.waitUntil(deliverCallback(env, id));
}

// POST the finished task to the customer's callback_url, signed with their webhook secret.
export async function deliverCallback(env, id) {
  const t = await getTaskRow(env, id);
  if (!t?.callback_url || !t.callback_due_at) return;
  const u = await env.DB.prepare("SELECT webhook_secret FROM users WHERE id = ?").bind(t.user_id).first();
  const body = JSON.stringify(publicTask(t));
  let ok = false;
  try {
    const r = await fetch(t.callback_url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "EasyToken-Webhooks/1", "x-easytoken-signature": await hmac(u.webhook_secret, body) }, body, signal: AbortSignal.timeout(10000) });
    ok = r.ok;
  } catch {}
  const attempts = t.callback_attempts + 1;
  const next = ok || attempts > CALLBACK_BACKOFF_S.length ? null : nowIso(CALLBACK_BACKOFF_S[attempts - 1] * 1000);
  await env.DB.prepare("UPDATE tasks SET callback_attempts = ?, callback_due_at = ? WHERE id = ?").bind(attempts, next, id).run();
}

// kie.ai calls this when a task changes. We never trust the body: re-read the task from kie instead.
export async function upstreamCallback(request, env, ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("task") || "";
  const sig = url.searchParams.get("sig") || "";
  if (!id || !safeEqual(sig, await hmac(env.INTERNAL_SECRET, id))) return json({ ok: false }, 403);
  const t = await getTaskRow(env, id);
  if (t) await refreshTask(env, ctx, t);
  return json({ ok: true });
}

// Cron: poll stale open tasks, then retry due webhooks.
export async function sweep(env, ctx) {
  const { results: open } = await env.DB.prepare("SELECT * FROM tasks WHERE status IN ('queued','running') AND (polled_at IS NULL OR polled_at < ?) ORDER BY polled_at LIMIT 40").bind(nowIso(-30e3)).all();
  for (const t of open) {
    if (!t.upstream_id && Date.now() - Date.parse(t.created_at) > 10 * 6e4) await finishTask(env, ctx, t.id, { status: "failed", error: "The provider never accepted the task." });
    else await refreshTask(env, ctx, t);
  }
  const { results: due } = await env.DB.prepare("SELECT id FROM tasks WHERE callback_due_at IS NOT NULL AND callback_due_at <= ? LIMIT 40").bind(nowIso()).all();
  await Promise.all(due.map(d => deliverCallback(env, d.id)));
}
