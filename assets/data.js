// Single source for model catalog and prices (USD). Every page reads from here.
const MODELS = [
  {id:"veo-3.1",         name:"Veo 3.1",         provider:"Google",     cat:"video", unit:"8s clip, 1080p",    official:6.00,  ours:2.50,  eta:"~90s",
   blurb:"Cinematic text-to-video and image-to-video with native audio.", input:{prompt:"A barista pours latte art, slow motion", duration:8}},
  {id:"seedance-2.5",    name:"Seedance 2.5",    provider:"ByteDance",  cat:"video", unit:"5s clip, 1080p",    official:1.20,  ours:0.55,  eta:"~60s",
   blurb:"Fast multi-shot video with strong motion and character consistency.", input:{prompt:"Product spin on a marble table", resolution:"1080p"}},
  {id:"kling-3.0",       name:"Kling 3.0",       provider:"Kuaishou",   cat:"video", unit:"5s clip, pro",      official:0.98,  ours:0.60,  eta:"~120s",
   blurb:"Realistic human motion, camera control and image-to-video.", input:{prompt:"Drone shot over Lake Bled at dawn", mode:"pro"}},
  {id:"gpt-image-2.5",   name:"GPT Image 2.5",   provider:"OpenAI",     cat:"image", unit:"image, 2K",         official:0.25,  ours:0.04,  eta:"~20s",
   blurb:"Precise prompt following and readable text inside images.", input:{prompt:"Flat-lay of a skincare kit, soft light", size:"2048x2048"}},
  {id:"flux-2-pro",      name:"FLUX.2 Pro",      provider:"Black Forest Labs", cat:"image", unit:"image, 1MP", official:0.05,  ours:0.03,  eta:"~8s",
   blurb:"Photoreal images with fine detail at low cost per image.", input:{prompt:"Poster for a jazz night in Ljubljana"}},
  {id:"nano-banana-pro", name:"Nano Banana Pro", provider:"Google",     cat:"image", unit:"image, 2K",         official:0.14,  ours:0.09,  eta:"~15s",
   blurb:"Conversational image editing: swap backgrounds, keep faces.", input:{prompt:"Swap the background to a beach", image_url:"https://example.com/in.jpg"}},
  {id:"suno-v6",         name:"Suno V6",         provider:"Suno",       cat:"audio", unit:"song, up to 4 min", official:0.10,  ours:0.06,  eta:"~45s",
   blurb:"Full songs with vocals from a text prompt or your own lyrics.", input:{prompt:"Upbeat synth-pop jingle about coffee"}},
  {id:"elevenlabs-v3",   name:"ElevenLabs v3",   provider:"ElevenLabs", cat:"audio", unit:"1k characters",     official:0.30,  ours:0.18,  eta:"~3s",
   blurb:"Expressive text-to-speech in 70+ languages.", input:{text:"Welcome to EasyToken.", voice:"Rachel"}},
  {id:"claude-opus-5-5", name:"Claude Opus 5.5", provider:"Anthropic",  cat:"chat",  unit:"1M output tokens",  official:25.00, ours:20.00, eta:"streaming",
   blurb:"Frontier reasoning and coding. OpenAI-compatible endpoint.", chat:true},
  {id:"gpt-5.5",         name:"GPT-5.5",         provider:"OpenAI",     cat:"chat",  unit:"1M output tokens",  official:10.00, ours:8.00,  eta:"streaming",
   blurb:"General-purpose model with tool calls and JSON mode.", chat:true},
  {id:"gemini-3-pro",    name:"Gemini 3 Pro",    provider:"Google",     cat:"chat",  unit:"1M output tokens",  official:12.00, ours:9.60,  eta:"streaming",
   blurb:"Long context and multimodal input for documents and video.", chat:true},
];
const CATS = [["video","Video"],["image","Image"],["audio","Audio"],["chat","Chat"]];
const API_BASE = "https://api.easytoken.si/v1";

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const usd = n => "$" + (n < 1 ? n.toFixed(3).replace(/0$/, "") : n.toFixed(2));
const pct = m => Math.round((1 - m.ours / m.official) * 100);
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

// Demo account kept in this browser only (no backend yet).
const Account = {
  get(){ try { return JSON.parse(localStorage.getItem("et_account")) } catch { return null } },
  set(a){ try { localStorage.setItem("et_account", JSON.stringify(a)) } catch {} },
  clear(){ try { localStorage.removeItem("et_account") } catch {} },
};
