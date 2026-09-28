# 销售专属二维码与访问统计 Implementation Plan

## 执行结果（2026-09-23）

- [x] Task 1：独立 SQLite 存储、校验、去重及归档。
- [x] Task 2：认证接口及可解码的 PNG 二维码。
- [x] Task 3：首页可见访问上报及有限重试。
- [x] Task 4：管理员销售管理、统计及二维码界面。
- [x] Task 5：全量测试、构建、独立审查、本地浏览器验收及使用文档。

下文为原计划步骤，执行证据及差异以 [验收记录](../../sales-promotion-qa.md) 为准：二维码测试合并在路由测试文件，后台使用 linkedom；异常场景以自动测试覆盖，浏览器实际验证范围单独列明，移动真机未验收。任务 2–5 的代码集中保存于收尾提交，保留任务 1 的独立提交。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员为销售生成专属推广二维码，并按销售和上海日期查询匿名推广访问次数。

**Architecture:** 保留现有客户存储与产品匹配；新建独立 SQLite 推广存储、HTTP 路由和后台页面。首页在可见时异步上报幂等访问事件，失败不影响客户流程。

**Tech Stack:** 现有 React 19、Vite 6、Node HTTP、node:test；推广存储使用 Node 内置 node:sqlite（本地 v24 已具备，正式环境部署前核验）；PNG 使用 qrcode 库，测试使用独立 PNG/二维码解码库验证二维码内容。

**Spec:** [已确认设计](../specs/2026-09-22-sales-qr-attribution-design.md)。本计划待用户审阅后执行。推荐由当前会话顺序实现，再独立审查。

## Global Constraints

- 第一版由管理员统一操作，销售拿到二维码即可推广。
- 客户数据 `server/data/leads.json` 不迁移、不修改；推广数据独立保存。
- 保留本地现有 SEO 改动；带推广参数的首页 canonical 保持无参数首页。
- 指标名称为“推广访问次数”，不是扫码人数、客户人数或独立访客数。
- 原始事件保留 90 天；较早事件按销售和上海日期转为每日计数，归档及删除在事务内完成。
- 事件不保存姓名、手机号、表单内容、完整来源 URL 或原始 IP。
- 开发在本地完成并提供预览，正式上线单独处理；开发测试不连接真实客户数据。
- 不提供销售独立登录。管理员凭据不能分享给普通销售。
- 继续构建 iOS >= 10、Safari >= 10 兼容 bundle；不宣称完成真机测试。

## Review Focus

1. 同一事件并发重试、服务重启、归档边界不能产生重复计数；任务 1 测试事务和事件有效期。
2. 用户切后台、React 重复 effect、网络失败不能无限重试或影响表单；任务 3 使用假时钟和可见性事件测试。
3. 改名、停用、重新启用后，已分发的二维码身份映射保持不变；任务 1 和任务 4 验证。
4. 错误站点配置、伪造 Host、带脚本名称不能形成恶意链接或 HTML；任务 2 和任务 4 验证。
5. 筛选请求倒序返回、下载失败、会话失效不能展示过时结果或丢失编辑；任务 4 验证。

## 文件与接口总览

| 文件 | 职责 |
|---|---|
| `server/promotion/store.mjs` | SQLite 生命周期、事务、销售、事件、归档、聚合 |
| `server/promotion/validation.mjs` | 名称/备注、公开域名、日期、事件格式校验 |
| `server/promotion/routes.mjs` | 认证后的管理操作、公开事件、限流、PNG |
| `server/promotion/adminPage.mjs` | 独立推广后台 HTML、交互及样式 |
| `src/lib/promotionTracking.js` | 一次页面加载的可见性追踪与有限重试 |
| `server/index.mjs` | 注入推广服务、复用认证/CORS、退出时关闭存储 |
| `server/adminPage.mjs` | 添加“销售推广”入口，不重构客户后台 |
| `src/App.jsx` | 启动追踪及简明统计说明 |
| `package.json`、`pnpm-lock.yaml`、`.gitignore` | 依赖、锁定版本、忽略推广数据库及伴随文件 |
| `test/promotion*.test.js` | 存储、HTTP、二维码、追踪、后台测试 |
| `docs/sales-promotion.md` | 操作说明、配置、统计口径、部署和回滚 |

管理页面 `/admin/promotions` 为无业务数据的壳，数据接口均鉴权。接口响应与内部字段统一使用 camelCase。

```
GET   /api/admin/promotions/salespeople?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
POST  /api/admin/promotions/salespeople                 {name, internalNote}
PATCH /api/admin/promotions/salespeople/:id             {name?, internalNote?, active?}
GET   /api/admin/promotions/salespeople/:id/qr.png
POST  /api/promotion/events                            {ref, eventId, eventType:"page_view"}
```

销售响应字段：id、name、internalNote、active、referralCode、createdAt、updatedAt、promotionUrl、totalViews、periodViews、lastVisitAt。列表响应另有 configurationError；配置错误时 promotionUrl 为 null，下载接口返回 503。公开事件成功/重复/未知或停用码一律返回 204，避免泄露有效销售；格式错误 400、超限 429、存储故障 503。未知字段不入库。

### Task 1: 持久化、校验与准确统计

**Files:** 创建 `server/promotion/store.mjs`、`server/promotion/validation.mjs`、`test/promotionStore.test.js`。

**Interfaces:**

```js
// store.mjs：同步数据库操作保持单个事务边界，SQL 全部参数绑定。
openPromotionStore({ databasePath, now = () => new Date() })
// 返回以下方法：
createSalesperson({ name, internalNote = "" }) // -> Salesperson
updateSalesperson(id, patch) // -> Salesperson，找不到抛 404 类错误
listSalespeople({ dateFrom, dateTo } = {}) // -> 带统计的 Salesperson[]
recordVisit({ ref, eventId, eventType }) // -> { inserted: boolean }
archiveExpiredEvents() // -> void；每日首次写入前调用
close() // -> void
// validation.mjs
validateSalespersonInput(input, { partial = false } = {})
validateDateRange({ dateFrom, dateTo }) // -> 校验后的同名字段
validateVisit(input, now) // -> {ref,eventId,eventType} 或 400
normalizePublicSiteUrl(value) // -> HTTPS origin，不允许路径/查询/用户名/片段
```

- [ ] 建立临时 SQLite 数据库测试；断言持久化、两个同名销售仍有不同 ID/推广码、停用/启用保留原码、改名不影响统计。首个红灯测试核心如下，测试用 `mkdtemp` 建目录并在结束后先 close 再删除：

```js
const store = openPromotionStore({ databasePath, now: () => new Date("2026-09-22T02:00:00Z") });
const a = store.createSalesperson({ name: "测试小李" });
const b = store.createSalesperson({ name: "测试小李" });
assert.notEqual(a.referralCode, b.referralCode);
const visit = { ref: a.referralCode, eventType: "page_view", eventId: "1758506400000-0123456789abcdef0123456789abcdef" };
// 测试 eventId 前缀以注入时间的 getTime() 生成，避免固定值与日期不一致。
visit.eventId = `${Date.parse("2026-09-22T02:00:00Z")}-0123456789abcdef0123456789abcdef`;
assert.equal(store.recordVisit(visit).inserted, true);
assert.equal(store.recordVisit(visit).inserted, false);
assert.equal(store.listSalespeople().find(row => row.id === a.id).totalViews, 1);
```

- [ ] 运行 `node --test test/promotionStore.test.js` 确认因模块缺失失败，补实现后再运行。
- [ ] schema 使用 `salespeople(id TEXT PRIMARY KEY, name TEXT NOT NULL, internal_note TEXT NOT NULL, referral_code TEXT UNIQUE NOT NULL, active INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_visit_at TEXT)`；`promotion_events(event_id TEXT PRIMARY KEY, salesperson_id TEXT NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL)`；`promotion_daily(salesperson_id TEXT NOT NULL, day TEXT NOT NULL, page_views INTEGER NOT NULL, PRIMARY KEY(salesperson_id,day))`。开启外键、busy_timeout、WAL；事件按时间和销售索引。
- [ ] 名称 trim 后 1–80 字符、备注至多 500 字符、active 必须 boolean。ID 用 randomUUID；推广码 randomBytes(16).toString("hex")。日期严格验证真实 YYYY-MM-DD；可独立传起止，起大于止返回 400。
- [ ] eventId 为 `浏览器毫秒时间-32位随机十六进制`；接收时间前后 24 小时内有效，数据库 occurredAt 始终用服务端时间。拒绝超出窗口的上报，不阻止网页。这使 90 天归档后重放旧事件不会再次计数。页面可见首次发送时才生成 ID。
- [ ] 事务内先查有效销售，再 `INSERT ... ON CONFLICT(event_id) DO NOTHING`，仅新增事件才更新 last_visit_at；归档在同一事务按 `date(occurred_at,'+8 hours')` 聚合、累加 daily 后删除旧记录。
- [ ] 日期过滤使用上海日期；累计值来自 raw + daily，lastVisitAt 来自销售独立时间戳。测试 15:59:59Z/16:00:00Z 日期边界、90 天归档重复运行、归档后旧事件重放、跨销售同 eventId、真实文件关闭重开、停用码、非法日期和超长名称。
- [ ] 用仅包含上述文件的提交保存 `feat: add promotion store and statistics`。

### Task 2: HTTP 管理、访问接口和二维码

**Files:** 创建 `server/promotion/routes.mjs`、`test/promotionRoutes.test.js`、`test/promotionQr.test.js`；修改 `server/index.mjs`、依赖与忽略规则。

**Interfaces:**

```js
createPromotionHandler({ getStore, publicSiteUrl, isAuthorized, isWriteOriginAllowed, now })
// -> async (request, response, url) => boolean，true 表示已处理
// createMeiouServer 新增可选参数：promotionDatabasePath、publicSiteUrl。
// 默认测试库位置取 dirname(leadsFilePath)/promotions.sqlite，避免测试触碰生产文件。
```

- [ ] 增加真实 HTTP 测试，先验证以下行为失败：

```js
const denied = await fetch(`${base}/api/admin/promotions/salespeople`);
assert.equal(denied.status, 401);
const event = await fetch(`${base}/api/promotion/events`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify(validVisit),
});
assert.equal(event.status, 204);
assert.equal(await event.text(), "");
```

- [ ] 以 `node --test test/promotionRoutes.test.js test/promotionQr.test.js` 运行红灯测试。
- [ ] 开发时通过包管理器安装 qrcode，并将解码测试需要的 pngjs/jsqr 安装为 devDependencies，精确锁定实际版本。二维码核心代码：

```js
const url = new URL("/", normalizePublicSiteUrl(publicSiteUrl));
url.searchParams.set("ref", salesperson.referralCode);
const png = await QRCode.toBuffer(url.href, { type: "png", width: 512, margin: 4, errorCorrectionLevel: "M" });
response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="sales-${salesperson.id}.png"` });
response.end(png);
```

- [ ] 路由在现有 CORS/OPTIONS 处理之后、客户路由之前处理。管理请求先验证凭据再访问数据库。POST/PATCH 要求 JSON 和许可 Origin；公开事件体上限 2 KiB、销售写入 4 KiB；解析错误 400、类型错误 415、超限 413、方法错误 405。允许未提供 Origin 的带凭据管理客户端，但拒绝明确不许可 Origin。
- [ ] 公开事件内存限流：每个 socket 来源每分钟 120 次，全局每分钟 3000 次，上限 10000 个桶，过期清理；不信任 X-Forwarded-For，不将 IP 入库/日志。文档明确反向代理下会共用来源桶，应在上线前按真实流量和可信代理配置验证。
- [ ] 推广数据库懒加载，初始化失败只使推广接口 503，不能导致产品/测评 API 启动失败。服务器 close 时关闭已打开的库。运行时从 `MEIOU_PROMOTION_DB_PATH` 和 `MEIOU_PUBLIC_SITE_URL` 读取配置；不自动从 Host 推导公开地址。
- [ ] 二维码用 pngjs 解码 PNG，再以 jsQR 得到 data 并断言等于 promotionUrl；验证不同销售、畸形站点配置、Host 注入、未认证下载、并发相同事件只增加一次、事件无私人信息、存储失败后原 `/api/products` 仍可用。
- [ ] 运行新增接口测试及 `node --test test/serverLead.test.js`；提交本任务文件，避免夹带工作区已有 SEO 修改。

### Task 3: 首页匿名追踪与降级

**Files:** 创建 `src/lib/promotionTracking.js`、`test/promotionTracking.test.js`；修改 `src/App.jsx`。

**Interfaces:**

```js
startPromotionTracking({ windowObject = window, documentObject = document, fetchImpl = fetch } = {})
// -> stop()；模块级 WeakMap 按 Document 保存已启动/已完成状态和重试 ID。
// 不保存跨页面身份；crypto.getRandomValues 缺失则跳过，不阻断网页。
```

- [ ] 用 fake document、fake fetch、fake timers 建行为测试：后台页不发、可见后一次、重复启动不重复、失败最多重试一次且 eventId 相同、普通流量跳过；先运行 `node --test test/promotionTracking.test.js` 验证失败。

```js
const stop = startPromotionTracking({ windowObject: fakeWindow, documentObject: fakeDocument, fetchImpl: fakeFetch });
assert.equal(sent.length, 0); // 初始 hidden
fakeDocument.makeVisible();
await flushPromises();
assert.equal(sent.length, 1);
assert.equal(JSON.parse(sent[0].body).eventType, "page_view");
stop();
```

- [ ] 校验唯一 ref 参数且匹配 32 位 hex；可见时生成 ID，用 JSON POST 上报；非重试性 4xx 不重试，网络/5xx 在 1 秒后最多重试一次。stop 清理监听和定时器，但重新挂载不得重新计数；重挂载中尚未发送的事件可以继续等待可见。
- [ ] 在 App 挂载 effect 调用并返回 stop，不能 await 追踪完成才加载产品；在联系区域显示“推广链接会记录匿名来源访问次数，用于统计推广效果。”。
- [ ] 测试 fetch 同步抛错、JSON 构造失败保护、可见性反复切换、crypto 不可用和重复 ref；已有表单请求逻辑不添加新字段。运行追踪测试和原融资表单测试，提交本任务文件。

### Task 4: 管理员销售推广界面

**Files:** 创建 `server/promotion/adminPage.mjs`、`test/promotionAdmin.test.js`；修改 `server/adminPage.mjs`、`server/promotion/routes.mjs`。

**Interfaces:** `buildPromotionAdminPage()` 返回 HTML 壳，不包含销售数据；页面请求使用 Task 2 的接口和字段。销售 ID 由服务端返回，UI 不推算。

- [ ] 测试 DOM 交互和异步请求，用现有后台测试的 node:vm 思路提供 DOM fake，或复用现有 Chrome 自动化模式。首要断言：未登录无数据；编辑失败保留输入；两次筛选倒序响应仅渲染最新结果。
- [ ] 页面提供管理员账号/密码、日期范围、加载按钮、新增销售表单、表格、编辑区域、二维码预览和下载按钮；布局沿用现有后台配色，手机横向表格可滚动。已有客户后台增加普通链接 `<a href="/admin/promotions">销售推广</a>`。
- [ ] 凭据仅存在当前页面内存，不写浏览器存储。渲染姓名备注用 `textContent`；request generation 递增避免旧请求覆盖；提交/下载期间禁用对应按钮，finally 恢复。

```js
const requestVersion = ++latestRequestVersion;
const response = await fetch(url, { headers: authHeaders, cache: "no-store" });
const payload = await response.json();
if (requestVersion !== latestRequestVersion) return;
if (!response.ok) throw new Error(payload.error || "读取销售推广数据失败");
// 对 salespeople 创建 DOM 行，单元格 textContent，禁止拼接用户 HTML。
```

- [ ] 下载和预览通过带认证 fetch 得到 Blob，再 createObjectURL；旧对象 URL 在替换/关闭时 revoke。复制优先 clipboard，失败时展示可选中的完整链接；不宣称复制成功。缺站点配置时显示配置提示并禁用链接/二维码按钮。
- [ ] 浏览器测试新增两位销售、相同姓名、包含 `<img onerror=...>` 的备注安全显示、编辑、停用/启用、日期筛选、空表、401、500、下载失败、复制不可用。`test/promotionAdmin.test.js` 通过后提交本任务文件。

### Task 5: 集成验收、预览与使用文档

**Files:** 创建 `docs/sales-promotion.md`、`docs/sales-promotion-qa.md`；按实际结果更新 README 配置说明。

- [ ] 写操作说明，包含管理员路径、销售创建/下载步骤、匿名访问统计口径、转发归因、刷新计新访问、无客户端代码执行则不计数、事件 90 天转汇总、配置缺失处理、SQLite 持久磁盘和备份要求。
- [ ] 文档记录环境变量 `MEIOU_PUBLIC_SITE_URL=https://yundai.meiouyuncang.com`、`MEIOU_PROMOTION_DB_PATH=<持久目录>/promotions.sqlite`；正式 Node 版本必须具备采用的 node:sqlite API。不得在未核验生产环境时声称可直接部署。
- [ ] 运行 `node --test test/promotion*.test.js`、完整 `node --test test/*.test.js`、`pnpm build`。任何失败先区分本功能与已有环境问题，修复本功能回归；不因全部测试数量多就跳过。
- [ ] 本地以合成管理员凭据、临时客户/推广数据库启动组合服务；用 `/admin/promotions` 新增 A/B，再分别打开生成链接。正式二维码域名与本地验证分开：解码验证正式 URL，本地浏览通过相同 ref 参数执行，不能把本地地址二维码当正式推广码交付。
- [ ] 浏览器验证页面可见上报、A/B 计数隔离、重试幂等、停用码仍能浏览、原表单完成、后端故障不妨碍页面；记录截图和限制。打开 Codex 预览供用户查看。
- [ ] 完成独立代码审查，重点检查认证、Origin、数据隔离、SQLite 生命周期、归档统计和跨请求竞态，修复高优先级发现后跑受影响测试。
- [ ] 只提交本次文件，逐项审查修改过的共享文件差异；不自动上线、不提交真实数据。最终报告功能、验证证据、本地预览以及生产环境待核验事项。

## 执行方式

推荐 Native：当前会话按以上任务顺序开发，最后独立审查。存储、路由、后台共享字段较多，顺序实现便于稳定接口。

也可选择 Subagent-driven：逐任务由实施代理与审查代理完成，再做整体审查；上下文与审查成本更高。

## 计划自审

- 范围映射：销售/统计/归档在任务 1；权限/二维码/配置/限流在任务 2；首页追踪在任务 3；所有管理操作在任务 4；回归、预览、部署说明在任务 5。
- 统一 Salesperson、eventId、ref、periodViews、totalViews 命名；没有复用客户线索字段。
- 事件有效期是归档后保持幂等的补充约束，页面时间异常只影响统计，不影响客户业务。
- 生产环境部署前核验；本次本地开发不以接触生产环境为前提。
