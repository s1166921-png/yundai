import { salesLayout } from './layout.mjs';
import { mountSalesClient } from './salesClient.mjs';
export function buildSalesPage() {
  return salesLayout('销售工作台', `<div class="eyebrow">SALES WORKSPACE</div><h1>我的客户，我的推广</h1><p class="muted">查看分配给你的客户资料和测评结果，用专属链接开展推广。</p>
  <form id="login-panel" class="card"><h2>销售登录</h2><div class="row"><label>销售账户<input id="login-name" autocomplete="username" required></label><label>密码<input id="login-password" type="password" autocomplete="current-password" required></label><button class="primary" id="login-button">登录</button></div><p class="muted">请使用管理员为你创建的独立销售账户。</p></form>
  <div id="identity-panel" class="row" hidden><strong id="identity"></strong><button id="logout" type="button">退出登录</button><button id="show-password" type="button">修改密码</button></div>
  <form id="change-panel" class="card" hidden><h2>修改密码</h2><p>初次登录或重置后，请先设置自己的密码。修改后需要重新登录。</p><div class="row"><label>当前密码<input id="current-password" type="password" autocomplete="current-password" required></label><label>新密码（8–128 个字符）<input id="new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button class="primary" id="change-button">保存新密码</button></div></form>
  <div id="workspace" hidden><section class="card"><h2>我的推广码</h2><p id="promotion-info" class="muted"></p><div class="row"><label>专属推广链接<input id="promotion-url" readonly></label><button id="copy" type="button">复制链接</button><button id="qr" type="button">查看二维码</button></div><div id="qr-panel" hidden><img id="qr-image" alt="我的推广二维码"><a id="qr-download" download="my-promotion.png">下载 PNG 二维码</a></div></section>
  <section class="card"><div class="row"><h2>我的客户</h2><label>查找客户<input id="query" type="search" placeholder="企业、姓名或电话"></label><button id="refresh" type="button">查询 / 刷新</button></div><p id="count" class="muted"></p><div class="table-wrap"><table><thead><tr><th>企业</th><th>联系人</th><th>电话</th><th>提交时间</th><th>操作</th></tr></thead><tbody id="customers"></tbody></table></div></section>
  <section id="detail-panel" class="card" hidden><button id="close-detail" type="button">关闭详情</button><div id="detail"></div></section></div>`, mountSalesClient);
}
