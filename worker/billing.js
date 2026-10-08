// Credit top-ups through Stripe Checkout. Credits land only from the signed webhook.
import { fail, json, readJson, hmac, safeEqual, toMicros } from "./util.js";

export const TOPUPS = [10, 50, 200, 500];
export const bonusFor = usd => (usd >= 500 ? 0.05 : 0);

async function stripe(env, path, params) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await r.json();
  if (!r.ok) { console.error("stripe", path, data?.error?.message); fail(502, "payment_error", "The payment provider returned an error. Please try again."); }
  return data;
}

export async function checkout(request, env, user, origin) {
  if (!env.STRIPE_SECRET_KEY) fail(503, "billing_not_configured", "Card payments open soon. Contact support to add credits now.");
  const { amount_usd } = await readJson(request);
  const usd = Number(amount_usd);
  if (!TOPUPS.includes(usd)) fail(422, "invalid_input", `Choose one of: ${TOPUPS.map(v => "$" + v).join(", ")}.`);
  const session = await stripe(env, "checkout/sessions", {
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(usd * 100),
    "line_items[0][price_data][product_data][name]": `EasyToken credits ($${usd})`,
    "metadata[user_id]": user.id,
    "metadata[credit_usd]": String(usd * (1 + bonusFor(usd))),
    success_url: `${origin}/dashboard#billing?paid=1`,
    cancel_url: `${origin}/dashboard#billing`,
  });
  return json({ url: session.url });
}

// Stripe-Signature: t=timestamp,v1=hex(hmac(secret, `${t}.${body}`)), 5-minute tolerance.
export async function stripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ ok: false }, 503);
  const raw = await request.text();
  const parts = Object.fromEntries((request.headers.get("stripe-signature") || "").split(",").map(p => p.split("=")));
  const sigs = (request.headers.get("stripe-signature") || "").split(",").filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  const t = Number(parts.t);
  const expected = await hmac(env.STRIPE_WEBHOOK_SECRET, `${parts.t}.${raw}`);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300 || !sigs.some(s => safeEqual(s, expected))) return json({ ok: false }, 400);

  const event = JSON.parse(raw);
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object;
    const userId = s.metadata?.user_id, credit = toMicros(Number(s.metadata?.credit_usd));
    if (s.payment_status === "paid" && userId && credit > 0) {
      // ledger.ref is unique, so a replayed event inserts nothing and the balance update is skipped.
      const ins = await env.DB.prepare("INSERT OR IGNORE INTO ledger (user_id, amount, kind, ref) VALUES (?, ?, 'topup', ?)").bind(userId, credit, "stripe:" + s.id).run();
      if (ins.meta.changes) await env.DB.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").bind(credit, userId).run();
    }
  }
  return json({ ok: true });
}
