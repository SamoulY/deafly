# DeFly Cloudflare 连接与部署手册

核验日期：2026-09-29（America/New_York）。本次只检查连接、配置和数据库结构，没有发布代码、修改 DNS 或执行数据库迁移。可复核快照见 [资源清单](cloudflare-inventory-2026-09-29.json)。JSON 时间使用 UTC。

## 后续正式发布记录

2026-09-29（America/New_York），在用户授权后，将 `main` 提交 `47ffc04044f2488acc2844b661cc1dc283979906` 发布到 Pages 生产环境，部署 ID 为 `c5fdadde-f617-4b75-b71f-dcd47ed00ca5`。该提交的代码树与通过 285 项测试的 `fb924c9` 一致。本次只更新前端；Worker 源码无变化，保留原版本，没有执行数据库迁移。

发布后确认两个域名上的首页、检查点模块、浏览器 Worker 文件与本地逐字节一致；API 未认证访问返回预期的 401，正式域名的 CORS 和 credentials 响应正确。独立 Chromium 会话可初始化匿名身份并加载完整浏览器 WASM，页面无 JavaScript 异常。此检查没有执行 Colony 投票或完整交易回合。详细证据见 [发布回执](cloudflare-release-2026-09-29.json)。以下资源表保留首次盘点时的快照值，当前 Pages 提交以发布回执为准。

## 已确认的结构

```text
GitHub: SamoulY/deafly
    ├─ pages/ → Cloudflare Pages: flydesk-v2-trial
    │           ├─ https://defly.99x.meme
    │           └─ https://flydesk-v2-trial.pages.dev
    └─ worker/ → Worker: flydesk-v2-trial-worker
                ├─ DB → D1: flydesk-v2-trial-db
                ├─ FLYDESK_LIVE → FlydeskLive Durable Object
                └─ 每分钟定时任务
```

| 项目 | 标识或状态 |
| --- | --- |
| Cloudflare 账户 | `testcf`，`195eca5460da6b1ff32998d01587182d` |
| Pages 项目 | `flydesk-v2-trial`，`5fc93ee9-9b6d-4bb0-b1ef-0a9009df0da9` |
| Pages 生产分支 | `main`；无 Git source 配置，当前为 ad_hoc 直接上传，未配置自动构建 |
| Pages 当前生产提交 | `26dc9ac7042909dd05430addb2eb555d8249937f`，Cloudflare 报告部署成功 |
| Worker 地址 | `https://flydesk-v2-trial-worker.testcf-195.workers.dev` |
| Worker 当前版本 | `811383bd-6caa-41d0-a4ce-220c572662d1`，100% 流量；版本元数据不足以独立证明对应哪个 Git commit |
| Worker 配置 | `worker/wrangler.toml`，compatibility date `2026-08-18` |
| D1 数据库 | `flydesk-v2-trial-db`，`fb0490a9-6615-47d6-b3c0-2ab66b79b08b` |
| Durable Object | `FlydeskLive`，SQLite，namespace `c21cf6b034774d97b25aa75ccbe8f68d` |
| 定时任务 | `*/1 * * * *`，每分钟 |
| 环境配置 | `APP_ENV=trial`，`PAPER_ONLY=true` |
| 跨域来源 | `https://defly.99x.meme,https://flydesk-v2-trial.pages.dev`，与本地配置一致 |

前端两个入口都返回 HTTP 200。Worker 的 `/api/99x/markets` 返回 503，当前没有 `ARENA` 绑定，与可选交易场未配置的行为一致；这不代表整个 API 不可用。当前也没有 `ADMIN_USER_IDS` 绑定，数据集管理入口需要另外指定管理员。本次没有测试账号登录、真实一小时回合或写入部署权限。

账户还存在其他项目；本仓库只操作上面明确对应 DeFly 的资源，不能以相似名称代替目标。

## 凭据如何使用

本次验证的是账户 API Token，状态 active；它用于 API/Wrangler，不能作为 Cloudflare 网页密码。用户粘贴值末尾附加的 `%` 导致认证格式错误，去掉该字符后验证通过。仓库不保存 token 原文或其可还原编码。

本机凭据位于 `%LOCALAPPDATA%\DeFly\cloudflare-token.dpapi`，使用 Windows 当前用户 DPAPI 加密；文件在仓库外，其他机器或其他 Windows 用户不能直接解密。不要上传它，也不要打印包含凭据的环境变量。换机器后应另行配置 `CLOUDFLARE_API_TOKEN`，不要复制聊天内容到代码。

在项目目录打开 PowerShell：

```powershell
# 只读资源盘点；自动读取本机加密凭据，也接受进程环境变量
./scripts/cloudflare-inventory.ps1

# 仅在需要运行 Wrangler 的终端加载凭据
. ./scripts/cloudflare-session.ps1
npx wrangler whoami

# 完成后清除当前终端中的凭据
Remove-Item Env:CLOUDFLARE_API_TOKEN
Remove-Item Env:CLOUDFLARE_ACCOUNT_ID
```

已验证账户、Pages、Workers、D1、Durable Objects 读取及 D1 结构查询。DNS 记录读取返回认证错误，不能声称具备 DNS 管理权限；本次未以真实写操作验证发布权限。密钥已在聊天中出现，正式长期使用前宜由账户管理员轮换，并重新保存到本机加密文件或 CI Secret。

## 数据库迁移需要先核对

生产库实际存在 61 张表，包括 `flydesk_*`、`raising_*`、`colony_*`、账号和浏览器实验表。`d1_migrations` 表存在，但查询到 0 条记录。**迁移历史为空不等于数据库为空，不可直接运行全量 migrations apply 或重放 schema.sql。**

目录中有同号不同名迁移：`0009_colony_tasks.sql` / `0009_flydesk.sql`，`0010_colony_auto.sql` / `0010_flydesk_auth.sql`。后续应先导出备份，逐文件比对线上表、列、索引和触发器，再决定缺少哪些迁移及如何建立准确的迁移基线。表存在本身不证明该文件已完整执行。本次仅查询表名及迁移记录，未读取用户业务数据。

## 后续部署步骤

1. 同步 GitHub，确认工作区干净，固定要发布的 commit；运行相关测试、`npm run check` 和 `npm run worker:build`。
2. 重新运行盘点，核对账户、数据库、域名、CORS、当前版本和迁移差异。需要数据库变更时，先完成上一节的备份和逐项核对。
3. 加载本机凭据。`npx wrangler deploy --dry-run --config worker/wrangler.toml` 仅作配置和打包检查。
4. 正式发布后端的命令为 `npx wrangler deploy --config worker/wrangler.toml`；它会修改线上 Worker，只有进入正式发布步骤才执行。
5. 发布前端的命令为 `npx wrangler pages deploy pages --project-name flydesk-v2-trial --branch main --commit-hash <已验证提交SHA>`。
6. 回读 Pages/Worker 版本，验证公开网页、CORS、账号会话及模拟教学；记录发布 SHA、版本和结果。Worker 回滚不能回滚 D1 数据变化。

GitHub 同步和 Cloudflare 发布是两件独立的事。若要未来自动发布，需要单独配置 GitHub Actions/Pages Git 集成及仓库 Secrets；当前没有配置它们。本次没有修改账户权限。

官方参考：[账户 Token 验证](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/verify/)、[Pages 直接上传](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)。
