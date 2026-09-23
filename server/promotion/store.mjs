import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { PromotionError, validateSalespersonInput, validateDateRange, validateVisit } from "./validation.mjs";
import { createIdentityStore } from "../sales/identityStore.mjs";

export function openPromotionStore({ databasePath, now = () => new Date() }) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  try {
    chmodSync(databasePath, 0o600);
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS salespeople (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, internal_note TEXT NOT NULL,
        referral_code TEXT UNIQUE NOT NULL, active INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_visit_at TEXT
      );
      CREATE TABLE IF NOT EXISTS promotion_events (
        event_id TEXT PRIMARY KEY, salesperson_id TEXT NOT NULL REFERENCES salespeople(id),
        event_type TEXT NOT NULL, occurred_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS promotion_event_date ON promotion_events(occurred_at);
      CREATE INDEX IF NOT EXISTS promotion_event_sales ON promotion_events(salesperson_id, occurred_at);
      CREATE TABLE IF NOT EXISTS promotion_daily (
        salesperson_id TEXT NOT NULL REFERENCES salespeople(id), day TEXT NOT NULL,
        page_views INTEGER NOT NULL, PRIMARY KEY(salesperson_id, day)
      );
    `);
  } catch (error) { db.close(); throw error; }
  const row = value => value && ({
    id: value.id, name: value.name, internalNote: value.internal_note, referralCode: value.referral_code,
    active: Boolean(value.active), createdAt: value.created_at, updatedAt: value.updated_at, lastVisitAt: value.last_visit_at,
  });
  const get = id => row(db.prepare("SELECT * FROM salespeople WHERE id = ?").get(id));
  const transact = work => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = work(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  let lastArchiveDay = null;
  function archiveExpiredEvents() {
    const instant = now(), cutoff = new Date(instant.getTime() - 90 * 86_400_000).toISOString();
    transact(() => {
      db.prepare(`INSERT INTO promotion_daily(salesperson_id, day, page_views)
        SELECT salesperson_id, date(occurred_at, '+8 hours'), count(*)
        FROM promotion_events WHERE occurred_at < ? GROUP BY salesperson_id, date(occurred_at, '+8 hours')
        ON CONFLICT(salesperson_id, day) DO UPDATE SET page_views = page_views + excluded.page_views`).run(cutoff);
      db.prepare("DELETE FROM promotion_events WHERE occurred_at < ?").run(cutoff);
    });
    lastArchiveDay = instant.toISOString().slice(0, 10);
  }
  function maintain() {
    if (lastArchiveDay !== now().toISOString().slice(0, 10)) archiveExpiredEvents();
  }
  const store = {
    createSalesperson(input) {
      const data = validateSalespersonInput(input), id = randomUUID(), referralCode = randomBytes(16).toString("hex"), timestamp = now().toISOString();
      db.prepare("INSERT INTO salespeople(id,name,internal_note,referral_code,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)")
        .run(id, data.name, data.internalNote, referralCode, timestamp, timestamp);
      return get(id);
    },
    updateSalesperson(id, patch) {
      const data = validateSalespersonInput(patch, { partial: true });
      return transact(() => {
        const current = get(id);
        if (!current) throw new PromotionError("销售不存在", 404);
        db.prepare("UPDATE salespeople SET name=?,internal_note=?,active=?,updated_at=? WHERE id=?")
          .run(data.name ?? current.name, data.internalNote ?? current.internalNote, Number(data.active ?? current.active), now().toISOString(), id);
        if (data.active === false) db.prepare('DELETE FROM sales_sessions WHERE account_id IN (SELECT id FROM sales_accounts WHERE salesperson_id=?)').run(id);
        return get(id);
      });
    },
    listSalespeople(range = {}) {
      const { dateFrom, dateTo } = validateDateRange(range);
      maintain();
      const stats = db.prepare(`WITH visits AS (
        SELECT salesperson_id, date(occurred_at, '+8 hours') AS day, count(*) AS n FROM promotion_events GROUP BY salesperson_id, day
        UNION ALL SELECT salesperson_id, day, page_views AS n FROM promotion_daily
      ) SELECT s.*, coalesce(sum(v.n),0) AS total_views,
        coalesce(sum(CASE WHEN (? IS NULL OR v.day >= ?) AND (? IS NULL OR v.day <= ?) THEN v.n ELSE 0 END),0) AS period_views
        FROM salespeople s LEFT JOIN visits v ON v.salesperson_id = s.id GROUP BY s.id ORDER BY s.created_at DESC, s.id`)
        .all(dateFrom ?? null, dateFrom ?? null, dateTo ?? null, dateTo ?? null);
      return stats.map(value => ({ ...row(value), totalViews: value.total_views, periodViews: value.period_views }));
    },
    getSalesperson: get,
    recordVisit(input) {
      const data = validateVisit(input, now());
      maintain();
      return transact(() => {
        const salesperson = db.prepare("SELECT id FROM salespeople WHERE referral_code=? AND active=1").get(data.ref);
        if (!salesperson) return { inserted: false };
        const timestamp = now().toISOString();
        const result = db.prepare("INSERT INTO promotion_events(event_id,salesperson_id,event_type,occurred_at) VALUES(?,?,?,?) ON CONFLICT(event_id) DO NOTHING")
          .run(data.eventId, salesperson.id, data.eventType, timestamp);
        if (result.changes) db.prepare("UPDATE salespeople SET last_visit_at=max(coalesce(last_visit_at, ''), ?) WHERE id=?").run(timestamp, salesperson.id);
        return { inserted: Boolean(result.changes) };
      });
    },
    archiveExpiredEvents,
    close() { db.close(); },
  };
  try {
    store.identity = createIdentityStore(db, { now, setSalespersonActive: (id, active) => store.updateSalesperson(id, { active }) });
  } catch (error) { db.close(); throw error; }
  return store;
}
