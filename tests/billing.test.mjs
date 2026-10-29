import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { stripeWebhook } from '../worker/billing.js';
import { hmac } from '../worker/util.js';

function binding(db, failUpdate = false) {
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), run: async () => {
    if (failUpdate && sql.startsWith('UPDATE users SET balance')) throw new Error('injected update failure');
    return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
  } });
  return { prepare: sql => stmt(sql), batch: async statements => {
    db.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } };
}

const event = (id = 'cs_test_1') => ({ type: 'checkout.session.completed', data: { object: {
  id, payment_status: 'paid', metadata: { user_id: 'u1', credit_usd: '10' },
} } });
const deliver = async (env, body) => {
  const raw = JSON.stringify(body), t = Math.floor(Date.now() / 1000);
  return stripeWebhook(new Request('https://easytoken.si/api/stripe/webhook', {
    method: 'POST', body: raw, headers: { 'stripe-signature': `t=${t},v1=${await hmac(env.STRIPE_WEBHOOK_SECRET, `${t}.${raw}`)}` },
  }), env);
};

test('signed Stripe webhook credits once on duplicate event and distinct event', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  db.prepare("INSERT INTO users(id,email,pw_hash,webhook_secret) VALUES ('u1','a@example.org','x','w')").run();
  const env = { DB: binding(db), STRIPE_WEBHOOK_SECRET: 'local-test' };
  assert.equal((await deliver(env, event())).status, 200);
  assert.equal((await deliver(env, event())).status, 200);
  assert.equal(db.prepare("SELECT balance FROM users WHERE id='u1'").get().balance, 10_000_000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger").get().n, 1);
  assert.equal((await deliver(env, event('cs_test_2'))).status, 200);
  assert.equal(db.prepare("SELECT balance FROM users WHERE id='u1'").get().balance, 20_000_000);
  const broken = { ...env, DB: binding(db, true) };
  await assert.rejects(deliver(broken, event('cs_test_3')), /injected update failure/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger").get().n, 2);
  assert.equal((await deliver(env, event('cs_test_3'))).status, 200);
  assert.equal(db.prepare("SELECT balance FROM users WHERE id='u1'").get().balance, 30_000_000);
});
