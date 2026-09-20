DeFly Colony — Source bundle / 源码包
Project URL: https://defly.99x.meme
GitHub: https://github.com/SamoulY/deafly

This is a local working-tree snapshot, not a verified mirror of the GitHub repository. No push was performed.
本包来自本地工作目录，不代表与 GitHub 仓库内容一致；没有执行推送。

Includes / 内容：frontend, Worker APIs, D1 schema/migrations, tests, scripts, docs, browser model assets, and English/Chinese pitch decks + project introduction.
包含前端、后端、迁移、测试、开发脚本、文档、浏览器模型资源、中英演示稿及简介。

Excluded / 排除：node_modules, .git, local D1 databases, caches, credentials, generated spike binary fixtures, old deck backups and internal handoff notes.
Dependencies / 依赖：npm ci
Syntax check / 语法检查：npm run check
Tests / 测试：npm test (some experimental tests may need regenerated fixtures and local tools / 部分实验测试需重建数据与本地工具)
Pitch decks / 演示稿：open DeFly_Colony_PitchDeck.html or DeFly_Colony_PitchDeck_CN.html directly.
Deployment / 部署：supply your own Cloudflare account, D1 database, configuration and environment credentials. Included wrangler.toml reflects the original project; adapt bindings before deploying. Some development scripts reference author-local paths.
部署需自行配置 Cloudflare 账户、D1 绑定及环境凭据；原配置与部分本地路径不可直接当作通用部署配置。

Provenance / 来源：model export code uses Stonkfly graph data and selected upstream code. See spikes/001-full-stonkfly-mobile/README.md and spikes/002-full-browser-quantized/README.md. Keep upstream notices and verify licenses before redistribution; this bundle does not grant a new blanket license.
模型导出使用 Stonkfly 数据与部分上游代码，保留上游归属并核对授权；本打包不赋予整包新的统一开源许可。

Status / 状态：experimental, paper-only. End-to-end federation and Avalanche anchoring are not represented as completed.
