// kie.ai chat: translate OpenAI chat completions to kie's endpoints and back, and price the usage kie reports.
// "anthropic" models use kie's Claude Messages endpoint, "responses" models its OpenAI Responses (Codex) endpoint.
import { fail } from "./util.js";

export const KIE_CHAT_BASE = "https://api.kie.ai";
// kie's Codex endpoint answers as a coding agent ("You are Codex…") unless the request sets `instructions`.
const DEFAULT_INSTRUCTIONS = "You are a helpful assistant.";

const textOf = c => typeof c === "string" ? c : Array.isArray(c) ? c.map(p => p?.type === "text" ? p.text : "").join("") : "";
const args = s => { try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { fail(422, "invalid_input", "tool_calls[].function.arguments must be a JSON object string."); } };

function parts(content, image) {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) fail(422, "invalid_input", "message content must be a string or an array of parts.");
  return content.map(p => {
    if (p?.type === "text") return { type: "text", text: String(p.text ?? "") };
    if (p?.type === "image_url") return image(typeof p.image_url === "string" ? p.image_url : p.image_url?.url);
    fail(422, "invalid_input", `Content part type '${p?.type}' is not supported; send text and image_url parts.`);
  });
}

function anthropicImage(url) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(url || ""));
  return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } } : { type: "image", source: { type: "url", url: String(url || "") } };
}

function jsonHint(rf) {
  if (rf?.type === "json_object") return "Respond with a single valid JSON object and nothing else.";
  if (rf?.type === "json_schema") return `Respond with a single valid JSON value matching this JSON Schema and nothing else:\n${JSON.stringify(rf.json_schema?.schema ?? {})}`;
  return "";
}

function toAnthropic(model, body) {
  const system = [], messages = [];
  const push = (role, blocks) => { const last = messages.at(-1); if (last?.role === role) last.content.push(...blocks); else messages.push({ role, content: blocks }); };
  for (const m of body.messages) {
    if (m?.role === "system" || m?.role === "developer") system.push(textOf(m.content));
    else if (m?.role === "user") push("user", parts(m.content, anthropicImage));
    else if (m?.role === "assistant") {
      const blocks = m.content ? parts(m.content, anthropicImage).filter(b => b.type !== "text" || b.text) : [];
      for (const t of m.tool_calls || []) blocks.push({ type: "tool_use", id: t.id, name: t.function?.name, input: args(t.function?.arguments) });
      if (blocks.length) push("assistant", blocks);
    } else if (m?.role === "tool") push("user", [{ type: "tool_result", tool_use_id: m.tool_call_id, content: textOf(m.content) }]);
    else fail(422, "invalid_input", `Unsupported message role '${m?.role}'.`);
  }
  const hint = jsonHint(body.response_format);
  if (hint) system.push(hint);
  const up = { model: model.upstream, messages, max_tokens: Number(body.max_completion_tokens ?? body.max_tokens) || 4096, stream: body.stream === true };
  if (system.length) up.system = system.join("\n\n");
  if (body.temperature != null) up.temperature = body.temperature;
  if (body.top_p != null) up.top_p = body.top_p;
  if (body.stop != null) up.stop_sequences = [].concat(body.stop);
  if (Array.isArray(body.tools) && body.tools.length) {
    up.tools = body.tools.map(t => ({ name: t.function?.name, description: t.function?.description, input_schema: t.function?.parameters || { type: "object", properties: {} } }));
    const tc = body.tool_choice;
    if (tc === "required") up.tool_choice = { type: "any" };
    else if (tc === "none") up.tool_choice = { type: "none" };
    else if (tc?.type === "function") up.tool_choice = { type: "tool", name: tc.function?.name };
    else if (tc != null) up.tool_choice = { type: "auto" };
  }
  return up;
}

function toResponses(model, body) {
  if (body.stop != null) fail(422, "invalid_input", `stop is not supported by ${model.id}.`);
  const system = [], input = [];
  for (const m of body.messages) {
    if (m?.role === "system" || m?.role === "developer") system.push(textOf(m.content));
    else if (m?.role === "user") input.push({ role: "user", content: parts(m.content, url => ({ type: "input_image", image_url: String(url || "") })).map(p => p.type === "text" ? { type: "input_text", text: p.text } : p) });
    else if (m?.role === "assistant") {
      const text = textOf(m.content);
      if (text) input.push({ role: "assistant", content: [{ type: "output_text", text }] });
      for (const t of m.tool_calls || []) input.push({ type: "function_call", call_id: t.id, name: t.function?.name, arguments: t.function?.arguments || "{}" });
    } else if (m?.role === "tool") input.push({ type: "function_call_output", call_id: m.tool_call_id, output: textOf(m.content) });
    else fail(422, "invalid_input", `Unsupported message role '${m?.role}'.`);
  }
  const up = { model: model.upstream, instructions: system.join("\n\n") || DEFAULT_INSTRUCTIONS, input, stream: body.stream === true, store: false };
  const max = Number(body.max_completion_tokens ?? body.max_tokens);
  if (max) up.max_output_tokens = max;
  if (body.temperature != null) up.temperature = body.temperature;
  if (body.top_p != null) up.top_p = body.top_p;
  if (body.reasoning_effort) up.reasoning = { effort: body.reasoning_effort };
  const rf = body.response_format;
  if (rf?.type === "json_object") up.text = { format: { type: "json_object" } };
  if (rf?.type === "json_schema") up.text = { format: { type: "json_schema", name: rf.json_schema?.name || "response", schema: rf.json_schema?.schema ?? {}, strict: rf.json_schema?.strict } };
  if (Array.isArray(body.tools) && body.tools.length) {
    up.tools = body.tools.map(t => ({ type: "function", name: t.function?.name, description: t.function?.description, parameters: t.function?.parameters || { type: "object", properties: {} } }));
    const tc = body.tool_choice;
    if (tc?.type === "function") up.tool_choice = { type: "function", name: tc.function?.name };
    else if (tc != null) up.tool_choice = tc;
  }
  return up;
}

// Validated upstream request body for an OpenAI-format chat body. Throws 422 on input kie cannot take.
export function toUpstream(model, body) {
  if (body.n != null && Number(body.n) !== 1) fail(422, "invalid_input", "n must be 1.");
  return model.api === "anthropic" ? toAnthropic(model, body) : toResponses(model, body);
}

// Exact sale price in micro-dollars of the usage kie reported: each token class at kie's price × MARKUP.
export function costOf(model, u) {
  const r = model.rates, n = v => Number(v) || 0;
  const micros = model.api === "anthropic"
    ? n(u.input_tokens) * r.input + n(u.cache_read_input_tokens) * r.cache_read + n(u.output_tokens) * r.output
    : (n(u.input_tokens) - n(u.input_tokens_details?.cached_tokens)) * r.input + n(u.input_tokens_details?.cached_tokens) * r.cached_input + n(u.output_tokens) * r.output;
  return Math.ceil(micros / 1e6);
}

export function openaiUsage(model, u) {
  const n = v => Number(v) || 0;
  if (model.api === "anthropic") {
    const prompt = n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens);
    return { prompt_tokens: prompt, completion_tokens: n(u.output_tokens), total_tokens: prompt + n(u.output_tokens), prompt_tokens_details: { cached_tokens: n(u.cache_read_input_tokens) } };
  }
  return { prompt_tokens: n(u.input_tokens), completion_tokens: n(u.output_tokens), total_tokens: n(u.input_tokens) + n(u.output_tokens),
    prompt_tokens_details: { cached_tokens: n(u.input_tokens_details?.cached_tokens) }, completion_tokens_details: { reasoning_tokens: n(u.output_tokens_details?.reasoning_tokens) } };
}

const ANTHROPIC_FINISH = { end_turn: "stop", stop_sequence: "stop", max_tokens: "length", tool_use: "tool_calls", refusal: "content_filter" };

// kie error message from a JSON body (kie sometimes answers HTTP 200 with { code, msg }).
export const errorOf = d => d?.error?.message || d?.msg || d?.message || (typeof d?.error === "string" ? d.error : "");

// Non-streaming kie reply → { message, finish, usage (kie's), credits } or { error }.
export function fromResponse(model, d) {
  if (model.api === "anthropic") {
    if (d?.type !== "message" || !d.usage) return { error: errorOf(d) || "unexpected reply" };
    const text = d.content.filter(b => b.type === "text").map(b => b.text).join("");
    const tools = d.content.filter(b => b.type === "tool_use").map(b => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
    return { message: { role: "assistant", content: text || (tools.length ? null : ""), ...(tools.length ? { tool_calls: tools } : {}) },
      finish: ANTHROPIC_FINISH[d.stop_reason] || "stop", usage: d.usage, credits: d.credits_consumed };
  }
  if (d?.object !== "response" || !d.usage || d.status === "failed") return { error: d?.error?.message || errorOf(d) || "unexpected reply" };
  const out = d.output || [];
  const text = out.filter(i => i.type === "message").flatMap(i => i.content || []).filter(c => c.type === "output_text").map(c => c.text).join("");
  const tools = out.filter(i => i.type === "function_call").map(i => ({ id: i.call_id, type: "function", function: { name: i.name, arguments: i.arguments || "{}" } }));
  const finish = tools.length ? "tool_calls" : d.status === "incomplete" ? (d.incomplete_details?.reason === "content_filter" ? "content_filter" : "length") : "stop";
  return { message: { role: "assistant", content: text || (tools.length ? null : ""), ...(tools.length ? { tool_calls: tools } : {}) }, finish, usage: d.usage, credits: d.credits_consumed ?? d.response?.credits_consumed };
}

// Streaming: feed each kie SSE `data:` JSON to `event`; it returns OpenAI chunk deltas ({ delta } or { finish }).
// `usage` is set once kie reports final usage; `billed` (when set) is the part of it kie charges for. `error` if kie failed.
export function streamState(model) {
  const s = { usage: null, credits: null, error: null, tools: new Map(), finish: null };
  const tool = key => s.tools.get(key);
  s.event = d => {
    const t = d?.type, out = [];
    if (model.api === "anthropic") {
      if (t === "message_start") { s.base = { ...(d.message?.usage || {}) }; out.push({ delta: { role: "assistant", content: "" } }); }
      else if (t === "content_block_start" && d.content_block?.type === "tool_use") {
        const index = s.tools.size; s.tools.set(d.index, index);
        out.push({ delta: { tool_calls: [{ index, id: d.content_block.id, type: "function", function: { name: d.content_block.name, arguments: "" } }] } });
      } else if (t === "content_block_delta" && d.delta?.type === "text_delta") out.push({ delta: { content: d.delta.text } });
      else if (t === "content_block_delta" && d.delta?.type === "input_json_delta" && tool(d.index) != null) out.push({ delta: { tool_calls: [{ index: tool(d.index), function: { arguments: d.delta.partial_json } }] } });
      else if (t === "message_delta") {
        // kie bills a Claude stream on message_start's input_tokens plus message_delta's usage only: cache reads that
        // message_start reports are free when streamed (measured 2026-10-10), so they are not billed here either.
        s.usage = { ...(s.base || {}), ...(d.usage || {}) }; s.credits = d.credits_consumed ?? null;
        s.billed = { input_tokens: s.base?.input_tokens || 0, cache_read_input_tokens: 0, ...(d.usage || {}) };
        s.finish = ANTHROPIC_FINISH[d.delta?.stop_reason] || "stop";
      } else if (t === "message_stop") out.push({ finish: s.finish || "stop" });
      else if (t === "error") s.error = errorOf(d) || "stream error";
      return out;
    }
    if (t === "response.created") out.push({ delta: { role: "assistant", content: "" } });
    else if (t === "response.output_text.delta") out.push({ delta: { content: d.delta } });
    else if (t === "response.output_item.added" && d.item?.type === "function_call") {
      const index = s.tools.size; s.tools.set(d.output_index, index);
      out.push({ delta: { tool_calls: [{ index, id: d.item.call_id, type: "function", function: { name: d.item.name, arguments: "" } }] } });
    } else if (t === "response.function_call_arguments.delta" && tool(d.output_index) != null) out.push({ delta: { tool_calls: [{ index: tool(d.output_index), function: { arguments: d.delta } }] } });
    else if (t === "response.completed" || t === "response.incomplete") {
      s.usage = d.response?.usage || null; s.credits = d.credits_consumed ?? d.response?.credits_consumed ?? null;
      out.push({ finish: s.tools.size ? "tool_calls" : t === "response.incomplete" ? "length" : "stop" });
    } else if (t === "response.failed" || t === "error") s.error = d.response?.error?.message || errorOf(d) || "stream error";
    return out;
  };
  return s;
}
