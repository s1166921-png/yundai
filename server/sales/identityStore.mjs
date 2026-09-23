import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from './passwords.mjs';
import { PromotionError } from '../promotion/validation.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const project = row => row && ({ id: row.id, salespersonId: row.salesperson_id, username: row.username, mustChangePassword: Boolean(row.must_change_password), active: Boolean(row.active) });
export function createIdentityStore(db, { now, setSalespersonActive }) {
  db.exec(`CREATE TABLE IF NOT EXISTS sales_accounts (
    id TEXT PRIMARY KEY, salesperson_id TEXT UNIQUE NOT NULL REFERENCES salespeople(id),
    username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, must_change_password INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sales_sessions (
    token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES sales_accounts(id),
    csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sales_session_account ON sales_sessions(account_id);`);
  const get = id => db.prepare('SELECT a.*,s.active FROM sales_accounts a JOIN salespeople s ON s.id=a.salesperson_id WHERE a.id=?').get(id);
  const revokeAll = id => db.prepare('DELETE FROM sales_sessions WHERE account_id=?').run(id);
  const transaction = work => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  function replacePassword(id, hash, mustChange, expectedHash) {
    return transaction(() => {
      const current = get(id);
      if (!current) throw new PromotionError('账号不存在', 404);
      if (expectedHash && current.password_hash !== expectedHash) throw new PromotionError('账号已变更，请重新登录', 401);
      db.prepare('UPDATE sales_accounts SET password_hash=?,must_change_password=?,updated_at=? WHERE id=?').run(hash, Number(mustChange), now().toISOString(), id);
      revokeAll(id);
      return project(get(id));
    });
  }
  return {
    async createAccount({ salespersonId, username, password } = {}) {
      username = typeof username === 'string' ? username.trim().toLowerCase() : '';
      if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw new PromotionError('账户名须为 3–64 位字母、数字、点、横线或下划线');
      if (typeof salespersonId !== 'string' || !db.prepare('SELECT id FROM salespeople WHERE id=?').get(salespersonId)) throw new PromotionError('销售不存在', 404);
      const hash = await hashPassword(password);
      return transaction(() => {
        if (db.prepare('SELECT id FROM sales_accounts WHERE username=? OR salesperson_id=?').get(username, salespersonId)) throw new PromotionError('销售账号或账户名已存在', 409);
        const id = randomUUID(), at = now().toISOString();
        db.prepare('INSERT INTO sales_accounts VALUES (?,?,?,?,1,?,?)').run(id, salespersonId, username, hash, at, at);
        return project(get(id));
      });
    },
    listAccounts() { return db.prepare('SELECT a.*,s.active FROM sales_accounts a JOIN salespeople s ON s.id=a.salesperson_id ORDER BY a.created_at,a.id').all().map(project); },
    async resetPassword(id, password) { return replacePassword(id, await hashPassword(password), true); },
    setActive(id, active) {
      const account = get(id);
      if (!account) throw new PromotionError('账号不存在', 404);
      setSalespersonActive(account.salesperson_id, active);
      return project(get(id));
    },
    async authenticate(username, password) {
      const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
      const account = db.prepare('SELECT a.*,s.active FROM sales_accounts a JOIN salespeople s ON s.id=a.salesperson_id WHERE username=?').get(name);
      if (!await verifyPassword(password, account?.password_hash) || !account?.active) return null;
      return { ...project(account), credentialVersion: account.password_hash };
    },
    createSession(authenticated) {
      return transaction(() => {
        const current = authenticated && get(authenticated.id);
        if (!current?.active || current.password_hash !== authenticated.credentialVersion) throw new PromotionError('账号已变更，请重新登录', 401);
        const instant = now().getTime();
        db.prepare('DELETE FROM sales_sessions WHERE expires_at<=?').run(instant);
        db.prepare('DELETE FROM sales_sessions WHERE rowid IN (SELECT rowid FROM sales_sessions WHERE account_id=? ORDER BY rowid DESC LIMIT -1 OFFSET 4)').run(current.id);
        const token = randomBytes(32).toString('base64url'), csrfToken = randomBytes(32).toString('base64url');
        db.prepare('INSERT INTO sales_sessions VALUES (?,?,?,?)').run(digest(token), current.id, csrfToken, instant + 8 * 3600000);
        return { token, csrfToken, ...project(current) };
      });
    },
    resolveSession(token) {
      if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return null;
      const row = db.prepare(`SELECT a.*,s.active,t.csrf_token FROM sales_sessions t JOIN sales_accounts a ON a.id=t.account_id
        JOIN salespeople s ON s.id=a.salesperson_id WHERE token_hash=? AND expires_at>? AND s.active=1`).get(digest(token), now().getTime());
      return row ? { accountId: row.id, salespersonId: row.salesperson_id, username: row.username, mustChangePassword: Boolean(row.must_change_password), csrfToken: row.csrf_token } : null;
    },
    revokeSession(token) { if (typeof token === 'string') db.prepare('DELETE FROM sales_sessions WHERE token_hash=?').run(digest(token)); },
    async changePassword(id, currentPassword, newPassword) {
      const current = get(id);
      if (!current?.active || !await verifyPassword(currentPassword, current.password_hash)) throw new PromotionError('当前密码不正确', 401);
      if (newPassword === currentPassword) throw new PromotionError('新密码不能与当前密码相同');
      return replacePassword(id, await hashPassword(newPassword), false, current.password_hash);
    },
  };
}
