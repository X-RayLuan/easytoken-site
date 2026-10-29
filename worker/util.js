// Small helpers shared by every route.

export const MICRO = 1_000_000;
export const toMicros = usd => Math.round(usd * MICRO);
export const toUsd = micros => Math.round(micros) / MICRO;

export function parseUsd(v) {
  const text = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
  if (typeof text !== "string" || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(text)) fail(422, "invalid_input", "Amount must be positive USD with at most six decimals.");
  const [whole, fraction = ""] = text.split(".");
  const micros = Number(whole) * MICRO + Number(fraction.padEnd(6, "0"));
  if (!Number.isSafeInteger(micros) || micros <= 0) fail(422, "invalid_input", "Amount must be positive and exactly representable.");
  return micros;
}
export function canonicalJson(v) {
  if (v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
  fail(422, "invalid_input", "Unsupported request value.");
}
export class ApiError extends Error {
  constructor(status, code, message, headers = {}) { super(message); this.status = status; this.code = code; this.headers = headers; }
}
export const fail = (status, code, message, headers) => { throw new ApiError(status, code, message, headers); };

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
export function errorResponse(e) {
  if (e instanceof ApiError) return json({ error: { code: e.code, message: e.message,
    type: e.status === 429 ? "rate_limit_error" : e.status >= 500 ? "server_error" : "invalid_request_error",
    param: null, ...(e.status === 429 ? { retry_after: Number(e.headers["retry-after"] || 15) } : {}) } }, e.status, e.headers);
  console.error("unhandled", e?.stack || e);
  return json({ error: { code: "internal_error", message: "Something went wrong on our side. Please retry.", type: "server_error", param: null } }, 500);
}

export async function readJson(request, max = 256 * 1024) {
  const text = await request.text();
  if (text.length > max) fail(413, "payload_too_large", "Request body is too large.");
  if (!text) return {};
  try { const v = JSON.parse(text); if (v && typeof v === "object" && !Array.isArray(v)) return v; } catch {}
  fail(400, "invalid_json", "Send a JSON object in the request body.");
}

const ALPHA = "abcdefghijkmnpqrstuvwxyz23456789";
export function randomToken(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = ""; for (const b of bytes) s += ALPHA[b % ALPHA.length]; // 256 % 32 == 0, so no bias
  return s;
}
export const newId = prefix => `${prefix}_${randomToken(14)}`;

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
export async function sha256(text) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(text))); }
export async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Workers cap PBKDF2 at 100k iterations.
const PBKDF2_ITER = 100_000;
export async function hashPassword(pw, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g), h => parseInt(h, 16)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256);
  return `pbkdf2$${PBKDF2_ITER}$${hex(salt)}$${hex(bits)}`;
}
export async function verifyPassword(pw, stored) {
  const [, , salt] = String(stored).split("$");
  return salt ? safeEqual(await hashPassword(pw, salt), stored) : false;
}

export const nowIso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");
export const clientIp = request => request.headers.get("cf-connecting-ip") || "0.0.0.0";

// Only https URLs on public hosts may receive our webhooks.
export function safeCallbackUrl(value) {
  if (value == null || value === "") return null;
  let u; try { u = new URL(String(value)); } catch { fail(422, "invalid_input", "callback_url must be a valid https URL."); }
  if (u.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || u.hostname.endsWith(".local") || u.hostname.endsWith(".internal"))
    fail(422, "invalid_input", "callback_url must be a public https URL.");
  return u.toString();
}
