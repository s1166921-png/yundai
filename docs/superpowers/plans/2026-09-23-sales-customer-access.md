# Sales Customer Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (preserved Native method) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 /admin 接入独立销售账号，将专属链接提交的客户归属销售，严格限制销售只能读取当前负责的客户。

**Architecture:** 保留客户 JSON 的串行原子写入及管理员认证；账号和会话通过幂等迁移加入现有推广 SQLite。身份、客户归属和销售 HTTP 路由分模块，server/index.mjs 只负责注入现有客户读写及报告投影能力。销售响应显式选择字段，不能直接返回 adminLead 的整个对象。

**Tech Stack:** Node 24 node:sqlite / crypto / HTTP，现有 React 19/Vite，node:test，linkedom。沿用当前依赖，无外部身份或 CRM 服务。

**Spec:** docs/superpowers/specs/2026-09-23-sales-customer-access-design.md（用户已确认）。

## 执行结果（2026-09-23）

- [x] 任务 1–5：身份存储、认证、归属、销售权限及管理界面已实现并测试。
- [x] 任务 6：全量回归、构建、独立审查及本地浏览器主流程验收完成，见 ../../sales-customer-access-qa.md。
- 用户追加扩展要求已落实为独立领域模块和 docs/sales-customer-access.md 中的扩展边界。
- 原步骤保留供追溯。执行差异：会话创建接收带凭据版本的认证结果，防止重置竞态；转交编辑在关联管理页完成，主后台增加来源/负责人列及状态筛选；历史 revision 沿用原系统的 0 起始约定；移动视口工具未生效，不宣称移动端验收。

## Global Constraints

- 销售仅能查看自己负责的客户，管理员可查看全部。
- 本阶段销售只读客户资料；不提供销售批量导出、删除、审核修改或 AI 重试权限。
- 默认按提交时当前页面的有效 ref 归属。不跨设备识别，不跨浏览器或长期保存来源。
- 第一版按每次表单提交的线索进行归属，不以手机号自动合并客户，也不宣称手机号已验证。
- 会话绝对有效期 8 小时，退出撤销。
- 沿用客户 JSON 文件，不迁移历史客户内容。
- 在现有功能分支继续开发，保留原工作目录 SEO 修改。
- 测试与预览使用隔离合成数据，不访问生产客户；不自动部署或推送。

## Review Focus

1. AI 完成写回与管理员转交同时发生：不得丢失归属、审计或 revision（任务 3）。
2. 原推广后台停用销售但销售浏览器已有会话：下一次请求立即拒绝（任务 1、2）。
3. 直接请求导出、AI 重试、审核或其他销售二维码：不能绕过隔离（任务 4）。
4. URL 中有重复 ref、提交伪造负责人、历史记录缺少新增字段：不能误分配或获得权限（任务 3）。
5. 从销售 A 退出后登录 B，旧网络响应及二维码 Blob：不得继续展示 A 的数据（任务 5）。

## Task 1: 账号、密码和会话存储

**Files:** 创建 server/sales/passwords.mjs、server/sales/identityStore.mjs、test/salesIdentity.test.js；修改 server/promotion/store.mjs。

**Interfaces:** createIdentityStore(db,{now}) 由 openPromotionStore 在同一连接初始化，作为 store.identity 返回。提供 createAccount({salespersonId,username,password})、resetPassword(accountId,password)、setActive(accountId,active)、authenticate(username,password)、createSession(accountId)、resolveSession(token)、revokeSession(token)、changePassword(accountId,currentPassword,newPassword)、listAccounts()。返回账号投影不含哈希；resolveSession 返回 {accountId,salespersonId,mustChangePassword,csrfToken} 或 null。所有密码计算接口 async，SQL 事务内不 await。

- [ ] 编写临时数据库测试，运行 `node --test test/salesIdentity.test.js`，确认缺模块红灯。覆盖重复用户名、一个销售只能一个账号、错误密码、首次改密、重置、重启持久化、会话过期和原推广入口停用。核心断言：

```js
const session = await store.identity.createSession(account.id);
assert.equal(store.identity.resolveSession(session.token).salespersonId, salesperson.id);
store.updateSalesperson(salesperson.id, { active: false });
assert.equal(store.identity.resolveSession(session.token), null);
```

- [ ] 建立 accounts(id, salesperson_id UNIQUE REFERENCES salespeople(id), username UNIQUE, password_hash, must_change_password, created_at, updated_at)、sessions(token_hash PRIMARY KEY, account_id, csrf_token, expires_at)。username 规范为 trim 后小写 ASCII，3–64 字符 `[a-z0-9._-]`；密码 8–128 字符、UTF-8 不超过 512 字节，拒绝静默截断。保存 scrypt 参数、随机 16 字节盐和 64 字节派生值；用 timingSafeEqual 比较，未知用户名也执行一次固定 dummy 哈希验证。

```js
const derived = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token).digest('hex');
```

- [ ] 会话读取 JOIN salespeople 检查 active；停用销售的同一事务删除其会话，防止重启用复活旧会话。账号 setActive 委托相同销售启停入口；密码变更/重置删除所有会话，必须重新登录。每次创建会话删除已过期会话，每账号最多 5 个有效会话，超出删最旧。登录校验完成后签发前再读取当前 password_hash 和 active，防止重置或停用竞态。
- [ ] 幂等迁移测试执行两次，旧推广码和计数不变；运行身份和 promotionStore 测试至绿，提交 `feat: add sales identities and revocable sessions`。

## Task 2: 登录与账号管理 HTTP

**Files:** 创建 server/sales/authRoutes.mjs、test/salesAuth.test.js；修改 server/index.mjs。

**Interfaces:** createSalesAuthHandler({getStore,isAdmin,now,cookieSecure,allowedOrigins}) -> async(request,response,url) => handledBoolean。导出 requireSalesSession(request,{getStore,allowPasswordChange=false}) -> session 或状态化错误；requireSalesMutation 校验精确 Origin 与 X-CSRF-Token。cookieSecure 默认 true，只有显式本地开发配置才能 false，不信任 X-Forwarded-Proto。

- [ ] 编写真 HTTP 测试并运行 `node --test test/salesAuth.test.js` 确认红灯：登录 401、成功 Set-Cookie、跨站 Origin 拒绝、缺 CSRF、退出撤销、停用、重置、SQL 不可用 503。Cookie 断言示例：

```js
assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
assert.match(response.headers.get('set-cookie'), /SameSite=Strict/i);
assert.match(response.headers.get('set-cookie'), /Secure/i);
assert.equal((await requestWithRevokedCookie()).status, 401);
```

- [ ] 实现 POST /api/sales/login {username,password}；GET /api/sales/session 返回自身身份及 csrfToken；POST /api/sales/logout；POST /api/sales/password {currentPassword,newPassword}。统一 Cookie `meiou_sales_session`，Path=/api/sales，Max-Age=28800，无 Domain；退出同属性清除。首次改密会话只允许 session/password/logout，业务接口 403。
- [ ] 登录 JSON 上限 4 KiB；相同 socket 每分钟 20 次、全局每分钟 200 次、并行密码计算最多 4 个，拒绝为 429，来源映射最多 10000 项并清理过期；不信任任意 XFF。登录要求允许的精确 Origin，后续状态更改还需 CSRF；响应全部 no-store，日志不含密码、令牌或 Cookie。
- [ ] 管理接口 GET/POST /api/admin/sales/accounts，POST /api/admin/sales/accounts/:id/password，PATCH /api/admin/sales/accounts/:id {active}，仅接受原有管理员认证并遵守现有 Origin 检查。创建账号必须关联现有销售；未知 ID 404、冲突 409、无效参数 400、存储异常 503。请求体不接受 role 字段来赋予管理员权限。
- [ ] 将处理器接在现有 CORS 之后；公共表单和管理员 Basic 流程独立。运行 auth/store 测试至绿，提交 `feat: add sales login and admin account management`。

## Task 3: 表单来源、归属及转交

**Files:** 创建 src/lib/promotionRef.js、server/sales/ownership.mjs、test/salesOwnership.test.js；修改 src/lib/promotionTracking.js、src/components/FinancingIntake.jsx、server/index.mjs、server/promotion/store.mjs。

**Interfaces:** readPromotionRef(search) -> 32hex 或 null；store.getSalespersonByReferral(ref) -> sales row 或 null；resolveSubmissionOwnership(ref,getStore) -> {sourceSalespersonId,assignedSalespersonId,attributionStatus,assignmentHistory:[]}。status 为 attributed/direct/invalid/inactive/unavailable。transferLead(lead,{assignedSalespersonId,expectedRevision,actor,now}) -> 新 lead，使用既有冲突错误机制。

- [ ] 编写测试并红灯运行 `node --test test/salesOwnership.test.js`：A/B 链接、无 ref、停用、重复 ref、伪造负责人、旧记录、同手机号多次提交和存储故障。测试关键数据：

```js
assert.equal(stored.sourceSalespersonId, salesA.id);
assert.equal(stored.assignedSalespersonId, salesA.id);
assert.equal(publicResponse.lead.assignedSalespersonId, undefined);
assert.equal(readPromotionRef('?ref=' + code + '&ref=' + code), null);
```

- [ ] 抽取共享 ref 解析器：getAll 必须长度为 1，正则严格验证；表单构造 payload 后仅加入当前页面解析出的 ref。normalizeLead 原 allowlist 不增加内部字段。服务端在保存初始 lead 前解析 ref，随后把服务端生成的归属加入 normalizedLead。解析错误以 unavailable 未分配保存，不吞没原客户文件写入失败。公开响应、AI 输入测试确认无内部字段。
- [ ] 增加 PATCH /api/admin/leads/:id/assignment {assignedSalespersonId:null|id,expectedRevision}，仅管理员。目标非空需存在且启用；在 updateLeads 队列内读取当前版本并转交，revision+1；assignmentHistory 追加 {from,to,actor,at}；同负责人无变化不追加。旧字段缺失按 null，来源不改变。

```js
const next = {
  ...lead, assignedSalespersonId: targetId, revision: storedLeadRevision(lead) + 1,
  assignmentHistory: [...(lead.assignmentHistory ?? []), { from: lead.assignedSalespersonId ?? null, to: targetId, actor, at }],
};
```

- [ ] 测试 AI generate 人为挂起时管理员转交，放行生成后归属与历史仍在；双转交同 revision 仅一个成功，另一个 409。运行 ownership、serverLead 和 promotionTracking 测试至绿，提交 `feat: persist referral ownership and audited lead transfers`。

## Task 4: 销售只读客户接口

**Files:** 创建 server/sales/customerRoutes.mjs、server/sales/customerProjection.mjs、test/salesCustomerAccess.test.js；修改 server/index.mjs。

**Interfaces:** createSalesCustomerHandler({getStore,readLeads,projectCustomerReport,requireSession}) -> HTTP handler。注入 readLeads 闭包绑定当前服务实例的客户路径。salesLead(lead,projectCustomerReport) 显式返回 id,createdAt,profile,matchReport,aiReport；不返回 rawInput、内部审核、AI 调试、审计或其他账号信息。

- [ ] 真 HTTP 红灯测试 `node --test test/salesCustomerAccess.test.js`，三个客户 A/B/未分配，两个已改密会话。关键权限断言：

```js
assert.deepEqual(listA.leads.map(x => x.id), [leadA.id]);
assert.equal((await getAsA('/api/sales/leads/' + leadB.id)).status, 404);
assert.equal((await getAsA('/api/leads/export')).status, 401);
```

- [ ] GET /api/sales/leads 先按 session.salespersonId 筛选，再查询/投影；GET /api/sales/leads/:id 不存在或他人都 404。不接受请求参数替换身份。GET /api/sales/promotion 返回自己的公开链接和统计；GET /api/sales/promotion/qr.png 只生成自身二维码，复用本地 qrcode 与同一公开域名校验。
- [ ] 每请求验证会话和启用状态，读取数据后异步工作完成前再次校验授权，转交后下一请求立即失权；失败只返回 401/403/503，绝不回退全量列表。所有响应 no-store。
- [ ] 验证账号 A 带 Cookie 请求管理员列表、导出、review、ai-retry、推广管理均被拒；管理员 Basic 仍正常；篡改分页/过滤 ID 无效；转交和停用后复验；运行新增与现有路由测试，提交 `feat: enforce salesperson scoped customer access`。

## Task 5: 后台账号、归属及销售界面

**Files:** 创建 server/sales/salesPage.mjs、server/sales/salesClient.mjs、server/sales/accountPage.mjs、server/sales/accountClient.mjs、test/salesUi.test.js；修改 server/adminPage.mjs、server/promotion/adminPage.mjs、server/index.mjs。

**Interfaces:** buildSalesPage() 和 buildAccountPage() 输出无数据 HTML；mountSalesClient(document,environment) 与 mountAccountClient(document,environment) 可通过 linkedom 测试。/admin 保留管理页面，增加显著“销售登录”入口指向 /admin/sales；/admin/sales/accounts 是管理员账号配置页，从现有推广后台进入。

- [ ] DOM 红灯测试 `node --test test/salesUi.test.js`：首次改密屏障、登录失败、个人列表/详情、退出清屏、A 旧响应晚于 B 登录、账户重置失败保留输入、转交 409。核心异步规则：

```js
const version = ++requestVersion;
const data = await loadCurrentCustomers();
if (version !== requestVersion) return;
renderCustomers(data);
```

- [ ] 销售界面登录后显示“我的客户”“我的推广码”；首次改密只显示改密与退出。Cookie 自动携带，csrfToken 仅内存，密码提交后清空，不写 localStorage。姓名备注用 textContent；错误显示真实失败，不显示虚假成功。切账号/退出递增 generation、清客户及详情、撤销 QR Blob URL；详情和二维码分别防过期响应。
- [ ] 管理员账号页复用已有销售列表建立绑定，提供用户名、初始密码、重置、启停；不返回或显示已保存密码。现有客户后台增加来源/负责人列、负责人/待分配筛选、带 revision 的转交动作；409 刷新记录并保留用户待选目标提示重试，不自动覆盖。
- [ ] 测试客户端隐藏按钮之外的服务端拒绝已由任务 4 保证；验证桌面与窄屏布局，不把构建兼容当真机验证。运行 UI 和既有后台测试至绿，提交 `feat: integrate sales workspace and ownership controls`。

## Task 6: 全量验收、独立审查与交付

**Files:** 创建 docs/sales-customer-access.md、docs/sales-customer-access-qa.md；修改 README.md。

- [ ] 写管理员建账号、分发临时密码、销售改密/二维码/客户查看、转交、历史待分配操作说明；说明重复提交按独立线索、来源不等于身份验证、销售无导出。记录 HTTPS Cookie、本地显式例外、Node SQLite、单实例持久存储、密码重置撤销和反向代理共享限流限制。
- [ ] 执行新测试及全套：`node --test --test-timeout=45000 --test-concurrency=1 test/*.test.js`，再 `pnpm build` 和 `git diff --check`。既有基线为 385 pass、2 Windows POSIX skip；报告新增后真实数字，不复用旧数字。
- [ ] 用隔离演示数据建立两个销售账号，浏览器验证初始改密、专属链接表单提交、各自客户列表/详情、管理员转交、原销售失权、退出重登和停用。QR 正式 URL 通过解码验证，本地演示 ref 在 localhost 使用，不向真实销售分发演示码。
- [ ] 按 Native 执行方式完成一次独立全分支审查，重点检查所有读取出口、Cookie/CSRF、密码及会话竞态、跨存储失败和转交/AI 写回。修复发现并跑受影响测试，记录未验证范围。
- [ ] 仅提交本次文件、保留原 SEO 改动和预览，交付真实验证结果及部署前提；不自动合并、推送或上线。

## 自审与执行方式

设计覆盖：认证/停用/改密为任务 1–2，表单和转交为任务 3，权限和具体数据为任务 4，后台为任务 5，回归/发布为任务 6。五项 Review Focus 均有对应测试。接口名称、字段及 Cookie 路径在各任务保持一致；同一 SQLite 连接避免嵌套事务和独立账号状态漂移。

沿用上一阶段 Native：本会话依次实现，最后一次独立审查。任务有明确前后依赖，不并行修改同一主服务或管理页面。用户已确认并完成执行，未自动合并或部署。
