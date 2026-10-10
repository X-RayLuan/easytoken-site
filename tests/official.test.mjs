// The "official" price on every page is the "Official / Fal Price" kie.ai/pricing lists for the same options,
// and every sale price is kie's price × 1.15. Both are checked against scripts/kie-snapshot.json
// (refresh with `node scripts/kie-prices.mjs --snapshot` after updating worker/catalog.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { mediaModel, mediaModels, quote, saleMicros, MARKUP } from "../worker/catalog.js";
import { SOURCE } from "../scripts/kie-prices.mjs";

const src = readFileSync(new URL("../assets/data.js", import.meta.url), "utf8").split("const $ =")[0];
const MODELS = vm.runInNewContext(src + "; MODELS");
const snap = JSON.parse(readFileSync(new URL("../scripts/kie-snapshot.json", import.meta.url), "utf8")).records;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);

// kie's official price for what the example input is billed for; null if kie shows N/A for any part of it.
const kieOfficial = m => {
  const parts = quote(mediaModel(m.id), m.input).charges.map(([tier, n]) => [snap[SOURCE[m.id][tier]].official, n]);
  return parts.some(([o]) => o == null) ? null : +parts.reduce((a, [o, n]) => a + o * n, 0).toFixed(6);
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
});

test("every sale price is kie × 1.15 per option", () => {
  assert.equal(MARKUP, 1.15);
  for (const m of mediaModels())
    for (const [tier, v] of Object.entries(m.kie)) assert.equal(m.tiers[tier].micros, saleMicros(Array.isArray(v) ? v[0] : v), `${m.id} ${tier}`);
});

test("the snapshot covers every source record and nothing else", () => {
  const used = new Set(Object.values(SOURCE).flatMap(Object.values));
  assert.deepEqual([...used].sort(), Object.keys(snap).sort());
});

// Page helpers from assets/data.js, so the labels and savings are tested as the pages render them.
const page = vm.runInNewContext(readFileSync(new URL("../assets/data.js", import.meta.url), "utf8").split("// Highlighted curl")[0]
  + "; ({ MODELS, OFF_LABEL, pct, save, offUsd, savePill })", { document: {} });

test("savings are measured against kie's Official / Fal price; N/A shows – and no pill", () => {
  assert.equal(page.OFF_LABEL, "Official / Fal price");
  for (const m of page.MODELS) {
    const off = kieOfficial(m);
    if (off == null) {
      assert.equal(page.offUsd(m), "–", m.id);
      assert.equal(page.save(m), null, m.id);
      assert.equal(page.savePill(m), "", m.id);
    } else {
      assert.equal(page.pct(m), Math.round((1 - m.ours / off) * 100), m.id);
      if (m.ours >= off) assert.equal(page.savePill(m), "", `${m.id} is not cheaper, so no pill`);
      else assert.match(page.savePill(m), new RegExp(`−${page.pct(m)}%`), m.id);
    }
  }
});

test("every comparison on the site is labelled Official / Fal price and no page claims to beat the vendors' own APIs", () => {
  const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const pages = ["index.html", "models.html", "playground.html", "dashboard.html", "docs.html"];
  for (const f of pages) {
    const html = read(f);
    assert.doesNotMatch(html, /<(th|small)[^>]*>\s*Official\s*</i, `${f} has a bare "Official" column header`);
    assert.doesNotMatch(html, /cheaper than (the )?official|lower rates than official|less than official prices/i, `${f} claims to beat official APIs`);
  }
  assert.match(read("index.html"), /<th class="r">Official \/ Fal price<\/th>/);
  assert.match(read("index.html"), /<small>Official \/ Fal price<\/small>/);
  assert.match(read("index.html"), /vs\. official \/ fal price, as listed by Kie/);
  assert.match(read("models.html"), /OFF_LABEL/);
  assert.match(read("playground.html"), /OFF_LABEL/);
  assert.match(read("dashboard.html"), /official \/ fal price listed by Kie/);
});
