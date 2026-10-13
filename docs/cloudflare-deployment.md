# DeFly Cloudflare 连接与部署手册

核验日期：2026-09-29（America/New_York）。本次只检查连接、配置和数据库结构，没有发布代码、修改 DNS 或执行数据库迁移。可复核快照见 [资源清单](cloudflare-inventory-2026-09-29.json)。JSON 时间使用 UTC。

## 后续正式发布记录

2026-10-13 首页交互与记录更新：PR #6 已合并，发布提交为 `145776bd214ef8df24b7ff1c56ed0207a86613ec`，Worker 版本为 `258194a8-127a-4bb0-be31-61fa4d315966`，Pages 部署为 `491bdb09-4bea-4888-8f08-70f1e17f2390`。首页改为在 BTC 折线上点选或拖动位置进行教学，后台截取截至该点的行情并冻结当前持仓；保存示范仍不下单。记录显示每条示范的实际学习变化，以及同一输入下有无累计教学的决策对照，并关联当时已经学过的示范。新增电脑双栏、手机纵向布局，以及跟随系统／白天／夜晚配色。新身份用 10,000 美元模拟预算建立 BTC 持仓，预算包含手续费与滑点，创建过程原子提交；现有账户不重置。

300/300 测试、47 个模块语法检查、Worker 构建及部署预检通过。生产两个域名的 14 个版本化文件请求与本地一致；独立测试身份验证初始买入、历史点冻结、教学幂等、账户隔离与持仓不变，浏览器复核手机／电脑配色和原果蝇画面，无控制台错误。已完成仓库外 D1 完整备份，本次无需数据库迁移。详见 [首页与记录发布回执](cloudflare-observer-release-2026-10-13.json) 和 [行为说明](companion-chart-and-records.md)。

2026-10-13 教学训练更新：PR #5 已合并，后端发布提交为 `58b92f7e338bc7905a94a520db98c302b50f869e`，Worker 版本为 `a933b543-03af-404a-92ad-bbaad8e11204`。在新的 D1 完整备份后，仅执行 `0013_companion_learning.sql`。示范现在训练账户独立的决策层，历史示范会在刷新或自主决策准备时分批补训。训练账本保证重试不重复更新，每次自主推理使用准备时冻结的模型和行情特征；保存示范本身不执行交易。

手机浏览器复核发现旧会话仍复用旧脚本，随后在 `28049ff1ef4243ebbb80f112e56d64685a24f6cf` 更新入口及教学模块的版本标识，发布 Pages 部署 `d954e312-56a4-45d2-b329-44dd7369cacc`。旧会话刷新后已显示正确的学习说明。完整回归 294/294、最终专项复测 10/10 通过，包含真实 WASM 神经信号下教学改变后续自主决策的联调；线上独立测试身份验证训练持久化、幂等、账户隔离、持仓不变和自主决策准备读取新模型。模型训练范围为个人决策层，并非改写基础连接组；未声称交易收益得到改善。详情见 [教学训练发布回执](cloudflare-learning-release-2026-10-13.json)。

2026-10-13（America/New_York），PR #4 已合并，发布提交为 `18c6209e24ae70cfcad46419effdd835cb07e9fc`。手机首页改为观察持仓和教学示范，保留原果蝇；教学示范独立保存，不执行订单、不改变持仓或果蝇决策，也未接入模型训练。Pages 部署 ID 为 `c3e39d68-78d6-4090-8fa5-6f7381370373`，Worker 版本为 `5b764de5-eac1-4bf6-924b-d063a94d17ea`，正式入口仍为 `https://defly.99x.meme`。D1 完整备份保存在本机仓库外；逐项核对后仅执行新增教学表的 `0012_companion_teaching.sql`，没有重放历史迁移或修改迁移基线。

发布后确认两个域名的主要前端文件与发布代码逐字节一致；独立匿名测试身份的教学保存、幂等重试、持仓与决策不变、认证和 CORS 均通过验证。390px 浏览器视口下，原 3D 果蝇、教学预览与取消、More / Colony 导航正常，未发现控制台错误。发布版本、前一版本、备份摘要与检查结果见 [2026-10-13 发布回执](cloudflare-release-2026-10-13.json)。Pages 仍为直接上传；本次没有配置自动部署、修改 DNS 或扩大账户权限。

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
