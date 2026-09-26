# FlyDesk｜Codex 技术执行方案

版本：1.0
设计日期与公开资料核对日期：2026-09-14
读者：负责实现、测试和交付的 Agent / Codex
性质：待执行的工程规格，不是已实现系统的说明，不是盈利能力报告。

## 0. 执行入口与需求优先级

先读本章，再按第 20 章里程碑实施。`MUST` 表示验收必需，`MUST NOT` 表示不得实施，`SHOULD` 表示默认采用、改变时要写 ADR。本文中的接口、目录和启动命令是要求你创建的目标接口，不代表现在已经存在。不要把设计示例当成实测数据。

需求优先级：用户明确要求 > 本文不可变边界 > demo 验收项 > 可调整默认参数。对非阻塞的小问题采用本文默认值并记录决定，不要反复要求用户确认。

### 0.1 用户已经确定的边界

1. 全部使用模拟账户。允许真实实时行情和历史行情，但绝不提交真实交易。
2. 不提供入金、提现、交易所账号绑定、钱包、私钥、现金奖励或可兑现积分。
3. 主要交互只有 `BUY / SELL / HOLD`。界面中文分别为“买、卖、不动”；`SKIP / TIMEOUT` 不属于动作标签。
4. 用户有指定资产和指定时点的行情窗口，可以看 K 线、指标、切换周期和画线。
5. 每个账号拥有自己的果蝇、示范记录、训练版本、积分和外观。
6. 用户操作用于训练；必须分开用户成绩与果蝇自主成绩。
7. 积分仅兑换外观。服装不能修改模型输入、学习率、风险额度、收益或推理速度。
8. 不加入 LLM 聊天、编造心理活动、情绪成长、虚构智力等级或提示用户频繁交易的陪伴台词。

### 0.2 本文新增的工程默认值

项目暂名 FlyDesk；首个资产 BTC-USD；每轮 10,000 模拟 USD；固定一档额度；桌面网页优先；每人一只果蝇；原生进程部署，不强制 Docker；PostgreSQL 作为业务数据库；首轮采用真实神经模拟加可训练决策层。这些是便于实施的初始选择，不是用户额外确认过的永久限制。

### 0.3 最容易做错的事

- 只交付一个漂亮的交易页面，后端使用随机数伪装训练。
- 把真实行情称为真实资金交易，或保留一个能打开真实下单的隐藏开关。
- 将未来 K 线先发给浏览器，再用遮罩隐藏。
- 把用户赚钱记为果蝇已经学会，或把权重变化记为盈利改善。
- 在用户接管后，直接按用户盈利给果蝇原动作施加正强化。
- 把每个用户只保存为一个 seed，忽略持续的模型参数和运行状态。
- 用用户点击次数发成长值，代替实际训练与评测。

## 1. 交付分层：什么才算 demo 完成

### 1.1 三个门槛

| 门槛 | 必须成立 | 允许怎样表述 |
| --- | --- | --- |
| G0：产品闭环 | 真实后端、历史模拟、实时模拟、图表工具、示范记录、积分和衣柜能跑通 | “交易训练平台原型已完成” |
| G1：完整 demo | G0 加真实 Stonkfly 神经核接入、每用户决策层实际训练、版本恢复和独立测试 | “真实果蝇神经模拟＋可训练决策层 demo 已完成” |
| G2：研究效果 | 未见行情上的预先规定评测表明改进，且对照支持归因 | 只陈述具体测试发现，不概括为稳定盈利 |

本次目标为 **G1**，不是仅 G0。G2 是研究结果，不能靠修改验收标准保证出现。

允许在 G0 使用 `stub_debug` 或规则基准进行开发，但 UI、API 和测试报告必须显示真实 backend 名称。没有大脑数据、编译失败或神经核未执行时，只能报告 G0 或 G1 的阻塞项，不能静默换成普通网络后宣布真实果蝇 demo 完成。

### 1.2 训练路线的明确选择

G1 采用 **冻结果蝇连接组与脑内可塑性，训练用户专属决策层**。模型由神经模拟特征、当时可见的市场特征及账户状态共同决策。用户的持久差异首先保存在决策层，而非宣称整张生物连接图被重新训练。

另外保留 `stonkfly_native` 原始解码路径作为对照。脑内突触的人类带教、在线奖励可塑性及 PPO 微调在第 15 章给出后续路线，但默认关闭，不阻塞 G1。

原项目的公开说明区分了机制运行与有效学习，尚未报告被验证的交易学习改善。[S01] 不能复用项目名称来替代本平台自己的实验。

### 1.3 功能清单与范围

| ID | 功能 | G1 要求 | 后续扩展 |
| --- | --- | --- | --- |
| F01 | 注册、登录、账号隔离、每人一只果蝇 | 必做 | 多只果蝇与协作团队 |
| F02 | 历史连续回合、指定时点任务 | 必做；单题为不计分的单步练习配置 | 自定义课程 |
| F03 | 真实实时行情模拟盘 | 必做；无写入交易所能力 | 多数据源切换 |
| F04 | K 线、成交量、周期、指标、画线 | 必做 | 更多指标和订单类型 |
| F05 | 三按钮操作、跳过、超时区分 | 必做 | 不扩展聊天交互 |
| F06 | 模拟成交、账本、终局结算 | 必做 | 深度与流动性模拟 |
| F07 | 时点快照、操作记录、可重放导出 | 必做 | 更丰富的带教痕迹分析 |
| F08 | 积分、商店、衣柜、穿戴 | 必做 | 更多纯外观内容 |
| F09 | 神经核适配、独立模型版本 | 必做 | 脑内可塑性训练 |
| F10 | 用户示范训练与独立评测 | 必做 | DAgger 风格补采、PPO |
| F11 | 复盘、现金/持有/训练前后比较 | 必做 | 独立排行榜与赛季 |
| F12 | 管理任务、数据健康、训练队列 | 最小管理页必做 | 完整运营后台 |
| F13 | 经授权的群体数据研究 | 仅保留 consent 和 provenance 字段 | 显式同意后做共享课程；不平均全脑权重 |
| F14 | 繁殖、交易物品、真钱、LLM、复杂 3D | 不做 | 其中真钱与 LLM 不属于当前产品方向 |

## 2. 默认规则与配置文件

以下数值是 **demo 设计参数，不是交易建议、真实费用报价或已测性能**。规则在回合开始时锁定版本，修改只影响新回合。

```yaml
spec_version: "1.0"
execution_mode: PAPER_ONLY                 # 唯一允许值；没有 REAL 枚举
market:
  provider: coinbase_exchange_public
  product: BTC-USD
  quote_unit: SIM_USD
  base_bar_seconds: 60
  timeframes_seconds: [60, 300, 3600]
  source_lookback_minutes: 3600
  visible_default_bars: 300
  max_snapshot_bars: 5000
  quote_stale_seconds: 3
  heartbeat_timeout_seconds: 10
session:
  decisions_per_round: 12
  decision_interval_seconds: 300
  live_answer_window_seconds: 30
  live_fill_latency_ms: 250
  live_fill_wait_timeout_seconds: 5
  historical_wall_time_limit: null
  initial_equity: "10000.00000000"
  initial_position: "0"
  buy_max_debit: "1000.00000000"             # 包括手续费
  sell_reference_notional: "1000.00000000"
  minimum_action_notional: "0.01"
  allow_short: false
  allow_leverage: false
  final_liquidation: true
simulation:
  fee_rate: "0.001"                        # 人为固定模拟费率
  slippage_rate: "0.0005"                  # 人为固定不利滑点
  quantity_quantum: "0.00000001"
  money_quantum: "0.00000001"
rewards:
  rule_version: points_v1
  minimum_explicit_decisions: 8
  max_drawdown_for_reward: "0.20"
  points_per_unit_return: 1000
  per_round_cap: 50
  per_day_cap: 100
  repeat_historical_reward: false
model:
  default_backend: stonkfly_readout_v1
  native_plasticity_enabled: false
  neural_ms_per_observation: 500
  neural_integration_dt_ms: 0.1
  native_resident_brains: 1
  native_warmup_observations: 24
  min_training_labels: 64
  min_validation_labels: 16
  minimum_represented_classes: 2
  minimum_labels_per_represented_class: 8
  mlp_hidden: 64
  max_train_epochs: 30
  early_stop_patience: 5
  batch_size: 32
  learning_rate: 0.001
  optimizer: AdamW
  ppo_enabled: false
```

数据源产品是否实际可用，由适配器启动探测确认；不支持时明确报错，不把其他交易对偷偷标成 BTC-USD。所有开发和测试结果使用 `environment=dev/test`，不能迁入公开积分账户。

## 3. 页面与最小交互

### 3.1 页面路由

- `/`：产品说明、纯模拟标识、登录入口。
- `/app`：果蝇外观、积分、最近回合、训练任务状态；入口为历史训练和实时模拟。
- `/desk/:session_id`：行情工作台、账户、操作按钮、回合状态。
- `/sessions/:id/review`：按步查看当时观察、提交、实际执行、下一状态及结果。
- `/fly`：名称、装扮、示范数量、模型版本、训练/独立测试入口。
- `/wardrobe`：拥有物品、积分购买、槽位穿戴和预览。
- `/evaluations/:id`：训练前后及基准结果，数据范围和 backend 标识。
- `/admin`：权限保护的数据、任务、训练作业与审计状态，不提供直接修改用户盈利的入口。

### 3.2 交易工作台

顶部固定显示：`历史 / 实时模拟`、资产、UTC 时点及用户本地显示时间、回合步数、模拟标识、数据新鲜度。

主体采用图表与右侧账户栏；工具栏包括十字线、水平线、趋势线、矩形、删除、撤销、重做。底部三个主要按钮为“买一档”“卖一档”“不动”，标题下说明额度。`跳过` 使用次级样式。

账户显示模拟现金、数量、平均成本、浮动盈亏、权益、费用。禁用按钮必须说明原因，例如“没有可卖持仓”，不能只变灰。

默认不在提交前展示果蝇动作。提交后可以显示 `人类：SELL / 模型：HOLD`，但没有完成的神经推理显示“尚未计算”，不得生成随机答案。

### 3.3 输入与状态规则

鼠标一次点击或键盘一次确认提交一个动作；键盘快捷键仅在工作台聚焦且不编辑图形时生效。提交后锁定本步，不允许撤回交易或事后修改示范。

未提交时可以撤销画线。画线撤销只改分析草稿，不能撤销已提交动作。跨标签页操作由服务器统一拒绝重复提交。

果蝇使用简单分层 SVG/Canvas 形象和少量待机动画。不要为完成此 demo 引入 LLM 服务、3D 引擎或外部形象版权依赖。

## 4. 图表、指标与分析痕迹

采用 React + TypeScript + Vite；图表默认 Lightweight Charts。画线不是自动附带功能，必须自己实现 primitive 的状态、坐标换算、命中测试和交互。官方提供 series primitives 扩展接口。[S05]

保留其许可证、NOTICE 以及官方要求的可见署名/链接。[S06] 不用无法控制底层数据的外部行情 widget 替代工作台。

### 4.1 必做指标

- SMA：20、50；不足 N 根时返回 `null`，不补零。
- RSI：14，Wilder 平滑；首值用前 14 个涨跌幅均值。平均涨跌都为零时取 50，只有平均跌幅为零时取 100。
- MACD：EMA12 − EMA26；signal 为 9 期 EMA；histogram 为两者之差。
- EMA 初始化为该周期首批 N 根收盘价均值；MACD signal 对首批 9 个有效 MACD 值初始化。此约定固定进 `indicator_version`。
- 成交量面板及 SMA20 成交量。

服务端维护一套权威指标实现；前端展示服务端的结果，不另写数值不一致的算法。切换周期只改变可见聚合视图，不改变决策节奏。

### 4.2 画线数据

保存数据坐标，而非只有像素坐标：

```json
{
  "tool": "trend_line",
  "id": "drawing_uuid",
  "anchors": [
    {"event_time": "2026-01-01T10:00:00Z", "price": "92500.00"},
    {"event_time": "2026-01-01T11:00:00Z", "price": "92700.00"}
  ],
  "style": {"stroke": "user_selected", "width": 2},
  "created_at": "2026-09-14T18:00:00Z",
  "revision": 2
}
```

允许用户把线延伸到右侧空白区域做预测，但空白区域不能包含未来行情；将预测锚点标记为 `projection=true`。它们不是实际市场数据。

每次动作保存不可变的 `analysis_revision_id`，包括周期、缩放范围、指标参数和画线。草稿可以继续编辑，但不能改掉旧决策引用的版本。

分析痕迹不是因果解释。不要把“画了趋势线”自动标记为“用户依据趋势线买入”。G1 默认不把手绘线输入模型，避免自主运行时缺少人类辅助。

## 5. 数据源与时点快照

### 5.1 两类数据的来源

历史通过 Coinbase Exchange 公共 candles 接口导入；真实运行以公共 ticker/heartbeat 等消息进入后端，再由服务器向浏览器推送。历史接口单次最多 300 根，可能有缺失，需分段、去重和排序；不要高频轮询历史接口假装实时流。[S07] 公共 ticker 提供成交更新及 best bid/ask，heartbeat 用于连接健康检查。[S08]

实施前核对当期端点、限流及数据展示条件；公开接口不自动等于可以任意再分发数据。demo 默认开发/受控展示，公开运营前完成数据使用条款审查。无需交易账户或交易凭据。

保留独立 `MarketDataProvider` 接口，网络不可用时允许明确标识的 fixture 演示，但不能伪装为实时行情。

### 5.2 双时钟与版本

历史记录至少包含 `bar_open_time`、`bar_close_time`、`source_available_at`、`ingested_at`、`provider`、`dataset_version` 和质量标记。

历史接口通常不提供当年的实际接收时间。对于事后下载的数据，`source_available_at` 是依据 bar 收盘时间设定的回放可见时间，必须标记 `availability_basis=BAR_CLOSE_ASSUMPTION`，不能冒充真实历史网络延迟记录。`ingested_at` 只是本平台抓取时间，不能用它排除所有历史数据。

实时消息保留交易所事件时间、后端接收时间、序号/交易 ID 和原始消息哈希。服务器时间统一 UTC，记录时钟偏差；浏览器时间不作为提交和过期依据。

### 5.3 时点隔离的硬规则

`SnapshotService.build(session_id, step_index)` 根据服务器拥有的时点创建快照，客户端不能自行声明 `as_of`。快照包含账户 revision、行情版本、规则版本、可见窗口和哈希。

在历史模式中，一分钟已闭合 K 线必须满足 `bar_close_time <= as_of`；不能把下一根的 open/high/low/close 放入该快照。

高周期部分 K 线只能使用已到时点的基础 K 线聚合，标记 `is_partial=true`。不得读取事后完整日 K，再截掉时间标签。指标如显示部分值，必须明确标记且在提交快照中固定；G1 模型特征只用已闭合高周期 K 线。

所有接口、SSE、缓存、服务端渲染和浏览器持久化都遵守边界。缓存键至少包含数据版本、时点、周期和观察范围。不得向客户端提供完整未来 CSV、公开未来静态文件或可自行增大时点的下载 URL。

### 5.4 缺失与质量

发现重复、乱序、OHLC 不合法、负成交量、断流或缺失分钟时，先标记质量，不静默插值。图表允许显示缺口。用于奖励和训练的正式回合，其必要窗口、成交时点与结果区间必须完整；否则 `DATA_INVALID`。

合成行情标记 `source_kind=SYNTHETIC`，隔离到 demo 账号和测试数据集。已记录的实时行情可在后续用作历史回放，但仍保留原始来源。

## 6. 回合状态机与事件顺序

### 6.1 状态

`CREATED → ACTIVE → SETTLING → SETTLED`；另外有 `ABORTED / DATA_INVALID / FAILED` 终态。

每步：`OBSERVING → ACTION_COMMITTED → FILL_PENDING → RESOLVED`。HOLD/SKIP 没有交易单，但仍经过状态推进。步骤失败不能在后台悄悄换动作。

### 6.2 历史连续回合

1. `t0` 的观察只包含截至 `t0` 已闭合的数据。先锁定快照及原模型版本。
2. 用户提交，服务器原子保存动作与分析版本；这一事务完成前不读未来成交或结果数据。
3. BUY/SELL 使用快照之后下一根基础 K 线的开盘价作为成交基准，再加不利滑点和费用。它不是刚展示的收盘价。`fill_policy=NEXT_BAR_OPEN`。
4. 下一根 K 线可能从 `t0` 边界开始；使用独立事件顺序保证“观察截止 → 提交 → 读取下一根 open”，不得以时间戳相同为由将 open 提前暴露。
5. 推进到 `t1=t0+300s`，计算权益及下一快照。默认 12 次决策，对应一小时市场区间。
6. 最后推进到 `t12` 后按第 7 章期末规则统一清仓、结算。

历史 wall-clock 可以暂停，市场时钟只在动作或跳过后推进。重新登录从服务器状态继续，不重置资金或奖励资格。

### 6.3 实时模拟回合

1. 按 UTC 固定节奏生成观察快照，冻结本步可见数据；给用户 30 秒提交窗口。
2. 服务器提交时间记为 `accepted_at`；只接收第一条有效提交。
3. BUY/SELL 在 `accepted_at + 250ms` 之后收到的第一条合格报价上模拟成交。消息必须属于本产品、时序有效、数据新鲜，并通过价格与现金校验。
4. 不允许使用提交前已经到达的报价作为低价买入机会。以服务器接收序号和接收时间实施，交易所事件时间用于校验乱序与异常时钟。
5. 5 秒内没有合格报价，则订单 `EXPIRED_NO_QUOTE`，不虚构成交。保留用户意图，但该样本标记执行无效，默认不进入 G1 模仿训练。
6. 未回答：记录 `TIMEOUT`，环境保持持仓且继续推进；不能记为用户 HOLD。用户离线不影响市场推进。
7. 数据中断超过阈值时停止生成可回答任务和新成交。若导致本回合路径不完整，则整轮 `DATA_INVALID`，不发积分，不把缺口段用于 RL。
8. 期末结算无新鲜报价时可显示“等待行情结算”，最多等待 60 秒；仍失败转 `DATA_INVALID`，不拿旧价格补成交。

无需始终打开网页才能结束回合。用户缺席造成 TIMEOUT 与平台断流造成 DATA_INVALID 必须区分。

## 7. 模拟成交与账本：唯一权威在服务器

交易资金与积分使用不同表、不同单位、不同接口；不能通过任何兑换函数互相转换。前端提交动作，不提交价格、利润、积分、现金或用户 ID。

### 7.1 数值与按钮含义

使用 Python Decimal 和 PostgreSQL NUMERIC；JSON 金额使用字符串。金额与数量内部按配置保留 8 位小数，展示金额可显示 2 位；不能先将显示值四舍五入再记账。

`BUY`：最大总扣款为 `min(1000, available_cash)`，包括费用。计算可买数量后向下截断到数量精度。

`SELL`：提交时锁定 `min(owned_quantity, 1000 / snapshot_mark_price)`，向下截断；只卖已有持仓，不产生负库存。执行时价格变化可能让卖出金额略高于或低于 1000，这是预期行为。

action_mask 根据同一套余额、库存和最小金额规则在快照时计算，执行时再次校验；市场变化导致拒绝时不改写原标签。

`HOLD`：明确的人类不交易标签；数量和现金不因动作改变，但权益可能随行情改变。

`SKIP / TIMEOUT`：无有效人类标签；环境执行 `NO_ORDER`。成交被拒绝也不是一个新的用户 HOLD。

低于最小名义金额的残余仓位可由期末统一处理；主要按钮禁用时显示原因。任何提交只能减少已有的可用现金或库存，不能借款。

### 7.2 成交公式

历史基础价为下一根 open；实时基础价为提交后新报价的 ask（买）或 bid（卖）。不利滑点 `s=0.0005`：

```text
buy_price  = reference_buy_price  × (1 + s)
sell_price = reference_sell_price × (1 - s)

buy_quantity = floor_to_quantum(max_debit / (buy_price × (1 + fee_rate)))
buy_notional = ceil_money(buy_quantity × buy_price)
buy_fee      = ceil_money(buy_notional × fee_rate)
new_cash     = old_cash - buy_notional - buy_fee

sell_gross   = floor_money(sell_quantity × sell_price)
sell_fee     = ceil_money(sell_gross × fee_rate)
new_cash     = old_cash + sell_gross - sell_fee
```

成本基础采用平均成本法：买入把名义金额与买入费用加入持仓总成本；部分卖出按卖出数量占原数量的比例移除成本，并记录已实现盈亏。完全清仓时移除全部剩余成本、总成本设为 0，避免舍入残留；浮动盈亏为当前持仓市值减剩余成本。成本分摊也按统一金额精度记账，显示值不参与计算。

若舍入后买入总扣款超过预算或余额，再减少一个数量量子并重算，直到满足约束。成交价格本身按固定高精度保存，不随前端显示精度改变。

参考实现必须为纯函数：输入 Portfolio、已锁定 Intent、FillQuote、Rules，输出 Fill 和新 Portfolio；网络、数据库及积分逻辑不得嵌入核心撮合函数。

### 7.3 可作为黄金测试的算例

这是人工构造的单元测试，不是历史收益。初始现金 10000、基础买价 100、最大扣款 1000；随后将全部已买数量卖出，基础卖价 110；使用本章费率、滑点和舍入约定。

| 字段 | 精确期望值 |
| --- | --- |
| 买入成交价 | 100.05 |
| 买入数量 | 9.98501748 |
| 买入名义金额 | 999.00099888 |
| 买入费用 | 0.99900100 |
| 买后现金 | 9000.00000012 |
| 卖出成交价 | 109.945 |
| 卖出毛收入 | 1097.80274683 |
| 卖出费用 | 1.09780275 |
| 最终现金 | 10096.70494420 |
| 最终净盈亏 | 96.70494420 |

这里“全部卖出”是验证清仓的测试调用，不是按 1000 名义金额的普通 SELL 按钮。测试不能混淆两种数量规则。

### 7.4 账户计价与期末结算

期间权益 `E = cash + quantity × mark_price`。历史 mark 使用当前已闭合基础 K 线收盘价；实时 mark 使用有效报价中间价。不同模式记录不同 `valuation_policy`，不混排原始收益。

最大回撤 `MDD = max_t(1 - E_t / max_{u≤t} E_u)`，按全部基础分钟计价点计算，而非只在用户点击时计算；实时在每分钟截止处取有效 mark。缺少必要计价点时不得报告完整回撤。

期末清仓是提前约定的系统动作：历史使用期末已闭合价格减不利滑点，实时使用合格 bid 减不利滑点，再扣费用。它是统一的终局模拟规则，不声称现实中一定能成交。此动作标记 `SYSTEM_LIQUIDATION`，不能进入人类动作标签。

结束前处理所有 pending intent，然后锁定终局权益。每个 session 只结算一次；终局值和积分不能被普通客户端改写。

### 7.5 事务与幂等

动作提交使用客户端 UUID `Idempotency-Key`，并有唯一约束 `(session_id, step_index)`。相同 key 相同 payload 返回同一结果；相同 key 不同 payload 返回 409。跨标签页不同 key 争抢同一步时只有一个成功。

采用短事务：锁 session/step/account → 检查 revision 和资格 → 写 decision 与待执行 intent → 提交。等待行情或运行神经模型时不持有数据库锁。

实际成交事务锁 account/intent，检查 intent 尚未处理，再写不可变 fill、ledger entries 和新 account revision。PostgreSQL 的行锁适合此处的互斥控制。[S09]

作业采用至少一次投递，账本通过唯一键实现一次业务效果；不要笼统宣称消息队列本身“恰好一次”。

## 8. 积分、装扮与防重复领取

### 8.1 积分规则 v1

以下是游戏规则，不是给模型的 reward。正式积分要求：数据有效、完成完整回合、显式合法人类决定至少 8 次、净回报为正、MDD 不超过 20%、本次具备奖励资格。

```text
R = (terminal_equity - initial_equity) / initial_equity
if not eligible or R <= 0:
    raw_points = 0
else:
    raw_points = min(50, ceil(1000 × R))

awarded_points = min(raw_points, max(0, 100 - already_awarded_today))
```

使用 Decimal 计算 `ceil`。例如净收益率 0.5% 得 5 分，1% 得 10 分，5% 及以上最多 50 分；亏损为 0。相同资金和完整期末处理是奖励前提。纯 HOLD 的显式判断计入有效参与，但不能靠跳过凑次数。

规则只鼓励有限额的游戏参与，不构成“有技能”的证明。基准比较另行展示；不要求用户击败买入持有才承认此次游戏盈利。允许后续调整，但新规则必须新版本化。

### 8.2 领奖资格与原子性

历史资格以 `(user_id, scenario_family_id)` 标识，奖励规则版本作为审计字段而不是重新领奖的钥匙。同一资产、同一开始/结束区间和规则族不能因为换 seed、重复导入或新建 scenario_id 再领奖。

第一次开始正式奖励回合时即登记 eligibility reservation。中途看到走势后退出并重开，不重新获得首轮资格；重开为练习模式。平台故障可由管理员按审计流程补偿资格，不能直接伪造盈利。

实时资格绑定用户和固定时间窗口；每人同一时段最多一个计分回合。每日积分按服务器 UTC 日期计算。结算事务锁用户积分账户，同时应用单次唯一键和当日上限，避免并发越限。

### 8.3 衣柜

种子内容至少 12 件，覆盖 head/face/body/background 四个槽位。至少提供一套免费默认外观。物品标价使用 10、20、30 等整数积分；具体美术和定价可调整。

购买事务原子完成“余额检查 → 扣分流水 → inventory ownership”。同一件不可重复购买。穿戴必须拥有物品，同槽位只装备一件。换衣服不产生新模型版本。

`cosmetics` 数据只能被 UI 和 profile presentation 读取。增加测试证明换装前后，相同模型状态与观察的输出完全相同。

不实现充值、转赠、玩家交易、抽奖、现金奖品、链上资产或装备属性。积分与衣柜为账号内的纯虚拟内容。

### 8.4 数据质量不等于反作弊速度规则

不要把快速点击、长时间思考或某类画线习惯自动判断为高质量/作弊。仅实施速率限制、重复领取限制、服务器时间权威和可审计异常标记。可疑数据与已确认作弊分开。

## 9. 示范、轨迹与数据权限

### 9.1 决策的三个来源必须分离

```text
model_proposed_action       果蝇在这次观察上的建议，可以是 null
human_requested_action      用户明确提交的 BUY / SELL / HOLD，可以是 null
environment_executed_action 实际 BUY / SELL / NO_ORDER / SYSTEM_LIQUIDATION
```

并保存 `decision_source=HUMAN/MODEL/SYSTEM/TIMEOUT/SKIP`、action_mask、reject_reason、执行有效性、采样模式、模型版本、观察哈希及后续结果。

模型尚未计算时，human 仍可提交；不得为了补齐字段生成假建议。事后用已固定检查点回算时，标记 `proposal_timing=REPLAYED_AFTER_SUBMISSION`，不冒充在线预先决策。

### 9.2 不可变训练记录

每条记录至少包含：

```text
schema_version, decision_id, pseudonymous_user_id, fly_id,
session_id, episode_id, step_index, scenario_family_id,
market_mode, source_kind, dataset_version, split_assignment,
as_of, observed_at_server, accepted_at, executed_at,
observation_artifact_hash, account_before_revision,
analysis_revision_id, action_mask,
model_version_id, model_proposed_action,
human_requested_action, environment_executed_action,
execution_status, fill_id, account_after_revision,
next_observation_hash, equity_before, equity_after,
reward_value, terminated, truncated,
training_eligible, exclusion_reason, consent_scope
```

`model_version_id` 是关联键，不得直接作为模型输入。用户 ID、任务 ID、未来结果和积分也不能进入决策特征。

结果未产生时 `reward_value=null`，不是 0。被拒绝/超时提交保留审计，但 G1 默认仅使用合法且可重放的显式人类动作做模仿标签。

### 9.3 导出

管理员或本人授权导出为 JSONL manifest + Parquet trajectories + 引用的观察 artifacts。导出包包含 schema、规则、数据和模型哈希及排除原因计数；不包含密码、cookie、邮箱、其他人的私有数据。

不把所有人的权重自动平均。个人训练默认只使用本人示范。未来群体研究需要独立 consent 开关和 `parent_dataset_ids`；未经同意不共享手绘线、操作历史或个人检查点。

### 9.4 数据保留

G1 为受控 demo：提供本人记录导出与账号删除入口；删除至少撤销访问、排除未来训练并清理个人 artifacts。对于已参与共享版本的历史影响，不能声称删原数据即可从模型中完全抹除；需要版本停用或重训策略，并在共享功能上线前说明。

## 10. 数据库最小结构

所有表的主键使用 UUID；业务时间使用 `timestamptz`；金额用 NUMERIC(38,18) 并按业务精度量化。`owner_user_id` 的隔离不能依赖前端过滤。

| 表 | 关键字段/用途 | 关键约束 |
| --- | --- | --- |
| users | account_name, password_hash, created_at, status | account_name 唯一 |
| auth_sessions | user_id, token_hash, expiry, revoked_at | token_hash 唯一；只保存散列 |
| flies | owner_user_id, name, ancestor_id, active_model_version_id | demo 每用户唯一 |
| market_datasets | provider, product, version, time_range, checksum, source_kind | 内容版本不可变 |
| market_bars | dataset_id, open/close_time, OHLCV, availability_basis, quality | dataset+product+open_time 唯一 |
| market_ticks | product, seq/trade_id, event_time, received_at, bid/ask, raw_hash | 按 provider 规则去重 |
| scenarios | family_id, dataset_id, t0, horizon, split, config_hash | 禁止普通用户修改 |
| sessions | owner, fly, scenario, mode, state, step, frozen_rule_json | 一个有效计分 live 窗口 |
| steps | session_id, index, as_of, snapshot_id, state, deadline | session+index 唯一 |
| snapshots | market slice refs, account_revision, analysis rules, hash | 不可变 |
| decisions | step_id, sources/actions, idempotency_key, payload_hash | step 唯一；owner+key 唯一 |
| order_intents | decision_id, side, budget/quantity, state, accepted_at | 一 decision 最多一 intent |
| fills | intent_id, price, qty, fee, quote_ref, fill_policy | intent_id 唯一 |
| portfolio_accounts | session_id, cash, qty, cost_basis, revision | session 唯一 |
| portfolio_ledger | account_id, event_id, delta_cash, delta_qty, reason | event_id 唯一；append-only |
| equity_marks | session_id, market_time, equity, mark_ref | session+market_time 唯一 |
| analysis_revisions | owner, step_id, revision, tools/indicators/viewport JSON | 不可变版本 |
| round_settlements | session_id, terminal_equity, metrics, rules, hash | session 唯一 |
| reward_eligibility | user, family/timewindow, rule_version, reservation | 资格键唯一 |
| points_accounts | user_id, balance, revision | user 唯一；balance≥0 |
| points_ledger | user_id, event_id, delta, reason, settlement/item ref | event_id 唯一 |
| daily_reward_totals | user_id, utc_date, granted | user+date 唯一 |
| cosmetics | sku, slot, price, asset_uri, asset_hash | sku 唯一 |
| inventory | user_id, cosmetic_id, acquired_by | user+cosmetic 唯一 |
| equipped_items | fly_id, slot, cosmetic_id | fly+slot 唯一；必须拥有 |
| model_versions | fly_id, parent_id, backend, trainable_parts, manifest_hash | immutable；可追溯父版本 |
| training_jobs | owner, fly, source_manifest, state, lease, heartbeat | 活跃 job 同 fly 互斥 |
| evaluations | model ids, split, environment versions, metrics, artifacts | 评测不修改模型 |
| artifact_registry | hash, media_type, storage_key, owner, access_scope | 内容寻址；路径由服务器生成 |
| audit_events | actor, event_type, target, redacted_payload, timestamp | append-only |

可将市场历史压缩到私有 Parquet artifacts、在 PostgreSQL 只保留索引；业务事务、用户、积分及模型版本仍由 PostgreSQL 管理。不要为方便省略迁移和唯一约束。

## 11. API 合同

统一前缀 `/api/v1`。使用 OpenAPI 生成或校验 TypeScript 类型；不要前后端各维护一份含义不同的枚举。

### 11.1 必要端点

| 方法与路径 | 用途 | 主要保护 |
| --- | --- | --- |
| POST `/auth/register`, `/auth/login`, `/auth/logout` | 身份 | CSRF、限流、密码安全 |
| GET `/me`, `/flies/me` | 用户及果蝇 | cookie session |
| GET `/scenarios` | 可用任务 | 不泄露未来价格/隐藏测试内容 |
| POST `/sessions` | 开始回合 | 服务端分配规则、时点和资格 |
| GET `/sessions/{id}` | 状态 | ownership |
| GET `/sessions/{id}/snapshot` | 当前观察 | 截止时间由服务器决定 |
| GET `/sessions/{id}/chart?timeframe=...` | 时点内图表 | 不允许 arbitrary future `to` |
| PUT `/sessions/{id}/analysis-draft` | 草稿 | 大小、工具、数值校验 |
| POST `/sessions/{id}/decisions` | BUY/SELL/HOLD | 幂等、revision、窗口 |
| POST `/sessions/{id}/skip` | 明确跳过 | 不产生 HOLD 标签 |
| GET `/sessions/{id}/events` | SSE | 认证、重连游标、无未来数据 |
| GET `/sessions/{id}/review` | 已结束区间复盘 | 只释放已经解锁的结果 |
| GET `/points`, `/cosmetics`, `/inventory` | 积分和物品 | 本人账本 |
| POST `/cosmetics/{sku}/purchase` | 兑换 | 原子扣分、防重复 |
| PUT `/flies/me/equipment` | 穿戴 | ownership 与合法槽位 |
| POST `/flies/me/training-jobs` | 发起实际训练 | 数据资格、配额、版本锁 |
| GET `/training-jobs/{id}` | 作业状态 | owner；实际进度 |
| POST `/flies/me/evaluations` | 独立测试 | 固定模型、测试范围 |
| POST `/flies/me/model-versions/{id}/activate` | 切换版本 | 回合内不换；版本属于本人 |
| POST `/exports` | 本人数据导出 | 私有可过期访问 |
| GET `/health/live`, `/health/ready` | 进程与依赖状态 | 不暴露 secrets |

### 11.2 动作请求与响应示例

```http
POST /api/v1/sessions/{session_id}/decisions
Idempotency-Key: 74522a44-1415-46dd-8d1a-e94350a5d616
Content-Type: application/json
```

```json
{
  "step_index": 3,
  "snapshot_id": "uuid",
  "expected_portfolio_revision": 3,
  "action": "SELL",
  "analysis_draft_revision": 7
}
```

```json
{
  "decision_id": "uuid",
  "human_requested_action": "SELL",
  "model_proposed_action": null,
  "status": "FILL_PENDING",
  "accepted_at": "2026-09-14T18:15:12.431Z",
  "next_step_at": "2026-09-14T18:20:00Z",
  "paper_only": true
}
```

禁止接受 `price`、`points`、`reward`、`cash`、`owner_user_id` 等可篡改业务结果的字段；严格 schema，额外字段直接 422。

错误码至少包括 `STALE_SNAPSHOT`、`STEP_ALREADY_COMMITTED`、`ACTION_NOT_ALLOWED`、`ANSWER_WINDOW_CLOSED`、`MARKET_STALE`、`DATA_INVALID`、`INSUFFICIENT_POINTS`、`TRAINING_DATA_INSUFFICIENT`、`BRAIN_BACKEND_UNAVAILABLE`。前端显示中文可理解说明。

## 12. 架构与模块职责

### 12.1 单体业务＋独立计算 worker

```text
React 工作台 / 衣柜 / 复盘
              │ HTTPS / SSE
              ▼
FastAPI 业务服务 ── PostgreSQL（身份、状态、账本、作业）
      │                    │
      ├─ SnapshotService   ├─ 私有 artifacts（快照、模型、数据清单）
      ├─ PaperBroker       │
      ├─ RewardService     ▼
      └─ MarketFeed     训练/评测 worker ── Stonkfly 神经核适配器
                              └─ 用户专属 readout 训练
```

不需要一开始拆微服务、部署 Kafka 或 Kubernetes。FastAPI 进程不加载全量脑模型；多个普通 worker 并不会自动共享大模型内存。[S10] 神经核运行于独立进程并限制并发。

G1 作业队列可使用 PostgreSQL `jobs` 表、短租约和 `FOR UPDATE SKIP LOCKED` 领取；每 5 秒续租，超过 30 秒无心跳可重试。重试先验证 artifacts 和幂等阶段，不从头重复发积分。

### 12.2 推荐技术栈

- Web：React、TypeScript、Vite、Lightweight Charts、TanStack Query；样式用普通 CSS 或项目现有工具，不强制复杂组件库。
- API：Python 3.11、FastAPI、Pydantic、SQLAlchemy、Alembic、psycopg。
- 数据：PostgreSQL；历史 Parquet；私有本地 artifacts 可后换对象存储。
- 计算：NumPy、Pillow、PyTorch；Gymnasium 环境；G1 不要求 GPU。
- 验证：pytest、Hypothesis、Playwright、前端单元测试；基准报告保留环境信息。

锁定实际安装版本并生成 lockfile，不把“latest”写进可复现环境。上游 Stonkfly 当前依赖与本项目分开验证，尤其交易相关依赖不得顺带成为产品的真实下单能力。[S02]

### 12.3 部署边界

默认 macOS 或 Linux 原生进程运行神经 worker，Windows 可以运行浏览器和前端；Windows 原生神经编译不作为 G1 必须支持项。上游提供的环境说明以 Python 3.11、C++17 和 macOS/Linux 为基础。[S03]

同机先使用一名神经 worker，允许多账号异步排队。存储共享原始图不等于运行时内存零复制：上游检查点实际保存权重与多类动态数组，应先量测再决定多实例数量。[S04]

严禁因性能不足而悄悄裁剪连接图、放大积分步长或替换神经核。需要降级时标记为独立实验 backend，不能沿用真实全图 backend 标签。

## 13. 真实果蝇模型适配与状态管理

### 13.1 上游核对与最小隔离

开始 G1 前实际获取 Stonkfly 仓库，固定 Git commit；输出 `upstream_audit.md`，列出 commit、许可证、数据校验、编译环境、最小运行和测试结果。本文核对的是 2026-09-14 可见的 main，不提供未经验证的 commit SHA。

已核对的适配入口在 `stonkfly/neural/brain.py`：`MemoryBrain` 提供 step、checkpoint、restore 和 reset 等能力；神经步进返回脉冲计数及耗时。[S04] 这不是现成的网页多租户训练 API，需要新增适配层。

产品进程仅使用神经模拟、数据准备和观察投影所需模块。不要启动上游完整交易 runner；不要把 Coinbase AgentKit 的真实交易动作注册到产品中。若依赖拆分需要复制或改造上游模块，保留许可证和修改说明，记录 patch hash。[S02][S14]

### 13.2 Backend 类型必须显式

```text
stub_debug             用于 UI/故障测试，禁止宣称是真脑
market_only_baseline   普通市场特征模型，用于对照
stonkfly_native        原神经核与原始解码；原解码不被人类标签训练
stonkfly_readout_v1    真神经核 + 市场/账户特征 + 用户专属输出头；G1 主路径
stonkfly_plastic_exp   后续脑内可塑性实验；默认不启用
```

API、模型 manifest、评测报告和个人页均显示 backend 及 `trainable_parts`。不能只在日志里藏一个“mock=true”。

### 13.3 新建适配协议

下面是本项目要实现的接口，而非宣称上游已具有同名函数：

```python
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol
import numpy as np

Action = Literal["BUY", "SELL", "HOLD"]

@dataclass(frozen=True)
class BrainObservation:
    rgb: np.ndarray                 # uint8, (180, 320, 3)，服务端标准渲染
    market_features: np.ndarray     # float32, (36,)
    market_missing_mask: np.ndarray # bool, (36,)
    account_features: np.ndarray    # float32, (8,)
    action_mask: np.ndarray         # bool, (3,), HOLD 一直可用
    observation_hash: str

@dataclass(frozen=True)
class BrainResult:
    action: Action
    probabilities: np.ndarray      # (3,)，无效动作概率为 0
    neural_features: np.ndarray     # (256,)
    runtime_state_hash: str
    native_elapsed_ms: float

class BrainBackend(Protocol):
    def reset_episode(self, model_version: str, seed: int) -> None: ...
    def observe(self, observation: BrainObservation) -> BrainResult: ...
    def save_runtime(self, destination: Path) -> str: ...
    def restore_runtime(self, checkpoint: Path) -> None: ...
    def close(self) -> None: ...
```

模型对象不拥有数据库写权限、不持有行情凭据，也不能直接发模拟订单。它只输出建议；业务服务与 PaperBroker 执行规则。

### 13.4 标准观察表示

原始项目接收图像投影而不是完整工作台。[S01] 本项目必须定义固定的 `observation_encoder_version`，不能依赖用户屏幕分辨率、换装、主题、画线或浏览器截图。

G1 标准渲染图 320×180：使用固定亮色背景，按 1m、5m、1h 展示三段价格/成交量概要；各段只读时点允许的数据。市场侧使用同一份最多 3600 分钟的输入窗口。所有文字、颜色、缩放、字体版本进入 renderer hash。该输入是工程适配，不声称恢复生物视觉。

复用并核对上游图像到视网膜的映射。`MemoryBrain.step` 的底层输入不是直接一张 RGB 数组；不能跳过上游投影而凭空把 RGB 当成 luminance 参数。适配测试要检查实际光感受输入形状及有限值。

神经特征：对各神经元本观察周期的脉冲频率取 `log1p`，按整数 neuron ID 的稳定 SHA-256 映射到 256 个固定桶，每桶取均值。桶映射写入 manifest。不能用 Python 进程随机化的 `hash()`。不把桶称为未经证实的生物功能区。

市场特征：每个 1m/5m/1h 周期 12 个，合计 36 个：1/3/12 根收盘对数回报、当根振幅/收盘价、实体/收盘价、SMA20 与 SMA50 偏离、EMA12−EMA26 除以收盘价、MACD signal 除以收盘价、RSI14/100、成交量/SMA20 成交量、过去 20 根回报标准差。缺失另带 36 维 mask。

账户特征 8 个：现金/E0、持仓市值/E0、浮动盈亏/E0、剩余回合比例、上一步实际 BUY/SELL/NO_ORDER 的三个 one-hot、是否持仓。初始没有前动作时三个 one-hot 都为 0。

输入共 `256 + 36 + 36 + 8 = 336` 维。只标准化连续数值，mask、one-hot 与是否持仓标志保持原值。标准化只拟合训练数据；缺失值在标准化后置 0，并保留 mask。使用数值裁剪阈值时存入配置并记录越界次数，不从测试分布重估。

这是一种显式的混合控制器，可能主要依赖普通市场特征。因此 G1 必须做“移除神经特征”对照；没有证据时不能声称果蝇连接组贡献了收益。

### 13.5 运行时钟、冻结与重置

每个市场决策观察推进 500ms 神经时间；市场 5 分钟不是神经 5 分钟。保存 `market_time`、`neural_time`、wall-clock 三者，不混用 eligibility 和冷却时间。

G1 设置 `weights_frozen=True` 并关闭学习注入；不能只设置 `learning=False` 就假定所有记忆状态或权重都绝对不变。最终以权重逐数组前后比较测试为准。[S04]

每个新 episode 重置短期动态，保留选定用户输出头；再回放 t0 之前 24 个规定的观察作 warm-up。warm-up 仅用过去信息，不产生交易、标签、积分或学习更新。随机历史题不沿用上一道题的膜电位和突触迹线。

同一 episode 中断恢复时恢复完整运行状态，不能 reset。长期模型版本与临时神经 runtime checkpoint 使用不同 manifest 和生命周期。

### 13.6 每只果蝇到底保存什么

```text
共享只读：上游 commit、图结构、基准参数、视觉映射、标准渲染/特征协议
用户独立：readout 参数、normalizer、训练数据清单、版本谱系、训练配置
回合独立：神经动态状态、随机状态、当前位置、账户/步骤引用、输入哈希链
外观独立：物品 ownership、装备槽位；不参与模型
```

G1 默认同一祖先、同一初始输出头，后续差异来自真实示范和训练。不要仅靠随机 seed 冒充用户养成；也不要强求两个同样示范的用户一定作不同动作。

上游 checkpoint 包含大范围权重与动态数组，不能假设每只果蝇只有几千个可塑参数的存储成本。[S04] G1 先保存安全的完整检查点和用户输出头。优化为共享权重＋状态增量之前，必须通过恢复等价测试。

写 checkpoint 使用临时文件、哈希校验、原子 rename；文件成功后再提交 DB manifest。启动时清理孤立临时文件，绝不让 DB 指向未完成 artifact。不接受用户上传任意 pickle 或可执行模型文件。

### 13.7 缓存与多用户调度

冻结的脑核若只接收市场图像，且初始状态及完整输入前缀一致，神经特征可以按 `graph+renderer+prefix+seed+freeze_config` 缓存。账户向量及输出头仍按用户独立计算。

若启用脑内可塑性、账户视觉输入或不同 warm-up，缓存必须加入相应状态/输入哈希；不得跨不同经历的脑实例复用错误特征。

一只果蝇同时只允许一个训练 writer，活动回合锁定旧模型版本。训练成功产生候选版本，评测后由用户/默认规则在新回合启用。正在运行的回合不热替换参数。

## 14. G1 训练实现：人类示范 → 个人输出头

### 14.1 训练数据资格

只取已提交、合法、可重放、未泄露未来的显式用户动作。HOLD 是正常类别；SKIP、TIMEOUT、系统清仓和被拒绝的交易不能伪装成人类动作。训练记录包含亏损与盈利，不只保留赢家。

至少 64 条训练标签、16 条验证标签，训练集中至少两个类别各 8 条。达不到时返回 `TRAINING_DATA_INSUFFICIENT` 并准确显示缺什么；不循环复制样本凑数。

demo 可以提供有明确来源的 scripted 教学样本用于自动验收，必须标记 `teacher_kind=SCRIPTED`。它们不能计入真人带教数量或正式积分，也不能伪装为用户真实交易能力。

### 14.2 时间划分

G1 至少导入 30 天真实一分钟历史数据，创建固定 dataset manifest。按时间 70%/15%/15% 划为 train/validation/test；若缺口多，应延长取数区间而非填造行情。

一个 scenario 的上下文窗口、warm-up、动作期、奖励期和期末清仓都必须属于同一 split。边界处不满足条件的 scenario 剔除。相同或重叠未来结果窗口不得跨 split。来自多用户的同一市场窗口必须同属一个 split，不能按用户随机切分防止泄露失败。

test scenario 不向普通训练任务提供；验证集用于 early stopping；最终测试只用于报告，不参与调参或选择最佳版本。后续正式研究应另增加锁定、轮换和访问预算，避免反复查询测试集形成间接过拟合。

### 14.3 训练步骤

1. 冻结来源清单、parent model、规则和 encoder 版本，验证 consent 与数据资格。
2. 按 episode 顺序重放标准观察，恢复/计算神经特征；不能把拥有历史状态的神经核当成随机打乱样本的无状态函数。
3. 特征提取完毕后，训练 feed-forward 输出头时可以打乱 train 样本，但 episode/split 标签不变。
4. 结构为 `Linear(336,64) → Tanh → Linear(64,3)`；logits 按 action_mask 屏蔽后计算交叉熵。
5. 优化器 AdamW，学习率 0.001，batch 32，最多 30 epochs，验证损失 5 轮不改善提前停止；这些是初始超参数。
6. 可使用只根据训练集计算且上限为 3 的类别权重。没有出现过的类别权重设为 0 并在报告提示，不能因为 HOLD 多就删除它。
7. 输出实际 train/val loss、类别计数、accuracy、macro-F1、混淆矩阵及有效样本数。不把模仿准确率称为交易胜率。
8. 保存 head 参数、normalizer、optimizer 数组、训练 seed、epoch、数据 hash、代码和环境版本；生成不可变候选模型。
9. 运行独立 rollout 评测，成功后标记 READY_FOR_ACTIVATION；测试差也保留结果。训练失败不替换旧版本。

训练后可以更像用户，但用户本身也可能判断错误。G1 的工程要求是发生真实更新且流程可检验，不是承诺训练必然提高收益。

### 14.4 延续学习与灾难性遗忘

“继续训练”从上一模型版本恢复，并沿用 parent 的 normalizer。若需要重新拟合 normalizer，必须另作输入坐标迁移、重训或首层补偿与等价验证，不能直接换 scaler 后沿用旧 head。“继续训练”同时重放一部分此前有效示范，不能每次只用最近几条。G1 可先使用截至当前的全部个人训练数据，设置明确上限和采样 seed；到达上限后按 episode 分层保留，而不是按盈利优先。

保留一个长期验证集衡量旧任务表现，新版与旧版都有对照。候选版本劣化时用户可继续使用旧版。积分多少与模型是否被激活无关。

### 14.5 个性化的验证

必须有两组不同的合法 scripted teacher 数据，从同一初始 head 分别训练两个 demo 用户。检查两套输出头参数独立、结果可恢复，并在固定 probe 集上至少出现可测概率差异；同时训练用户 A 不得修改用户 B 的文件或 DB 版本。

这只证明个性化更新有效，不证明不同真人必定形成独特策略。真实用户的差异通过 action disagreement、持仓比例、交易频率等统计展示，不用未经验证的“勇敢/胆小”人格标签。

## 15. 后续训练路线：有接口，不假装已经完成

### 15.1 Gymnasium 环境现在就应实现

虽然 G1 先做模仿学习，撮合引擎应封装为标准 episode 环境，以便独立评测和后续 RL。[S11]

```python
class FlyPaperEnv(gymnasium.Env):
    # 0=BUY, 1=SELL, 2=HOLD，所有层统一
    action_space = gymnasium.spaces.Discrete(3)

    def reset(self, *, seed=None, options=None):
        # 返回 observation, info；重置短期状态和模拟账户
        ...

    def action_masks(self):
        # bool[3]；余额/持仓决定有效性；HOLD 恒为 True
        ...

    def step(self, action):
        # 复用 PaperBroker，不再维护另一套费用或成交公式
        # 返回 observation, reward, terminated, truncated, info
        ...
```

完整结束有限时域任务属于 terminated，并在 observation 中提供剩余时间。数据/系统故障属于 truncated 且对应轨迹排除训练；不要把断流当成正常成功结局。环境检查器可能采样无效动作，环境须安全处理：记录 invalid proposal、执行 NO_ORDER，不崩溃；正常策略通过 mask 避免无效动作。

### 15.2 PPO 可选实验

训练模式：在历史回放环境中，由当前策略重新采样动作的 on-policy RL。不能把现有人类 JSONL 直接喂给 PPO，再称为 on-policy 训练。历史回放不自动等于“离线 RL”算法。

默认奖励：`r_t = log(E_after / E_before)`，终局步包含提前规定的清仓费用；费用已进入 E，不再次减去以免重复惩罚。积分不输入 reward，也不参与探索。

使用当前版文档支持的 MaskablePPO 路线处理无效动作，并使用对应的 mask-aware 评测函数。[S12] actor 使用与 G1 相同的特征和可复用 head；初始化/迁移时逐 tensor 校验形状，不能随意加载不兼容权重。critic 单独初始化。

首个研究配置可以设 10,000 环境步、1 个环境、固定训练时间区间和三个 seed，先验证管线，不作为收益验证样本量标准。优化前后都保留纯 BC 模型。脑核冻结且输入路径相同时允许缓存神经特征。

### 15.3 交互式补采

后续让模型运行到自己会遇到的账户状态，再请用户点三按钮纠正；把这些记录加入个人数据集。可借鉴 DAgger 的交互式数据聚合思想，但普通用户不等于无误专家，不套用理论保证。[S13]

补采模式若展示原模型动作，必须记录 `teacher_exposed_to_model=true`，与独立示范区分。仍然不要求自然语言解释。

### 15.4 脑内可塑性实验

仅在独立实验 backend 中启用。先定义动作归因和奖励到神经信号的接口，再验证：同一观察、不同奖励，目标可塑状态确实按规则变化；冻结对照不变；恢复状态可复现。

人类接管时，不将其结果无条件强化到果蝇原来的 BUY/SELL 活动上。需要单独设计可检验的教学电流、动作通道关联或其他机制；本规格不声称有一个现成正确映射。没有通过机制和行为测试之前，界面只能显示“脑内学习实验”，不能表示已获得交易能力。

## 16. 独立评测与科学声明边界

### 16.1 G1 必做对照

固定相同资产、起始条件、规则、测试场景和数据版本，比较：

1. 现金持有基准；
2. 一次性买入并持有至期末的基准，明确该基准使用全额预算还是一档预算；G1 两种均输出；
3. 未训练 parent head；
4. 用户训练后 head；
5. 不使用神经特征的 market/account-only 模型；
6. Stonkfly 原始解码路径，作为独立 baseline，不与可训练 readout 混称。

全额买入持有可以使用一次性全额配置，这是有意不同的曝光基准，不将其不同订单次数隐藏；同费率、终局与数据规则保持一致。

追加将训练后 head 恢复为 parent 的消融，检查此前变化是否随之消失。脑内实验另外增加 frozen plasticity 与 shuffled reward 对照。不要只挑最好的一次展示。

### 16.2 输出指标

每组至少 10 个未见回合、3 个训练 seed，并报告实际 episode 数、独立市场窗口数和覆盖日期。相同市场的多个 seed 不是多个独立市场样本。demo 样本量用于验证流程，不保证统计结论充分。

核心：期末净回报、MDD、总费用、交易次数、平均仓位、BUY/SELL/HOLD 分布、非法动作率。短回合不报告夸大的年化收益或将一分钟收益年化为“稳定回报”。

分别展示模仿指标与收益指标。若提供区间估计，应按市场日/episode 块重采样而非将每笔成交当作独立样本。没有可靠改善时原样显示“该测试未观察到明确改善”。

用户页面至少区分：`训练数据不足 / 已训练待测试 / 已测试未见改善 / 在本测试集上改善`，不使用万能的“智力 +10”。

### 16.3 可复现边界

同机器、同依赖、同数据和同配置要测试确定性。跨硬件/编译器不强求字节相同，应报告数值差异和平台。不能为了通过测试，覆写不同平台的运行证据。

## 17. 安全、运行日志与恢复

### 17.1 即使是模拟盘也要保护账号

本地 demo 可使用账号名和密码，不必引入邮件服务。密码采用成熟库的 Argon2id；不自行发明加密。session token 只在 HttpOnly cookie 传递，服务器保存散列；生产启用 Secure/SameSite、HTTPS、CSRF、登录和动作限流。

所有资源以认证用户做 ownership 查询；UUID 不能充当权限。管理员访问模型与导出要审计。不接收任意 URL 数据源、文件路径、SVG 脚本、HTML 或模型 pickle。

公开部署模式与本地开发模式分开；开发种子账号和测试重置接口在公开模式必须拒绝启动或不可访问。不能把整个 artifacts 目录挂成静态网站，否则可能泄露未来行情和他人模型。

### 17.2 从架构上排除真钱路径

MUST NOT 存在 `RealBroker`、live-order endpoint、钱包接口或启用真实交易的环境变量。`execution_mode` 只能为 `PAPER_ONLY`，任何其他值启动失败。

市场网络访问允许只读公共行情 HTTP GET 和行情 WebSocket 的订阅控制消息；业务服务无交易凭据。CI 拦截所有交易订单/账户写入调用，覆盖意外安装上游 SDK 的情况。不要把“默认不开”当成“没有真钱能力”。

### 17.3 日志与恢复

结构化日志至少包含 request_id、session_id、step_id、job_id、model_version_id、stage、耗时、错误码、数据新鲜度。避免记录密码、cookie 或完整个人身份信息。

崩溃恢复场景：动作已提交但未成交；成交已记账但 SSE 未送达；积分已记账但客户端超时；模型文件写好但 DB 尚未发布；job 租约过期。每种场景都有幂等恢复测试。

模型作业不可以拥有积分写权限。重新训练、重试任务、恢复检查点都不能触发额外奖励。

## 18. 目标目录与启动合同

### 18.1 目录

```text
flydesk/
  AGENTS.md
  README.md
  .env.example
  package.json
  pnpm-lock.yaml
  pyproject.toml
  requirements.lock
  apps/
    web/src/
      pages/ components/ chart/ api/ state/ wardrobe/
  backend/flydesk/
    api/ auth/ db/ config/
    market/ snapshots/ scenarios/
    simulation/ rewards/ cosmetics/
    datasets/ artifacts/ jobs/
    brains/ training/ evaluation/
    cli.py
  integrations/stonkfly/       # pin 记录、隔离适配/patch，不存凭据
  migrations/
  configs/
    demo.yaml
    sources.yaml
    model.yaml
    reward_rules.yaml
  scripts/
    doctor.py
    dev.py
    import_market.py
    benchmark.py
    audit_paper_only.py
  tests/
    unit/ property/ integration/ e2e/ neural/ fixtures/
  docs/
    architecture.md
    upstream_audit.md
    data_contract.md
    model_card.md
    acceptance_report.md
    benchmark_report.md
    adr/
  runtime/                    # gitignore；由环境配置实际位置
    datasets/ artifacts/ checkpoints/ logs/
```

`AGENTS.md` 应复制第 0 章不可变边界，并引用本规格。不要把整个文档塞进每个源文件。

### 18.2 启动前提与 doctor

提供 doctor 检查：Python 3.11、固定 Node LTS/pnpm 版本、PostgreSQL 连通、迁移版本、磁盘空间、C++17 编译器、原生库、数据校验与 public feed。实际所需磁盘和内存在基准阶段报告，不声称所有机器都足够。

默认原生安装，不依赖 Docker。数据库使用本机或已有 PostgreSQL 服务；安装方式按 macOS/Linux/Windows 单独说明。没有数据库时清楚停止，不偷偷降级成一个进程内字典或 SQLite 文件并称为多用户 demo。

### 18.3 要实现的命令

下面是交付时应存在的命令。当前文档不是已经可运行的仓库，因此不能将它们称为已执行成功。

```bash
# 在项目根目录；macOS/Linux 的示例
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock
python -m pip install --no-deps -e .
pnpm install --frozen-lockfile
cp .env.example .env
# 用户填写本地 DATABASE_URL；不存在交易 API key 字段
python scripts/doctor.py --profile demo
python -m flydesk.cli migrate
python -m flydesk.cli seed --environment dev
python -m flydesk.cli market-import --config configs/sources.yaml
python -m flydesk.cli brain-prepare --backend stonkfly
python -m flydesk.cli verify-data
python scripts/dev.py
```

`dev.py` 启动 web、api、public market feed、普通 job worker 和一个 neural worker，输出端口与健康状态；Ctrl-C 清理子进程。Windows 浏览器/前端说明与神经 worker 的平台要求分开。

离线界面验收提供 `python scripts/dev.py --fixture --backend stub_debug`，页面永久显示“合成行情／调试模型”；这不满足 G1。外网失败时不得自动切入这个模式却保留“实时”标签。

### 18.4 源码与许可证

固定上游 commit、依赖版本、source 文件 SHA-256、图数据校验和本地 patch。不得只写“从 main 安装”。Stonkfly 的代码与 MaleCNS 数据授权不同，需要分别保留和核对归属；数据根据上游许可单独下载，不默认打包进应用。[S14]

所有 demo 外观使用原创简单 SVG 或可核实许可的素材；随仓库保留来源清单。不得复制受版权保护的角色作为默认果蝇服装。

## 19. 验收指标与测试矩阵

以下是工程验收目标，尚未实测。所有测试结果必须关联 Git commit、依赖锁、环境配置和实际输出。

### 19.1 不可妥协的正确性指标

| ID | 验收项 | 通过条件 |
| --- | --- | --- |
| A01 | 纯模拟边界 | 全量 E2E 期间外部交易写入调用为 0；非法 execution_mode 启动失败 |
| A02 | 账号隔离 | A 用户不能读取或修改 B 的会话、积分、图形、模型、导出 |
| A03 | 服务端时间边界 | 篡改请求时点、周期、分页、缓存命中都不能返回超出 as_of 的数据 |
| A04 | 高周期未来泄露 | 当天尚未发生的高/低/收盘不能出现在日内部分 K 线或指标中 |
| A05 | 浏览器无未来文件 | bundle、HTML、网络响应、SSE、storage 无当前任务未来行情 |
| A06 | 三动作语义 | BUY 扣现金，SELL 不做空，HOLD 明确无订单且有标签 |
| A07 | 跳过与超时 | 标签为 null；不会产生额外 HOLD 示范 |
| A08 | 无效动作 | 余额不足/无持仓返回明确错误或环境安全 NO_ORDER，不生成虚构 fill |
| A09 | 动作幂等 | 同一步重复 100 次请求只产生一个有效 decision/intent |
| A10 | 跨标签争抢 | 两个不同 key 同时提交同一步，仅一个成功 |
| A11 | 成交幂等 | worker 崩溃后重试不重复扣款、加仓或计费用 |
| A12 | 黄金账本 | 第 7.3 节所有值精确相等 |
| A13 | 性质测试 | 至少 10,000 个生成动作序列中 cash/qty 不为负、账本与状态一致 |
| A14 | 历史成交顺序 | 动作写入前不能读取/返回下一根 open；不用可见 close 回填 |
| A15 | 实时成交顺序 | 只用 accepted_at+latency 后接收的合格报价 |
| A16 | 断流处理 | 不新成交；明确 stale/data-invalid；不使用旧价补全 |
| A17 | 回合恢复 | API/worker 重启后 step、账户、锁定规则与已有动作不变 |
| A18 | 终局处理 | 持仓统一清算；系统清仓不进入人类标签；重复结算无副作用 |
| A19 | 积分算例 | 正收益、零、负收益、上限、门槛、舍入各有精确测试 |
| A20 | 防重复领奖 | 换 session/seed/导入 ID 不能绕过 scenario family 资格 |
| A21 | 每日限额 | 并发结算 100 次仍不突破每日上限 |
| A22 | 购买原子性 | 重试不重复扣分；余额非负；重复 SKU 不重复购买 |
| A23 | 穿戴隔离 | 未拥有物品无法装备；换装不改变同状态模型输出 |
| A24 | 图表工具 | 三种图形均可创建、移动、删除、撤销、恢复；刷新位置正确 |
| A25 | 指标正确性 | 固定 fixtures 的 SMA/RSI/MACD 与黄金数值一致；不足数据为 null |
| A26 | 分析版本 | 后改画线不会篡改已提交 decision 的分析记录 |
| A27 | 数据导出 | 每条有效样本具备完整 provenance；可重放同账户轨迹 |
| A28 | Split 隔离 | 无共享结果区间跨 train/val/test；标准化不读取 test |
| A29 | 实际训练 | 优化器真正更新允许参数；保存前后 hash 和 loss；不能只更新计数 |
| A30 | 真人/脚本来源 | scripted 和 synthetic 不计入真人示范或正式积分 |
| A31 | 独立用户版本 | 训练 A 不修改 B；不同 teacher 产生独立可测模型差异 |
| A32 | 真脑存在 | 日志及 artifact 含实际图校验、编译库、脉冲记录，非随机替代 |
| A33 | 受控输入响应 | 相同初态的至少两种受控图像产生可区分神经输出；结果归档 |
| A34 | 冻结正确 | G1 所有非允许参数逐数组保持不变；学习更新只在 head |
| A35 | 保存恢复 | 同平台原生核在同检查点续跑与不中断运行的动作/状态通过等价测试 |
| A36 | 模型异常 | 后端缺失、NaN、数据 hash 不符时停止并显示错误，不静默 fallback |
| A37 | 训练不足 | 不足数据不伪造训练；UI 显示确切不足数量/类别 |
| A38 | 独立测试 | 不接受用户动作、不更新参数；显示训练前后及规定基准 |
| A39 | 无神经对照 | market-only ablation 有真实结果；不隐藏神经特征无收益贡献的结论 |
| A40 | 状态真实性 | UI 后端名、数据类型、训练状态与实际一致，失败不显示完成 |
| A41 | 日志隐私 | 测试扫描无密码、cookie、原始认证 token 或他人个人数据 |
| A42 | 新环境复现 | 按 README 从空业务数据库可启动、迁移、seed、恢复与验收 |

### 19.2 性能目标与测量边界

基准机暂定 8 个逻辑 CPU、16GB RAM、SSD、桌面浏览器；实际机器不同要记录，不能混写达标。指标不包括首次下载和编译。

| ID | 场景 | 初始目标 |
| --- | --- | --- |
| P01 | 本地/同网普通业务 API，50 个会话、总计 5 次动作提交/秒，持续 10 分钟 | GET p95≤300ms；动作接收 p95≤500ms；不等待神经核 |
| P02 | 无人工故障注入的该压测 | 业务 5xx<1%，重复业务效果为 0 |
| P03 | 桌面 1440×900、1200 根展示数据 | 首次可操作图表≤2 秒；画线不遮挡操作栏 |
| P04 | MarketFeed 已收到消息到浏览器可见 | p95≤1 秒；外部网络延迟另列 |
| P05 | 积分查询/购买 | p95≤500ms；并发一致性优先于时延 |
| P06 | 真脑 100 次 500ms 神经观察 | 必须测量 p50/p95 wall time、RSS 峰值、checkpoint 大小与恢复耗时；不预设未经验证的速度 |
| P07 | 活跃神经实例数 | 默认 1 个；超出资源预算排队，不导致 API 进程 OOM |
| P08 | 自主实时交易能力开关 | 只有实测推理与排队 p95 能在该步 deadline 前完成才启用；否则只提供排队的历史自主评测 |

G1 要求实时**人类模拟操作**可用，不要求未经测量的全脑模型一定能在 30 秒人类回答窗口内给出建议。模型来不及算就如实显示“未就绪”。不得用 P01 的 API 性能宣称全脑推理性能。

### 19.3 模型训练的工程验收

构造至少 240 条明确可分的合成特征/标签，只验证输出头训练实现。独立验证集分类准确率应≥90%，最终 train loss 相比初始下降至少 20%；若失败先修实现。此测试结果不能作为市场学习证据。

另在真实市场特征及合法 scripted/human 记录上运行完整训练和独立 rollout，要求有真实产物、版本更新、有限数值及完整报告；不规定必须盈利、提高某个百分比或击败基准。

### 19.4 交付时要存在的验证命令

```bash
python -m pytest tests/unit tests/property tests/integration -q
pnpm --filter web test
pnpm --filter web test:e2e
python scripts/audit_paper_only.py
python -m flydesk.cli verify-datasets --strict-splits
python -m pytest tests/neural -q --require-native
python scripts/benchmark.py --profile demo
python -m flydesk.cli acceptance-report --output runtime/reports/
```

`--require-native` 不允许因缺少模型就跳过后仍返回成功。普通 CI 可单独跑轻量测试，但 G1 交付必须附真实神经测试结果。

## 20. Codex 执行顺序与阶段产物

每阶段先实现关键数据和测试，再做页面联调；不要先把所有页面画完而没有服务端规则。

| 阶段 | 工作 | 必交产物 | 退出条件 |
| --- | --- | --- | --- |
| T0 | 核对范围、锁依赖、审查上游、移除真钱能力 | AGENTS、ADR-001、upstream_audit、锁文件 | 不可变边界清楚；上游阻塞可见 |
| T1 | Repo、DB、身份、artifacts、配置、job 框架 | 迁移、doctor、seed、health、权限测试 | A01/A02 基础通过 |
| T2 | 历史导入、质量、split、快照、指标 | 数据清单、时点接口、黄金 fixtures | A03–A05/A25/A28 通过 |
| T3 | 纯模拟引擎、状态机、账本和恢复 | PaperBroker、Gym 环境、黄金算例 | A06–A18 通过 |
| T4 | 图表、画线、按钮、示范和复盘 | 可用工作台、E2E、导出 | A24/A26/A27 通过 |
| T5 | 积分、商店、衣柜、权限和防刷 | 12 件物品、积分流水、幂等测试 | A19–A23 通过 |
| T6 | 真实实时行情与模拟撮合 | feed、SSE、live task、断流恢复 | 实时 E2E 与 A15/A16 通过；达到 G0 |
| T7 | 真实神经核、观察协议、检查点、个性化 head | native adapter、训练作业、模型卡、实际日志 | A29–A37 通过 |
| T8 | 独立评测、对照、性能、交付 | acceptance_report、benchmark_report、演示记录 | A38–A42 与适用性能指标通过；达到 G1 |

可以并行推进 T4/T5，但不能绕开 T2 的未来隔离和 T3 的真实账本。T0 发现神经平台或依赖不兼容时继续完成不依赖它的模块，同时保留明确的 G1 阻塞，不用假的真脑通过验收。

每次阶段完成，向项目拥有者报告：已实现项、验证命令与结果、未完成项、ADR 变更。不把计划写成已完成，不把未跑测试写为 PASS。

## 21. 演示脚本与最终交付内容

### 21.1 面向人的完整演示

1. 新账号登录，领取一只默认外观果蝇；页面明确纯模拟。
2. 开始历史回合，展示 as_of；切换周期、添加指标、画线，证明右侧没有未来行情。
3. 提交 BUY、HOLD、SELL；刷新后状态保留，复盘能还原当时图表和动作。
4. 完成回合，查看模拟净结果与积分规则；符合规则时用积分购买并穿戴物品。
5. 打开实时模拟盘，显示真实来源和新鲜度；做一次模拟操作，并展示没有真实账户连接。
6. 进入个人训练页，查看真实数据量；使用足量本人记录或明确标识的 scripted demo 数据运行训练。
7. 训练产生新版本，执行独立历史测试，展示基准和消融。结果可以无改善，但不能是预先填好的数字。
8. 切换两个用户，证明装扮、账户、示范及模型版本隔离；重启 worker 证明恢复。

第 4 步若需要保证演示能展示衣柜购买，可单独提供 `DEMO_SYNTHETIC` 的确定性上涨教学回合和测试账号，必须在页面明确标识，其积分不能转入正式账号。不能篡改真实历史回合的收益来配合展示。

### 21.2 开发交付清单

完整源码、依赖锁、数据库迁移、配置样例、原生启动脚本、数据导入工具、schema/OpenAPI、黄金 fixtures、所有测试、实际运行日志和测试报告、模型卡、上游许可证/归属清单、已知限制。

模型卡至少写清 backend、trainable_parts、输入协议、数据范围/许可/consent、上游 commit 与图 hash、测试范围、基准、是否观察到改善、限制及资源需求。

不要交付真实行情账号凭据、密码、个人数据、系统字体文件或来源不明的图片。大体积脑数据单独按许可下载，交付校验清单即可。

### 21.3 机器可读完成报告

```json
{
  "spec_version": "1.0",
  "git_commit": "实际提交值",
  "gate": "G0_OR_G1_ACTUAL_RESULT",
  "execution_mode": "PAPER_ONLY",
  "backend_used": "实际后端值",
  "market_sources": [],
  "passed_tests": [],
  "failed_tests": [],
  "not_run_tests": [],
  "benchmark_artifact": "实际产物路径或null",
  "known_limitations": [],
  "unverified_claims": []
}
```

以上字符串是说明性占位符，交付时替换实际值；不能直接提交占位符并算完成。

## 22. 必须公开的限制与后续工作

- 真实市场行情并不使模拟成交等同真实交易；G1 不模拟完整盘口排队、市场冲击和流动性。
- 用户可以外查历史答案。系统能限制站内未来信息和重复领奖，不能证明用户没有外部信息。
- 普通用户示范不保证优于基准；用户参与多也不保证模型学得好。
- G1 学习的是个人决策层，非全脑权重；脑内可塑性仍是单独的研究路线。
- 输入展示方式和普通市场特征可能主导结果，需要神经特征消融，不能将任何收益都归因于连接组。
- 完整神经核吞吐与多用户 RAM 成本必须实际测量；异步排队不等于每只果蝇都持续实时运行。
- 积分与装扮不是真钱，但公开运营仍需处理账号隐私、数据授权、内容许可和面向未成年人的产品边界。本规格不作“完全无监管”的法律结论。

可在 G1 后扩展：更多资产、课程、明确同意的共享示范、DAgger 风格补采、PPO、脑内可塑性实验、独立榜单。不得未做范围变更就加入真钱、提现、道具金融化或 LLM 成长。

## 23. 公开来源与设计归属

核对日期：2026-09-14。下面的来源用于确认上游能力、接口和边界；本文的产品规则、数值门槛、架构和验收指标是为此项目提出的设计，不是来源已完成的功能。

| 编号 | 来源 | 支持内容 |
| --- | --- | --- |
| S01 | Stonkfly，What is actually modeled | 原模型输入/解码、候选可塑性和学习证据边界 |
| S02 | Stonkfly，pyproject.toml | 上游 Python 与依赖状况；需要隔离交易依赖 |
| S03 | Stonkfly，Running and stopping Stonkfly | 平台、准备数据、运行与恢复边界 |
| S04 | Stonkfly，stonkfly/neural/brain.py | 实际神经接口、冻结字段、运行数组、检查点 |
| S05 | TradingView，Series primitives | 画线工具的图表扩展机制 |
| S06 | TradingView，Getting started / License and attribution | 图表署名与授权要求 |
| S07 | Coinbase Exchange，Get product candles | 历史接口、分页限制和缺失区间 |
| S08 | Coinbase Exchange，WebSocket Channels | ticker 和 heartbeat |
| S09 | PostgreSQL，Explicit Locking | 行锁与并发事务 |
| S10 | FastAPI，Deployments Concepts | 多进程及每进程内存边界 |
| S11 | Farama，Gymnasium Env | reset/step、terminated/truncated 环境合同 |
| S12 | Stable Baselines3 Contrib，Maskable PPO | 带动作 mask 的 PPO 与评测要求 |
| S13 | Ross, Gordon & Bagnell (2011)，DAgger paper | 交互式模仿学习与数据聚合的参考 |
| S14 | Stonkfly，THIRD_PARTY.md | 代码与数据的归属及授权区分 |

可直接供 Agent 查阅的原始地址：

```text
S01 https://raw.githubusercontent.com/nftechie/stonkfly/main/docs/model.md
S02 https://raw.githubusercontent.com/nftechie/stonkfly/main/pyproject.toml
S03 https://raw.githubusercontent.com/nftechie/stonkfly/main/docs/operations.md
S04 https://raw.githubusercontent.com/nftechie/stonkfly/main/stonkfly/neural/brain.py
S05 https://tradingview.github.io/lightweight-charts/docs/plugins/series-primitives
S06 https://tradingview.github.io/lightweight-charts/docs
S07 https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles
S08 https://docs.cdp.coinbase.com/exchange/websocket-feed/channels
S09 https://www.postgresql.org/docs/current/explicit-locking.html
S10 https://fastapi.tiangolo.com/deployment/concepts/
S11 https://gymnasium.farama.org/api/env/
S12 https://sb3-contrib.readthedocs.io/en/master/modules/ppo_mask.html
S13 https://arxiv.org/abs/1011.0686
S14 https://raw.githubusercontent.com/nftechie/stonkfly/main/THIRD_PARTY.md
```

访问到的网页和仓库可能继续变化。执行时必须重新核对接口、固定实际 commit 和依赖锁；本文没有替代一次真实 clone、安装、编译、运行和安全审查。
