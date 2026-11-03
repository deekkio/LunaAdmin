import type { Sample } from '../../api/types';
import { filesize } from 'filesize';
import { formatBytes } from '../../utils/format';

export const SAMPLE_LIMIT = 180;
export const SAMPLE_WINDOW = 1800;
const MAX_GAP = 30;

export type HealthKind = 'cpu' | 'memory' | 'connections' | 'traffic';
export interface HealthLine {
  name: string;
  values: [number, number | null][];
}

export const appendSample = (items: Sample[], sample: Sample): Sample[] => {
  const last = items.at(-1);
  if (last?.boot === sample.boot && (sample.sequence <= last.sequence || sample.measured_at < last.measured_at)) return items;
  if (last && sample.measured_at < last.measured_at) return [{ ...sample }];
  const prior = last?.measured_at === sample.measured_at ? items.slice(0, -1) : items;
  return [...prior, { ...sample }]
    .filter(item => item.measured_at >= sample.measured_at - SAMPLE_WINDOW)
    .slice(-SAMPLE_LIMIT);
};

export const sampleRate = (prior: Sample | undefined, sample: Sample, key: 'upload_bytes' | 'download_bytes'): number | null => {
  if (!prior || prior.boot !== sample.boot) return null;
  const seconds = sample.measured_at - prior.measured_at;
  const delta = sample[key] - prior[key];
  if (seconds <= 0 || seconds > MAX_GAP || delta < 0) return null;
  const rate = delta / seconds;
  return Number.isFinite(rate) ? rate : null;
};

export const healthSeries = (items: readonly Sample[], kind: HealthKind): HealthLine[] => {
  const names = kind === 'traffic' ? ['上传', '下载'] : kind === 'connections' ? ['活动连接', '连接容量'] : [kind === 'cpu' ? 'CPU' : '内存'];
  const lines: HealthLine[] = names.map(name => ({ name, values: [] }));
  items.forEach((sample, index) => {
    const prior = items[index - 1];
    if (prior && (prior.boot !== sample.boot || sample.measured_at - prior.measured_at > MAX_GAP)) {
      for (const line of lines) line.values.push([prior.measured_at * 1000 + 1, null]);
    }
    const values = kind === 'traffic'
      ? [sampleRate(prior, sample, 'upload_bytes'), sampleRate(prior, sample, 'download_bytes')]
      : kind === 'connections' ? [sample.connections, sample.capacity]
      : [kind === 'cpu' ? sample.cpu_millis / 10 : sample.memory_bytes];
    lines.forEach((line, offset) => line.values.push([sample.measured_at * 1000, values[offset] ?? null]));
  });
  return lines;
};

export const formatMetric = (value: number | null | undefined, kind: HealthKind): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (kind === 'cpu') return `${value.toFixed(1)}%`;
  if (kind === 'memory') return formatBytes(value);
  if (kind === 'traffic') return `${filesize(value, { standard: 'si', round: 2 })}/s`;
  return value.toLocaleString();
};
