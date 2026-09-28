export function mountAccountClient(document, environment = window) {
  const $ = id => document.getElementById(id);
  let generation=0, sequence=0, sales=[], accounts=[], leads=[], resetting=null;
  const pendingTargets = new Map();
  const status = message => { $('status').textContent=message; };
  function auth() { return { Authorization: 'Basic ' + environment.btoa(unescape(encodeURIComponent($('username').value.trim()+':'+$('password').value))) }; }
  async function request(path,method='GET',body) {
    const response=await environment.fetch(path,{method,cache:'no-store',headers:{...auth(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const data=await response.json(); if(!response.ok){const error=new Error(data.error||'请求失败');error.status=response.status;throw error;}return data;
  }
  function text(parent,tag,value){const node=document.createElement(tag);node.textContent=value??'—';parent.appendChild(node);return node;}
  function option(select,value,label){const node=text(select,'option',label);node.value=value;}
  function saleName(id){return sales.find(s=>s.id===id)?.name || (id?'历史销售':'待分配');}
  function clear(){generation++;sequence++;sales=[];accounts=[];leads=[];pendingTargets.clear();resetting=null;for(const id of ['account-rows','customer-rows','sale-select'])$(id).replaceChildren();$('reset-panel').hidden=true;$('initial-password').value='';$('reset-password').value='';status('请重新读取数据。');}
  function renderAccounts(){
    $('account-rows').replaceChildren();$('sale-select').replaceChildren();option($('sale-select'),'','请选择销售');
    for(const sale of sales.filter(s=>!accounts.some(a=>a.salespersonId===s.id)))option($('sale-select'),sale.id,sale.name+(sale.active?'':'（已停用）'));
    for(const account of accounts){const tr=document.createElement('tr');text(tr,'td',saleName(account.salespersonId));text(tr,'td',account.username);text(tr,'td',account.active?'启用':'已停用');const td=document.createElement('td');td.className='actions';
      const reset=text(td,'button','重置密码');reset.type='button';reset.addEventListener('click',()=>{resetting=account.id;$('reset-title').textContent='重置密码 · '+account.username;$('reset-password').value='';$('reset-panel').hidden=false;});
      const toggle=text(td,'button',account.active?'停用':'启用');toggle.type='button';toggle.addEventListener('click',async()=>{const version=generation;toggle.disabled=true;try{await request('/api/admin/sales/accounts/'+account.id,'PATCH',{active:!account.active});if(version===generation)await load();}catch(error){if(version===generation)status(error.message);}finally{toggle.disabled=false;}});tr.appendChild(td);$('account-rows').appendChild(tr);
    }
  }
  function renderCustomers(){
    $('customer-rows').replaceChildren();const owner=$('owner-filter').value,q=$('customer-query').value.toLowerCase();
    const filtered=leads.filter(lead=>(!owner||(owner==='unassigned'?!lead.assignedSalespersonId:lead.assignedSalespersonId===owner))&&(!q||[lead.companyName,lead.contactName,lead.phone].some(v=>String(v??'').toLowerCase().includes(q))));
    for(const lead of filtered){const tr=document.createElement('tr');text(tr,'td',lead.companyName);text(tr,'td',[lead.contactName,lead.phone].filter(Boolean).join(' / '));text(tr,'td',lead.sourceSalespersonId?saleName(lead.sourceSalespersonId):(lead.attributionStatus==='unavailable'?'来源解析失败':'普通入口 / 未知'));text(tr,'td',saleName(lead.assignedSalespersonId));
      const td=document.createElement('td'),select=document.createElement('select');select.setAttribute('aria-label','分配 '+(lead.companyName||'客户'));option(select,'','待分配');for(const sale of sales.filter(s=>s.active))option(select,sale.id,sale.name);
      const current=pendingTargets.has(lead.id)?pendingTargets.get(lead.id):(lead.assignedSalespersonId??'');
      if(current&&!sales.some(s=>s.active&&s.id===current))option(select,current,saleName(current)+'（已停用）');select.value=current;td.appendChild(select);
      const button=text(td,'button','保存分配');button.type='button';button.addEventListener('click',async()=>{const version=generation,target=select.value;pendingTargets.set(lead.id,target);button.disabled=true;try{await request('/api/admin/leads/'+encodeURIComponent(lead.id)+'/assignment','PATCH',{assignedSalespersonId:target||null,expectedRevision:lead.revision??1});if(version===generation){pendingTargets.delete(lead.id);await load();if(version===generation)status('分配已保存。');}}catch(error){if(version===generation){if(error.status===409)await load();if(version===generation)status(error.status===409?'客户已更新，已刷新当前负责人并保留你的选择，请核对后再次保存。':error.message);}}finally{button.disabled=false;}});tr.appendChild(td);$('customer-rows').appendChild(tr);
    }
    if(!filtered.length){const tr=document.createElement('tr'),td=text(tr,'td','暂无符合条件的客户');td.colSpan=5;$('customer-rows').appendChild(tr);}
  }
  async function load(){const version=generation,ticket=++sequence;$('load').disabled=true;
    try{const [s,a,l]=await Promise.all([request('/api/admin/promotions/salespeople'),request('/api/admin/sales/accounts'),request('/api/leads')]);if(version!==generation||ticket!==sequence)return;sales=s.salespeople;accounts=a.accounts;leads=l.leads;
      const selected=$('owner-filter').value;$('owner-filter').replaceChildren();option($('owner-filter'),'','全部客户');option($('owner-filter'),'unassigned','待分配');for(const sale of sales)option($('owner-filter'),sale.id,sale.name);$('owner-filter').value=selected;renderAccounts();renderCustomers();status('已读取 '+accounts.length+' 个销售账号、'+leads.length+' 条客户资料。');
    }catch(error){if(version===generation&&ticket===sequence)status(error.message);}finally{$('load').disabled=false;}
  }
  async function createAccount(){const version=generation;$('create-button').disabled=true;
    try{await request('/api/admin/sales/accounts','POST',{salespersonId:$('sale-select').value,username:$('account-name').value,password:$('initial-password').value});if(version===generation){$('initial-password').value='';$('account-name').value='';await load();if(version===generation)status('账号已创建，请将初始密码交给对应销售。');}}
    catch(error){if(version===generation)status(error.message);}finally{$('create-button').disabled=false;}
  }
  async function resetPassword(){if(!resetting)return;const version=generation,id=resetting;$('reset-button').disabled=true;
    try{await request('/api/admin/sales/accounts/'+id+'/password','POST',{password:$('reset-password').value});if(version===generation&&id===resetting){$('reset-password').value='';$('reset-panel').hidden=true;resetting=null;await load();if(version===generation)status('密码已重置，旧登录已撤销。');}}
    catch(error){if(version===generation)status(error.message);}finally{$('reset-button').disabled=false;}
  }
  $('load').addEventListener('click',load);$('filter').addEventListener('click',renderCustomers);$('owner-filter').addEventListener('change',renderCustomers);
  $('create-account').addEventListener('submit',event=>{event.preventDefault();createAccount();});$('reset-panel').addEventListener('submit',event=>{event.preventDefault();resetPassword();});
  $('reset-cancel').addEventListener('click',()=>{resetting=null;$('reset-panel').hidden=true;$('reset-password').value='';});
  $('username').addEventListener('input',clear);$('password').addEventListener('input',clear);
  return { load,createAccount,resetPassword };
}
