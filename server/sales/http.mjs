import { PromotionError } from '../promotion/validation.mjs';
export function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}
export function failure(response, error) {
  json(response, error instanceof PromotionError ? error.status : 503, { error: error instanceof PromotionError ? error.message : '销售服务暂时不可用，请稍后重试' });
}
export async function readJson(request, limit = 4096) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new PromotionError('请使用 application/json 提交', 415);
  if (Number(request.headers['content-length']) > limit) { request.resume(); throw new PromotionError('请求内容过大', 413); }
  let size = 0; const chunks = [];
  // Keep draining an oversized request so a reliable JSON error can be sent.
  return new Promise((resolve, reject) => {
    request.on('data', chunk => { size += chunk.length; if (size <= limit) chunks.push(chunk); else chunks.length = 0; });
    request.on('end', () => {
      if (size > limit) { reject(new PromotionError('请求内容过大', 413)); return; }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        resolve(value);
      } catch { reject(new PromotionError('JSON 格式不正确')); }
    });
    request.on('aborted', () => reject(new PromotionError('请求已中断')));
    request.on('error', reject);
  });
}
export function sessionToken(request) {
  const matches = String(request.headers.cookie ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith('meiou_sales_session='));
  return matches.length === 1 ? matches[0].slice('meiou_sales_session='.length) : '';
}
export async function requireSalesSession(request, { getStore, allowPasswordChange = false }) {
  const session = (await getStore()).identity.resolveSession(sessionToken(request));
  if (!session) throw new PromotionError('请重新登录销售账户', 401);
  if (session.mustChangePassword && !allowPasswordChange) throw new PromotionError('请先修改初始密码', 403);
  return session;
}
export function requireSalesMutation(request, session) {
  // The host server has already checked this exact Origin against its allowlist.
  if (!request.headers.origin || request.headers['x-csrf-token'] !== session.csrfToken) throw new PromotionError('请求验证失败，请刷新后重试', 403);
}
