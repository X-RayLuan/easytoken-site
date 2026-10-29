// End-to-end media task flow against an in-memory D1 (node:sqlite) and a mocked kie.ai — no real upstream calls, nothing is billed.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createTask, refreshTask, getTaskRow } from "../worker/tasks.js";
import worker from "../worker/index.js";

// Minimal D1 binding: prepare().bind().first()/run()/all() and batch().
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../migrations/0002_agent_budget_idempotency.sql", import.meta.url), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { prepare: sql => stmt(sql), batch: async list => Promise.all(list.map(s => s.run())), raw: db };
}

let env, ctx, calls, kieReply, realFetch;
beforeEach(async () => {
  env = { DB: d1(), KIE_API_KEY: "test-key", INTERNAL_SECRET: "test-secret" };
  ctx = { waitUntil() {} };
  calls = [];
  kieReply = () => ({ code: 200, data: { taskId: "kie_1" } });
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(kieReply(String(url))), { headers: { "content-type": "application/json" } });
  };
  await env.DB.prepare("INSERT INTO users (id, email, pw_hash, balance, webhook_secret) VALUES ('u1', 'a@b.c', 'x', 10000000, 'whsec')").run();
});
afterEach(() => { globalThis.fetch = realFetch; });

const user = async () => env.DB.prepare("SELECT * FROM users WHERE id = 'u1'").first();
const run = async (model, input) => createTask(env, ctx, { user: await user(), keyId: null, body: { model, input }, origin: "https://easytoken.si" });

test("charges kie price × 1.15 for the requested options and sends them upstream", async () => {
  const t = await run("seedance-2.5", { prompt: "a boat", resolution: "1080p", duration: 8 });
  assert.equal(t.status, "running");
  assert.equal(t.cost, 908500 * 8);
  assert.equal((await user()).balance, 10000000 - 908500 * 8);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.kie.ai/api/v1/jobs/createTask");
  assert.equal(calls[0].body.model, "bytedance/seedance-2-5");
  assert.deepEqual({ resolution: calls[0].body.input.resolution, duration: calls[0].body.input.duration }, { resolution: "1080p", duration: 8 });
  assert.match(calls[0].body.callBackUrl, /^https:\/\/easytoken\.si\/api\/upstream\/kie\?task=task_/);
  const ledger = await env.DB.prepare("SELECT amount, kind FROM ledger WHERE user_id = 'u1'").all();
  assert.deepEqual(ledger.results.map(r => ({ ...r })), [{ amount: -908500 * 8, kind: "charge" }]);
});

test("image-to-video switches the upstream model and adds input-image charges", async () => {
  const t = await run("minimax-h3", { prompt: "dance", duration: 5, resolution: "2k", image_urls: ["https://a.test/1.png"] });
  assert.equal(calls[0].body.model, "minimax-h3/image-to-video");
  assert.equal(calls[0].body.input.first_frame_url, "https://a.test/1.png");
  assert.equal(calls[0].body.input.resolution, "2K");
  assert.equal(t.cost, 74750 * 5 + 23000);
});

test("bad input is rejected before anything is charged or sent", async () => {
  await assert.rejects(run("kling-3.0", { prompt: "x", mode: "8K" }), e => e.status === 422);
  assert.equal(calls.length, 0);
  assert.equal((await user()).balance, 10000000);
});

test("grok imagine 1080p with several images and unpriced wan 2.6 combos are refused before any charge", async () => {
  await assert.rejects(run("grok-imagine-video", { prompt: "x", resolution: "1080p", image_urls: ["https://a.test/1.png", "https://a.test/2.png"] }), e => e.status === 422);
  await assert.rejects(run("wan-2.6", { prompt: "xx", image_urls: ["https://a.test/1.png", "https://a.test/2.png"] }), e => e.status === 422);
  await assert.rejects(run("veo-3.1", { prompt: "x", duration: 6 }), e => e.status === 422);
  assert.equal(calls.length, 0);
  assert.equal((await user()).balance, 10000000);
  const res = await worker.fetch(new Request("https://api.easytoken.si/v1/quote", { method: "POST", body: JSON.stringify({ model: "grok-imagine-video", input: { resolution: "1080p", image_urls: ["https://a.test/1.png", "https://a.test/2.png"] } }) }), env, ctx);
  assert.equal(res.status, 422);
});

test("wan 2.6 image-to-video charges the image-to-video price", async () => {
  const t = await run("wan-2.6", { prompt: "xx", resolution: "720p", duration: 15, image_urls: ["https://a.test/1.png"] });
  assert.equal(calls[0].body.model, "wan/2-6-image-to-video");
  assert.deepEqual(calls[0].body.input.image_urls, ["https://a.test/1.png"]);
  assert.equal(t.cost, 1207500);
});

test("insufficient balance is refused with the exact price", async () => {
  await env.DB.prepare("UPDATE users SET balance = 1000 WHERE id = 'u1'").run();
  await assert.rejects(run("veo-3.1", { prompt: "x", mode: "fast", resolution: "4k" }), e => e.status === 402 && e.code === "insufficient_balance");
  assert.equal(calls.length, 0);
});

test("a task kie rejects is refunded in full", async () => {
  kieReply = () => ({ code: 422, msg: "bad prompt" });
  await assert.rejects(run("gpt-image-2", { prompt: "x", resolution: "4K" }), e => e.status === 422);
  assert.equal((await user()).balance, 10000000);
  const t = await env.DB.prepare("SELECT status, cost FROM tasks").first();
  assert.deepEqual({ ...t }, { status: "failed", cost: 0 });
});

test("a task that fails upstream later is refunded; a success keeps the charge", async () => {
  const ok = await run("nano-banana-2", { prompt: "x", resolution: "4K" });
  const bad = await run("nano-banana-2", { prompt: "y", resolution: "2K" });
  assert.equal((await user()).balance, 10000000 - 103500 - 69000);
  kieReply = url => url.includes("recordInfo") ? { code: 200, data: { state: "success", resultJson: JSON.stringify({ resultUrls: ["https://cdn.test/o.png"] }) } } : {};
  await refreshTask(env, ctx, ok);
  kieReply = url => url.includes("recordInfo") ? { code: 200, data: { state: "fail", failMsg: "nsfw" } } : {};
  await refreshTask(env, ctx, bad);
  assert.equal((await getTaskRow(env, ok.id)).status, "succeeded");
  assert.equal((await getTaskRow(env, bad.id)).status, "failed");
  assert.equal((await user()).balance, 10000000 - 103500);
});

test("POST /v1/quote prices a task without a key, a charge or an upstream call", async () => {
  const res = await worker.fetch(new Request("https://api.easytoken.si/v1/quote", { method: "POST", body: JSON.stringify({ model: "kling-3.0", input: { prompt: "x", mode: "pro", sound: true, duration: 10 } }) }), env, ctx);
  const q = await res.json();
  assert.equal(res.status, 200);
  assert.equal(q.cost_usd, 0.15525 * 10);
  assert.deepEqual(q.lines, [{ option: "pro-audio", quantity: 10, per: "second", usd: 0.15525 }]);
  assert.equal(calls.length, 0);
});

test("GET /v1/models lists every option with its sale price", async () => {
  const res = await worker.fetch(new Request("https://api.easytoken.si/v1/models"), env, ctx);
  const veo = (await res.json()).data.find(m => m.id === "veo-3.1");
  assert.deepEqual(veo.pricing.find(p => p.option === "quality-4k"), { option: "quality-4k", usd: 2.1275, per: "video (8s)" });
  assert.ok(!JSON.stringify(veo).includes("kie"), "kie cost is not exposed");
});

// Budget and reservation tests exercise SQLite triggers against the same migration shipped to D1.
const key = async (id, cap = 10000000, spend = null, max = null) => {
  await env.DB.prepare("INSERT INTO api_keys (id,user_id,name,key_hash,prefix,last4,daily_cap,spend_cap,max_cost) VALUES (?, 'u1', 'agent', ?, 'et_live_', 'abcd', ?, ?, ?)")
    .bind(id, id + '-hash', cap, spend, max).run();
};
const keyed = async (id, prompt = 'x', token = null) => createTask(env, ctx, {
  user: await user(), keyId: id, body: { model: 'veo-3.1', input: { prompt, mode: 'fast', resolution: '720p' } },
  origin: 'https://easytoken.si', idempotencyKey: token,
});
test('simultaneous budget reservations cannot exceed the cap and denied request never reaches Kie', async () => {
  await key('k1', 345000);
  const settled = await Promise.allSettled([keyed('k1'), keyed('k1', 'y')]);
  assert.equal(settled.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(settled.find(r => r.status === 'rejected').reason.code, 'budget_exceeded');
  assert.equal(calls.length, 1);
  assert.equal((await user()).balance, 9655000);
});
test('keys share account balance and revocation is enforced during reservation', async () => {
  await key('k1'); await key('k2');
  await env.DB.prepare("UPDATE users SET balance = 345000 WHERE id = 'u1'").run();
  const outcomes = await Promise.allSettled([keyed('k1'), keyed('k2')]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(r => r.status === 'rejected').reason.code, 'insufficient_balance');
  assert.equal(calls.length, 1);
  await env.DB.prepare("UPDATE api_keys SET revoked_at = '2026-01-01' WHERE id = 'k1'").run();
  await assert.rejects(keyed('k1'), e => e.code === 'invalid_api_key');
});
test('refund releases lifetime and daily budget exactly once', async () => {
  await key('k1', 345000, 345000, 345000);
  const t = await keyed('k1');
  const { finishTask } = await import('../worker/tasks.js');
  await Promise.all([finishTask(env, ctx, t.id, { status: 'failed', error: 'failed' }), finishTask(env, ctx, t.id, { status: 'failed', error: 'again' })]);
  assert.equal((await user()).balance, 10000000);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'refund'").first()).n, 1);
  await keyed('k1', 'second');
  assert.equal(calls.length, 2);
});
test('idempotency is isolated per key, conflict rejects changed body, timeout never resubmits', async () => {
  await key('k1'); await key('k2');
  const first = await keyed('k1', 'x', 'same');
  const replay = await keyed('k1', 'x', 'same');
  assert.equal(replay.id, first.id);
  assert.equal(replay.replayed, true);
  await assert.rejects(keyed('k1', 'different', 'same'), e => e.code === 'idempotency_conflict');
  const other = await keyed('k2', 'x', 'same');
  assert.notEqual(other.id, first.id);
  assert.equal(calls.length, 2);
  globalThis.fetch = async () => { calls.push({ timeout: true }); throw new Error('timeout'); };
  const uncertain = await keyed('k1', 'timeout', 'new');
  assert.equal(uncertain.status, 'queued');
  assert.equal(uncertain.submitTimeout, true);
  const again = await keyed('k1', 'timeout', 'new');
  assert.equal(again.id, uncertain.id);
  assert.equal(calls.length, 3);
});
test('constraint abort rolls back task and debit if ledger ref conflicts', async () => {
  await env.DB.prepare("INSERT INTO ledger(user_id,amount,kind,ref) VALUES ('u1',0,'adjust','task:fixed')").run();
  await assert.rejects(env.DB.prepare("INSERT INTO tasks(id,user_id,model,kind,status,cost) VALUES ('fixed','u1','veo-3.1','media','queued',345000)").run());
  assert.equal((await user()).balance, 10000000);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks").first()).n, 0);
});
test('headers, fresh balance, CORS, replay and error envelopes on both hosts', async () => {
  const { sha256 } = await import('../worker/util.js');
  const secret = 'et_live_' + 'x'.repeat(32);
  await env.DB.prepare("INSERT INTO api_keys(id,user_id,name,key_hash,prefix,last4,daily_cap) VALUES ('k1','u1','agent',?,'et_live_','xxxx',10000000)").bind(await sha256(secret)).run();
  const req = (host, extra = {}) => new Request(`https://${host}/v1/tasks`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'idempotency-key': 'a', ...extra }, body: JSON.stringify({ model: 'veo-3.1', input: { prompt: 'x', mode: 'fast', resolution: '720p' } }) });
  const created = await worker.fetch(req('api.easytoken.si'), env, ctx);
  assert.equal(created.status, 202);
  assert.equal(created.headers.get('x-easytoken-cost'), '0.345000');
  assert.equal(created.headers.get('x-easytoken-balance'), '9.655000');
  assert.match(created.headers.get('access-control-expose-headers'), /X-EasyToken-Balance/);
  const replay = await worker.fetch(req('easytoken.si'), env, ctx);
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('idempotency-replayed'), 'true');
  assert.equal(replay.headers.get('x-easytoken-cost'), '0.000000');
  const invalid = await worker.fetch(new Request('https://api.easytoken.si/v1/tasks', { headers: { authorization: 'Bearer wrong' } }), env, ctx);
  assert.equal(invalid.headers.get('x-easytoken-balance'), 'unknown');
  assert.equal((await invalid.json()).error.param, null);
  const options = await worker.fetch(new Request('https://api.easytoken.si/v1/tasks', { method: 'OPTIONS' }), env, ctx);
  assert.equal(options.headers.get('x-easytoken-cost'), '0.000000');
});
