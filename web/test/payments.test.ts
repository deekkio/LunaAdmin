import { expect, test } from 'bun:test';
import { pageModule } from './view';
const { paymentModel, paymentValue, paymentRules } = await pageModule(new URL('../src/views/payments/List.svelte', import.meta.url));
import type { PaymentConfig } from '../src/api/types';
import { hasView } from './router';

test('payment views and secret-preserving edits', () => {
  expect(hasView('payments/List')).toBe(true);
  const config: PaymentConfig = {
    id: 'a'.repeat(32), revision: 2, name: '支付宝', provider: 'alipay',
    app_id: '2026102500000001', merchant_id: '2088000000000001', serial: null, public_id: null,
    notify_url: 'https://pay.example.test/v1/payments/notify', has_private: true, has_public: true,
    has_api: false, enabled: true, updated_at: 100,
  };
  const model = paymentModel(config);
  expect(model.private_key).toBe('');
  expect(paymentValue(model).private_key).toBeNull();
  expect(paymentValue(model).public_key).toBeNull();
  expect(paymentValue(model).revision).toBe(2);
  const rule = (paymentRules.private_key as readonly {validator: Function}[])[0]!;
  expect(rule.validator('', model)).toBeUndefined();
  model.app_id = '2026102500000002';
  expect(rule.validator('', model)).toBe('请输入商户私钥');
});

test('provider changes exclude fields from the other channel', () => {
  const model = paymentModel();
  model.merchant_id = '2088000000000001';
  model.api_key = 'a'.repeat(32);
  const value = paymentValue(model);
  expect(value.merchant_id).toBe('2088000000000001');
  expect(value.api_key).toBeNull();
  model.provider = 'wechat';
  expect(paymentValue(model).api_key).toBe('a'.repeat(32));
});

