import { describe, expect, mock, test } from 'bun:test';
import type { Sample } from '../src/api/types';
import { pageModule } from './view';

const { appendSample, formatMetric, healthSeries, sampleRate, SAMPLE_LIMIT, SAMPLE_WINDOW } = await pageModule(new URL('../src/views/nodes/HealthDialog.svelte', import.meta.url));

const fixture = (sequence = 1, values: Partial<Sample> = {}): Sample => ({
  version: 1, node: '1'.repeat(32), boot: '2'.repeat(32), sequence,
  measured_at: 1_800_000_000 + sequence * 10, healthy: true, latency_ms: null,
  cpu_millis: 125, memory_bytes: 64 * 1024 * 1024, capacity: 100, connections: 3,
  upload_bytes: sequence * 10_000, download_bytes: sequence * 20_000,
  ...values,
});

describe('health sampling', () => {
  test('network rates use decimal units while memory keeps IEC units', () => {
    expect(formatMetric(0, 'traffic')).toBe('0 B/s');
    expect(formatMetric(1000, 'traffic')).toBe('1 kB/s');
    expect(formatMetric(1_500_000, 'traffic')).toBe('1.5 MB/s');
    expect(formatMetric(1_000_000_000, 'traffic')).toBe('1 GB/s');
    expect(formatMetric(64 * 1024 * 1024, 'memory')).toBe('64.0 MiB');
  });
  test('deduplicates reports and rejects older sequences without adding graph points', () => {
    const items = [fixture(2)];
    expect(appendSample(items, fixture(2))).toBe(items);
    expect(appendSample(items, fixture(1))).toBe(items);
    expect(appendSample(items, fixture(3, { measured_at: items[0].measured_at - 1 }))).toBe(items);
    const next = appendSample(items, fixture(3, { measured_at: items[0].measured_at }));
    expect(next).toHaveLength(1);
    expect(next[0].sequence).toBe(3);
    expect(items[0].sequence).toBe(2);
  });
  test('bounds samples by count and timestamp and handles a reboot clock change', () => {
    let items: Sample[] = [];
    for (let sequence = 1; sequence <= 250; sequence++) items = appendSample(items, fixture(sequence));
    expect(items).toHaveLength(61);
    expect(items[0].sequence).toBe(190);
    let dense: Sample[] = [];
    for (let sequence = 1; sequence <= 250; sequence++) dense = appendSample(dense, fixture(sequence, { measured_at: 1_800_000_000 + sequence * 5 }));
    expect(dense).toHaveLength(SAMPLE_LIMIT);
    expect(items[0].measured_at).toBeGreaterThanOrEqual(items.at(-1)!.measured_at - SAMPLE_WINDOW);
    const restarted = fixture(1, { boot: '3'.repeat(32) });
    expect(appendSample(items, restarted)).toEqual([restarted]);
  });
  test('uses elapsed sample time and cumulative counter deltas for byte rates', () => {
    const prior = fixture(1), sample = fixture(2);
    expect(sampleRate(prior, sample, 'upload_bytes')).toBe(1000);
    expect(sampleRate(prior, sample, 'download_bytes')).toBe(2000);
    expect(sampleRate(prior, { ...sample, upload_bytes: prior.upload_bytes }, 'upload_bytes')).toBe(0);
    for (const next of [
      { ...sample, boot: '3'.repeat(32) },
      { ...sample, measured_at: prior.measured_at },
      { ...sample, measured_at: prior.measured_at + 31 },
      { ...sample, upload_bytes: 0 },
    ]) expect(sampleRate(prior, next, 'upload_bytes')).toBeNull();
    expect(sampleRate(undefined, sample, 'upload_bytes')).toBeNull();
  });
  test('keeps upload and download separate and breaks curves across missing reports or restarts', () => {
    const lines = healthSeries([fixture(1), fixture(2)], 'traffic');
    expect(lines.map(line => line.name)).toEqual(['上传', '下载']);
    expect(lines[0].values.map(point => point[1])).toEqual([null, 1000]);
    expect(lines[1].values.map(point => point[1])).toEqual([null, 2000]);
    for (const sample of [fixture(5), fixture(2, { boot: '3'.repeat(32) })]) {
      const cpu = healthSeries([fixture(1), sample], 'cpu')[0];
      expect(cpu.values.map(point => point[1])).toEqual([12.5, null, 12.5]);
      expect(healthSeries([fixture(1), sample], 'traffic')[0].values.at(-1)![1]).toBeNull();
    }
    expect(formatMetric(null, 'traffic')).toBe('-');
    expect(formatMetric(12.5, 'cpu')).toBe('12.5%');
  });
});

test('chart factories update samples, height and observers through the loaded engine', async () => {
  const { mountChart } = await pageModule(new URL('../src/views/nodes/HealthChart.svelte', import.meta.url));
  const saved = new Map(['document', 'getComputedStyle', 'ResizeObserver', 'MutationObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const observers: { notify: () => void; disconnect: ReturnType<typeof mock> }[] = [];
  type ChartState = { series: { name: string; data: [number, number | null][] }[]; legend: { show: boolean } };
  const setOption = mock((_option: ChartState, _settings: unknown) => {});
  const resize = mock(() => {});
  const dispose = mock(() => {});
  const engine = { setOption, resize, dispose };
  const init = mock(() => engine);
  const host = { isConnected: true, clientWidth: 300 };
  class Observer {
    disconnect = mock(() => {});
    constructor(notify: () => void) { observers.push({ notify, disconnect: this.disconnect }); }
    observe() {}
  }
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: { documentElement: {} } },
    getComputedStyle: { configurable: true, value: () => ({ fontFamily: 'sans-serif', getPropertyValue: () => '' }) },
    ResizeObserver: { configurable: true, value: Observer },
    MutationObserver: { configurable: true, value: Observer },
  });
  try {
    const chart = mountChart(host, { kind: 'cpu', samples: [fixture()], height: 100 }, { init });
    expect(init).toHaveBeenCalledWith(host, undefined, { renderer: 'svg', width: 300, height: 100 });
    expect(setOption.mock.calls.at(-1)![0].series[0].data).toEqual([[fixture().measured_at * 1000, 12.5]]);
    chart.update({ kind: 'connections', samples: [fixture(2)], height: 120 });
    expect(resize).toHaveBeenCalledWith({ width: 300, height: 120, animation: { duration: 0 } });
    expect(setOption.mock.calls.at(-1)![0].series.map((line: { name: string }) => line.name)).toEqual(['活动连接', '连接容量']);
    host.clientWidth = 220;
    observers[0].notify();
    expect(resize).toHaveBeenLastCalledWith({ width: 220, height: 120, animation: { duration: 0 } });
    expect(setOption.mock.calls.at(-1)![0].legend.show).toBe(false);
    chart.dispose();
    for (const observer of observers) expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

describe('health memory units', () => {
  test('renders byte units', () => {
    expect(formatMetric(0, 'memory')).toBe('0 B');
    expect(formatMetric(1023, 'memory')).toBe('1023 B');
    expect(formatMetric(1024, 'memory')).toBe('1.00 KiB');
    expect(formatMetric(1536, 'memory')).toBe('1.50 KiB');
    expect(formatMetric(1024 * 1024 * 5, 'memory')).toBe('5.00 MiB');
    expect(formatMetric(10 * 1024, 'memory')).toBe('10.0 KiB');
    expect(formatMetric(100 * 1024, 'memory')).toBe('100 KiB');
    expect(formatMetric(1024 ** 2 - 1, 'memory')).toBe('1024 KiB');
    expect(formatMetric(1024 ** 6, 'memory')).toBe('1024 PiB');
  });

  test('renders missing values', () => {
    expect(formatMetric(null, 'memory')).toBe('-');
    expect(formatMetric(undefined, 'memory')).toBe('-');
    expect(formatMetric(-1, 'memory')).toBe('-');
    expect(formatMetric(NaN, 'memory')).toBe('-');
    expect(formatMetric(Infinity, 'memory')).toBe('-');
  });
});
