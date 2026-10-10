// Front-end prices (assets/data.js) must match what the Worker bills (worker/catalog.js),
// and every media price must be kie.ai's price × MARKUP for the exact options requested.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { allModels, mediaModel, mediaModels, quote, saleMicros, MARKUP } from "../worker/catalog.js";
import { SOURCE } from "../scripts/kie-prices.mjs";

const src = readFileSync(new URL("../assets/data.js", import.meta.url), "utf8").split("// Demo account")[0].split("const $ =")[0];
const MODELS = vm.runInNewContext(src + "; MODELS");
const usd = (id, input) => quote(mediaModel(id), input).micros / 1e6;
const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg || ""} ${actual} != ${expected}`);

test("every front-end model is billable, and its example price is what the example input costs", () => {
  const billed = Object.fromEntries(allModels().map(m => [m.id, m]));
  for (const m of MODELS) {
    assert.ok(billed[m.id], `${m.id} missing from worker catalog`);
    assert.equal(usd(m.id, m.input), m.ours, m.id);
  }
  assert.equal(Object.keys(billed).length, MODELS.length);
});

test("the example price is also the default price, so the playground shows what a run costs", () => {
  for (const m of MODELS.filter(m => !m.input.image_urls)) assert.equal(usd(m.id, { prompt: "x" }), m.ours, m.id);
});

test("sale price is kie price × 1.15, rounded up to the micro-dollar", () => {
  assert.equal(MARKUP, 1.15);
  assert.equal(saleMicros(0.05), 57500);
  assert.equal(saleMicros(0.025), 28750);
  assert.equal(saleMicros(0.0162), 18630);
  assert.equal(saleMicros(0.00875), 10063); // 10062.5 → up
  for (const m of mediaModels().filter(m => m.kie)) {
    for (const [tier, v] of Object.entries(m.kie)) {
      const kie = Array.isArray(v) ? v[0] : v, sale = m.tiers[tier].micros;
      assert.ok(sale >= kie * 1e6 * MARKUP - 1e-6 && sale < kie * 1e6 * MARKUP + 1, `${m.id} ${tier}`);
    }
  }
});

test("every kie tier has a documented source record", () => {
  for (const m of mediaModels().filter(m => m.kie))
    for (const tier of Object.keys(m.kie)) assert.ok(SOURCE[m.id]?.[tier], `${m.id} ${tier} has no kie source`);
});

test("each media model builds an upstream request from its example input", () => {
  for (const m of MODELS) {
    const req = quote(mediaModel(m.id), m.input).up("https://x.test/cb");
    assert.ok(req.model && req.input && req.callbackUrl, m.id);
    assert.ok(!Object.values(req.input).includes(undefined), m.id);
  }
});

test("price follows resolution, duration, mode and audio", () => {
  // veo: per 8s video, by tier and resolution
  near(usd("veo-3.1", { prompt: "x" }), 1.46625);
  near(usd("veo-3.1", { prompt: "x", mode: "fast", resolution: "720p" }), 0.345);
  near(usd("veo-3.1", { prompt: "x", mode: "lite", resolution: "4k" }), 0.8625);
  assert.equal(quote(mediaModel("veo-3.1"), { prompt: "x", mode: "fast", resolution: "4k" }).up("").input.model, "veo3_fast");
  assert.equal(quote(mediaModel("veo-3.1"), { prompt: "x", duration: 8 }).up("").input.duration, 8);
  assert.throws(() => quote(mediaModel("veo-3.1"), { prompt: "x", duration: 4 }), e => e.status === 422 && /duration must be 8/.test(e.message), "veo refuses durations it would not deliver");
  // seedance: per second × duration
  near(usd("seedance-2.5", { prompt: "x", resolution: "1080p", duration: 10 }), 0.9085 * 10);
  near(usd("seedance-2", { prompt: "x", resolution: "4k", duration: 4 }), 1.196 * 4);
  // kling 3.0: mode × audio × seconds
  near(usd("kling-3.0", { prompt: "x", mode: "std", sound: true, duration: 10 }), 1.15);
  near(usd("kling-3.0", { prompt: "x", mode: "4K", duration: "15" }), 0.38525 * 15);
  assert.equal(quote(mediaModel("kling-3.0"), { prompt: "x", duration: 15 }).up("").input.duration, "15");
  // wan 2.6: image-to-video 1080p 10s is priced differently from text-to-video
  near(usd("wan-2.6", { prompt: "x", resolution: "1080p", duration: 10 }), 1.204625);
  near(usd("wan-2.6", { prompt: "x", resolution: "1080p", duration: 10, image_urls: ["https://a.test/i.png"] }), 1.2075);
  // extra charges for input images
  near(usd("minimax-h3", { prompt: "x", duration: 6, image_urls: ["https://a.test/1.png", "https://a.test/2.png"] }), 0.046 * 6 + 0.023 * 2);
  near(usd("seedream-5-pro", { prompt: "x", image_urls: ["https://a.test/1.png", "https://a.test/2.png", "https://a.test/3.png"] }), 0.0805 + 0.002875 * 2);
  near(usd("qwen-image-3", { prompt: "x", image_urls: ["https://a.test/1.png"] }), 0.0276 + 0.002875);
  // per image × n
  near(usd("wan-2.7-image", { prompt: "x", n: 4 }), 0.0276 * 4);
  near(usd("imagen-4", { prompt: "x", mode: "ultra" }), 0.069);
  near(usd("ideogram-v3", { prompt: "x", rendering_speed: "TURBO" }), 0.020125);
});

test("inputs that would be billed differently than quoted are refused", () => {
  assert.throws(() => quote(mediaModel("seedance-2.5"), { prompt: "x", reference_video_urls: ["https://a.test/v.mp4"] }), /Video inputs/);
  assert.throws(() => quote(mediaModel("seedance-2.5"), { prompt: "x", duration: -1 }), /duration/);
  assert.throws(() => quote(mediaModel("wan-3.0"), { prompt: "x", duration: -1 }), /duration/);
  assert.throws(() => quote(mediaModel("seedance-2-fast"), { prompt: "x", resolution: "1080p" }), /resolution/);
  assert.throws(() => quote(mediaModel("kling-3.0"), { prompt: "x", duration: 16 }), /duration/);
  assert.throws(() => quote(mediaModel("hailuo-2.3"), { prompt: "x", image_urls: ["https://a.test/i.png"], resolution: "1080p", duration: 10 }), /768p/);
  assert.throws(() => quote(mediaModel("hailuo-2.3"), { prompt: "x" }), /image_urls/);
  assert.throws(() => quote(mediaModel("wan-2.7-image"), { prompt: "x", n: 5 }), /n must/);
  assert.throws(() => quote(mediaModel("wan-2.7-image-pro"), { prompt: "x", resolution: "4K", image_urls: ["https://a.test/i.png"] }), /4K/);
  assert.throws(() => quote(mediaModel("grok-imagine-video"), { prompt: "x", mode: "spicy" }), /mode/);
  assert.throws(() => quote(mediaModel("elevenlabs-v3"), { text: "a".repeat(1001) }), /1000/);
});

test("audio models are priced at kie × 1.15 like everything else", () => {
  assert.equal(usd("suno-v6", { prompt: "x" }), 0.069);
  assert.equal(usd("elevenlabs-v3", { text: "hi" }), 0.0805);
});

const IMG = n => Array.from({ length: n }, (_, k) => `https://a.test/${k}.png`);

test("wan 2.6 image-to-video is billed at kie's image-to-video price for every resolution × duration", () => {
  const i2v = { "720p-5": 0.35, "720p-10": 0.70, "720p-15": 1.05, "1080p-5": 0.5225, "1080p-10": 1.05, "1080p-15": 1.575 };
  for (const [k, kie] of Object.entries(i2v)) {
    const [resolution, duration] = k.split("-"), q = quote(mediaModel("wan-2.6"), { prompt: "xx", resolution, duration, image_urls: IMG(1) });
    assert.deepEqual(q.charges, [[`i2v-${resolution}-${duration}s`, 1]], k);
    assert.equal(q.micros, saleMicros(kie), k);
    assert.equal(q.up("").model, "wan/2-6-image-to-video", k);
  }
  // 1080p 10s: image-to-video ($1.05) is not the text-to-video price ($1.0475)
  assert.notEqual(usd("wan-2.6", { prompt: "xx", resolution: "1080p", duration: 10, image_urls: IMG(1) }), usd("wan-2.6", { prompt: "xx", resolution: "1080p", duration: 10 }));
  assert.equal(quote(mediaModel("wan-2.6"), { prompt: "xx" }).up("").model, "wan/2-6-text-to-video");
});

test("wan 2.6 accepts exactly one input image and no aspect_ratio", () => {
  assert.throws(() => quote(mediaModel("wan-2.6"), { prompt: "xx", image_urls: IMG(2) }), e => e.status === 422 && /image_urls/.test(e.message));
  assert.throws(() => quote(mediaModel("wan-2.6"), { prompt: "xx", aspect_ratio: "9:16" }), e => e.status === 422 && /aspect_ratio/.test(e.message));
});

test("an option combination with no registered kie price is a 422, never a fallback price", () => {
  const m = mediaModel("wan-2.6"), saved = m.tiers["i2v-720p-15s"];
  delete m.tiers["i2v-720p-15s"];
  try {
    assert.throws(() => quote(m, { prompt: "xx", resolution: "720p", duration: 15, image_urls: IMG(1) }), e => e.status === 422 && e.code === "unsupported_option");
  } finally { m.tiers["i2v-720p-15s"] = saved; }
});

test("grok imagine image-to-video: 1 image at 1080p, up to 7 at 480p/720p, billed at the image-to-video price", () => {
  const g = input => quote(mediaModel("grok-imagine-video"), input);
  assert.throws(() => g({ resolution: "1080p", image_urls: IMG(2) }), e => e.status === 422 && /1080p/.test(e.message));
  near(g({ resolution: "1080p", duration: 10, image_urls: IMG(1) }).micros / 1e6, 0.046 * 10);
  assert.deepEqual(g({ resolution: "1080p", duration: 10, image_urls: IMG(1) }).charges, [["i2v-1080p", 10]]);
  for (const resolution of ["480p", "720p"]) {
    assert.equal(g({ resolution, image_urls: IMG(7) }).up("").input.image_urls.length, 7);
    assert.throws(() => g({ resolution, image_urls: IMG(8) }), e => e.status === 422 && /image_urls/.test(e.message));
  }
  // one image: kie ignores aspect_ratio, so it is not sent and an explicit one is refused
  assert.equal(g({ image_urls: IMG(1) }).up("").input.aspect_ratio, undefined);
  assert.throws(() => g({ image_urls: IMG(1), aspect_ratio: "9:16" }), e => e.status === 422 && /aspect_ratio/.test(e.message));
  assert.equal(g({ image_urls: IMG(3), aspect_ratio: "9:16" }).up("").input.aspect_ratio, "9:16");
  assert.throws(() => g({ image_urls: IMG(1), mode: "spicy" }), /mode/);
});
