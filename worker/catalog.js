// Billing source of truth: what each public model costs and how it maps to the upstream request.
// Prices must match assets/data.js (checked by tests/catalog.test.mjs).
// Parameters that change the upstream price are pinned to the unit we sell, so `price` is always exact.
import { fail } from "./util.js";

const str = (v, name, max) => {
  if (typeof v !== "string" || !v.trim()) fail(422, "invalid_input", `input.${name} is required and must be a string.`);
  if (v.length > max) fail(422, "invalid_input", `input.${name} must be at most ${max} characters.`);
  return v;
};
const oneOf = (v, name, allowed, dflt) => {
  if (v == null) return dflt;
  if (!allowed.includes(v)) fail(422, "invalid_input", `input.${name} must be one of: ${allowed.join(", ")}.`);
  return v;
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
const up = (model, input) => callbackUrl => ({ model, input, callbackUrl });

const MEDIA = [
  { id: "veo-3.1", cat: "video", price: 2.50, unit: "8s clip, 1080p",
    build: i => { const im = imgs(i, 2); return up("veo-3-1", { prompt: str(i.prompt, "prompt", 5000), model: "veo3", resolution: "1080p", duration: 8,
      aspect_ratio: oneOf(i.aspect_ratio, "aspect_ratio", ["16:9", "9:16", "Auto"], "16:9"),
      ...(im ? { image_urls: im, generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO" } : { generation_type: "TEXT_2_VIDEO" }) }); } },
  { id: "seedance-2.5", cat: "video", price: 1.95, unit: "5s clip, 720p",
    build: i => { const im = imgs(i, 2); return up("bytedance/seedance-2-5", { prompt: str(i.prompt, "prompt", 20000), duration: 5,
      resolution: oneOf(i.resolution, "resolution", ["480p", "720p"], "720p"),
      aspect_ratio: oneOf(i.aspect_ratio, "aspect_ratio", ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"], "adaptive"),
      generate_audio: bool(i.generate_audio, "generate_audio", true),
      ...(im ? { first_frame_url: im[0], ...(im[1] ? { last_frame_url: im[1] } : {}) } : {}) }); } },
  { id: "kling-3.0", cat: "video", price: 0.60, unit: "5s clip, pro",
    build: i => { const im = imgs(i, 2); return up("kling-3.0/video", { prompt: str(i.prompt, "prompt", 2500), duration: "5", mode: "pro", sound: false, multi_shots: false,
      aspect_ratio: oneOf(i.aspect_ratio, "aspect_ratio", ["16:9", "9:16", "1:1"], "16:9"), ...(im ? { image_urls: im } : {}) }); } },
  { id: "gpt-image-2.5", cat: "image", price: 0.06, unit: "image, 2K",
    build: i => { const im = imgs(i, 8); return up(`gpt-image-2-5-flare-${im ? "image-to-image" : "text-to-image"}`, { prompt: str(i.prompt, "prompt", 20000), resolution: "2K",
      aspect_ratio: oneOf(i.aspect_ratio, "aspect_ratio", ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"], "1:1"),
      background: oneOf(i.background, "background", ["transparent", "opaque", "auto"], "auto"), ...(im ? { input_urls: im } : {}) }); } },
  { id: "flux-2-pro", cat: "image", price: 0.03, unit: "image, 1MP",
    build: i => { const im = imgs(i, 8); return up(`flux-2/${im ? "pro-image-to-image" : "pro-text-to-image"}`, { prompt: str(i.prompt, "prompt", 5000), resolution: "1K",
      aspect_ratio: oneOf(i.aspect_ratio, "aspect_ratio", ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", ...(im ? ["auto"] : [])], "1:1"), ...(im ? { input_urls: im } : {}) }); } },
  { id: "nano-banana-pro", cat: "image", price: 0.11, unit: "image, 2K",
    build: i => { const im = imgs(i, 8); return up("nano-banana-pro", { prompt: str(i.prompt, "prompt", 20000), resolution: "2K",
      aspect_ratio: oneOf(i.aspect_ratio, "aspect_ratio", ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"], im ? "auto" : "1:1"),
      output_format: oneOf(i.output_format, "output_format", ["png", "jpg"], "png"), ...(im ? { image_input: im } : {}) }); } },
  { id: "suno-v6", cat: "audio", price: 0.08, unit: "song, up to 4 min",
    // Custom mode when the caller supplies lyrics or a title; otherwise Suno writes everything from the prompt + style.
    build: i => {
      const instrumental = bool(i.instrumental, "instrumental", false);
      if (i.lyrics != null || i.title != null) return up("ai-music-api/generate", { model: "V6", custom_mode: true, instrumental,
        title: str(i.title, "title", 80), style: str(i.style ?? i.prompt, "style", 1000), ...(i.lyrics != null ? { lyrics: str(i.lyrics, "lyrics", 5000) } : {}) });
      const prompt = str(i.prompt, "prompt", 3000);
      return up("ai-music-api/generate", { model: "V6", custom_mode: false, instrumental, prompt, style: i.style != null ? str(i.style, "style", 1000) : prompt.slice(0, 1000) });
    } },
  { id: "elevenlabs-v3", cat: "audio", price: 0.18, unit: "1k characters",
    build: i => { const text = str(i.text ?? i.prompt, "text", 1000);
      return up("elevenlabs/text-to-dialogue-v3", { dialogue: [{ text, voice: i.voice == null ? "Rachel" : str(i.voice, "voice", 64) }],
        stability: oneOf(i.stability, "stability", [0, 0.5, 1], 0.5) }); } },
];

// USD per 1M tokens. `upstream` is the OpenRouter model id; override with CHAT_MODEL_MAP if the provider renames it.
const CHAT = [
  { id: "claude-opus-5-5", cat: "chat", input: 4.00, output: 20.00, upstream: "anthropic/claude-opus-5.5" },
  { id: "gpt-5.5", cat: "chat", input: 1.60, output: 8.00, upstream: "openai/gpt-5.5" },
  { id: "gemini-3-pro", cat: "chat", input: 1.92, output: 9.60, upstream: "google/gemini-3-pro" },
];

export const mediaModel = id => MEDIA.find(m => m.id === id) || null;
export const chatModel = id => CHAT.find(m => m.id === id) || null;
export const allModels = () => [
  ...MEDIA.map(m => ({ id: m.id, object: "model", type: m.cat, endpoint: "/v1/tasks", price_usd: m.price, unit: m.unit })),
  ...CHAT.map(m => ({ id: m.id, object: "model", type: "chat", endpoint: "/v1/chat/completions", input_usd_per_1m: m.input, output_usd_per_1m: m.output })),
];
export function applyChatOverrides(env) {
  if (!env.CHAT_MODEL_MAP) return;
  try { const map = JSON.parse(env.CHAT_MODEL_MAP); for (const m of CHAT) if (map[m.id]) m.upstream = map[m.id]; } catch {}
}
