// Accounts, browser sessions and API keys.
import { fail, json, readJson, newId, randomToken, sha256, hashPassword, verifyPassword, nowIso, clientIp, toMicros, toUsd } from "./util.js";

const SESSION_COOKIE = "et_session";
const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function readCookie(request, name) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

async function startSession(env, userId) {
  const token = randomToken(40);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, nowIso(SESSION_DAYS * 864e5)).run();
  return sessionCookie(token, SESSION_DAYS * 86400);
}

export async function sessionUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .bind(await sha256(token), nowIso()).first();
}
export async function requireSession(request, env) {
  return (await sessionUser(request, env)) || fail(401, "not_signed_in", "Log in to continue.");
}

// Bearer key auth for /v1. Returns { user, key }.
export async function requireApiKey(request, env, ctx) {
  const m = (request.headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!m || !m[1].startsWith("et_live_")) fail(401, "invalid_api_key", "Send your key as 'Authorization: Bearer et_live_…'.");
  const key = await env.DB.prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL").bind(await sha256(m[1])).first();
  if (!key) fail(401, "invalid_api_key", "This API key is not valid or has been revoked.");
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(key.user_id).first();
  ctx.waitUntil(env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(nowIso(), key.id).run());
  return { user, key };
}

async function createKey(env, userId, name, capUsd) {
  const secret = "et_live_" + randomToken(32);
  const id = newId("key");
  await env.DB.prepare("INSERT INTO api_keys (id, user_id, name, key_hash, prefix, last4, daily_cap) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, userId, name, await sha256(secret), secret.slice(0, 12), secret.slice(-4), toMicros(capUsd)).run();
  return { id, secret };
}

// Same-origin check for cookie-authenticated writes (SameSite=Lax covers most, this covers the rest).
export function checkOrigin(request) {
  const origin = request.headers.get("origin");
  let host = null; try { host = origin && new URL(origin).host; } catch {}
  if (origin && host !== new URL(request.url).host) fail(403, "bad_origin", "Cross-site request blocked.");
}

export async function signup(request, env) {
  const body = await readJson(request);
  const email = String(body.email || "").trim().toLowerCase();
  const pw = String(body.password || "");
  if (!EMAIL_RE.test(email) || email.length > 254) fail(422, "invalid_input", "Enter a valid email address.");
  if (pw.length < 8 || pw.length > 200) fail(422, "invalid_input", "Use at least 8 characters for your password.");
  const ip = clientIp(request);
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE signup_ip = ? AND created_at > ?").bind(ip, nowIso(-864e5)).first();
  if (recent.n >= 3) fail(429, "rate_limited", "Too many accounts from this network today. Try again tomorrow.");
  if (await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()) fail(409, "email_taken", "An account with this email already exists. Log in instead.");

  const id = newId("usr");
  const credit = toMicros(Number(env.SIGNUP_CREDIT_USD || 0));
  const stmts = [env.DB.prepare("INSERT INTO users (id, email, pw_hash, use_case, balance, webhook_secret, signup_ip) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, email, await hashPassword(pw), String(body.use_case || "").slice(0, 80), credit, "whsec_" + randomToken(32), ip)];
  if (credit > 0) stmts.push(env.DB.prepare("INSERT INTO ledger (user_id, amount, kind, ref) VALUES (?, ?, 'signup', ?)").bind(id, credit, "signup:" + id));
  await env.DB.batch(stmts);
  const key = await createKey(env, id, "Default key", 10);
  return json({ ok: true, key: key.secret }, 201, { "set-cookie": await startSession(env, id) });
}

export async function login(request, env) {
  const body = await readJson(request);
  const ip = clientIp(request);
  const fails = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND at > ?").bind(ip, nowIso(-15 * 6e4)).first();
  if (fails.n >= 10) fail(429, "rate_limited", "Too many attempts. Wait 15 minutes and try again.", { "retry-after": "900" });
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(String(body.email || "").trim().toLowerCase()).first();
  if (!user || !(await verifyPassword(String(body.password || ""), user.pw_hash))) {
    await env.DB.prepare("INSERT INTO login_failures (ip) VALUES (?)").bind(ip).run();
    fail(401, "bad_credentials", "Email or password is incorrect.");
  }
  return json({ ok: true }, 200, { "set-cookie": await startSession(env, user.id) });
}

export async function logout(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
}

export function publicUser(u) {
  return { id: u.id, email: u.email, balance_usd: toUsd(u.balance), webhook_secret: u.webhook_secret, created_at: u.created_at };
}

export async function listKeys(env, user) {
  const { results } = await env.DB.prepare("SELECT id, name, prefix, last4, daily_cap, last_used_at, created_at FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC").bind(user.id).all();
  return json({ keys: results.map(k => ({ id: k.id, name: k.name, preview: `${k.prefix}••••${k.last4}`, daily_cap_usd: toUsd(k.daily_cap), last_used_at: k.last_used_at, created_at: k.created_at })) });
}
export async function addKey(request, env, user) {
  const body = await readJson(request);
  const name = String(body.name || "").trim().slice(0, 60);
  const cap = Number(body.daily_cap_usd);
  if (!name) fail(422, "invalid_input", "Give the key a name.");
  if (!(cap >= 1 && cap <= 100000)) fail(422, "invalid_input", "Daily cap must be between $1 and $100,000.");
  const live = await env.DB.prepare("SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ? AND revoked_at IS NULL").bind(user.id).first();
  if (live.n >= 20) fail(422, "too_many_keys", "Revoke an unused key before creating another (limit 20).");
  const { id, secret } = await createKey(env, user.id, name, cap);
  return json({ id, key: secret }, 201);
}
export async function revokeKey(env, user, id) {
  const r = await env.DB.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL").bind(nowIso(), id, user.id).run();
  if (!r.meta.changes) fail(404, "not_found", "Key not found.");
  return json({ ok: true });
}
