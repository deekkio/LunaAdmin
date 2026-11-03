import type { FormModel } from '../../api/types';
import type { FormRules } from '@luna/components/contracts';
import type { OrderAccess, OrderInput, Plan } from '../../api/types';
import { parseAmount, printAmount } from '../../utils/amounts';
import { parseTime, timeInput } from '../../utils/format';

export const orderStateText = (state: string): string => {
  switch (state) {
    case 'pending':
      return '待支付';
    case 'paid':
      return '已支付';
    case 'cancelled':
      return '已取消';
    default:
      return state;
  }
};

export interface OrderModel extends Record<string, unknown> {
  revision: number;
  plan: string;
  state: 'active' | 'disabled';
  quota: string;
  used: number;
  until: string;
  started: number;
}

export const orderModel = (grant: OrderAccess, started: number): OrderModel => ({
  revision: grant.revision, plan: grant.plan, state: grant.state,
  quota: printAmount(grant.quota_bytes, 9), used: grant.used_bytes,
  until: timeInput(grant.expires_at), started,
});

export const orderRules: FormRules<FormModel> = {
  plan: [{ required: true, pattern: /^[0-9a-f]{32}$/, message: '请选择预设套餐' }],
  state: [{ required: true, pattern: /^(active|disabled)$/, message: '请选择状态' }],
  quota: [{ required: true, validator: value => {
    const amount = parseAmount(String(value ?? ''), 9);
    if (amount === null || amount <= 0) return '流量须大于 0，最多九位小数';
  } }],
  until: [{ required: true, validator: value => parseTime(String(value ?? '')) === null ? '请选择有效的到期时间' : undefined }],
};

export const applyPlan = (model: OrderModel, plan: Plan): OrderModel => ({
  ...model, plan: plan.id, quota: printAmount(plan.quota_bytes, 9),
  until: timeInput(model.started + plan.duration_days * 86400),
});

export const orderValue = (model: OrderModel, request: string): OrderInput => {
  const amount = parseAmount(model.quota, 9);
  const until = parseTime(model.until);
  if (amount === null || amount <= 0 || amount < model.used) throw new Error('流量不能小于已用额度');
  if (until === null || until <= model.started) throw new Error('到期时间须晚于订单生效时间');
  return { version: 1, request, revision: model.revision, plan: model.plan,
    state: model.state, quota_bytes: amount, expires_at: until };
};
