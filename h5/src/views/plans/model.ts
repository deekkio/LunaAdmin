import type { FormRules } from '@luna/components/contracts';
import type { Plan, PlanInput } from '../../api/types';
import { newRequestId } from '../../api/request';
import { parseAmount, printAmount } from '../../utils/amounts';
import {
  currencyRule,
  hex32Rules,
  intIn,
  requiredText,
  type FormModel,
} from '../../utils/rules';

export interface PlanModel {
  id: string;
  request: string;
  name: string;
  price: string;
  currency: string;
  days: string;
  quota: string;
  enabled: boolean;
}

export const planModel = (item?: Plan): PlanModel => ({
  id: item?.id ?? newRequestId(),
  request: newRequestId(),
  name: item?.name ?? '',
  price: item ? printAmount(item.price_minor, 2) : '',
  currency: item?.currency ?? 'CNY',
  days: item ? String(item.duration_days) : '30',
  quota: item ? printAmount(item.quota_bytes, 9) : '',
  enabled: item?.enabled ?? true,
});

export const planRules: FormRules<FormModel> = {
  id: hex32Rules('套餐 ID'),
  name: [
    requiredText('套餐名称'),
    { max: 80, message: '名称不能超过 80 个字符' },
  ],
  price: [
    {
      required: true,
      message: '请输入价格（元）',
      validator: (value) => {
        if (parseAmount(String(value ?? ''), 2) === null)
          return '请输入非负金额，最多两位小数';
      },
    },
  ],
  currency: [requiredText('货币代码'), currencyRule()],
  days: [intIn(1, 3650, '时长必须在 1 到 3650 天之间')],
  quota: [
    {
      required: true,
      message: '请输入流量（GB）',
      validator: (value) => {
        const amount = parseAmount(String(value ?? ''), 9);
        if (amount === null || amount <= 0)
          return '请输入大于 0 的流量，最多九位小数';
      },
    },
  ],
};

export const planValue = (model: PlanModel): PlanInput => {
  const price = parseAmount(model.price, 2);
  const quota = parseAmount(model.quota, 9);
  if (price === null || quota === null || quota <= 0)
    throw new Error('请检查价格与流量');
  return {
    version: 1,
    request: model.request,
    id: model.id,
    name: model.name.trim(),
    price_minor: price,
    currency: model.currency,
    duration_days: Number(model.days),
    quota_bytes: quota,
    nodes: [],
    enabled: model.enabled,
  };
};
