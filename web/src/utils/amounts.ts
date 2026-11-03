import Decimal from 'decimal.js';

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
