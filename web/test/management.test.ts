import { describe, expect, mock, setSystemTime, test } from 'bun:test';
mock.module('@luna/components/message', () => ({ showMessage: () => {} }));
mock.module('@luna/components/toast', () => ({ showToast: () => {} }));
import { parseAmount, printAmount } from '../src/utils';
import { pageModule } from './view';
import type { NodeView, Plan } from '../src/api/types';

const { planModel, planValue } = await pageModule(new URL('../src/views/plans/List.svelte', import.meta.url));
const { nodeModel, nodeValue } = await pageModule(new URL('../src/views/nodes/List.svelte', import.meta.url));

const plan: Plan = {
  id: 'a'.repeat(32),
  name: 'Monthly',
  price_minor: 1280,
  currency: 'CNY',
  duration_days: 30,
  quota_bytes: 100_000_000_000,
  nodes: ['b'.repeat(32)],
  enabled: true,
};
const until = Math.ceil(Date.now() / 60_000) * 60 + 86_419;
const node: NodeView = {
  id: '01K00000000000000000000001',
  group: '01K00000000000000000000000',
  node: {
    node: 'b'.repeat(32),
    name: 'Tokyo',
    endpoints: ['1.1.1.1:21000'],
    trust: {
      until,
      keys: [
        {
          key: 'c'.repeat(32),
          public: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
          until,
          state: 'active',
        },
      ],
    },
  },
  suite: 'aes-256-gcm',
  enabled: true,
  sample: null,
  stale: true,
};

describe('display units', () => {
  test('converts yuan and decimal G without floating point truncation', () => {
    expect(parseAmount('0.29', 2)).toBe(29);
    expect(parseAmount('12.80', 2)).toBe(1280);
    expect(parseAmount('100', 9)).toBe(100_000_000_000);
    expect(parseAmount('0.000000001', 9)).toBe(1);
    expect(parseAmount('0', 2)).toBe(0);
    for (const text of [
      '1.001',
      '1.000',
      '-1',
      '-0',
      '+1',
      '.5',
      '01',
      '1.',
      '1e3',
      'NaN',
      'Infinity',
      '',
      '90071992547409.92',
      '90071992547409910000000000000000',
    ])
      expect(parseAmount(text, 2)).toBeNull();
    for (const digits of [2, 9])
      expect(
        parseAmount(printAmount(Number.MAX_SAFE_INTEGER, digits), digits),
      ).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseAmount('90071992547409.91', 2)).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseAmount('9007199.254740991', 9)).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseAmount('9007199.254740992', 9)).toBeNull();
    expect(parseAmount('0.0000000001', 9)).toBeNull();
    expect(printAmount(1, 9)).toBe('0.000000001');
    for (const value of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
      expect(() => printAmount(value, 2)).toThrow('数值超出可精确显示范围');
    }
  });
  test('preserves unchanged prices and quota when editing', () => {
    const model = planModel(plan);
    expect(model.price).toBe('12.8');
    expect(model.quota).toBe('100');
    const value = planValue(model);
    expect(value.price_minor).toBe(1280);
    expect(value.quota_bytes).toBe(100_000_000_000);
    model.price = '0.29';
    model.quota = '200.5';
    expect(planValue(model).price_minor).toBe(29);
    expect(planValue(model).quota_bytes).toBe(200_500_000_000);
  });
});

describe('subscription plans', () => {
  test('creates shared plans with generated identity and default currency', () => {
    const model = planModel();
    model.name = 'Monthly';
    model.price = '12.8';
    model.quota = '100';
    const value = planValue(model);
    expect(value.id).toMatch(/^[0-9a-f]{32}$/);
    expect(value.id).toBe(model.id);
    expect(value.currency).toBe('CNY');
    expect(value.duration_days).toBe(30);
    expect(value.nodes).toEqual([]);
  });
  test('preserves existing identity and currency while clearing node restrictions', () => {
    const value = planValue(planModel({ ...plan, currency: 'USD' }));
    expect(value.id).toBe(plan.id);
    expect(value.currency).toBe('USD');
    expect(value.price_minor).toBe(plan.price_minor);
    expect(value.nodes).toEqual([]);
    expect(plan.nodes).toEqual(['b'.repeat(32)]);
  });
});

describe('node forms', () => {
  test('defaults trust and keys to ten calendar years including leap days', () => {
    try {
      setSystemTime(new Date(2024, 1, 29, 12, 34, 56));
      const model = nodeModel();
      expect(model.trustUntil).toBe('2034-02-28T12:34:56');
      expect(model.keyUntil).toBe(model.trustUntil);
      const existing = nodeModel(node);
      expect(nodeValue(existing).node.trust.until).toBe(until);
      expect(nodeValue(existing).node.trust.keys).toEqual(node.node.trust.keys);
    } finally { setSystemTime(); }
  });

  test('leaves new identities for the server to generate', () => {
    const model = nodeModel();
    model.group = node.group;
    model.name = 'Tokyo';
    model.endpoints = node.node.endpoints.join(', ');
    model.publicKey = node.node.trust.keys[0]!.public;
    expect(model.id).toBe('');
    expect(model.wire).toBe('');
    const value = nodeValue(model);
    expect(value.id).toBeNull();
    expect(value.node.node).toBe('');
    expect(value.suite).toBe('aes-256-gcm');
    expect(value).not.toHaveProperty('profile');
    expect(value).not.toHaveProperty('send');
    expect(value).not.toHaveProperty('receive');
  });
  test('preserves management and protocol identities, keys and seconds', () => {
    const model = nodeModel(node);
    expect(model.name).toBe('Tokyo');
    expect(model.id).toBe(node.id);
    expect(model.wire).toBe(node.node.node);
    const value = nodeValue(model);
    expect(value.id).toBe(node.id);
    expect(value.node.node).toBe(node.node.node);
    expect(value.node.trust).not.toHaveProperty('version');
    expect(value.node.trust.until).toBe(until);
    expect(value.node.trust.keys).toEqual(node.node.trust.keys);
    expect(value.suite).toBe(node.suite);
    expect(Object.keys(value).sort()).toEqual(['enabled', 'group', 'id', 'node', 'request', 'suite', 'version']);
    expect(node.node.trust).not.toHaveProperty('version');
  });
  test('preserves multiple endpoints in a single-line input', () => {
    const endpoints = ['1.1.1.1:21000', '[2001:db8::1]:21000'];
    const model = nodeModel({ ...node, node: { ...node.node, endpoints } });
    expect(model.endpoints).toBe(endpoints.join(', '));
    expect(nodeValue(model).node.endpoints).toEqual(endpoints);
    model.endpoints = endpoints.join('，');
    expect(nodeValue(model).node.endpoints).toEqual(endpoints);
  });

});
