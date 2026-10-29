ALTER TABLE api_keys ADD COLUMN spend_cap INTEGER;
ALTER TABLE api_keys ADD COLUMN max_cost INTEGER;
ALTER TABLE api_keys ADD COLUMN agent_label TEXT;
ALTER TABLE api_keys ADD COLUMN task_label TEXT;
ALTER TABLE tasks ADD COLUMN quoted_cost INTEGER;
ALTER TABLE tasks ADD COLUMN idempotency_hash TEXT;
ALTER TABLE tasks ADD COLUMN request_hash TEXT;
ALTER TABLE tasks ADD COLUMN submit_error_code TEXT;
UPDATE tasks SET quoted_cost = cost;
CREATE UNIQUE INDEX tasks_key_idempotency ON tasks(key_id, idempotency_hash) WHERE idempotency_hash IS NOT NULL;
-- Triggers execute in the same SQLite statement as the insert/update: any abort rolls back
-- the task, balance mutation and ledger entry together, including on D1.
CREATE TRIGGER reserve_guard BEFORE INSERT ON tasks WHEN NEW.kind = 'media' BEGIN
  SELECT RAISE(ABORT, 'key_revoked') WHERE NEW.key_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM api_keys WHERE id = NEW.key_id AND user_id = NEW.user_id AND revoked_at IS NULL);
  SELECT RAISE(ABORT, 'budget_exceeded') WHERE NEW.key_id IS NOT NULL AND EXISTS
    (SELECT 1 FROM api_keys k WHERE k.id = NEW.key_id AND
      (NEW.cost > COALESCE(k.max_cost, 9223372036854775807) OR
       NEW.cost + COALESCE((SELECT SUM(cost) FROM tasks WHERE key_id = k.id AND status != 'failed'), 0) > COALESCE(k.spend_cap, 9223372036854775807) OR
       NEW.cost + COALESCE((SELECT SUM(cost) FROM tasks WHERE key_id = k.id AND status != 'failed' AND created_at >= strftime('%Y-%m-%dT00:00:00Z','now')), 0) > k.daily_cap));
  SELECT RAISE(ABORT, 'insufficient_balance') WHERE NOT EXISTS
    (SELECT 1 FROM users WHERE id = NEW.user_id AND balance >= NEW.cost);
  SELECT RAISE(ABORT, 'rate_limited') WHERE
    (SELECT COUNT(*) FROM tasks WHERE user_id = NEW.user_id AND model = NEW.model AND status IN ('queued','running')) >= 10;
END;
CREATE TRIGGER reserve_charge AFTER INSERT ON tasks WHEN NEW.kind = 'media' BEGIN
  UPDATE users SET balance = balance - NEW.cost WHERE id = NEW.user_id AND balance >= NEW.cost;
  SELECT RAISE(ABORT, 'insufficient_balance') WHERE changes() != 1;
  INSERT INTO ledger(user_id, amount, kind, ref) VALUES (NEW.user_id, -NEW.cost, 'charge', 'task:' || NEW.id);
END;
CREATE TRIGGER refund_charge AFTER UPDATE OF status ON tasks
  WHEN OLD.kind = 'media' AND OLD.status IN ('queued','running') AND NEW.status = 'failed' AND OLD.cost > 0 BEGIN
  SELECT RAISE(ABORT, 'refund_cost_not_zero') WHERE NEW.cost != 0;
  INSERT INTO ledger(user_id, amount, kind, ref) VALUES (OLD.user_id, OLD.cost, 'refund', 'refund:' || OLD.id);
  UPDATE users SET balance = balance + OLD.cost WHERE id = OLD.user_id;
  SELECT RAISE(ABORT, 'refund_user_missing') WHERE changes() != 1;
END;
