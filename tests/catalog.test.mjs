// Front-end prices (assets/data.js) must match what the Worker bills (worker/catalog.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { allModels, mediaModel } from "../worker/catalog.js";

const src = readFileSync(new URL("../assets/data.js", import.meta.url), "utf8").split("// Demo account")[0].split("const $ =")[0];
const MODELS = vm.runInNewContext(src + "; MODELS");

test("every front-end model is billable at the advertised price", () => {
  const billed = Object.fromEntries(allModels().map(m => [m.id, m]));
  for (const m of MODELS) {
    const b = billed[m.id];
    assert.ok(b, `${m.id} missing from worker catalog`);
    if (m.chat) assert.equal(b.output_usd_per_1m, m.ours, m.id);
    else { assert.equal(b.price_usd, m.ours, m.id); assert.equal(b.unit, m.unit, m.id); }
  }
  assert.equal(Object.keys(billed).length, MODELS.length);
});

test("each media model builds an upstream request from its example input", () => {
  for (const m of MODELS.filter(m => !m.chat)) {
    const req = mediaModel(m.id).build(m.input)("https://x.test/cb");
    assert.ok(req.model && req.input, m.id);
  }
});

test("price-changing params are pinned", () => {
  assert.equal(mediaModel("veo-3.1").build({ prompt: "x", resolution: "4k" })("").input.resolution, "1080p");
  assert.throws(() => mediaModel("seedance-2.5").build({ prompt: "x", resolution: "1080p" }), /resolution/);
  assert.equal(mediaModel("kling-3.0").build({ prompt: "x", duration: "15" })("").input.duration, "5");
  assert.throws(() => mediaModel("elevenlabs-v3").build({ text: "a".repeat(1001) }), /1000/);
});
