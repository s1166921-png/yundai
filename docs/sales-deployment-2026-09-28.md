# 销售系统上线记录

正式站点：https://yundai.meiouyuncang.com/

## 发布版本与配置

- 2026-09-28 发布提交 `9a10170`，目录 `/opt/meiou-yundai-releases/20260928-9a10170`。
- `/opt/meiou-yundai` 原子切换到新版本，继续使用 `meiou-yundai.service`、`www-data` 和 `127.0.0.1:8787`。
- 生产 Node `22.23.1` 支持 `node:sqlite`；未升级全局 Node，未修改其他网站服务或 Nginx 配置。
- 原管理员凭据、允许 Origin 和 AI 配置保留。新增 `/etc/meiou-yundai-sales.env` 及 `sales.conf` drop-in，配置正式域名和持久 SQLite 路径。
- 客户数据移至 `/var/lib/meiou-yundai`，新旧发布目录的 `server/data` 均指向该目录。目录归 `www-data` 所有，权限 `0700`。
- 原 SEO 标题、描述、canonical、百度验证、robots 和 sitemap 保留。旧版本静态资源保留在新目录，以兼容已打开的页面。

## 备份与验证

- 备份目录：`/opt/meiou-yundai-backups/20260928-093151`，仅 root 可读。
- 包含原应用、服务/Nginx/环境配置、停服后客户数据副本和发布 manifest。
- 切换前后 7 条客户记录数量和 JSON SHA-256 一致；未向正式库写入演示客户或创建演示账号。
- 生产服务器完整测试：402 通过，0 失败、0 跳过；真实服务用户补充认证/身份/UI 测试：9 通过。
- 现代及 legacy 前端构建成功，上传包 SHA-256 校验通过。
- 公网 HTTPS：首页、原管理员页、推广页、销售登录页、账号页、健康检查、robots、sitemap 和首页引用的 5 个 JS/CSS 资源均返回 200。
- 未登录读取客户、销售客户和管理员销售账号接口均返回 401。
- 使用现有管理员凭据在服务器验证客户读取、推广列表和账号列表成功，推广域名配置无错误。
- 客户归属、销售隔离、首次改密及 8 位密码边界在服务器隔离测试中验证；未在正式库执行完整客户提交演练。
- 浏览器自动化工具超时，未声称完成本次公网浏览器交互验收。

## 使用入口

1. 原管理员从 `/admin` 进入销售推广，先在 `/admin/promotions` 添加销售。
2. 在 `/admin/sales/accounts` 创建该销售账号及初始密码（至少 8 位）。
3. 销售在 `/admin/sales` 首次登录、修改密码后，使用自己的链接或二维码推广。
4. 经有效专属链接提交的客户自动分配给该销售；原有记录不自动分配，由管理员处理。

## 应用回退

先检查当前版本和备份 manifest。停止 `meiou-yundai.service`，将 `/opt/meiou-yundai` 原子切回 `/opt/meiou-yundai-releases/20260901-24fdc64`，把 `sales.conf` 移到非生效备份位置，执行 `systemctl daemon-reload` 并启动服务，再验证健康检查和客户读取。

回退应用时必须保留 `/var/lib/meiou-yundai` 及新旧目录的数据软链接，不用旧 JSON 覆盖上线后的客户，不删除 SQLite 或归属字段。旧版本不提供销售功能。

## SSH 说明

此次使用用户已有 SSH 密钥发布。新建的云贷专用密钥仍仅保存在本机；安装其公钥到生产 root 账号的操作被自动审批拒绝，未执行。
