// The "official" price on every page is the "Official / Fal Price" kie.ai/pricing lists for the same options,
// and every sale price is kie's price × 1.15. Both are checked against scripts/kie-snapshot.json
// (refresh with `node scripts/kie-prices.mjs --snapshot` after updating worker/catalog.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { mediaModel, mediaModels, chatModels, quote, saleMicros, MARKUP } from "../worker/catalog.js";
import { SOURCE, CHAT_SOURCE } from "../scripts/kie-prices.mjs";

const src = readFileSync(new URL("../assets/data.js", import.meta.url), "utf8").split("const $ =")[0];
const MODELS = vm.runInNewContext(src + "; MODELS");
const snap = JSON.parse(readFileSync(new URL("../scripts/kie-snapshot.json", import.meta.url), "utf8")).records;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);

// kie's official price for what the example input is billed for; null if kie shows N/A for any part of it.
const kieOfficial = m => {
  if (m.chat) return snap[CHAT_SOURCE[m.id].output].official;
  const parts = quote(mediaModel(m.id), m.input).charges.map(([tier, n]) => [snap[SOURCE[m.id][tier]].official, n]);
  return parts.some(([o]) => o == null) ? null : parts.reduce((a, [o, n]) => a + o * n, 0);
};

test("every official price in data.js is kie's listed official price for the same options, or null when kie lists none", () => {
  for (const m of MODELS) {
    const want = kieOfficial(m);
    if (want == null) assert.equal(m.official, null, `${m.id} official must be null (kie shows N/A)`);
    else near(m.official, want, `${m.id} official`);
  }
});

test("every kie price in worker/catalog.js matches the kie.ai snapshot", () => {
  for (const m of mediaModels())
    for (const [tier, v] of Object.entries(m.kie)) near(Array.isArray(v) ? v[0] : v, snap[SOURCE[m.id][tier]].kie, `${m.id} ${tier}`);
  for (const m of chatModels())
    for (const k of ["input", "output"]) near(m.kie[k], snap[CHAT_SOURCE[m.id][k]].kie, `${m.id} ${k}`);
});

test("every sale price is kie × 1.15 (media per option, chat per input and output token)", () => {
  assert.equal(MARKUP, 1.15);
  for (const m of mediaModels())
    for (const [tier, v] of Object.entries(m.kie)) assert.equal(m.tiers[tier].micros, saleMicros(Array.isArray(v) ? v[0] : v), `${m.id} ${tier}`);
  for (const m of chatModels()) {
    near(m.input, saleMicros(m.kie.input) / 1e6, `${m.id} input`);
    near(m.output, saleMicros(m.kie.output) / 1e6, `${m.id} output`);
  }
});

test("the snapshot covers every source record and nothing else", () => {
  const used = new Set([...Object.values(SOURCE), ...Object.values(CHAT_SOURCE)].flatMap(Object.values));
  assert.deepEqual([...used].sort(), Object.keys(snap).sort());
});
