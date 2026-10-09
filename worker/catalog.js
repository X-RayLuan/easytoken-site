// Billing source of truth: what each public model costs and how it maps to the upstream request.
// Media prices are kie.ai's list price × MARKUP, per model and per option (resolution, duration, mode, audio…).
// `kie` holds kie's USD price per unit, snapshot from kie.ai/pricing (public API: POST
// https://api.kie.ai/client/v1/model-pricing/page) on 2026-10-09. Re-check with `node scripts/kie-prices.mjs`.
// `build` validates the caller's input and returns the upstream request plus the billable `charges`
// ([tier, quantity] pairs), so the price is known exactly before the task is submitted.
// The front end's example prices in assets/data.js are checked against this file by tests/catalog.test.mjs.
import { fail } from "./util.js";

export const MARKUP = 1.15;
// Sale price in micro-dollars for one unit of a kie tier, rounded up so we never sell below cost × MARKUP.
export const saleMicros = kieUsd => Math.ceil(Math.round(kieUsd * 1e6) * Math.round(MARKUP * 100) / 100);

const str = (v, name, max) => {
  if (typeof v !== "string" || !v.trim()) fail(422, "invalid_input", `input.${name} is required and must be a string.`);
  if (v.length > max) fail(422, "invalid_input", `input.${name} must be at most ${max} characters.`);
  return v;
};
const optStr = (v, name, max) => v == null ? undefined : str(v, name, max);
const oneOf = (v, name, allowed, dflt) => {
  if (v == null) return dflt;
  if (!allowed.includes(v)) fail(422, "invalid_input", `input.${name} must be one of: ${allowed.join(", ")}.`);
  return v;
};
const int = (v, name, min, max, dflt) => {
  if (v == null) return dflt;
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) fail(422, "invalid_input", `input.${name} must be a whole number from ${min} to ${max}.`);
  return n;
};
const urls = (v, name, max) => {
  if (v == null) return null;
  const list = Array.isArray(v) ? v : [v];
  if (!list.length || list.length > max || !list.every(u => typeof u === "string" && /^https:\/\/\S+$/.test(u)))
    fail(422, "invalid_input", `input.${name} must be up to ${max} https URLs.`);
  return list;
};
const bool = (v, name, dflt) => {
  if (v == null) return dflt;
  if (typeof v !== "boolean") fail(422, "invalid_input", `input.${name} must be true or false.`);
  return v;
};
const imgs = (i, max) => urls(i.image_urls ?? i.image_url ?? i.input_urls, "image_urls", max);
// Inputs that make kie bill extra seconds we cannot price up front (reference videos, auto duration) are refused.
const noVideoRefs = i => {
  if (i.reference_video_urls != null || i.video_urls != null || i.video_url != null)
    fail(422, "invalid_input", "Video inputs are not supported for this model yet.");
};
const ar = (v, allowed, dflt) => oneOf(v, "aspect_ratio", allowed, dflt);
const prompt = (i, max) => str(i.prompt, "prompt", max);
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
// One upstream job. `charges` is a list of [tier, quantity].
const job = (model, input, ...charges) => ({ up: callbackUrl => ({ model, input: clean(input), callbackUrl }), charges });

const RATIOS_VIDEO = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

const MEDIA = [
  // ---------- Video ----------
  { id: "veo-3.1", cat: "video", per: "video (8s)",
    kie: { "quality-720p": 1.25, "quality-1080p": 1.275, "quality-4k": 1.85, "fast-720p": 0.30, "fast-1080p": 0.325, "fast-4k": 0.90, "lite-720p": 0.15, "lite-1080p": 0.175, "lite-4k": 0.75 },
    build: i => {
      const mode = oneOf(i.mode, "mode", ["quality", "fast", "lite"], "quality"), res = oneOf(i.resolution, "resolution", ["720p", "1080p", "4k"], "1080p"), im = imgs(i, 2);
      return job("veo-3-1", { prompt: prompt(i, 5000), model: { quality: "veo3", fast: "veo3_fast", lite: "veo3_lite" }[mode], resolution: res, duration: 8,
        aspect_ratio: ar(i.aspect_ratio, ["16:9", "9:16", "Auto"], "16:9"),
        ...(im ? { image_urls: im, generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO" } : { generation_type: "TEXT_2_VIDEO" }) }, [`${mode}-${res}`, 1]);
    } },
  { id: "seedance-2.5", cat: "video", per: "second",
    kie: { "480p": 0.14, "720p": 0.315, "1080p": 0.79 },
    build: i => { noVideoRefs(i); const im = imgs(i, 2), res = oneOf(i.resolution, "resolution", ["480p", "720p", "1080p"], "720p"), d = int(i.duration, "duration", 4, 30, 5);
      return job("bytedance/seedance-2-5", { prompt: prompt(i, 20000), duration: d, resolution: res,
        aspect_ratio: ar(i.aspect_ratio, [...RATIOS_VIDEO, "adaptive"], "adaptive"), generate_audio: bool(i.generate_audio, "generate_audio", true),
        ...(im ? { first_frame_url: im[0], last_frame_url: im[1] } : {}) }, [res, d]); } },
  { id: "seedance-2", cat: "video", per: "second",
    kie: { "480p": 0.095, "720p": 0.205, "1080p": 0.51, "4k": 1.04 },
    build: i => { noVideoRefs(i); const im = imgs(i, 2), res = oneOf(i.resolution, "resolution", ["480p", "720p", "1080p", "4k"], "720p"), d = int(i.duration, "duration", 4, 15, 5);
      return job("bytedance/seedance-2", { prompt: prompt(i, 20000), duration: d, resolution: res,
        aspect_ratio: ar(i.aspect_ratio, [...RATIOS_VIDEO, "adaptive"], "16:9"), generate_audio: bool(i.generate_audio, "generate_audio", true),
        ...(im ? { first_frame_url: im[0], last_frame_url: im[1] } : {}) }, [res, d]); } },
  { id: "seedance-2-fast", cat: "video", per: "second",
    kie: { "480p": 0.059, "720p": 0.124 },
    build: i => { noVideoRefs(i); const im = imgs(i, 2), res = oneOf(i.resolution, "resolution", ["480p", "720p"], "720p"), d = int(i.duration, "duration", 4, 15, 5);
      return job("bytedance/seedance-2-fast", { prompt: prompt(i, 20000), duration: d, resolution: res,
        aspect_ratio: ar(i.aspect_ratio, [...RATIOS_VIDEO, "adaptive"], "16:9"), generate_audio: bool(i.generate_audio, "generate_audio", true),
        ...(im ? { first_frame_url: im[0], last_frame_url: im[1] } : {}) }, [res, d]); } },
  { id: "kling-3.0", cat: "video", per: "second",
    // mode std = 720p, pro = 1080p, 4K = 4K.
    kie: { "std": 0.07, "std-audio": 0.10, "pro": 0.09, "pro-audio": 0.135, "4K": 0.335, "4K-audio": 0.335 },
    build: i => { const im = imgs(i, 2), mode = oneOf(i.mode, "mode", ["std", "pro", "4K"], "pro"), sound = bool(i.sound, "sound", false), d = int(i.duration, "duration", 3, 15, 5);
      return job("kling-3.0/video", { prompt: prompt(i, 2500), duration: String(d), mode, sound, multi_shots: false,
        aspect_ratio: ar(i.aspect_ratio, ["16:9", "9:16", "1:1"], "16:9"), ...(im ? { image_urls: im } : {}) }, [mode + (sound ? "-audio" : ""), d]); } },
  { id: "kling-3.0-turbo", cat: "video", per: "second",
    kie: { "720p": 0.09, "1080p": 0.1125 },
    build: i => { const im = imgs(i, 1), res = oneOf(i.resolution, "resolution", ["720p", "1080p"], "1080p"), d = int(i.duration, "duration", 3, 15, 5);
      return im ? job("kling/v3-turbo-image-to-video", { prompt: prompt(i, 2500), image_urls: im, duration: String(d), resolution: res }, [res, d])
        : job("kling/v3-turbo-text-to-video", { prompt: prompt(i, 2500), duration: String(d), resolution: res, aspect_ratio: ar(i.aspect_ratio, ["16:9", "9:16", "1:1"], "16:9") }, [res, d]); } },
  { id: "kling-2.6", cat: "video", per: "video",
    kie: { "5s": 0.275, "5s-audio": 0.55, "10s": 0.55, "10s-audio": 1.10 },
    build: i => { const im = imgs(i, 1), d = oneOf(i.duration == null ? null : String(i.duration), "duration", ["5", "10"], "5"), sound = bool(i.sound, "sound", false), tier = `${d}s${sound ? "-audio" : ""}`;
      return im ? job("kling-2.6/image-to-video", { prompt: prompt(i, 2500), image_urls: im, sound, duration: d }, [tier, 1])
        : job("kling-2.6/text-to-video", { prompt: prompt(i, 2500), sound, duration: d, aspect_ratio: ar(i.aspect_ratio, ["16:9", "9:16", "1:1"], "16:9") }, [tier, 1]); } },
  { id: "wan-3.0", cat: "video", per: "second",
    kie: { "480p": 0.04, "720p": 0.08, "1080p": 0.16 },
    build: i => wan3("wan/3-0-video", i) },
  { id: "wan-3.0-prime", cat: "video", per: "second",
    kie: { "480p": 0.0612, "720p": 0.126, "1080p": 0.252 },
    build: i => wan3("wan/3-0-video-prime", i) },
  { id: "wan-2.7", cat: "video", per: "second",
    kie: { "720p": 0.08, "1080p": 0.12 },
    build: i => { noVideoRefs(i); const im = imgs(i, 2), res = oneOf(i.resolution, "resolution", ["720p", "1080p"], "1080p"), d = int(i.duration, "duration", 2, 15, 5);
      const common = { prompt: prompt(i, 5000), negative_prompt: optStr(i.negative_prompt, "negative_prompt", 500), resolution: res, duration: d };
      return im ? job("wan/2-7-image-to-video", { ...common, first_frame_url: im[0], last_frame_url: im[1] }, [res, d])
        : job("wan/2-7-text-to-video", { ...common, ratio: ar(i.aspect_ratio, ["16:9", "9:16", "1:1", "4:3", "3:4"], "16:9") }, [res, d]); } },
  { id: "wan-2.6", cat: "video", per: "video",
    kie: { "720p-5s": 0.35, "720p-10s": 0.70, "720p-15s": 1.05, "1080p-5s": 0.5225, "1080p-10s": 1.0475, "1080p-15s": 1.575, "i2v-1080p-10s": 1.05 },
    build: i => { const im = imgs(i, 1), res = oneOf(i.resolution, "resolution", ["720p", "1080p"], "1080p"), d = oneOf(i.duration == null ? null : String(i.duration), "duration", ["5", "10", "15"], "5");
      const tier = im && res === "1080p" && d === "10" ? "i2v-1080p-10s" : `${res}-${d}s`;
      return job(im ? "wan/2-6-image-to-video" : "wan/2-6-text-to-video", { prompt: prompt(i, 5000), duration: d, resolution: res, multi_shots: false, ...(im ? { image_urls: im } : {}) }, [tier, 1]); } },
  { id: "hailuo-2.3", cat: "video", per: "video",
    kie: { "pro-768p-6s": 0.225, "pro-768p-10s": 0.45, "pro-1080p-6s": 0.40, "standard-768p-6s": 0.15, "standard-768p-10s": 0.25, "standard-1080p-6s": 0.25 },
    build: i => { const mode = oneOf(i.mode, "mode", ["pro", "standard"], "standard"), res = oneOf(i.resolution, "resolution", ["768p", "1080p"], "768p"),
      d = oneOf(i.duration == null ? null : String(i.duration), "duration", ["6", "10"], "6"), im = imgs(i, 1);
      if (!im) fail(422, "invalid_input", "input.image_urls is required: Hailuo 2.3 animates an image.");
      if (res === "1080p" && d === "10") fail(422, "invalid_input", "10s videos are only available at 768p.");
      return job(`hailuo/2-3-image-to-video-${mode}`, { prompt: prompt(i, 5000), image_url: im[0], duration: d, resolution: res.toUpperCase() }, [`${mode}-${res}-${d}s`, 1]); } },
  { id: "minimax-h3", cat: "video", per: "second",
    kie: { "768p": 0.04, "2k": 0.065, "input-image": [0.02, "input image"] },
    build: i => { const im = imgs(i, 2), res = oneOf(i.resolution, "resolution", ["768p", "2k"], "768p"), d = int(i.duration, "duration", 4, 15, 6);
      const common = { prompt: prompt(i, 7000), duration: d, resolution: res === "2k" ? "2K" : "768P" };
      return im ? job("minimax-h3/image-to-video", { ...common, first_frame_url: im[0], last_frame_url: im[1] }, [res, d], ["input-image", im.length])
        : job("minimax-h3/text-to-video", { ...common, aspect_ratio: ar(i.aspect_ratio, ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], "16:9") }, [res, d]); } },
  { id: "grok-imagine-video", cat: "video", per: "second",
    kie: { "480p": 0.012, "720p": 0.0225, "1080p": 0.04 },
    build: i => { const im = imgs(i, 7), res = oneOf(i.resolution, "resolution", ["480p", "720p", "1080p"], "720p"), d = int(i.duration, "duration", 6, 30, 6);
      const common = { mode: oneOf(i.mode, "mode", ["normal", "fun"], "normal"), resolution: res, aspect_ratio: ar(i.aspect_ratio, ["16:9", "9:16", "1:1", "2:3", "3:2"], "16:9") };
      return im ? job("grok-imagine/image-to-video", { ...common, prompt: optStr(i.prompt, "prompt", 5000), image_urls: im, duration: String(d) }, [res, d])
        : job("grok-imagine/text-to-video", { ...common, prompt: prompt(i, 5000), duration: d }, [res, d]); } },
  { id: "pixverse-v6", cat: "video", per: "second",
    kie: { "360p": 0.02, "360p-audio": 0.028, "540p": 0.028, "540p-audio": 0.036, "720p": 0.036, "720p-audio": 0.048, "1080p": 0.072, "1080p-audio": 0.092 },
    build: i => { const im = imgs(i, 1), res = oneOf(i.resolution, "resolution", ["360p", "540p", "720p", "1080p"], "720p"), d = int(i.duration, "duration", 1, 15, 5), audio = bool(i.generate_audio, "generate_audio", false);
      const common = { prompt: prompt(i, 5000), quality: res, duration: d, generate_audio_switch: audio, generate_multi_clip_switch: false }, tier = res + (audio ? "-audio" : "");
      return im ? job("pixverse-v6/image-to-video", { ...common, image_urls: im }, [tier, d])
        : job("pixverse-v6/text-to-video", { ...common, aspect_ratio: ar(i.aspect_ratio, ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"], "16:9") }, [tier, d]); } },
  { id: "happyhorse-1.1", cat: "video", per: "second",
    kie: { "720p": 0.1125, "1080p": 0.145 },
    build: i => { const im = imgs(i, 1), res = oneOf(i.resolution, "resolution", ["720p", "1080p"], "1080p"), d = int(i.duration, "duration", 3, 15, 5);
      return im ? job("happyhorse-1-1/image-to-video", { prompt: optStr(i.prompt, "prompt", 5000), image_urls: im, resolution: res, duration: d }, [res, d])
        : job("happyhorse-1-1/text-to-video", { prompt: prompt(i, 5000), resolution: res, duration: d, aspect_ratio: ar(i.aspect_ratio, ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"], "16:9") }, [res, d]); } },

  // ---------- Image ----------
  { id: "gpt-image-2.5", cat: "image", per: "image",
    kie: { "1K": 0.03, "2K": 0.05, "4K": 0.08 },
    build: i => { const im = imgs(i, 8), res = oneOf(i.resolution, "resolution", ["1K", "2K", "4K"], "2K");
      return job(`gpt-image-2-5-flare-${im ? "image-to-image" : "text-to-image"}`, { prompt: prompt(i, 20000), resolution: res,
        aspect_ratio: ar(i.aspect_ratio, ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"], "1:1"),
        background: oneOf(i.background, "background", ["transparent", "opaque", "auto"], "auto"), ...(im ? { input_urls: im } : {}) }, [res, 1]); } },
  { id: "gpt-image-2", cat: "image", per: "image",
    kie: { "1K": 0.03, "2K": 0.05, "4K": 0.08 },
    build: i => { const im = imgs(i, 16), res = oneOf(i.resolution, "resolution", ["1K", "2K", "4K"], "1K");
      return job(`gpt-image-2-${im ? "image-to-image" : "text-to-image"}`, { prompt: prompt(i, 20000), resolution: res,
        aspect_ratio: ar(i.aspect_ratio, ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"], "1:1"),
        background: res === "1K" ? oneOf(i.background, "background", ["transparent", "opaque", "auto"], undefined) : undefined, ...(im ? { input_urls: im } : {}) }, [res, 1]); } },
  { id: "nano-banana-pro", cat: "image", per: "image",
    kie: { "1K": 0.09, "2K": 0.09, "4K": 0.12 },
    build: i => { const im = imgs(i, 8), res = oneOf(i.resolution, "resolution", ["1K", "2K", "4K"], "2K");
      return job("nano-banana-pro", { prompt: prompt(i, 20000), resolution: res,
        aspect_ratio: ar(i.aspect_ratio, ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"], im ? "auto" : "1:1"),
        output_format: oneOf(i.output_format, "output_format", ["png", "jpg"], "png"), ...(im ? { image_input: im } : {}) }, [res, 1]); } },
  { id: "nano-banana-2", cat: "image", per: "image",
    kie: { "1K": 0.04, "2K": 0.06, "4K": 0.09 },
    build: i => nanoBanana("nano-banana-2", i, 14) },
  { id: "nano-banana-2.1", cat: "image", per: "image",
    kie: { "1K": 0.02, "2K": 0.03, "4K": 0.045 },
    build: i => nanoBanana("nano-banana-2-1", i, 10) },
  { id: "seedream-5-pro", cat: "image", per: "image",
    // The first input image is free; each extra one is billed.
    kie: { "1K": 0.035, "2K": 0.07, "extra-input-image": [0.0025, "extra input image"] },
    build: i => { const im = imgs(i, 10), res = oneOf(i.resolution, "resolution", ["1K", "2K"], "2K");
      return job(`seedream/5-pro-${im ? "image-to-image" : "text-to-image"}`, { prompt: prompt(i, 5000), quality: res === "1K" ? "basic" : "high",
        aspect_ratio: ar(i.aspect_ratio, ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"], "1:1"),
        output_format: oneOf(i.output_format, "output_format", ["png", "jpeg"], "png"), ...(im ? { image_urls: im } : {}) },
        [res, 1], ...(im && im.length > 1 ? [["extra-input-image", im.length - 1]] : [])); } },
  { id: "seedream-5-flash", cat: "image", per: "image",
    kie: { "1K": 0.0162, "1.5K": 0.0162, "2K": 0.0162 },
    build: i => { const im = imgs(i, 10), res = oneOf(i.resolution, "resolution", ["1K", "1.5K", "2K"], "2K");
      return job(`seedream/5-flash-${im ? "image-to-image" : "text-to-image"}`, { prompt: prompt(i, 5000), size: res,
        aspect_ratio: ar(i.aspect_ratio, ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"], "1:1"),
        output_format: oneOf(i.output_format, "output_format", ["png", "jpeg"], "png"), ...(im ? { image_urls: im } : {}) }, [res, 1]); } },
  { id: "seedream-5-lite", cat: "image", per: "image",
    // One price for basic (2K), high (3K) and ultra (4K).
    kie: { "image": 0.0275 },
    build: i => { const im = imgs(i, 14);
      return job(`seedream/5-lite-${im ? "image-to-image" : "text-to-image"}`, { prompt: prompt(i, 2995), quality: oneOf(i.quality, "quality", ["basic", "high", "ultra"], "basic"),
        aspect_ratio: ar(i.aspect_ratio, ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"], "1:1"),
        output_format: oneOf(i.output_format, "output_format", ["png", "jpeg"], "png"), ...(im ? { image_urls: im } : {}) }, ["image", 1]); } },
  { id: "flux-2-pro", cat: "image", per: "image",
    kie: { "1K": 0.025, "2K": 0.035 },
    build: i => flux2("pro", i) },
  { id: "flux-2-flex", cat: "image", per: "image",
    kie: { "1K": 0.07, "2K": 0.12 },
    build: i => flux2("flex", i) },
  { id: "imagen-4", cat: "image", per: "image",
    kie: { "fast": 0.02, "standard": 0.04, "ultra": 0.06 },
    build: i => { const v = oneOf(i.mode, "mode", ["fast", "standard", "ultra"], "standard");
      return job({ fast: "google/imagen4-fast", standard: "google/imagen4", ultra: "google/imagen4-ultra" }[v], { prompt: prompt(i, 5000),
        negative_prompt: optStr(i.negative_prompt, "negative_prompt", 5000), aspect_ratio: ar(i.aspect_ratio, ["1:1", "16:9", "9:16", "3:4", "4:3"], "1:1") }, [v, 1]); } },
  { id: "ideogram-v3", cat: "image", per: "image",
    kie: { "TURBO": 0.0175, "BALANCED": 0.035, "QUALITY": 0.05 },
    build: i => { const speed = oneOf(i.rendering_speed, "rendering_speed", ["TURBO", "BALANCED", "QUALITY"], "BALANCED");
      return job("ideogram/v3-text-to-image", { prompt: prompt(i, 5000), rendering_speed: speed, style: oneOf(i.style, "style", ["AUTO", "GENERAL", "REALISTIC", "DESIGN"], "AUTO"),
        image_size: oneOf(i.image_size, "image_size", ["square", "square_hd", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"], "square_hd"),
        negative_prompt: optStr(i.negative_prompt, "negative_prompt", 5000) }, [speed, 1]); } },
  { id: "qwen-image-3", cat: "image", per: "image",
    kie: { "1K": 0.024, "2K": 0.024, "input-image": [0.0025, "input image"] },
    build: i => qwen3("qwen3/", i) },
  { id: "qwen-image-3-pro", cat: "image", per: "image",
    kie: { "1K": 0.032, "2K": 0.06, "input-image": [0.0025, "input image"] },
    build: i => qwen3("qwen3/pro-", i) },
  { id: "grok-imagine-image", cat: "image", per: "image",
    kie: { "image": 0.02 },
    build: i => { const im = imgs(i, 5);
      return im ? job("grok-imagine-image-2-0/image-edit", { prompt: optStr(i.prompt, "prompt", 8000), image_urls: im, aspect_ratio: ar(i.aspect_ratio, ["1:1", "2:3", "3:2", "16:9", "9:16", "auto"], "auto") }, ["image", 1])
        : job("grok-imagine-image-2-0/text-to-image", { prompt: prompt(i, 8000), aspect_ratio: ar(i.aspect_ratio, ["1:1", "2:3", "3:2", "16:9", "9:16"], "1:1") }, ["image", 1]); } },
  { id: "wan-2.7-image", cat: "image", per: "image",
    kie: { "image": 0.024 },
    build: i => wanImage("wan/2-7-image", i, ["1K", "2K"]) },
  { id: "wan-2.7-image-pro", cat: "image", per: "image",
    kie: { "image": 0.06 },
    build: i => wanImage("wan/2-7-image-pro", i, ["1K", "2K", "4K"]) },

  // ---------- Audio (unchanged: fixed price per unit) ----------
  { id: "suno-v6", cat: "audio", per: "song, up to 4 min", fixed: 0.08,
    // Custom mode when the caller supplies lyrics or a title; otherwise Suno writes everything from the prompt + style.
    build: i => {
      const instrumental = bool(i.instrumental, "instrumental", false);
      if (i.lyrics != null || i.title != null) return job("ai-music-api/generate", { model: "V6", custom_mode: true, instrumental,
        title: str(i.title, "title", 80), style: str(i.style ?? i.prompt, "style", 1000), ...(i.lyrics != null ? { lyrics: str(i.lyrics, "lyrics", 5000) } : {}) }, ["fixed", 1]);
      const p = prompt(i, 3000);
      return job("ai-music-api/generate", { model: "V6", custom_mode: false, instrumental, prompt: p, style: i.style != null ? str(i.style, "style", 1000) : p.slice(0, 1000) }, ["fixed", 1]);
    } },
  { id: "elevenlabs-v3", cat: "audio", per: "1k characters", fixed: 0.18,
    build: i => { const text = str(i.text ?? i.prompt, "text", 1000);
      return job("elevenlabs/text-to-dialogue-v3", { dialogue: [{ text, voice: i.voice == null ? "Rachel" : str(i.voice, "voice", 64) }],
        stability: oneOf(i.stability, "stability", [0, 0.5, 1], 0.5) }, ["fixed", 1]); } },
];

function wan3(model, i) {
  noVideoRefs(i);
  if (i.duration === -1) fail(422, "invalid_input", "input.duration must be set; automatic duration is not supported.");
  const im = imgs(i, 2), res = oneOf(i.resolution, "resolution", ["480p", "720p", "1080p"], "1080p"), d = int(i.duration, "duration", 2, 30, 5);
  return job(model, { prompt: im ? optStr(i.prompt, "prompt", 20000) : prompt(i, 20000), resolution: res.toUpperCase(), duration: d,
    aspect_ratio: ar(i.aspect_ratio, ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], "adaptive"), audio: bool(i.audio, "audio", true),
    ...(im ? { first_frame_url: im[0], last_frame_url: im[1] } : {}) }, [res, d]);
}
function nanoBanana(model, i, max) {
  const im = imgs(i, max), res = oneOf(i.resolution, "resolution", ["1K", "2K", "4K"], "1K");
  return job(model, { prompt: prompt(i, 20000), resolution: res,
    aspect_ratio: ar(i.aspect_ratio, ["1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5", "5:4", "1:8", "8:1", "9:16", "16:9", "21:9", "auto"], "auto"),
    output_format: oneOf(i.output_format, "output_format", ["png", "jpg"], "png"), ...(im ? { image_input: im } : {}) }, [res, 1]);
}
function flux2(kind, i) {
  const im = imgs(i, 8), res = oneOf(i.resolution, "resolution", ["1K", "2K"], "1K");
  return job(`flux-2/${kind}-${im ? "image-to-image" : "text-to-image"}`, { prompt: prompt(i, 5000), resolution: res,
    aspect_ratio: ar(i.aspect_ratio, ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", ...(im ? ["auto"] : [])], "1:1"), ...(im ? { input_urls: im } : {}) }, [res, 1]);
}
function qwen3(prefix, i) {
  const im = imgs(i, 3), res = oneOf(i.resolution, "resolution", ["1K", "2K"], "1K");
  return job(`${prefix}${im ? "image-to-image" : "text-to-image"}`, { prompt: prompt(i, 5000), resolution: res,
    image_size: ar(i.aspect_ratio, ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"], "1:1"),
    output_format: oneOf(i.output_format, "output_format", ["png", "jpeg"], "png"), negative_prompt: optStr(i.negative_prompt, "negative_prompt", 5000),
    ...(im ? { image_urls: im } : {}) }, [res, 1], ...(im ? [["input-image", im.length]] : []));
}
function wanImage(model, i, resolutions) {
  const im = imgs(i, 9), n = int(i.n, "n", 1, 4, 1), res = oneOf(i.resolution, "resolution", resolutions, "2K");
  if (im && res === "4K") fail(422, "invalid_input", "4K is only available without input images.");
  return job(model, { prompt: prompt(i, 5000), n, resolution: res, enable_sequential: false, watermark: false,
    ...(im ? { input_urls: im } : { aspect_ratio: ar(i.aspect_ratio, ["1:1", "16:9", "4:3", "21:9", "3:4", "9:16", "8:1", "1:8"], "1:1") }) }, ["image", n]);
}

// Sale price table per model: { tier: { micros, per } }.
const tiers = m => m.fixed != null ? { fixed: { micros: Math.round(m.fixed * 1e6), per: m.per } }
  : Object.fromEntries(Object.entries(m.kie).map(([k, v]) => Array.isArray(v) ? [k, { micros: saleMicros(v[0]), per: v[1] }] : [k, { micros: saleMicros(v), per: m.per }]));
for (const m of MEDIA) m.tiers = tiers(m);

// Validate `input` and return the upstream request builder plus the exact cost in micro-dollars. Throws 422 on bad input.
export function quote(model, input) {
  const { up, charges } = model.build(input);
  let micros = 0;
  for (const [tier, qty] of charges) {
    const t = model.tiers[tier];
    if (!t) throw new Error(`${model.id}: no price for tier ${tier}`);
    micros += t.micros * qty;
  }
  return { up, charges, micros };
}

// USD per 1M tokens. `upstream` is the OpenRouter model id; override with CHAT_MODEL_MAP if the provider renames it.
const CHAT = [
  { id: "claude-opus-5-5", cat: "chat", input: 4.00, output: 20.00, upstream: "anthropic/claude-opus-5.5" },
  { id: "gpt-5.5", cat: "chat", input: 1.60, output: 8.00, upstream: "openai/gpt-5.5" },
  { id: "gemini-3-pro", cat: "chat", input: 1.92, output: 9.60, upstream: "google/gemini-3-pro" },
];

export const mediaModel = id => MEDIA.find(m => m.id === id) || null;
export const mediaModels = () => MEDIA;
export const chatModel = id => CHAT.find(m => m.id === id) || null;
export const allModels = () => [
  ...MEDIA.map(m => ({ id: m.id, object: "model", type: m.cat, endpoint: "/v1/tasks",
    pricing: Object.entries(m.tiers).map(([option, t]) => ({ option, usd: t.micros / 1e6, per: t.per })) })),
  ...CHAT.map(m => ({ id: m.id, object: "model", type: "chat", endpoint: "/v1/chat/completions", input_usd_per_1m: m.input, output_usd_per_1m: m.output })),
];
export function applyChatOverrides(env) {
  if (!env.CHAT_MODEL_MAP) return;
  try { const map = JSON.parse(env.CHAT_MODEL_MAP); for (const m of CHAT) if (map[m.id]) m.upstream = map[m.id]; } catch {}
}
