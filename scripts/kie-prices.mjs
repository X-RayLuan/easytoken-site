// Compare worker/catalog.js against kie.ai's live price list (the public data behind kie.ai/pricing; free, no API key).
//   node scripts/kie-prices.mjs             → lists every tier, exits 1 if a kie price changed
//   node scripts/kie-prices.mjs --markdown  → price table (kie price, our price) for PRs and docs
//   node scripts/kie-prices.mjs --snapshot  → rewrite scripts/kie-snapshot.json (kie price + kie's official price)
import { mediaModels, MARKUP } from "../worker/catalog.js";

// Where each catalog tier's kie price comes from: the `modelDescription` of the kie pricing record.
export const SOURCE = {
  "veo-3.1": { "quality-720p": "Google veo 3.1, text-to-video, Quality-720p", "quality-1080p": "Google veo 3.1, text-to-video, Quality-1080p", "quality-4k": "Google veo 3.1, text-to-video, Quality-4K",
    "fast-720p": "Google veo 3.1, text-to-video, Fast-720p", "fast-1080p": "Google veo 3.1, text-to-video, Fast-1080p", "fast-4k": "Google veo 3.1, text-to-video, Fast-4K",
    "lite-720p": "Google veo 3.1, text-to-video, Lite-720p", "lite-1080p": "Google veo 3.1, text-to-video, Lite-1080p", "lite-4k": "Google veo 3.1, text-to-video, Lite-4K" },
  "seedance-2.5": { "480p": "bytedance/seedance-2-5, 480p no video", "720p": "bytedance/seedance-2-5, 720p no video", "1080p": "bytedance/seedance-2-5, 1080p no video" },
  "seedance-2": { "480p": "bytedance/seedance-2, 480p no video input", "720p": "bytedance/seedance-2, 720p no video input", "1080p": "bytedance/seedance-2, 1080p no video input", "4k": "bytedance/seedance-2, 4K no video input" },
  "seedance-2-fast": { "480p": "bytedance/seedance-2 fast, 480p no video input", "720p": "bytedance/seedance-2 fast, 720p no video input" },
  "kling-3.0": { "std": "Kling 3.0, video, without audio-720P", "std-audio": "Kling 3.0, video, with audio-720P", "pro": "Kling 3.0, video, without audio-1080P",
    "pro-audio": "Kling 3.0, video, with audio-1080P", "4K": "Kling 3.0, video, without audio-4K", "4K-audio": "Kling 3.0, video, with audio-4K" },
  "kling-3.0-turbo": { "720p": "kling 3.0 turbo, text-to-video, 720P", "1080p": "kling 3.0 turbo, text-to-video, 1080P" },
  "kling-2.6": { "5s": "kling 2.6, text-to-video, without audio-5.0s", "5s-audio": "kling 2.6, text-to-video, with audio-5.0s",
    "10s": "kling 2.6, text-to-video, without audio-10.0s", "10s-audio": "kling 2.6, text-to-video, with audio-10.0s" },
  "wan-3.0": { "480p": "wan 3.0 video, 480p, video", "720p": "wan 3.0 video, 720p, video", "1080p": "wan 3.0 video, 1080p, video" },
  "wan-3.0-prime": { "480p": "wan3.0 video prime, 480p, video", "720p": "wan3.0 video prime, 720p, video", "1080p": "wan3.0 video prime, 1080p, video" },
  "wan-2.7": { "720p": "wan 2.7 video, text-to-video, 720p", "1080p": "wan 2.7 video, text-to-video, 1080p" },
  "wan-2.6": { "720p-5s": "wan 2.6, text to video, 5.0s-720p", "720p-10s": "wan 2.6, text to video, 10.0s-720p", "720p-15s": "wan 2.6, text to video, 15.0s-720p",
    "1080p-5s": "wan 2.6, text to video, 5.0s-1080p", "1080p-10s": "wan 2.6, text to video, 10.0s-1080p", "1080p-15s": "wan 2.6, text to video, 15.0s-1080p",
    "i2v-720p-5s": "wan 2.6, image-to-video, 5.0s-720p", "i2v-720p-10s": "wan 2.6, image-to-video, 10.0s-720p", "i2v-720p-15s": "wan 2.6, image-to-video, 15.0s-720p",
    "i2v-1080p-5s": "wan 2.6, image-to-video, 5.0s-1080p", "i2v-1080p-10s": "wan 2.6, image-to-video, 10.0s-1080p", "i2v-1080p-15s": "wan 2.6, image-to-video, 15.0s-1080p" },
  "hailuo-2.3": { "pro-768p-6s": "hailuo 2.3, image-to-video, Pro-6.0s-768p", "pro-768p-10s": "hailuo 2.3, image-to-video, Pro-10.0s-768p", "pro-1080p-6s": "hailuo 2.3, image-to-video, Pro-6.0s-1080p",
    "standard-768p-6s": "hailuo 2.3, image-to-video, Standard-6.0s-768p", "standard-768p-10s": "hailuo 2.3, image-to-video, Standard-10.0s-768p", "standard-1080p-6s": "hailuo 2.3, image-to-video, Standard-6.0s-1080p" },
  "minimax-h3": { "768p": "MiniMax H3, text to video, 768p", "2k": "MiniMax H3, text to video, 2K", "input-image": "MiniMax H3, image input, 768p, 2k" },
  "grok-imagine-video": { "480p": "grok-imagine, text-to-video, 480p", "720p": "grok-imagine, text-to-video, 720p", "1080p": "grok-imagine, text-to-video, 1080p",
    "i2v-480p": "grok-imagine, image-to-video, 480p", "i2v-720p": "grok-imagine, image-to-video, 720p", "i2v-1080p": "grok-imagine, image-to-video, 1080p" },
  "pixverse-v6": { "360p": "pixverse-v6, Text /Image to Video, 360p（no audio）", "360p-audio": "pixverse-v6, Text /Image to Video, 360p (with audio)",
    "540p": "pixverse-v6, Text /Image to Video, 540p (no audio)", "540p-audio": "pixverse-v6, Text /Image to Video, 540p (with audio)",
    "720p": "pixverse-v6, Text /Image to Video, 720p (no audio)", "720p-audio": "pixverse-v6, Text /Image to Video, 720p (with audio)",
    "1080p": "pixverse-v6, Text /Image to Video, 1080p (no audio)", "1080p-audio": "pixverse-v6, Text /Image to Video, 1080p (with audio)" },
  "happyhorse-1.1": { "720p": "HappyHorse-1.1, text-to-video, 720p", "1080p": "HappyHorse-1.1, text-to-video, 1080p" },
  "gpt-image-2.5": { "1K": "gpt-image-2-5-flare, text-to-image, 1K", "2K": "gpt-image-2-5-flare, text-to-image, 2K", "4K": "gpt-image-2-5-flare, text-to-image, 4K" },
  "gpt-image-2": { "1K": "gpt image 2, text-to-image, 1k", "2K": "gpt image 2, text-to-image, 2k", "4K": "gpt image 2, text-to-image, 4k" },
  "nano-banana-pro": { "1K": "Google nano banana pro, 1/2K", "2K": "Google nano banana pro, 1/2K", "4K": "Google nano banana pro, 4K" },
  "nano-banana-2": { "1K": "Google nano banana 2, 1K", "2K": "Google nano banana 2, 2K", "4K": "Google nano banana 2, 4K" },
  "nano-banana-2.1": { "1K": "nano-banana-2-1, 1K", "2K": "nano-banana-2-1, 2K", "4K": "nano-banana-2-1, 4K" },
  "seedream-5-pro": { "1K": "seedream 5 Pro, text-to-image, 1K", "2K": "seedream 5 Pro, text-to-image, 2K", "extra-input-image": "seedream 5 Pro, input image, First image free" },
  "seedream-5-flash": { "1K": "seedream 5 Flash, Text to image , 1K", "1.5K": "seedream 5 Flash, Text to image, 1.5K", "2K": "seedream 5 Flash, Text to image, 2K" },
  "seedream-5-lite": { "image": "seedream 5.0 Lite, text-to-image" },
  "flux-2-pro": { "1K": "Black Forest Labs flux-2 pro, text-to-image, 1.0s-1K", "2K": "Black Forest Labs flux-2 pro, text-to-image, 1.0s-2K" },
  "flux-2-flex": { "1K": "Black Forest Labs Flux 2 Flex, text to image, 1.0s-1K", "2K": "Black Forest Labs Flux 2 Flex, text to image, 1.0s-2K" },
  "imagen-4": { "fast": "google imagen4, text-to-image, Fast", "standard": "google imagen4, text-to-image, default", "ultra": "google imagen4, text-to-image, Ultra" },
  "ideogram-v3": { "TURBO": "ideogram v3,  text-to-image, TURBO", "BALANCED": "ideogram v3,  text-to-image, BALANCED", "QUALITY": "ideogram v3,  text-to-image, QUALITY" },
  "qwen-image-3": { "1K": "Qwen image 3.0, text to image, 1K", "2K": "Qwen image 3.0, text to image, 2K", "input-image": "Qwen image 3.0, input, 1K" },
  "qwen-image-3-pro": { "1K": "Qwen image 3.0 Pro, text to image, 1K", "2K": "Qwen image 3.0 Pro, text to image, 2K", "input-image": "Qwen image 3.0 Pro, input, 1K" },
  "grok-imagine-image": { "image": "grok-imagine-image-2-0, Text to Image" },
  "wan-2.7-image": { "image": "wan 2.7 image" },
  "wan-2.7-image-pro": { "image": "wan 2.7 image pro" },
  "suno-v6": { "fixed": "Suno, Generate Music" },
  "elevenlabs-v3": { "fixed": "Elevenlabs V3 , Text to dialogue" },
};

// kie's "Our Price" (usdPrice) and "Official / Fal Price" (falPrice, null when kie shows N/A) for every record above.
export const SNAPSHOT = new URL("./kie-snapshot.json", import.meta.url);
const descriptions = () => Object.values(SOURCE).flatMap(Object.values);
const entry = r => ({ kie: Number(r.usdPrice), official: r.falPrice?.trim() ? Number(r.falPrice) : null });

async function fetchKie() {
  const out = [];
  for (let page = 1; ; page++) {
    const r = await fetch("https://api.kie.ai/client/v1/model-pricing/page", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pageNum: page, pageSize: 100 }) });
    const d = (await r.json()).data;
    out.push(...d.records);
    if (page >= d.pages) return out;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const byDesc = new Map((await fetchKie()).map(r => [r.modelDescription.trim(), r]));
  if (process.argv.includes("--snapshot")) {
    const records = Object.fromEntries([...new Set(descriptions())].sort().map(d => [d, entry(byDesc.get(d))]));
    writeFileSync(SNAPSHOT, JSON.stringify({ source: "https://kie.ai/pricing", date: new Date().toISOString().slice(0, 10), records }, null, 1) + "\n");
    console.log(`Wrote ${Object.keys(records).length} records to scripts/kie-snapshot.json`);
    process.exit(0);
  }
  const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8")).records;
  const md = process.argv.includes("--markdown");
  let changed = 0;
  if (md) console.log(`| Model | Option | Unit | Kie price | EasyToken price (×${MARKUP}) |\n|---|---|---|---|---|`);
  for (const m of mediaModels()) {
    for (const [tier, v] of Object.entries(m.kie)) {
      const ours = Array.isArray(v) ? v[0] : v, desc = SOURCE[m.id]?.[tier], rec = desc && byDesc.get(desc);
      const live = rec ? Number(rec.usdPrice) : null, ok = live != null && Math.abs(live - ours) < 1e-9;
      if (!ok) changed++;
      if (md) console.log(`| ${m.id} | ${tier} | ${m.tiers[tier].per} | $${ours} | $${(m.tiers[tier].micros / 1e6).toFixed(6).replace(/0+$/, "")} |`);
      else console.log(`${ok ? "ok " : "!! "} ${m.id.padEnd(20)} ${tier.padEnd(18)} catalog $${ours}  kie ${live == null ? `(no record: ${desc})` : "$" + live}`);
    }
  }
  // The official price we show comes from the snapshot; flag any record whose kie or official price moved since.
  for (const d of new Set(descriptions())) {
    const live = byDesc.get(d) && entry(byDesc.get(d)), was = snap[d];
    if (!live || !was || live.kie !== was.kie || live.official !== was.official) {
      changed++;
      if (!md) console.log(`!!  snapshot ${d}: was ${JSON.stringify(was)}, kie now ${JSON.stringify(live)}`);
    }
  }
  if (!md) console.log(changed ? `\n${changed} price(s) differ from kie.ai (update catalog.js, then --snapshot)` : "\nAll prices match kie.ai and the snapshot");
  process.exitCode = changed ? 1 : 0;
}
