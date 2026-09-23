export function mountSalesClient(document, environment = window) {
  const $ = id => document.getElementById(id);
  let session = null, generation = 0, listRequest = 0, detailRequest = 0, qrRequest = 0, qrUrl = null;
  const status = message => { $('status').textContent = message; };
  function clear() {
    generation++; listRequest++; detailRequest++; qrRequest++; session = null;
    if (qrUrl) environment.URL.revokeObjectURL(qrUrl); qrUrl = null;
    for (const id of ['identity-panel','change-panel','workspace','detail-panel','qr-panel']) $(id).hidden = true;
    $('login-panel').hidden = false;
    for (const id of ['customers','detail','identity','count','promotion-info']) $(id).textContent = '';
    for (const id of ['promotion-url','current-password','new-password','login-password']) $(id).value = '';
    $('qr-image').removeAttribute('src'); $('qr-download').removeAttribute('href');
  }
  async function request(path, method = 'GET', body) {
    const response = await environment.fetch('/api/sales' + path, { method, cache: 'no-store', credentials: 'same-origin',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { 'X-CSRF-Token': session.csrfToken } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || '请求失败'); error.status = response.status; throw error; }
    return data;
  }
  function onError(error, version) { if (version !== generation) return; if (error.status === 401) clear(); status(error.message || '网络暂时不可用，请重试'); }
  function text(parent, tag, value) { const node = document.createElement(tag); node.textContent = value ?? '—'; parent.appendChild(node); return node; }
  function list(parent, title, items) { if (!items?.length) return; text(parent, 'h3', title); const ul = document.createElement('ul'); for (const item of items) text(ul, 'li', item); parent.appendChild(ul); }
  async function load() {
    if (!session || session.mustChangePassword) return;
    const version = generation, ticket = ++listRequest;
    try {
      const data = await request('/leads?q=' + encodeURIComponent($('query').value));
      if (version !== generation || ticket !== listRequest) return;
      $('customers').replaceChildren(); $('count').textContent = '当前客户 ' + data.leads.length + ' 位';
      for (const lead of data.leads) {
        const tr = document.createElement('tr');
        for (const value of [lead.companyName, lead.contactName, lead.phone, new Date(lead.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })]) text(tr, 'td', value);
        const td = document.createElement('td'), button = text(td, 'button', '查看详情'); button.type = 'button'; button.addEventListener('click', () => detail(lead.id)); tr.appendChild(td); $('customers').appendChild(tr);
      }
      status(data.leads.length ? '已更新，只显示当前由你负责的客户。' : '暂无客户。通过专属链接提交的客户或管理员分配的客户会显示在这里。');
    } catch (error) { if (ticket === listRequest) onError(error, version); }
  }
  async function promotion() {
    const version = generation;
    try {
      const data = await request('/promotion'); if (version !== generation) return;
      $('promotion-url').value = data.promotionUrl ?? ''; $('copy').disabled = $('qr').disabled = !data.promotionUrl;
      $('promotion-info').textContent = data.configurationError || '累计推广访问 ' + data.totalViews + ' 次。访问次数不等于客户人数。';
    } catch (error) { onError(error, version); }
  }
  async function detail(id) {
    const version = generation, ticket = ++detailRequest;
    $('detail').replaceChildren(); $('detail-panel').hidden = true;
    try {
      const { lead } = await request('/leads/' + encodeURIComponent(id)); if (version !== generation || ticket !== detailRequest) return;
      const root = $('detail'); text(root, 'h2', lead.companyName); const dl = document.createElement('dl');
      const amount = lead.profile?.requestedAmount;
      for (const [key,value] of [['联系人',lead.contactName],['联系电话',lead.phone],['申请金额',amount ? [amount.amount,amount.currency].filter(x => x != null).join(' ') : '—'],['企业地区',lead.profile?.entityRegion]]) { text(dl,'dt',key); text(dl,'dd',value); }
      root.appendChild(dl);
      if (lead.submittedFields?.length) { text(root, 'h3', '客户填写资料'); const fields = document.createElement('dl'); for (const field of lead.submittedFields) { text(fields, 'dt', field.label); text(fields, 'dd', field.value); } root.appendChild(fields); }
      const view = lead.reportView;
      if (view) {
        text(root, 'h3', '测评结果'); text(root, 'p', view.statusMessage); list(root, '经营判断', view.businessSummary);
        for (const item of view.financingAssessment ?? []) { const card = document.createElement('article'); card.className = 'report-item'; text(card,'h3',item.name); text(card,'p',[item.institution,item.amountLabel,item.termLabel,item.pricingLabel].filter(Boolean).join(' · ')); list(card,'判断依据',item.reasons); list(card,'需关注风险',item.risks); list(card,'待确认',item.itemsToConfirm); root.appendChild(card); }
        list(root, '准备事项', view.preparationActions); text(root,'p','测评结果仅供融资准备参考，实际额度及条件以机构审核为准。');
      } else text(root, 'p', '报告暂未就绪，请稍后刷新。');
      $('detail-panel').hidden = false;
    } catch (error) { if (ticket === detailRequest) onError(error, version); }
  }
  async function activate(data) {
    session = data; $('login-panel').hidden = true; $('identity-panel').hidden = false;
    $('identity').textContent = '销售账户：' + data.username;
    $('change-panel').hidden = !data.mustChangePassword; $('workspace').hidden = data.mustChangePassword;
    if (data.mustChangePassword) status('请先修改初始密码。'); else await Promise.all([load(), promotion()]);
  }
  async function login() {
    const username = $('login-name').value, password = $('login-password').value; clear(); const version = generation;
    $('login-button').disabled = true;
    try { const data = await request('/login','POST',{ username,password }); if (version === generation) await activate(data); }
    catch(error) { onError(error, version); } finally { $('login-button').disabled = false; }
  }
  async function logout() {
    const pending = request('/logout','POST',{}); clear(); const version = generation;
    try { await pending; if (version === generation) status('已退出登录。'); } catch (error) { if (version === generation) status('本页已清空，退出请求未完成。请重试退出或关闭浏览器；会话到期前仍可能有效。'); }
  }
  async function changePassword() {
    const version = generation; $('change-button').disabled = true;
    try { await request('/password','POST',{currentPassword:$('current-password').value,newPassword:$('new-password').value}); if (version === generation) { clear(); status('密码已修改，请用新密码登录。'); } }
    catch (error) { onError(error, version); } finally { $('change-button').disabled = false; }
  }
  async function qr() {
    const version = generation, ticket = ++qrRequest;
    try {
      const response = await environment.fetch('/api/sales/promotion/qr.png',{cache:'no-store',credentials:'same-origin'});
      if (!response.ok) { const data = await response.json(); const e = new Error(data.error || '二维码下载失败'); e.status=response.status; throw e; }
      const blob = await response.blob(); if (version !== generation || ticket !== qrRequest) return;
      if (qrUrl) environment.URL.revokeObjectURL(qrUrl); qrUrl=environment.URL.createObjectURL(blob);
      $('qr-image').src=qrUrl; $('qr-download').href=qrUrl; $('qr-panel').hidden=false;
    } catch(error) { if(ticket===qrRequest) onError(error,version); }
  }
  $('login-panel').addEventListener('submit',event=>{event.preventDefault();login();});
  $('change-panel').addEventListener('submit',event=>{event.preventDefault();changePassword();});
  $('logout').addEventListener('click',logout); $('refresh').addEventListener('click',load); $('qr').addEventListener('click',qr);
  $('close-detail').addEventListener('click',()=>{detailRequest++;$('detail-panel').hidden=true;$('detail').replaceChildren();});
  $('show-password').addEventListener('click',()=>{$('change-panel').hidden=false;});
  $('copy').addEventListener('click',async()=>{const version=generation;try{await environment.navigator.clipboard.writeText($('promotion-url').value);if(version===generation)status('已复制链接。');}catch{if(version===generation){$('promotion-url').focus();$('promotion-url').select();status('请手动复制已选中的链接。');}}});
  async function restore() { const version=generation;try{const data=await request('/session');if(version===generation)await activate(data);}catch(error){if(error.status!==401)onError(error,version);} }
  return { login, logout, load, detail, changePassword, restore };
}
