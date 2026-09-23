import { PromotionError } from '../promotion/validation.mjs';
import { json, failure, readJson, sessionToken, requireSalesSession, requireSalesMutation } from './http.mjs';

export function createSalesAuthHandler({ getStore, isAdmin, now, cookieSecure = true }) {
  let minute = -1, count = 0; const sources = new Map();
  function allowLogin(request) {
    const current = Math.floor(now().getTime() / 60000);
    if (current !== minute) { minute = current; count = 0; sources.clear(); }
    if (++count > 200) return false;
    const key = request.socket.remoteAddress ?? 'unknown';
    if (!sources.has(key) && sources.size >= 10000) return false;
    const n = (sources.get(key) ?? 0) + 1; sources.set(key, n);
    return n <= 20;
  }
  function cookie(response, token = '') {
    response.setHeader('Set-Cookie', 'meiou_sales_session=' + token + '; Path=/api/sales; HttpOnly; SameSite=Strict; Max-Age=' + (token ? 28800 : 0) + (cookieSecure ? '; Secure' : ''));
  }
  const authPaths = new Set(['/api/sales/login', '/api/sales/session', '/api/sales/logout', '/api/sales/password']);
  return async (request, response, url) => {
    const adminRoute = url.pathname.startsWith('/api/admin/sales/');
    if (!adminRoute && !authPaths.has(url.pathname)) return false;
    try {
      if (adminRoute) {
        if (!isAdmin(request)) throw new PromotionError('后台口令不正确', 401);
        const identity = (await getStore()).identity;
        if (url.pathname === '/api/admin/sales/accounts') {
          if (request.method === 'GET') { json(response, 200, { accounts: identity.listAccounts() }); return true; }
          if (request.method === 'POST') { json(response, 201, { account: await identity.createAccount(await readJson(request)) }); return true; }
        }
        const match = url.pathname.match(/^\/api\/admin\/sales\/accounts\/([a-f0-9-]{36})(\/password)?$/);
        if (match && request.method === (match[2] ? 'POST' : 'PATCH')) {
          const input = await readJson(request);
          const account = match[2] ? await identity.resetPassword(match[1], input.password) : identity.setActive(match[1], input.active);
          json(response, 200, { account }); return true;
        }
        throw new PromotionError('接口或请求方法不支持', 404);
      }
      if (url.pathname === '/api/sales/login' && request.method === 'POST') {
        if (!request.headers.origin) throw new PromotionError('请求来源不被允许', 403);
        if (!allowLogin(request)) { response.setHeader('Retry-After', '60'); throw new PromotionError('登录尝试过于频繁，请稍后重试', 429); }
        const { username, password } = await readJson(request);
        const identity = (await getStore()).identity, account = await identity.authenticate(username, password);
        if (!account) throw new PromotionError('账户或密码不正确', 401);
        const created = identity.createSession(account);
        cookie(response, created.token);
        json(response, 200, identity.resolveSession(created.token)); return true;
      }
      const session = await requireSalesSession(request, { getStore, allowPasswordChange: true });
      if (url.pathname === '/api/sales/session' && request.method === 'GET') { json(response, 200, session); return true; }
      if (request.method !== 'POST') throw new PromotionError('请求方法不支持', 405);
      requireSalesMutation(request, session);
      if (url.pathname === '/api/sales/logout') {
        (await getStore()).identity.revokeSession(sessionToken(request)); cookie(response); json(response, 200, { ok: true }); return true;
      }
      if (url.pathname === '/api/sales/password') {
        const input = await readJson(request);
        await (await getStore()).identity.changePassword(session.accountId, input.currentPassword, input.newPassword);
        cookie(response); json(response, 200, { ok: true }); return true;
      }
      throw new PromotionError('接口不存在', 404);
    } catch (error) { failure(response, error); return true; }
  };
}
