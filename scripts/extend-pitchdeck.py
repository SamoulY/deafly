from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
css='''
.tech-slide h2{font:56px/1.12 Pixel,"PingFang SC",sans-serif;margin:18px 0 24px;letter-spacing:0}
.tech-route{display:grid;grid-template-columns:1fr 40px 1fr 40px 1fr;align-items:center;border-top:1px solid var(--acid);border-bottom:1px solid var(--line);padding:17px 0;gap:12px}
.tech-route b{color:var(--acid);font-size:23px}.tech-route p{font-size:20px;line-height:1.4;margin:8px 0 0}.tech-route .route-arrow{color:var(--acid);font-size:30px;text-align:center}
.tech-status{color:var(--muted);font-size:17px;line-height:1.4;margin:14px 0 20px}
.tech-columns{display:grid;grid-template-columns:1.05fr 1fr 1fr;gap:28px}.tech-columns article{border-top:1px solid var(--line);padding-top:15px}.tech-columns h3{font-size:23px;color:var(--acid);margin:0 0 13px}.tech-columns p{font-size:21px;line-height:1.5;margin:0}.tech-columns strong{color:var(--ink)}
.tech-bottom{font-size:19px;line-height:1.45;margin-top:22px;padding-top:15px;border-top:1px solid var(--line);color:#c5cec4}
@media(max-width:800px){.tech-slide h2{font-size:32px}.tech-route,.tech-columns{grid-template-columns:1fr}.tech-route .route-arrow{transform:rotate(90deg)}.tech-route p,.tech-columns p{font-size:18px}.tech-status,.tech-bottom{font-size:16px}}
'''
en='''<section class="slide tech-slide" data-title="Why a fly, not just an LLM?" id="technical-rationale">
<div class="kicker">TECHNICAL DEEP DIVE · DESIGN &amp; VALUE</div>
<h2>Federate the records.<br><span class="acid">Keep the learning individual.</span></h2>
<div class="tech-route"><div><b>01 / Browser</b><p>Run neural state locally.<br>Sign a checkpoint manifest.</p></div><div class="route-arrow">→</div><div><b>02 / Router + D1</b><p>Verify signature and sequence.<br>Index hashes, not the whole brain.</p></div><div class="route-arrow">↔</div><div><b>03 / Peer routers</b><p>Target: handshake, exchange deltas,<br>coordinate common tasks and votes.</p></div></div>
<p class="tech-status">API foundations exist. Trusted router switching, reliable sync and parent-chain conflict checks remain to be completed. A signature proves authorship of a record, not execution.</p>
<div class="tech-columns"><article><h3>FLY ≠ LANGUAGE MODEL</h3><p>A connectome-based spiking model evolves neural state and plastic synapses. An LLM primarily predicts tokens; ordinary inference does not update its learned weights.</p></article><article><h3>WHY THIS MODEL?</h3><p>Our object of study is <strong>an evolving neural individual</strong>, not a chatbot persona. The fly circuit provides the substrate to study plasticity and behavior; it is not necessary for trading in general.</p></article><article><h3>WHY ADOPT?</h3><p>Build a personal training history; inspect state changes; compare frozen checkpoints; contribute an independent vote. These are learning and collaboration goals—not promised profit or proven intelligence gains.</p></article></div>
<p class="tech-bottom"><span class="acid">WHY NOT LLM-ONLY?</span> LLM agents can have memory, tools and fine-tuning. A prompt alone does not supply this neural-state experiment. LLMs could explain results; controlled tests must establish any advantage.</p>
<div class="meta">DEFLY COLONY · TECHNICAL RATIONALE</div><div class="page">07 / 11</div></section>'''
cn='''<section class="slide tech-slide" data-title="为何是果蝇，而不只是 LLM？" id="technical-rationale">
<div class="kicker">技术解读 · 架构与用户价值</div>
<h2>联邦共享记录。<br><span class="acid">学习仍属于每个个体。</span></h2>
<div class="tech-route"><div><b>01 / 浏览器</b><p>本地执行神经状态与可塑更新。<br>所有者签署状态存档清单。</p></div><div class="route-arrow">→</div><div><b>02 / Router + D1</b><p>校验签名与版本序号。<br>索引哈希，不托管完整大脑。</p></div><div class="route-arrow">↔</div><div><b>03 / 其他路由</b><p>目标：握手、增量交换记录，<br>协调统一任务与群体投票。</p></div></div>
<p class="tech-status">已有 API 基础；可信路由切换、可靠同步与父版本冲突校验尚待完成。签名证明记录由谁签署，不证明完整模型确实运行。</p>
<div class="tech-columns"><article><h3>果蝇模型 ≠ 语言模型</h3><p>基于连接组的脉冲模型，持续演化神经状态与可塑连接。LLM 主要预测词元；常规推理通常不更新已训练的模型权重。</p></article><article><h3>为何选择果蝇技术？</h3><p>我们研究的是<strong>会积累状态的神经个体</strong>，而非聊天人设。果蝇回路是研究可塑性与行为变化的载体；并非所有交易或智能体都必须使用它。</p></article><article><h3>用户为何领养？</h3><p>积累专属训练经历，观察状态变化，对比冻结存档，并贡献独立判断。这是学习与协作的目标，不承诺盈利，也不把状态变化等同于变聪明。</p></article></div>
<p class="tech-bottom"><span class="acid">为什么单用 LLM 不足？</span> LLM 也能结合记忆、工具和微调。但单次提示词调用不自带这套神经状态实验机制。LLM 可辅助解释结果；是否更有效，仍需对照实验验证。</p>
<div class="meta">DEFLY COLONY · 技术选择与价值</div><div class="page">07 / 11</div></section>'''
for name,slide in [('DeFly_Colony_PitchDeck.html',en),('DeFly_Colony_PitchDeck_CN.html',cn)]:
 p=root/name;s=p.read_text();backup=root/(p.stem+'_before_technical_page.html')
 if not backup.exists():backup.write_text(s)
 if 'id="technical-rationale"' in s:s=re.sub(r'<section[^>]*id="technical-rationale".*?</section>',slide,s,flags=re.S)
 else:
  sections=list(re.finditer(r'<section\b.*?</section>',s,re.S));pos=sections[5].end();s=s[:pos]+'\n'+slide+s[pos:]
 if '.tech-route{' not in s:s=s.replace('</style>',css+'\n</style>')
 count=len(re.findall(r'<section\b',s));n=[0]
 def number(m):
  n[0]+=1;return '<div class="page">'+f'{n[0]:02d} / {count:02d}'+'</div>'
 s=re.sub(r'<div class="page">.*?</div>',number,s)
 s=re.sub(r'(<span class="counter" id="counter">).*?(</span>)',rf'\g<1>01 / {count}\2',s)
 p.write_text(s)
 print(name,'slides:',count)
