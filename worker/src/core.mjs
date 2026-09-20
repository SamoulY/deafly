export const NINEX_MARKETS = [
  { pair: 'PEPE/99X', binance: 'PEPEUSDT' },
  { pair: 'DOGE/99X', binance: 'DOGEUSDT' },
  { pair: 'SHIB/99X', binance: 'SHIBUSDT' },
  { pair: 'SOL/99X', binance: 'SOLUSDT' },
  { pair: 'ASTER/99X', binance: 'ASTERUSDT' },
  { pair: 'CAKE/99X', binance: 'CAKEUSDT' },
  { pair: 'UNI/99X', binance: 'UNIUSDT' },
];
export const FEE_RATE = 0.001;
export const SLIPPAGE_RATE = 0.0005;

const round8 = (n) => Math.round((n + Number.EPSILON) * 1e8) / 1e8;
const floor8 = (n) => Math.floor(n * 1e8) / 1e8;

export function buyFill(portfolio, serverMark, maxDebit = 1000) {
  if (!(serverMark > 0)) throw new Error('INVALID_MARK');
  const debit = Math.min(maxDebit, portfolio.cash);
  const fillPrice = serverMark * (1 + SLIPPAGE_RATE);
  const qty = floor8(debit / (fillPrice * (1 + FEE_RATE)));
  const notional = round8(qty * fillPrice);
  const fee = round8(notional * FEE_RATE);
  const cash = round8(portfolio.cash - notional - fee);
  const oldCost = Number(portfolio.quantity) * Number(portfolio.avgCost ?? portfolio.avg_cost ?? 0);
  const quantity = round8(portfolio.quantity + qty);
  return { cash, quantity, avgCost: quantity ? round8((oldCost + notional + fee) / quantity) : 0, fillPrice: round8(fillPrice), fee, notional };
}

export function sellFill(portfolio, serverMark, referenceNotional = 1000) {
  if (!(serverMark > 0)) throw new Error('INVALID_MARK');
  const fillPrice = serverMark * (1 - SLIPPAGE_RATE);
  const qty = Math.min(portfolio.quantity, floor8(referenceNotional / serverMark));
  const gross = round8(qty * fillPrice);
  const fee = round8(gross * FEE_RATE);
  const quantity = round8(portfolio.quantity - qty);
  const cash = round8(portfolio.cash + gross - fee);
  return { cash, quantity, avgCost: quantity ? Number(portfolio.avgCost ?? portfolio.avg_cost ?? 0) : 0, fillPrice: round8(fillPrice), fee, notional: gross };
}

function arr(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

export function predictionQuote(outcomesValue, pricesValue, side) {
  const outcomes = arr(outcomesValue);
  const prices = arr(pricesValue);
  const wanted = String(side).trim().toLowerCase();
  const idx = outcomes.findIndex((o) => String(o).trim().toLowerCase() === wanted);
  if (idx < 0 || !Number.isFinite(Number(prices[idx]))) throw new Error('OUTCOME_NOT_FOUND');
  return Number(prices[idx]);
}

export function parsePolymarketMarket(m, now = Date.now()) {
  if (!m || m.closed === true) return null;
  const end = Date.parse(m.endDate || m.end_date_iso || '');
  if (!Number.isFinite(end) || end <= now) return null;
  const outcomes = arr(m.outcomes);
  const prices = arr(m.outcomePrices);
  if (outcomes.length !== 2 || prices.length !== 2) return null;
  const labels = outcomes.map((x) => String(x).toLowerCase());
  if (!labels.includes('yes') || !labels.includes('no')) return null;
  const yes = predictionQuote(outcomes, prices, 'yes');
  return {
    id: String(m.conditionId || m.id),
    question: String(m.question || ''),
    endDate: new Date(end).toISOString(),
    yes,
    no: predictionQuote(outcomes, prices, 'no'),
    volume: Number(m.volumeNum || m.volume || 0),
    liquidity: Number(m.liquidityNum || m.liquidity || 0),
    slug: String(m.slug || '')
  };
}

const tradeQty = (cash, mark, notional=1000) => Math.max(0, Math.floor(Math.min(cash,notional)/mark*1e8)/1e8);
export function openLong(p, mark, notional=1000) { const q=tradeQty(p.cash,mark,notional); return {...p,cash:p.cash-q*mark,long_qty:q,long_entry:mark}; }
export function openShort(p, mark, notional=1000) { const q=tradeQty(p.cash,mark,notional); return {...p,cash:p.cash-q*mark,short_qty:q,short_entry:mark}; }
export function closePosition(p, mark) { if(p.long_qty>0)return {...p,cash:p.cash+p.long_qty*mark,long_qty:0,long_entry:0}; if(p.short_qty>0)return {...p,cash:p.cash+p.short_qty*(2*p.short_entry-mark),short_qty:0,short_entry:0}; return p; }
export function checkRiskExit({side,entry,mark,tp=.01,sl=.01,decision}) { const move=side==='long'?(mark-entry)/entry:(entry-mark)/entry; if(decision!=='CLOSE')return null; return move>=tp?'TAKE_PROFIT':move<=-sl?'STOP_LOSS':null; }

export function accountEquity(p, mark) { const side=p.position_side||'FLAT', cash=Number(p.cash)||0, q=Number(p.position_qty||p.quantity)||0, entry=Number(p.entry_price||p.avgCost||p.avg_cost||mark); if(side==='SHORT') return cash+q*(entry-mark)+q*entry; if(side==='LONG') return cash+q*mark; return cash; }
