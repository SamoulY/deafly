import test from 'node:test';
import assert from 'node:assert/strict';
import {groupCandles,movingAverage,chartSelection,marketChart,normalizeChartSettings} from '../pages/companion-market.js';
import {translate} from '../pages/i18n.js';

test('five-minute views preserve actual minute timestamps and reveal partial groups',()=>{
  const bars=Array.from({length:40},(_,i)=>({time:60+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:i+1}));
  const grouped=groupCandles(bars,300);
  assert.deepEqual(grouped[0],{time:240,startTime:60,bucket:0,open:100,high:105,low:99,close:104,volume:10,sourceIndex:3,count:4});
  assert.equal(grouped.at(-1).count,1);
  const index=chartSelection(10,{left:0,width:800},bars,300);
  assert.equal(index,3);assert.equal(bars[index].time,240,'teaching uses the final real minute, not bucket zero');
  assert.equal(chartSelection(800,{left:0,width:800},bars,300),39);
  const html=marketChart(bars,{style:'candles',timeframe:300,volume:true,markers:true},{width:800,height:340});
  assert.match(html,/Partial group 4\/5/);assert.equal((html.match(/data-candle-time/g)||[]).length,9);
  assert.doesNotMatch(html,/NaN|Infinity/);
  assert.deepEqual(movingAverage(bars).slice(0,19),Array(19).fill(null));assert.equal(movingAverage(bars)[19],110.5);
});

test('chart preferences reject malformed settings and flat prices stay drawable',()=>{
  assert.deepEqual(normalizeChartSettings({style:'anything',timeframe:0,volume:'true'}),{style:'line',timeframe:60,average:false,volume:false,markers:true});
  const bars=[0,1].map(i=>({time:i*60,open:0,high:0,low:0,close:0,volume:0}));
  assert.doesNotMatch(marketChart(bars,normalizeChartSettings()),/NaN|Infinity/);
});

test('bilingual learning copy preserves measured evidence and literal data in messages',()=>{
  assert.equal(translate('In the scene you showed, it became more inclined to choose selling.','zh-CN'),'面对你示范的这种行情，它变得更倾向于卖出。');
  assert.match(translate('2 examples learned by this point. This comparison shows their combined effect.','zh-CN'),/综合影响/);
  assert.equal(translate('Fee US$12.34','zh-CN'),'手续费 US$12.34');
  assert.equal(translate('FAILED · $&','zh-CN'),'失败 · $&');
  assert.equal(translate('Buy one lot','en'),'Buy one lot');
  assert.equal(translate('__proto__','zh-CN'),'__proto__');
});
