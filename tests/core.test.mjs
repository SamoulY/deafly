import test from 'node:test';
import assert from 'node:assert/strict';
import { buyFill, sellFill, predictionQuote, parsePolymarketMarket } from '../worker/src/core.mjs';

test('BUY uses server mark, adverse slippage and fee without overspending', () => {
  const r = buyFill({ cash: 10000, quantity: 0, avgCost: 0 }, 100, 1000);
  assert.equal(r.fillPrice, 100.05);
  assert.ok(r.cash >= 9000);
  assert.ok(r.cash < 9000.01);
  assert.ok(r.quantity > 9.98);
});

test('SELL never creates a short position', () => {
  const r = sellFill({ cash: 9000, quantity: 2, avgCost: 100 }, 110, 1000);
  assert.equal(r.quantity, 0);
  assert.ok(r.cash > 9219);
});

test('prediction quote maps YES by label rather than array position', () => {
  assert.equal(predictionQuote(['No', 'Yes'], ['0.72', '0.28'], 'YES'), 0.28);
  assert.equal(predictionQuote(['Yes', 'No'], ['0.61', '0.39'], 'NO'), 0.39);
});

test('Polymarket parser rejects closed, expired or non-binary markets', () => {
  const now = Date.parse('2026-09-15T00:00:00Z');
  assert.equal(parsePolymarketMarket({closed:true}, now), null);
  assert.equal(parsePolymarketMarket({closed:false,endDate:'2025-01-01',outcomes:'["Yes","No"]',outcomePrices:'[".5",".5"]'}, now), null);
  assert.equal(parsePolymarketMarket({closed:false,endDate:'2027-01-01',outcomes:'["A","B","C"]',outcomePrices:'[".2",".3",".5"]'}, now), null);
});
