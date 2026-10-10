// Text (chat) models are removed: not listed, not shown on the site, and /v1/chat/completions refuses every request
// before auth, any upstream call or any charge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker/index.js";
import { sha256 } from "../worker/util.js";

const REMOVED = ["claude-opus-5-5", "gpt-5.5", "gemini-3-pro"];
const KEY = "et_live_" + "k".repeat(32);
const root = new URL("../", import.meta.url);

async function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("migrations/0001_init.sql", root), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  const env = { DB: { prepare: sql => stmt(sql), batch: async l => Promise.all(l.map(s => s.run())) }, KIE_API_KEY: "k", INTERNAL_SECRET: "s", CHAT_UPSTREAM_KEY: "c" };
  db.prepare("INSERT INTO users (id, email, pw_hash, balance, webhook_secret) VALUES ('u1', 'a@b.c', 'x', 10000000, 'w')").run();
  db.prepare("INSERT INTO api_keys (id, user_id, name, key_hash, prefix, last4, daily_cap) VALUES ('k1', 'u1', 't', ?, 'p', 'l', 100000000)").run(await sha256(KEY));
  return { env, db };
}

test("/v1/models lists no chat models", async () => {
  const { env } = await setup();
  const data = (await (await worker.fetch(new Request("https://api.easytoken.si/v1/models"), env, { waitUntil() {} })).json()).data;
  assert.ok(data.length > 0);
  assert.ok(data.every(m => m.type !== "chat" && m.endpoint === "/v1/tasks"));
  for (const id of REMOVED) assert.ok(!data.some(m => m.id === id), id);
});

test("/v1/chat/completions returns 404 model_not_found for any model, with or without a key, and charges nothing", async () => {
  const { env, db } = await setup();
  const realFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); return new Response("{}"); };
  try {
    for (const model of [...REMOVED, "anything"]) for (const auth of [`Bearer ${KEY}`, null]) for (const stream of [false, true]) {
      const res = await worker.fetch(new Request("https://api.easytoken.si/v1/chat/completions", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify({ model, stream, messages: [{ role: "user", content: "hi" }] }) }), env, { waitUntil() {} });
      assert.equal(res.status, 404, model);
      assert.equal((await res.json()).error.code, "model_not_found");
    }
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(calls, []);
  assert.equal(db.prepare("SELECT balance FROM users").get().balance, 10000000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger").get().n, 0);
});

test("no site page or script mentions the removed text models or the chat endpoint", () => {
  const files = [...readdirSync(root).filter(f => f.endsWith(".html")), ...readdirSync(new URL("assets/", root)).filter(f => f.endsWith(".js")).map(f => "assets/" + f)];
  for (const f of files) {
    const s = readFileSync(new URL(f, root), "utf8");
    assert.doesNotMatch(s, /claude|anthropic|gpt-5|gemini-3-pro|chat\/completions|\bLLM\b|cat:"chat"/i, f);
  }
});
