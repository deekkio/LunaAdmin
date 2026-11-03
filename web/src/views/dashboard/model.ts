import { addDays, format, getUnixTime, isValid, parse } from 'date-fns';
import type { DashboardQuery } from '../../api/types';

const localDate = (value: string): Date => {
  const date = parse(value, 'yyyy-MM-dd', 0);
  if (!isValid(date) || format(date, 'yyyy-MM-dd') !== value || value < '1970-01-01') {
    throw new Error('请选择有效日期');
  }
  return date;
};

/** Inclusive local calendar dates become an explicit [start, end) UTC instant range. */
export const dateRange = (start: string, end: string): DashboardQuery => {
  if (!start && !end) return { version: 1, start: null, end: null };
  if (!start || !end) throw new Error('请选择开始日期和结束日期');
  const first = localDate(start);
  const last = localDate(end);
  if (first > last) throw new Error('开始日期不能晚于结束日期');
  const lower = getUnixTime(first);
  const upper = getUnixTime(addDays(last, 1));
  if (lower < 0 || upper > 253402300800) throw new Error('日期超出支持范围');
  return { version: 1, start: lower, end: upper };
};

export const moneyValue = (minor: string): string => {
  if (!/^\d+$/.test(minor)) return '';
  const value = BigInt(minor);
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
};
