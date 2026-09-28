import QRCode from 'qrcode';
import { PromotionError, normalizePublicSiteUrl } from '../promotion/validation.mjs';
import { json, failure, requireSalesSession } from './http.mjs';
import { salesLead } from './customerProjection.mjs';

export function createSalesCustomerHandler({ getStore, readLeads, projectCustomerReport, publicSiteUrl }) {
  let origin = null;
  try { origin = normalizePublicSiteUrl(publicSiteUrl); } catch { /* surfaced only for links */ }
  return async (request, response, url) => {
    if (!url.pathname.startsWith('/api/sales/')) return false;
    try {
      const session = await requireSalesSession(request, { getStore });
      if (request.method !== 'GET') throw new PromotionError('销售账户仅支持读取客户', 405);
      if (url.pathname === '/api/sales/leads' || /^\/api\/sales\/leads\/[^/]+$/.test(url.pathname)) {
        const all = await readLeads();
        await requireSalesSession(request, { getStore });
        const own = all.filter(lead => lead.assignedSalespersonId === session.salespersonId);
        if (url.pathname !== '/api/sales/leads') {
          const lead = own.find(item => item.id === url.pathname.slice('/api/sales/leads/'.length));
          if (!lead) throw new PromotionError('客户不存在', 404);
          json(response, 200, { lead: salesLead(lead, projectCustomerReport) }); return true;
        }
        const q = (url.searchParams.get('q') ?? '').slice(0, 100).toLowerCase();
        json(response, 200, { leads: own.filter(lead => !q || [lead.companyName, lead.contactName, lead.phone].some(value => String(value ?? '').toLowerCase().includes(q))).map(lead => salesLead(lead, projectCustomerReport)) }); return true;
      }
      if (url.pathname === '/api/sales/promotion' || url.pathname === '/api/sales/promotion/qr.png') {
        const store = await getStore();
        const sale = store.listSalespeople().find(item => item.id === session.salespersonId);
        if (!sale?.active) throw new PromotionError('请重新登录销售账户', 401);
        const promotionUrl = origin ? origin + '/?ref=' + sale.referralCode : null;
        if (url.pathname.endsWith('.png')) {
          if (!promotionUrl) throw new PromotionError('管理员尚未配置正式网站域名', 503);
          const png = await QRCode.toBuffer(promotionUrl, { width: 512, margin: 4, errorCorrectionLevel: 'M' });
          await requireSalesSession(request, { getStore });
          response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="my-promotion.png"' }); response.end(png); return true;
        }
        json(response, 200, { name: sale.name, promotionUrl, totalViews: sale.totalViews, configurationError: promotionUrl ? null : '管理员尚未配置正式网站域名' }); return true;
      }
      throw new PromotionError('接口不存在', 404);
    } catch (error) { failure(response, error); return true; }
  };
}
