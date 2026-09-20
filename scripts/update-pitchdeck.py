from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
p=root/'DeFly_Colony_PitchDeck.html'
s=p.read_text()
js='''
(()=>{
const slides=[...document.querySelectorAll('.slide')], counter=document.querySelector('#counter');
const key='defly-deck-'+document.documentElement.lang+'-slide';
let i=0,touch=null,lastSwipe=0;
try{i=Number(localStorage.getItem(key)||0)}catch{}
if(!Number.isInteger(i)||i<0||i>=slides.length)i=0;
function fit(){document.documentElement.style.setProperty('--scale',Math.max(.1,Math.min(innerWidth/1600,(innerHeight-86)/900)))}
function show(n){i=(n+slides.length)%slides.length;slides.forEach((s,k)=>{s.classList.toggle('active',k===i);s.hidden=k!==i;s.setAttribute('aria-hidden',String(k!==i));});counter.textContent=String(i+1).padStart(2,'0')+' / '+slides.length;document.title='DeFly Colony — '+slides[i].dataset.title;try{localStorage.setItem(key,i)}catch{}}
function full(){const f=document.fullscreenElement?document.exitFullscreen?.():document.documentElement.requestFullscreen?.();f?.catch?.(()=>{})}
for(const id of ['prev','edgePrev'])document.getElementById(id).onclick=()=>show(i-1);
for(const id of ['next','edgeNext'])document.getElementById(id).onclick=()=>show(i+1);
document.getElementById('full').onclick=full;
slides.forEach(s=>s.addEventListener('click',e=>{if(e.target.closest('button,a')||Date.now()-lastSwipe<600||getSelection()?.toString())return;show(e.clientX<innerWidth/2?i-1:i+1)}));
addEventListener('touchstart',e=>{touch=[e.changedTouches[0].clientX,e.changedTouches[0].clientY]},{passive:true});
addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch[0],dy=e.changedTouches[0].clientY-touch[1];if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)){lastSwipe=Date.now();show(dx<0?i+1:i-1)}touch=null},{passive:true});
addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select')||e.altKey||e.ctrlKey||e.metaKey)return;if(e.key===' '&&e.target.closest('button'))return;if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();show(i+1)}else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();show(i-1)}else if(e.key==='Home'){e.preventDefault();show(0)}else if(e.key==='End'){e.preventDefault();show(slides.length-1)}else if(e.key.toLowerCase()==='f')full()});
addEventListener('resize',fit);fit();show(i);
})();
'''
s=re.sub(r'<script>.*?</script>','<script>'+js+'</script>',s,flags=re.S)
s=s.replace('</style>','''
/* Hide inactive slides regardless of layout helper classes. */
@media screen{.slide:not(.active),.slide[hidden]{display:none!important}.controls{z-index:20;max-width:calc(100vw - 16px);white-space:nowrap}.controls button{flex-shrink:0}.edge-nav{z-index:19}.slide{touch-action:pan-y}}
@media screen and (max-width:800px){.controls{gap:4px;padding:5px}.controls button{padding:7px;font-size:11px}.counter{min-width:50px}.edge-nav{padding:0 2px}.edge-nav button{width:28px;height:52px;font-size:32px}.slide{padding:36px 40px 110px}.meta,.page{position:static;margin-top:24px}.title{font-size:48px!important}.quote{font-size:32px}.body{font-size:18px}.small{font-size:16px}.big{font-size:36px}.slide.active.center{display:block}.stamp{white-space:normal;overflow-wrap:anywhere}}
@media print{.slide[hidden],.slide:not(.active){display:block!important}.controls,.edge-nav{display:none!important}.slide{width:16in;height:9in;min-height:0;padding:.8in;break-after:page}.slide[data-title="Roadmap"]>.center{display:none}}
</style>''')
p.write_text(s)
# Translate visible text only, preserving embedded fonts and slide composition.
translations={
'The thesis':'核心主张','The problem':'问题','The product':'产品','The brain':'完整大脑','The loop':'养成闭环','Federated network':'联邦网络','Colony intelligence':'群体智能','Why now':'为什么是现在','Roadmap':'路线图','The ask':'一起共建',
'DEFly / PITCH 01':'DeFly / 项目路演',
'A distributed neural organism for collective decisions':'面向群体决策的分布式数字神经个体',
'One fly':'一只果蝇，','is a signal.':'一种独立判断。',
'DeFly Colony turns a full digital fruit-fly brain into an independently trained, locally executed agent — then lets many agents learn together without becoming one opaque model.':'DeFly Colony 让完整数字果蝇大脑成为独立养成、本地运行的智能体。多个个体共同学习与协作，而不是被合并成一个不透明的模型。',
'01 — The problem':'01 — 我们要解决什么',
'Most “AI communities” share a server.':'多数 AI 社区共享的是服务器。',
'They do not share independent minds.':'我们希望连接独立的数字大脑。',
'Today':'现状','ONE':'单一决策',
'One hosted policy makes every participant dependent on the same black box.':'所有参与者依赖同一个托管策略，也就依赖同一个黑箱。',
'Missing':'缺失','TRACE':'可追溯性',
'Training history, model lineage and experimental context disappear behind a result.':'一个结果背后的训练经历、模型谱系与实验条件，往往无法追溯。',
'Opportunity':'机会','COLONY':'群体协作',
'Independent agents can disagree, specialize, and make their execution open to independent replay.':'独立个体可以分歧、分工，并向第三方开放可复算的执行记录。',
'02 — The product':'02 — 产品愿景','Adopt':'领养','your ':'你的','fly.':'数字果蝇。',
'The vision: a locally held Fly Identity, an evolving brain state, a checkpoint lineage and a reproducible exam record.':'目标体验：本地持有的果蝇身份、持续演化的大脑状态、可追溯的存档谱系，以及可复现的考试记录。',
'LOCAL EXECUTION':'本地执行','OWNER SIGNED':'所有者签名','REPLAYABLE':'可复算',
'Target experience / illustrative identity':'目标体验 / 身份示意，非真实账户',
'FLY ID':'果蝇 ID','GENESIS MODEL':'基础模型','CHECKPOINT':'状态存档','EXAM STATUS':'考试状态','EXAM PLANNED':'考试功能规划中','OWNER KEY':'所有者密钥','LOCAL':'本地持有','NOT ON-CHAIN — YET':'当前尚未上链',
'03 — The brain':'03 — 完整神经模型','Real scale.':'完整规模。','Local cognition.':'本地推理。',
'CONCEPTUAL NETWORK DIAGRAM · NOT LIVE TELEMETRY':'概念网络示意 · 非实时神经活动',
'MODEL NEURONS':'模型神经元','DIRECTED EDGES':'有向连接','PLASTIC EDGES':'可塑连接','DISPLAY SAMPLE':'显示抽样',
'The display is a sample. The runtime is the complete model. Static base weights are shared; mutable plasticity belongs to each fly.':'显示仅为抽样，运行的是完整模型。静态图与基础权重可以共享；每只果蝇保有独立的可塑状态。',
'04 — The closed loop':'04 — 养成与评估闭环','Train privately.':'独立养成。','Examine honestly.':'诚实考试。',
'ADOPT':'领养','Generate a local owner key and Fly ID.':'生成本地所有者密钥与果蝇身份。','RAISE':'养成','Run complete inference and plasticity in-browser.':'在浏览器执行完整推理与可塑更新。','FREEZE':'冻结','Lock learning before an unseen-data exam.':'在未见数据考试前冻结学习。','COMPARE':'比较','Publish hashes, actions and risk metrics.':'记录哈希、动作与风险指标。','COLLABORATE':'协作','Join a colony without merging brains.':'组成群落，但不合并大脑权重。',
'Trust posture':'信任边界',
'Browser execution is transparent and replayable — not falsely marketed as cryptographic proof.':'目标是让执行可检查、可复算。浏览器自报结果不等于密码学证明；独立复算验证仍需完善。',
'05 — The network':'05 — 联邦路由网络','Many routes.':'多个路由。','No single brain.':'没有唯一大脑。','Browser nodes':'浏览器节点','Full model runtime':'完整模型执行','Local checkpoints':'本地状态存档','Owner signatures':'所有者签名','BRAIN':'大脑','TRAINING':'训练','Federated routers':'联邦路由','Worker API routes':'Worker 接口与路由','D1 indexes':'D1 数据与索引','Peer sync + verification':'节点同步与校验（待完善）','ROUTE':'协调','INDEX':'索引',
'Target architecture: users choose a primary Router and connect community Routers. Discovery UI and API foundations exist; end-to-end federation and router switching remain to be completed.':'目标架构：用户选择主路由，并连接社区路由。目前已有发现界面与 API 基础；真正的路由切换和跨路由同步仍待完成。',
'06 — Colony intelligence':'06 — 群体如何产生价值','Do not average the brains.':'不把大脑简单平均。','Let them disagree in public.':'让独立判断公开碰撞。','Same task / four flies':'同一任务 / 四只果蝇 · 示例','FLY A':'果蝇 A','FLY B':'果蝇 B','FLY C':'果蝇 C','FLY D':'果蝇 D','BUY':'做多','SELL':'做空','HOLD':'观望',
'Illustrative group decision / target rule':'群体决策示例 / 目标规则',
'HOLD quorum reached · agreement 50% · checkpoint diversity 4':'观望票达到示例门槛 · 一致率 50% · 四个不同存档',
'Individual actions remain visible. Colony action is an explicit rule, not a larger biological brain.':'保留每个个体的独立输出。群体决策来自公开规则，不意味着形成一个更大的生物大脑。',
'07 — Why now':'07 — 为什么是现在','The stack':'技术栈','finally fits.':'开始具备条件。','Model':'模型','Network':'网络','Proof':'可验证记录','ROUTERS':'路由节点','HASHES':'内容哈希',
'A full neural kernel can run in the browser, close to the owner and the data.':'完整神经内核已能在浏览器运行，让计算更接近用户及其数据。',
'Worker + D1 gives a practical federation layer before global P2P or chain settlement.':'以 Worker + D1 构建可替换的协调节点，先完成联邦协作，再考虑全球 P2P 与链上登记。',
'Content-addressed checkpoints make lineage and replay part of the product, not afterthoughts.':'以内容哈希绑定状态存档，让版本谱系与复算成为产品设计的一部分。',
'08 — Roadmap':'08 — 实施路线','Ship the organism.':'先跑通数字个体。','Anchor the history later.':'再把历史登记上链。','NOW':'当前','Local-first MVP':'本地优先原型',
'Verified prototype: full browser inference, paper autonomy, activity telemetry. Identity and checkpoint modules exist; the complete adoption-to-exam workflow is not yet verified.':'已验证完整浏览器推理、自主模拟和神经遥测。已有身份与存档模块；领养到考试的完整流程尚未验收。',
'NEXT':'下一步',
'Complete: portable checkpoints, frozen exams, authenticated colony tasks, router switching and cross-router sync. These are roadmap deliverables, not shipped network claims.':'补齐存档迁移、冻结考试、任务鉴权、路由切换及跨节点同步。这些是后续交付目标，并非已上线能力。',
'LATER':'后续','Avalanche anchor':'Avalanche 链上登记',
'Adoption · checkpoint hash · exam result · colony result — small, durable records only':'登记领养关系、存档哈希、考试与群体结果；只上链必要的小型记录。',
'On-chain boundary':'链上边界',
'Avalanche records identity, ownership and history. It does not run 166,700 neurons.':'规划由 Avalanche 记录身份、归属和版本历史，而不是在链上运行 166,700 个神经元。',
'No NFT theater. No claim that copying model data is impossible. Clear layers, clear trust.':'不是给 NFT 套上大脑概念，也不声称模型不可复制。明确每层职责与信任边界。',
'09 — The ask':'09 — 一起共建','Adopt a fly.':'领养一只果蝇。','Build a colony.':'共建一个群落。',
'We are building a network where independent digital brains can learn, disagree, and collaborate — with their history intact.':'我们希望连接独立的数字大脑：各自学习、允许分歧、共同协作，并保留每一次成长的历史。',
'FULL BROWSER WASM':'完整浏览器 WASM','FEDERATED ROUTERS':'联邦路由网络','AVALANCHE-READY':'规划接入 AVALANCHE','DEFLY COLONY / PAPER ONLY / EXPERIMENTAL':'DEFLY COLONY / 仅模拟交易 / 实验性原型',
'← PREV':'← 上一页','NEXT →':'下一页 →','FULLSCREEN':'全屏'
}
# Split tags from text so HTML attributes / runtime code remain intact.
head,body=s.split('<body>',1)
markup,script=body.split('<script>',1)
parts=re.split(r'(<[^>]+>)',markup)
for j,x in enumerate(parts):
 if x.startswith('<'):
  for a,b in translations.items():
   x=x.replace('data-title="'+a+'"','data-title="'+b+'"')
  parts[j]=x
 else:
  stripped=x.strip()
  if stripped in translations: parts[j]=x.replace(stripped,translations[stripped])
  elif x in translations: parts[j]=translations[x]
cn=head.replace('lang="en"','lang="zh-CN"').replace('DeFly Colony — Pitch Deck','DeFly Colony — 中文路演稿')+'<body>'+''.join(parts)+'<script>'+script
cn=cn.replace('</style>', '''
:lang(zh-CN) body{font-family:Mono,"PingFang SC","Microsoft YaHei",sans-serif}
:lang(zh-CN) .title,:lang(zh-CN) .quote,:lang(zh-CN) .big,:lang(zh-CN) .layer h3{font-family:Pixel,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0;line-height:1.2}
:lang(zh-CN) .title{font-size:86px!important;font-weight:650}
:lang(zh-CN) .quote{font-size:49px}:lang(zh-CN) .big{font-size:49px}
@media(max-width:800px){:lang(zh-CN) .title{font-size:40px!important}:lang(zh-CN) .quote{font-size:29px}:lang(zh-CN) .big{font-size:34px}}
</style>''')
(root/'DeFly_Colony_PitchDeck_CN.html').write_text(cn)
print('Updated English deck and created Chinese deck')
