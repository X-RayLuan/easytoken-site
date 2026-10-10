// Single source for model catalog and prices (USD). Every page reads from here.
// Media prices: `ours` is the exact price of the example `input` (checked against worker/catalog.js by the tests).
// Every option's price is listed by GET /v1/models. `official` is the "Official / Fal Price" kie.ai/pricing lists for the
// same options (null where kie shows N/A), from scripts/kie-snapshot.json; tests/official.test.mjs checks both.
const MODELS = [
  {id:"veo-3.1",         name:"Veo 3.1",         provider:"Google",     cat:"video", unit:"8s clip, 1080p, quality", official:3.20, ours:1.46625, eta:"~90s",
   blurb:"Cinematic text-to-video and image-to-video with native audio. Quality, Fast and Lite tiers up to 4K.", input:{prompt:"A barista pours latte art, slow motion", mode:"quality", resolution:"1080p"}},
  {id:"seedance-2.5",    name:"Seedance 2.5",    provider:"ByteDance",  cat:"video", unit:"5s clip, 720p",     official:2.365,  ours:1.81125, eta:"~60s",
   blurb:"Fast multi-shot video with strong motion and character consistency. 480p to 1080p, 4–30s.", input:{prompt:"Product spin on a marble table", resolution:"720p", duration:5}},
  {id:"seedance-2",      name:"Seedance 2.0",    provider:"ByteDance",  cat:"video", unit:"5s clip, 720p",     official:1.512,  ours:1.17875, eta:"~60s",
   blurb:"Text or first/last-frame video with synced audio, 480p up to 4K.", input:{prompt:"A paper boat drifts down a rainy street", resolution:"720p", duration:5}},
  {id:"seedance-2-fast", name:"Seedance 2.0 Fast", provider:"ByteDance", cat:"video", unit:"5s clip, 720p",    official:1.2095,  ours:0.713,   eta:"~40s",
   blurb:"Cheaper, quicker Seedance 2.0 at 480p or 720p.", input:{prompt:"A cat jumps onto a sunny windowsill", resolution:"720p", duration:5}},
  {id:"kling-3.0",       name:"Kling 3.0",       provider:"Kuaishou",   cat:"video", unit:"5s clip, 1080p (pro), no audio", official:0.56, ours:0.5175, eta:"~120s",
   blurb:"Realistic human motion and camera control. std 720p, pro 1080p or 4K, optional audio, 3–15s.", input:{prompt:"Drone shot over Lake Bled at dawn", mode:"pro", duration:5}},
  {id:"kling-3.0-turbo", name:"Kling 3.0 Turbo", provider:"Kuaishou",   cat:"video", unit:"5s clip, 1080p",    official:0.70,  ours:0.646875, eta:"~60s",
   blurb:"Faster Kling 3.0 for text-to-video and image-to-video at 720p or 1080p.", input:{prompt:"A skateboarder carves through a neon tunnel", resolution:"1080p", duration:5}},
  {id:"kling-2.6",       name:"Kling 2.6",       provider:"Kuaishou",   cat:"video", unit:"5s clip, no audio", official:0.35,  ours:0.31625, eta:"~90s",
   blurb:"Reliable 5s or 10s clips, with or without generated sound.", input:{prompt:"Waves crash on black volcanic sand", duration:"5"}},
  {id:"wan-3.0",         name:"Wan 3.0",         provider:"Alibaba",    cat:"video", unit:"5s clip, 1080p",    official:1.00,  ours:0.92,    eta:"~90s",
   blurb:"Text or first/last-frame video with audio, 480p to 1080p, up to 30s.", input:{prompt:"Lanterns rise over a night market", resolution:"1080p", duration:5}},
  {id:"wan-3.0-prime",   name:"Wan 3.0 Prime",   provider:"Alibaba",    cat:"video", unit:"5s clip, 1080p",    official:1.40,  ours:1.449,   eta:"~120s",
   blurb:"Highest-quality Wan 3.0 tier for hero shots.", input:{prompt:"A chef flambés a pan in slow motion", resolution:"1080p", duration:5}},
  {id:"wan-2.7",         name:"Wan 2.7",         provider:"Alibaba",    cat:"video", unit:"5s clip, 1080p",    official:0.75,  ours:0.69,    eta:"~90s",
   blurb:"Text-to-video and first/last-frame video at 720p or 1080p, 2–15s.", input:{prompt:"Autumn leaves swirl around a park bench", resolution:"1080p", duration:5}},
  {id:"wan-2.6",         name:"Wan 2.6",         provider:"Alibaba",    cat:"video", unit:"5s clip, 1080p",    official:0.75,  ours:0.600875, eta:"~90s",
   blurb:"5, 10 or 15 second clips from text or an image.", input:{prompt:"A hot air balloon over Cappadocia", resolution:"1080p", duration:"5"}},
  {id:"hailuo-2.3",      name:"Hailuo 2.3",      provider:"MiniMax",    cat:"video", unit:"6s clip, 768p, standard", official:0.28, ours:0.1725, eta:"~90s",
   blurb:"Image-to-video with lively motion. Standard or Pro, 768p or 1080p.", input:{prompt:"The girl turns and smiles", image_urls:["https://example.com/in.jpg"], mode:"standard", resolution:"768p", duration:"6"}},
  {id:"minimax-h3",      name:"MiniMax H3",      provider:"MiniMax",    cat:"video", unit:"6s clip, 768p",     official:null,  ours:0.276,   eta:"~90s",
   blurb:"Video with stereo audio from text or a first/last frame, 768p or 2K.", input:{prompt:"A street drummer plays at sunset", resolution:"768p", duration:6}},
  {id:"grok-imagine-video", name:"Grok Imagine Video", provider:"xAI",  cat:"video", unit:"6s clip, 720p",     official:0.42,  ours:0.15525, eta:"~60s",
   blurb:"Low-cost video with sound from text or up to 7 images, 6–30s.", input:{prompt:"A corgi surfs a small wave", resolution:"720p", duration:6}},
  {id:"pixverse-v6",     name:"PixVerse V6",     provider:"PixVerse",   cat:"video", unit:"5s clip, 720p, no audio", official:0.225, ours:0.207, eta:"~60s",
   blurb:"Stylised video from text or an image, 360p to 1080p, optional audio.", input:{prompt:"Origami cranes take flight", resolution:"720p", duration:5}},
  {id:"happyhorse-1.1",  name:"HappyHorse 1.1",  provider:"Alibaba",    cat:"video", unit:"5s clip, 1080p",    official:0.90,  ours:0.83375, eta:"~90s",
   blurb:"Text-to-video and image-to-video at 720p or 1080p, 3–15s.", input:{prompt:"A horse gallops across a misty meadow", resolution:"1080p", duration:5}},
  {id:"gpt-image-2.5",   name:"GPT Image 2.5",   provider:"OpenAI",     cat:"image", unit:"image, 2K",         official:null,  ours:0.0575, eta:"~20s",
   blurb:"Precise prompt following and readable text inside images. 1K, 2K or 4K.", input:{prompt:"Flat-lay of a skincare kit, soft light", aspect_ratio:"1:1"}},
  {id:"gpt-image-2",     name:"GPT Image 2",     provider:"OpenAI",     cat:"image", unit:"image, 1K",         official:0.219,  ours:0.0345, eta:"~20s",
   blurb:"Text-to-image and editing with up to 16 reference images.", input:{prompt:"Isometric illustration of a tiny bakery", resolution:"1K"}},
  {id:"nano-banana-pro", name:"Nano Banana Pro", provider:"Google",     cat:"image", unit:"image, 2K",         official:0.15,  ours:0.1035, eta:"~15s",
   blurb:"Conversational image editing: swap backgrounds, keep faces. 1K–4K.", input:{prompt:"Swap the background to a beach", image_urls:["https://example.com/in.jpg"]}},
  {id:"nano-banana-2",   name:"Nano Banana 2",   provider:"Google",     cat:"image", unit:"image, 1K",         official:0.08,  ours:0.046,  eta:"~15s",
   blurb:"Fast generation and editing with up to 14 reference images.", input:{prompt:"A cozy reading nook, watercolor", resolution:"1K"}},
  {id:"nano-banana-2.1", name:"Nano Banana 2.1", provider:"Google",     cat:"image", unit:"image, 1K",         official:0.08,  ours:0.023,  eta:"~15s",
   blurb:"Newest Nano Banana at a lower price, 1K to 4K.", input:{prompt:"Retro travel poster of Lisbon", resolution:"1K"}},
  {id:"seedream-5-pro",  name:"Seedream 5.0 Pro", provider:"ByteDance", cat:"image", unit:"image, 2K",         official:0.09,  ours:0.0805, eta:"~20s",
   blurb:"Photoreal images and multi-image edits, 1K or 2K.", input:{prompt:"Studio portrait of a ceramic artist", resolution:"2K"}},
  {id:"seedream-5-flash", name:"Seedream 5.0 Flash", provider:"ByteDance", cat:"image", unit:"image, 2K",      official:0.018,  ours:0.01863, eta:"~10s",
   blurb:"Cheapest Seedream: same price at 1K, 1.5K and 2K.", input:{prompt:"Minimal logo of a mountain fox", resolution:"2K"}},
  {id:"seedream-5-lite", name:"Seedream 5.0 Lite", provider:"ByteDance", cat:"image", unit:"image, 2K–4K",     official:0.035,  ours:0.031625, eta:"~15s",
   blurb:"One flat price for 2K, 3K or 4K output.", input:{prompt:"Macro shot of dew on a spider web"}},
  {id:"flux-2-pro",      name:"FLUX.2 Pro",      provider:"Black Forest Labs", cat:"image", unit:"image, 1MP", official:0.03,  ours:0.02875, eta:"~8s",
   blurb:"Photoreal images with fine detail at low cost per image. 1K or 2K.", input:{prompt:"Poster for a jazz night in Ljubljana"}},
  {id:"flux-2-flex",     name:"FLUX.2 Flex",     provider:"Black Forest Labs", cat:"image", unit:"image, 1K",  official:0.12,  ours:0.0805, eta:"~15s",
   blurb:"Best FLUX.2 typography and detail control.", input:{prompt:"Hand-lettered menu for a coffee shop", resolution:"1K"}},
  {id:"imagen-4",        name:"Imagen 4",        provider:"Google",     cat:"image", unit:"image, standard",   official:null,  ours:0.046,  eta:"~10s",
   blurb:"Google's text-to-image model in Fast, Standard and Ultra.", input:{prompt:"A lighthouse in a storm, oil painting", mode:"standard"}},
  {id:"ideogram-v3",     name:"Ideogram V3",     provider:"Ideogram",   cat:"image", unit:"image, balanced",   official:0.06,  ours:0.04025, eta:"~15s",
   blurb:"Strong text rendering for logos and posters. Turbo, Balanced or Quality.", input:{prompt:"Bold poster that says OPEN LATE", rendering_speed:"BALANCED"}},
  {id:"qwen-image-3",    name:"Qwen Image 3.0",  provider:"Alibaba",    cat:"image", unit:"image, 1K",         official:0.03,  ours:0.0276, eta:"~15s",
   blurb:"Bilingual text-to-image and editing, great with Chinese text.", input:{prompt:"A tea shop sign with Chinese calligraphy", resolution:"1K"}},
  {id:"qwen-image-3-pro", name:"Qwen Image 3.0 Pro", provider:"Alibaba", cat:"image", unit:"image, 1K",        official:0.04,  ours:0.0368, eta:"~20s",
   blurb:"Higher-quality Qwen Image 3.0, 1K or 2K.", input:{prompt:"Product shot of a jade bracelet", resolution:"1K"}},
  {id:"grok-imagine-image", name:"Grok Imagine Image", provider:"xAI",  cat:"image", unit:"image",             official:0.06,  ours:0.023,  eta:"~10s",
   blurb:"Quick text-to-image and image edits.", input:{prompt:"A robot gardener tending tomatoes"}},
  {id:"wan-2.7-image",   name:"Wan 2.7 Image",   provider:"Alibaba",    cat:"image", unit:"image, 2K",         official:0.03,  ours:0.0276, eta:"~20s",
   blurb:"Generation and editing with up to 9 input images.", input:{prompt:"Flat illustration of a city bike lane"}},
  {id:"wan-2.7-image-pro", name:"Wan 2.7 Image Pro", provider:"Alibaba", cat:"image", unit:"image, 2K",        official:0.075,  ours:0.069,  eta:"~25s",
   blurb:"Pro tier with 4K text-to-image.", input:{prompt:"Architectural render of a glass cabin"}},
  {id:"suno-v6",         name:"Suno V6",         provider:"Suno",       cat:"audio", unit:"song, up to 4 min", official:null,  ours:0.069,  eta:"~45s",
   blurb:"Full songs with vocals from a text prompt or your own lyrics.", input:{prompt:"Upbeat synth-pop jingle about coffee"}},
  {id:"elevenlabs-v3",   name:"ElevenLabs v3",   provider:"ElevenLabs", cat:"audio", unit:"1k characters",     official:0.10,  ours:0.0805,  eta:"~3s",
   blurb:"Expressive text-to-speech in 70+ languages.", input:{text:"Welcome to EasyToken.", voice:"Rachel"}},
  {id:"claude-opus-5-5", name:"Claude Opus 5.5", provider:"Anthropic",  cat:"chat",  unit:"1M output tokens",  official:20.00, ours:9.20, eta:"streaming",
   blurb:"Frontier reasoning and coding. OpenAI-compatible endpoint.", chat:true},
  {id:"gpt-5.5",         name:"GPT-5.5",         provider:"OpenAI",     cat:"chat",  unit:"1M output tokens",  official:30.00, ours:9.66,  eta:"streaming",
   blurb:"General-purpose model with tool calls and JSON mode.", chat:true},
];
const CATS = [["video","Video"],["image","Image"],["audio","Audio"],["chat","Chat"]];
const API_BASE = "https://api.easytoken.si/v1";

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
// Whole cents print as $0.05; anything finer keeps up to 6 decimals so prices show exactly what is billed.
const usd = n => { const s = Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 ? n.toFixed(2) : String(+n.toFixed(6)); return "$" + (!s.includes(".") ? s + ".00" : /\.\d$/.test(s) ? s + "0" : s); };
const pct = m => m.official ? Math.round((1 - m.ours / m.official) * 100) : null;
const offUsd = m => m.official ? usd(m.official) : "–";
// Savings only when we are below the official price; a few models cost slightly more than kie's listed price.
const save = m => pct(m) > 0 ? pct(m) : null;
const savePill = m => save(m) == null ? "" : `<span class="pill">−${save(m)}%</span>`;
const modelById = id => MODELS.find(m => m.id === id);

// Highlighted curl request for a model (used by landing, models and playground pages).
function snippet(m, key = "$EASYTOKEN_KEY"){
  const S = v => `<span class="s">${esc(JSON.stringify(v))}</span>`;
  if (m.chat) return `<span class="k">curl</span> ${API_BASE}/chat/completions \\
  -H <span class="s">"Authorization: Bearer ${esc(key)}"</span> \\
  -d '{
    "model": <span class="m">${esc(JSON.stringify(m.id))}</span>,
    "messages": [{"role": "user", "content": "Hi"}]
  }'`;
  const inp = Object.entries(m.input).map(([k,v]) => `      ${S(k)}: ${S(v)}`).join(",\n");
  return `<span class="k">curl</span> ${API_BASE}/tasks \\
  -H <span class="s">"Authorization: Bearer ${esc(key)}"</span> \\
  -d '{
    "model": <span class="m">${esc(JSON.stringify(m.id))}</span>,
    "input": {
${inp}
    },
    "callback_url": <span class="s">"https://yourapp.com/hooks/et"</span>
  }'`;
}

// Same-origin dashboard API (session cookie). Throws Error with .status/.code on failure.
async function api(path, body, method){
  const r = await fetch("/api" + path, { method: method || (body ? "POST" : "GET"), headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/login") Account.clear();
  if (!r.ok) { const e = new Error(data.error?.message || "Request failed. Please retry."); e.status = r.status; e.code = data.error?.code; throw e; }
  return data;
}
// Signed-in hint for the header only. The real session is an HttpOnly cookie checked by the server.
const Account = {
  get(){ try { return JSON.parse(localStorage.getItem("et_account")) } catch { return null } },
  set(a){ try { localStorage.setItem("et_account", JSON.stringify({ email: a.email })) } catch {} },
  clear(){ try { localStorage.removeItem("et_account") } catch {} },
};
