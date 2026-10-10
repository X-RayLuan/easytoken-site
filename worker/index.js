// EasyToken Worker: /v1 public API (Bearer keys), /api dashboard API (session cookie), everything else static assets.
import { fail, json, errorResponse, readJson, toUsd } from "./util.js";
import { signup, login, logout, sessionUser, requireSession, requireApiKey, checkOrigin, publicUser, listKeys, addKey, revokeKey } from "./auth.js";
import { createTask, getTaskRow, refreshTask, publicTask, upstreamCallback, sweep } from "./tasks.js";
import { checkout, stripeWebhook } from "./billing.js";
import { allModels, mediaModel, quote } from "./catalog.js";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-max-age": "86400" };
const withCors = res => { const r = new Response(res.body, res); for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v); return r; };

// Poll an open task at most every 10s when someone reads it; the cron and kie callback cover the rest.
async function freshTask(env, ctx, t) {
  if (["queued", "running"].includes(t.status) && (!t.polled_at || Date.now() - Date.parse(t.polled_at) > 10e3)) return refreshTask(env, ctx, t);
  return t;
}

// Price of a task without running it: same validation and pricing as POST /v1/tasks, no key needed.
function priceQuote(body) {
  const model = mediaModel(body.model);
  if (!model) fail(404, "model_not_found", `Unknown model '${String(body.model ?? "")}'. See GET /v1/models.`);
  if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) fail(422, "invalid_input", "input must be an object, e.g. { \"prompt\": \"…\" }.");
  const { micros, charges } = quote(model, body.input);
  return { object: "quote", model: model.id, cost_usd: toUsd(micros),
    lines: charges.map(([option, qty]) => ({ option, quantity: qty, per: model.tiers[option].per, usd: toUsd(model.tiers[option].micros) })) };
}

async function v1(request, env, ctx, path) {
  const method = request.method;
  if (path === "/v1/models" && method === "GET") return json({ object: "list", data: allModels() });
  if (path === "/v1/quote" && method === "POST") return json(priceQuote(await readJson(request)));
  // Text (chat) models were removed; answer before auth so nothing is read, sent upstream or charged.
  if (path === "/v1/chat/completions") fail(404, "model_not_found", "EasyToken does not offer chat (text) models. Video, image and audio models: GET /v1/models.");
  const { user, key } = await requireApiKey(request, env, ctx);
  const origin = env.PUBLIC_ORIGIN || new URL(request.url).origin;
  if (path === "/v1/tasks" && method === "POST") return json(publicTask(await createTask(env, ctx, { user, keyId: key.id, body: await readJson(request), origin })), 202);
  let m = path.match(/^\/v1\/tasks\/([\w-]+)$/);
  if (m && method === "GET") {
    const t = await getTaskRow(env, m[1], user.id);
    if (!t || t.kind !== "media") fail(404, "not_found", "Task not found.");
    return json(publicTask(await freshTask(env, ctx, t)));
  }
  if (path === "/v1/balance" && method === "GET") return json({ balance_usd: toUsd(user.balance) });
  fail(404, "not_found", `No route for ${method} ${path}.`);
}

async function usage(env, user) {
  const since = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10) + "T00:00:00Z";
  const { results: daily } = await env.DB.prepare("SELECT substr(created_at, 1, 10) AS day, SUM(cost) AS spent, COUNT(*) AS n, SUM(status = 'failed') AS failed FROM tasks WHERE user_id = ? AND created_at >= ? GROUP BY day").bind(user.id, since).all();
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
    const row = daily.find(d => d.day === day);
    return { day, spent_usd: toUsd(row?.spent || 0) };
  });
  const { results: recent } = await env.DB.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 10").bind(user.id).all();
  return json({
    days,
    tasks: daily.reduce((a, d) => a + d.n, 0),
    failed: daily.reduce((a, d) => a + d.failed, 0),
    recent: recent.map(t => ({ ...publicTask(t), kind: t.kind })),
  });
}

// Playground runs use the signed-in session instead of an API key and bill the same balance.
async function playground(request, env, ctx, user, origin) {
  const { model, prompt, input } = await readJson(request);
  if (!mediaModel(model)) fail(404, "model_not_found", "Pick a model from the list.");
  const t = await createTask(env, ctx, { user, keyId: null, body: { model, input: { ...(input || {}), prompt: String(prompt || "") } }, origin });
  return json(publicTask(t), 202);
}

async function api(request, env, ctx, path) {
  const method = request.method;
  const origin = env.PUBLIC_ORIGIN || new URL(request.url).origin;
  if (path === "/api/upstream/kie" && method === "POST") return upstreamCallback(request, env, ctx);
  if (path === "/api/stripe/webhook" && method === "POST") return stripeWebhook(request, env);
  if (method !== "GET") checkOrigin(request);
  if (path === "/api/signup" && method === "POST") return signup(request, env);
  if (path === "/api/login" && method === "POST") return login(request, env);
  if (path === "/api/logout" && method === "POST") return logout(request, env);
  if (path === "/api/me" && method === "GET") {
    const u = await sessionUser(request, env);
    return u ? json({ user: publicUser(u) }) : json({ user: null });
  }
  const user = await requireSession(request, env);
  if (path === "/api/keys" && method === "GET") return listKeys(env, user);
  if (path === "/api/keys" && method === "POST") return addKey(request, env, user);
  let m = path.match(/^\/api\/keys\/([\w-]+)$/);
  if (m && method === "DELETE") return revokeKey(env, user, m[1]);
  if (path === "/api/usage" && method === "GET") return usage(env, user);
  if (path === "/api/playground" && method === "POST") return playground(request, env, ctx, user, origin);
  m = path.match(/^\/api\/tasks\/([\w-]+)$/);
  if (m && method === "GET") {
    const t = await getTaskRow(env, m[1], user.id);
    if (!t) fail(404, "not_found", "Task not found.");
    return json(publicTask(await freshTask(env, ctx, t)));
  }
  if (path === "/api/billing/checkout" && method === "POST") return checkout(request, env, user, new URL(request.url).origin);
  fail(404, "not_found", `No route for ${method} ${path}.`);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const apiHost = url.hostname.startsWith("api.");
    let path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path.startsWith("/v1/") || path === "/v1") {
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
        return withCors(await v1(request, env, ctx, path));
      }
      if (path.startsWith("/api/")) return await api(request, env, ctx, path);
      if (apiHost) return json({ name: "EasyToken API", docs: "https://easytoken.si/docs", base_url: `${url.origin}/v1` });
    } catch (e) {
      const res = errorResponse(e);
      return path.startsWith("/v1") ? withCors(res) : res;
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sweep(env, ctx));
  },
};
