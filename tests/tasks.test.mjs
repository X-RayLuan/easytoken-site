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

test("insufficient balance is refused with the exact price", async () => {
  await env.DB.prepare("UPDATE users SET balance = 1000 WHERE id = 'u1'").run();
  await assert.rejects(run("veo-3.1", { prompt: "x", mode: "fast", resolution: "4k" }), e => e.status === 402 && /costs \$1\.035 /.test(e.message));
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
