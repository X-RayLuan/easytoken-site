// Chat on kie.ai against an in-memory D1 and a mocked kie (reply shapes recorded from live kie calls, 2026-10-10).
// Checks request translation, the OpenAI-format reply, and that the charge is kie's usage × kie price × 1.15.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker/index.js";
import { sha256 } from "../worker/util.js";
import { chatModel } from "../worker/catalog.js";
import { costOf } from "../worker/kie-chat.js";

const KEY = "et_live_" + "k".repeat(32), START = 10000000;

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { prepare: sql => stmt(sql), batch: async list => Promise.all(list.map(s => s.run())) };
}

let env, ctx, pending, calls, reply, realFetch;
beforeEach(async () => {
  env = { DB: d1(), KIE_API_KEY: "test-key", INTERNAL_SECRET: "test-secret" };
  pending = []; ctx = { waitUntil: p => pending.push(p) };
  calls = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.authorization }); return reply(); };
  await env.DB.prepare("INSERT INTO users (id, email, pw_hash, balance, webhook_secret) VALUES ('u1', 'a@b.c', 'x', ?, 'whsec')").bind(START).run();
  await env.DB.prepare("INSERT INTO api_keys (id, user_id, name, key_hash, prefix, last4, daily_cap) VALUES ('k1', 'u1', 'test', ?, 'et_live_kkkk', 'kkkk', 100000000)").bind(await sha256(KEY)).run();
});
afterEach(() => { globalThis.fetch = realFetch; });

const jsonReply = (d, status = 200) => () => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
const sseReply = events => () => new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
const chat = async body => {
  const res = await worker.fetch(new Request("https://api.easytoken.si/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) }), env, ctx);
  const text = await res.text(); await Promise.all(pending);
  return { status: res.status, text, data: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};
const balance = async () => (await env.DB.prepare("SELECT balance FROM users WHERE id = 'u1'").first()).balance;
const tasks = async () => (await env.DB.prepare("SELECT status, cost, usage_json, error FROM tasks").all()).results;
const chunks = text => text.split("\n\n").filter(l => l.startsWith("data: ") && l !== "data: [DONE]").map(l => JSON.parse(l.slice(6)));

const CLAUDE_USAGE = { output_tokens: 10, cache_creation_input_tokens: 314, input_tokens: 2, cache_read_input_tokens: 2736 };
const claudeMsg = { role: "assistant", usage: CLAUDE_USAGE, stop_reason: "end_turn", model: "claude-opus-5-5", id: "msg_1", credits_consumed: 0.06, type: "message", content: [{ text: "Hello there, friend!", type: "text" }] };

test("sale rates are kie × 1.15 per token class", () => {
  assert.deepEqual(chatModel("claude-opus-5-5").rates, { input: 1840000, output: 9200000, cache_read: 92000 });
  assert.deepEqual(chatModel("gpt-5.5").rates, { input: 1610000, output: 9660000, cached_input: 161000 });
  assert.equal(chatModel("gemini-3-pro"), null);
});

test("claude: OpenAI request → kie Messages, reply → OpenAI, charged kie usage × 1.15", async () => {
  reply = jsonReply(claudeMsg);
  const r = await chat({ model: "claude-opus-5-5", max_tokens: 50, temperature: 0.2, stop: "END", messages: [
    { role: "system", content: "Be terse." },
    { role: "user", content: [{ type: "text", text: "What is in this image?" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] },
    { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "look", arguments: "{\"q\":1}" } }] },
    { role: "tool", tool_call_id: "t1", content: "a cat" },
  ], tools: [{ type: "function", function: { name: "look", description: "d", parameters: { type: "object", properties: {} } } }], tool_choice: "auto" });
  assert.equal(r.status, 200);
  assert.equal(calls[0].url, "https://api.kie.ai/claude/v1/messages");
  assert.equal(calls[0].auth, "Bearer test-key");
  const up = calls[0].body;
  assert.equal(up.model, "claude-opus-5-5"); assert.equal(up.system, "Be terse."); assert.equal(up.max_tokens, 50); assert.equal(up.stream, false);
  assert.deepEqual(up.stop_sequences, ["END"]);
  assert.deepEqual(up.messages[0].content[1], { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });
  assert.deepEqual(up.messages[1], { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "look", input: { q: 1 } }] });
  assert.deepEqual(up.messages[2], { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "a cat" }] });
  assert.deepEqual(up.tools[0], { name: "look", description: "d", input_schema: { type: "object", properties: {} } });
  assert.equal(r.data.model, "claude-opus-5-5");
  assert.deepEqual(r.data.choices[0], { index: 0, message: { role: "assistant", content: "Hello there, friend!" }, finish_reason: "stop" });
  assert.equal(r.data.usage.prompt_tokens, 2 + 314 + 2736);
  // (2 × $1.84 + 2736 × $0.092 + 10 × $9.20) per 1M = 347.392 µ$ → 348
  const cost = Math.ceil((2 * 1840000 + 2736 * 92000 + 10 * 9200000) / 1e6);
  assert.equal(cost, 348);
  assert.equal(await balance(), START - cost);
  const [t] = await tasks();
  assert.equal(t.status, "succeeded"); assert.equal(t.cost, cost);
  assert.deepEqual(JSON.parse(t.usage_json), { kie: CLAUDE_USAGE, kie_credits: 0.06 });
});

test("claude tool calls come back as OpenAI tool_calls", async () => {
  reply = jsonReply({ ...claudeMsg, stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "look", input: { q: 2 } }] });
  const r = await chat({ model: "claude-opus-5-5", messages: [{ role: "user", content: "hi" }], tools: [{ type: "function", function: { name: "look" } }], tool_choice: "required" });
  assert.deepEqual(calls[0].body.tool_choice, { type: "any" });
  assert.equal(calls[0].body.max_tokens, 4096);
  assert.deepEqual(r.data.choices[0].message, { role: "assistant", content: null, tool_calls: [{ id: "tu1", type: "function", function: { name: "look", arguments: "{\"q\":2}" } }] });
  assert.equal(r.data.choices[0].finish_reason, "tool_calls");
});

test("claude stream → OpenAI chunks, usage chunk on request, charged on the final usage", async () => {
  reply = sseReply([
    { type: "message_start", message: { id: "m", model: "claude-opus-5-5", usage: { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: 8602, cache_creation_input_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello " } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "there!" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", usage: { output_tokens: 10 }, delta: { stop_reason: "end_turn" }, credits_consumed: 0.02 },
    { type: "message_stop" },
  ]);
  const r = await chat({ model: "claude-opus-5-5", stream: true, stream_options: { include_usage: true }, messages: [{ role: "user", content: "hi" }] });
  assert.equal(calls[0].body.stream, true);
  const c = chunks(r.text);
  assert.equal(c.map(x => x.choices[0]?.delta?.content || "").join(""), "Hello there!");
  assert.ok(c.every(x => x.id === c[0].id && x.model === "claude-opus-5-5"));
  assert.equal(c.at(-2).choices[0].finish_reason, "stop");
  assert.deepEqual(c.at(-1).usage, { prompt_tokens: 8604, completion_tokens: 10, total_tokens: 8614, prompt_tokens_details: { cached_tokens: 8602 } });
  assert.ok(r.text.trimEnd().endsWith("data: [DONE]"));
  // kie charges a streamed reply on input_tokens + message_delta usage; the cache read in message_start is free
  const cost = Math.ceil((2 * 1840000 + 10 * 9200000) / 1e6);
  assert.equal(await balance(), START - cost);
  assert.equal((await tasks())[0].cost, cost);
  assert.deepEqual(JSON.parse((await tasks())[0].usage_json).billed, { input_tokens: 2, cache_read_input_tokens: 0, output_tokens: 10 });
});

test("claude stream tool call deltas", async () => {
  reply = sseReply([
    { type: "message_start", message: { usage: { input_tokens: 5, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "look", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"q\":" } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "3}" } },
    { type: "message_delta", usage: { output_tokens: 7 }, delta: { stop_reason: "tool_use" } },
    { type: "message_stop" },
  ]);
  const c = chunks((await chat({ model: "claude-opus-5-5", stream: true, messages: [{ role: "user", content: "hi" }] })).text);
  const calls_ = c.flatMap(x => x.choices[0]?.delta?.tool_calls || []);
  assert.deepEqual(calls_[0], { index: 0, id: "tu1", type: "function", function: { name: "look", arguments: "" } });
  assert.equal(calls_.map(t => t.function.arguments).join(""), "{\"q\":3}");
  assert.equal(c.at(-1).choices[0].finish_reason, "tool_calls");
  assert.ok(!c.some(x => x.usage), "no usage chunk unless include_usage");
});

const gptResp = (extra = {}) => ({ object: "response", status: "completed", model: "gpt-5.5", credits_consumed: 1.39,
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "512" }] }],
  usage: { input_tokens: 4922, input_tokens_details: { cached_tokens: 0 }, output_tokens: 5, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 4927 }, ...extra });

test("gpt-5.5: OpenAI request → kie Responses with our own instructions, charged kie usage × 1.15", async () => {
  reply = jsonReply(gptResp());
  const r = await chat({ model: "gpt-5.5", max_tokens: 20, reasoning_effort: "low", response_format: { type: "json_object" }, messages: [
    { role: "user", content: "item 512?" },
    { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "c1", content: "ok" },
  ] });
  assert.equal(r.status, 200);
  assert.equal(calls[0].url, "https://api.kie.ai/codex/v1/responses");
  const up = calls[0].body;
  assert.equal(up.model, "gpt-5-5"); assert.equal(up.instructions, "You are a helpful assistant."); assert.equal(up.store, false);
  assert.equal(up.max_output_tokens, 20); assert.deepEqual(up.reasoning, { effort: "low" }); assert.deepEqual(up.text, { format: { type: "json_object" } });
  assert.deepEqual(up.input, [
    { role: "user", content: [{ type: "input_text", text: "item 512?" }] },
    { type: "function_call", call_id: "c1", name: "f", arguments: "{}" },
    { type: "function_call_output", call_id: "c1", output: "ok" },
  ]);
  assert.equal(r.data.choices[0].message.content, "512");
  assert.equal(r.data.usage.prompt_tokens, 4922);
  // live call: kie charged 1.39 credits ($0.00695) for this usage; ours = (4922 × $1.61 + 5 × $9.66) per 1M
  const cost = Math.ceil((4922 * 1610000 + 5 * 9660000) / 1e6);
  assert.equal(cost, 7973);
  assert.equal(await balance(), START - cost);
});

test("gpt-5.5: system messages become instructions, cached input is billed at the cached price", async () => {
  reply = jsonReply(gptResp({ usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 800 }, output_tokens: 10 } }));
  await chat({ model: "gpt-5.5", messages: [{ role: "system", content: "Answer with the number only." }, { role: "user", content: "x" }] });
  assert.equal(calls[0].body.instructions, "Answer with the number only.");
  assert.equal(await balance(), START - Math.ceil((200 * 1610000 + 800 * 161000 + 10 * 9660000) / 1e6));
  assert.equal(costOf(chatModel("gpt-5.5"), { input_tokens: 1000, input_tokens_details: { cached_tokens: 800 }, output_tokens: 10 }), 548); // 322 + 128.8 + 96.6
});

test("gpt-5.5 stream → OpenAI chunks incl. function call deltas, charged on response.completed usage", async () => {
  const done = gptResp({ output: [], usage: { input_tokens: 100, output_tokens: 20 } });
  reply = sseReply([
    { type: "response.created", response: { status: "in_progress" } },
    { type: "response.output_text.delta", delta: "Let me " },
    { type: "response.output_text.delta", delta: "check." },
    { type: "response.output_item.added", output_index: 1, item: { type: "function_call", call_id: "c9", name: "f" } },
    { type: "response.function_call_arguments.delta", output_index: 1, delta: "{\"a\":1}" },
    { type: "response.completed", response: done },
  ]);
  const c = chunks((await chat({ model: "gpt-5.5", stream: true, stream_options: { include_usage: true }, messages: [{ role: "user", content: "hi" }] })).text);
  assert.equal(c.map(x => x.choices[0]?.delta?.content || "").join(""), "Let me check.");
  const tc = c.flatMap(x => x.choices[0]?.delta?.tool_calls || []);
  assert.equal(tc[0].id, "c9"); assert.equal(tc[1].function.arguments, "{\"a\":1}");
  assert.equal(c.at(-2).choices[0].finish_reason, "tool_calls");
  assert.equal(c.at(-1).usage.completion_tokens, 20);
  assert.equal(await balance(), START - Math.ceil((100 * 1610000 + 20 * 9660000) / 1e6));
});

for (const [name, r] of [
  ["HTTP 500", jsonReply({ error: { message: "boom" } }, 500)],
  ["HTTP 200 with a kie error code", jsonReply({ code: 500, msg: "server busy" })],
  ["a reply without usage", jsonReply({ type: "message", content: [] })],
]) test(`kie failure (${name}) is a 502 and is not charged`, async () => {
  reply = r;
  const res = await chat({ model: "claude-opus-5-5", messages: [{ role: "user", content: "hi" }] });
  assert.equal(res.status, 502);
  assert.equal(await balance(), START);
  const [t] = await tasks();
  assert.equal(t.status, "failed"); assert.equal(t.cost, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM ledger").first()).n, 0);
});

test("kie 400 is a 422 for the caller and not charged", async () => {
  reply = jsonReply({ error: { message: "max_tokens too large" } }, 400);
  const res = await chat({ model: "gpt-5.5", messages: [{ role: "user", content: "hi" }] });
  assert.equal(res.status, 422); assert.match(res.data.error.message, /max_tokens/);
  assert.equal(await balance(), START);
});

test("a stream that errors or ends before usage is not charged and tells the client", async () => {
  for (const events of [
    [{ type: "message_start", message: { usage: { input_tokens: 2 } } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } }, { type: "error", error: { message: "overloaded" } }],
    [{ type: "response.created" }, { type: "response.output_text.delta", delta: "x" }],
  ]) {
    reply = sseReply(events);
    const r = await chat({ model: events[0].type === "message_start" ? "claude-opus-5-5" : "gpt-5.5", stream: true, messages: [{ role: "user", content: "hi" }] });
    assert.ok(chunks(r.text).some(x => x.error?.code === "upstream_error"));
  }
  assert.equal(await balance(), START);
  assert.deepEqual((await tasks()).map(t => [t.status, t.cost]), [["failed", 0], ["failed", 0]]);
});

test("a stream request kie answers with a JSON error is a 502, not charged", async () => {
  reply = jsonReply({ code: 402, msg: "insufficient credits" });
  const r = await chat({ model: "claude-opus-5-5", stream: true, messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.status, 502);
  assert.equal(await balance(), START);
});

test("gemini-3-pro is not offered; unsupported input is refused before any kie call", async () => {
  assert.equal((await chat({ model: "gemini-3-pro", messages: [{ role: "user", content: "hi" }] })).status, 404);
  assert.equal((await chat({ model: "gpt-5.5", n: 2, messages: [{ role: "user", content: "hi" }] })).status, 422);
  assert.equal((await chat({ model: "gpt-5.5", stop: ["x"], messages: [{ role: "user", content: "hi" }] })).status, 422);
  assert.equal((await chat({ model: "claude-opus-5-5", messages: [{ role: "user", content: [{ type: "input_audio" }] }] })).status, 422);
  assert.equal(calls.length, 0);
  const ids = (await (await worker.fetch(new Request("https://api.easytoken.si/v1/models"), env, ctx)).json()).data.map(m => m.id);
  assert.ok(ids.includes("claude-opus-5-5") && ids.includes("gpt-5.5") && !ids.includes("gemini-3-pro"));
});
