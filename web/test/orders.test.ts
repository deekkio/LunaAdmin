import { expect, test } from 'bun:test';
import { pageModule } from './view';
import { formatTraffic } from '../src/utils';
import type { OrderAccess, Plan } from '../src/api/types';

const { orderModel, orderValue, applyPlan, orderStateText } = await pageModule(new URL('../src/views/orders/Editor.svelte', import.meta.url));

const started = 1_600_000_000;
const grant: OrderAccess = {
  order: 'a'.repeat(32), account: '01M5PXRCQY1Z1E53QVBRMP1631', plan: 'b'.repeat(32),
  name: '100 G', state: 'active', quota_bytes: 100_000_000_000, used_bytes: 1_000_000_000,
  expires_at: started + 30 * 86400, revision: 2,
};

test('maps payment states and preserves unknown states', () => {
  expect(orderStateText('pending')).toBe('待支付');
  expect(orderStateText('paid')).toBe('已支付');
  expect(orderStateText('cancelled')).toBe('已取消');
  expect(orderStateText('other')).toBe('other');
});

test('traffic uses decimal GB without reducing a 150 GB grant', () => {
  expect(formatTraffic(150_000_000_000)).toBe('150 GB');
  expect(formatTraffic(250_000_000_000)).toBe('250 GB');
  expect(formatTraffic(42_231_426_100)).toBe('42.231 GB');
  expect(formatTraffic(1_830_740_790)).toBe('1.831 GB');
  expect(formatTraffic(0)).toBe('0 GB');
  expect(formatTraffic(Number.NaN)).toBe('-');
});

test('editing keeps the existing deadline, including an expired order', () => {
  const value = orderValue(orderModel(grant, started), 'c'.repeat(32));
  expect(value.expires_at).toBe(grant.expires_at);
  expect(value.quota_bytes).toBe(grant.quota_bytes);
  expect(value.revision).toBe(grant.revision);
});

test('a preset is dated from order activation rather than editing time', () => {
  const plan: Plan = { id: 'd'.repeat(32), name: '50 G', duration_days: 30,
    price_minor: 100, currency: 'CNY', quota_bytes: 50_000_000_000, nodes: [], enabled: true };
  const value = orderValue(applyPlan(orderModel(grant, started), plan), 'c'.repeat(32));
  expect(value.expires_at).toBe(started + 30 * 86400);
  expect(value.quota_bytes).toBe(50_000_000_000);
  expect(value.plan).toBe(plan.id);
});

test('an edit cannot erase charged bytes or predate activation', () => {
  const model = orderModel(grant, started);
  model.quota = '0.5';
  expect(() => orderValue(model, 'c'.repeat(32))).toThrow();
  model.quota = '100'; model.started = grant.expires_at;
  expect(() => orderValue(model, 'c'.repeat(32))).toThrow();
});
