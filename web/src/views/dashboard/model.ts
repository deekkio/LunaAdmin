import { addDays, format, getUnixTime, isValid, parse } from 'date-fns';
import type { DashboardDaily, DashboardQuery } from '../../api/types';

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

/** 以当前时刻为终点的最近 N 天 [start, end) 查询区间；起点对齐 UTC 日界，正好覆盖 N 个日桶。 */
export const windowRange = (days: number): DashboardQuery => {
  const end = Math.floor(Date.now() / 1000);
  const today = Math.floor(end / 86400);
  return { version: 1, start: (today - (days - 1)) * 86400, end };
};

const dayLabel = (day: number): string => format(day * 1000, 'MM-dd');

/** 环比百分比：上一桶为零或缺失时返回 null，由调用方决定展示方式。 */
export const trendPct = (current: number, previous: number): number | null =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

/** 序列最后一项相对前一项的环比。 */
export const seriesTrend = (values: readonly number[]): number | null =>
  values.length >= 2 ? trendPct(values.at(-1)!, values.at(-2)!) : null;

/** 单一币种的按日金额（最小货币单位转数值，仅用于绘制趋势）。 */
export const revenueSeries = (daily: readonly DashboardDaily[], currency: string): number[] =>
  daily.map((bucket) => Number(bucket.revenue.find((item) => item.currency === currency)?.minor ?? '0') / 100);

/** 首个出现的币种（预期为主结算币种）。 */
export const mainCurrency = (daily: readonly DashboardDaily[]): string | null =>
  daily.flatMap((bucket) => bucket.revenue.map((item) => item.currency))[0] ?? null;

export const orderSeries = (daily: readonly DashboardDaily[]): number[] => daily.map((bucket) => bucket.orders);

/** 柱状图与折线图的日期刻度。 */
export const axisLabels = (daily: readonly DashboardDaily[]): string[] =>
  daily.map((bucket) => dayLabel(bucket.day));

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

/** 环形图分片与右侧图例共用的数据。 */
export const nodeSlices = (dashboard: { online: number | null; offline: number | null; disabled: number | null }): DonutSlice[] => [
  { name: '在线', value: dashboard.online ?? 0, color: 'primary' },
  { name: '离线', value: dashboard.offline ?? 0, color: 'danger' },
  { name: '停用', value: dashboard.disabled ?? 0, color: 'warning' },
];

/**
 * 近 7 天节点在线率的演示序列。后端暂无长期采样存储，此为固定波形，
 * 页面必须以「模拟数据」标注；接入真实历史后删除本函数。
 */
export const rateMock = (): { label: string; value: number }[] => {
  const wave = [88, 92, 90, 95, 91, 94, 93];
  const end = Math.floor(Date.now() / 1000);
  return wave.map((value, index) => ({
    label: format((end - (wave.length - 1 - index) * 86400) * 1000, 'MM-dd'),
    value,
  }));
};
