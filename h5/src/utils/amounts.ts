/** Decimal display units; integer arithmetic prevents cent/byte rounding errors. */
export const parseAmount = (text: string, digits: number): number | null => {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(text.trim());
  if (!match || (match[2]?.length ?? 0) > digits) return null;
  const scale = 10n ** BigInt(digits);
  const value =
    BigInt(match[1]!) * scale + BigInt((match[2] ?? '').padEnd(digits, '0'));
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
};

export const printAmount = (value: number, digits: number): string => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('数值超出可精确显示范围');
  const scale = 10n ** BigInt(digits);
  const amount = BigInt(value);
  const fraction = (amount % scale)
    .toString()
    .padStart(digits, '0')
    .replace(/0+$/, '');
  return `${amount / scale}${fraction ? '.' + fraction : ''}`;
};
