// 展示格式化：金额使用最小货币单位，流量使用字节，日期按本地时区呈现与输入。
import { addDays, format, fromUnixTime as fromUnix, getUnixTime as toUnix, isValid, parse } from 'date-fns';
import { filesize } from 'filesize';

export const formatBytes = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '-';
  // 固定缩放前的单位，避免四舍五入使边界值提前显示为下一级单位。
  const unit = Math.min(filesize(Math.floor(value), { standard: 'iec', output: 'exponent', round: 20 }), 5);
  const digits = unit === 0 || value >= 100 * 1024 ** unit ? 0 : value >= 10 * 1024 ** unit ? 1 : 2;
  return filesize(value, { standard: 'iec', exponent: unit, round: digits, pad: true });
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

/** 默认到期时间：当前时刻加指定天数，以本地日期时间填入。 */
export const futureInput = (days: number): string => {
  return format(addDays(new Date(), days), INPUT_FORMAT);
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

