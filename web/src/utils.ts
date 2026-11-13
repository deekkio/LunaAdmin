import Decimal from 'decimal.js';
import { format, fromUnixTime as fromUnix, getUnixTime as toUnix, isValid, parse } from 'date-fns';
import isInt from 'validator/es/lib/isInt';
import type { FormRule } from '@luna/components/contracts';
import type { FormModel } from './api/types';

/** 元与十进制 G 输入：保留业务小数位约束，单位换算使用十进制运算。 */
export const parseAmount = (text: string, digits: number): number | null => {
  const input = text.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(input);
  if (!match || (match[2]?.length ?? 0) > digits) return null;
  const amount = new Decimal(input).times(Decimal.pow(10, digits));
  return amount.lte(Number.MAX_SAFE_INTEGER) ? amount.toNumber() : null;
};

export const printAmount = (value: number, digits: number): string => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('数值超出可精确显示范围');
  return new Decimal(value).div(Decimal.pow(10, digits)).toFixed();
};

export const formatMoney = (minor: number | null | undefined, currency: string): string => {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return '-';
  const amount = minor / 100;
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

export const formatTime = (seconds: number | null | undefined): string => {
  if (!seconds) return '-';
  const date = fromUnix(seconds);
  return isValid(date) ? format(date, 'yyyy-MM-dd HH:mm:ss') : '-';
};

/** 本地日期时间解析为 Unix 秒，拒绝无效日期与时钟跳变中不存在的时间。 */
export const parseTime = (value: string): number | null => {
  const input = value.trim();
  for (const pattern of [INPUT_FORMAT, "yyyy-MM-dd'T'HH:mm"]) {
    const date = parse(input, pattern, new Date());
    if (isValid(date) && format(date, pattern) === input) return toUnix(date);
  }
  return null;
};

export const timeInput = (seconds: number | null | undefined): string => {
  if (!seconds) return '';
  const date = fromUnix(seconds);
  return isValid(date) ? format(date, INPUT_FORMAT) : '';
};

export const formatTraffic = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '-';
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value / 1_000_000_000)} GB`;
};

export const stateText = (state: string): string => {
  return state === 'active' ? '已启用' : state === 'disabled' ? '已禁用' : state;
};

/** 保留完整标识；显示省略由组件按实际可用宽度处理。 */
export const formatId = (value: unknown): string => value === null || value === undefined || value === '' ? '-' : String(value);

export const hex32Rules = (label: string): readonly FormRule<FormModel>[] => [
  { required: true, message: `请输入${label}` },
  { pattern: /^[0-9a-f]{32}$/, message: `${label}必须是 32 位无连字符十六进制` },
];

/** 整数文本规则：非空时必须是 [min, max] 内的整数。 */
export const intIn = (
  min: number,
  max: number,
  message: string,
  emptyMessage = '请输入数值'
): FormRule<FormModel> => ({
  required: true,
  message: emptyMessage,
  validator: (value) => {
    if (!isInt(String(value ?? '').trim(), { min, max })) return message;
  },
});

/** 本地日期时间须晚于当前时间，可选最大天数。 */
export const futureRule = (label: string, maxDays?: number): FormRule<FormModel> => ({
  required: true,
  message: `请选择${label}`,
  validator: (value) => {
    const seconds = parseTime(String(value ?? ''));
    if (seconds === null) return `${label}格式不正确`;
    if (seconds <= Date.now() / 1000) return `${label}必须晚于当前时间`;
    if (maxDays !== undefined && seconds > Date.now() / 1000 + maxDays * 86_400) {
      return `${label}不能超过 ${maxDays} 天`;
    }
  },
});
