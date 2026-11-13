<script module lang="ts">
  import type { Sample } from '../../api/types';
  import { filesize } from 'filesize';

  const formatBytes = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '-';
    // 固定缩放前的单位，避免四舍五入使边界值提前显示为下一级单位。
    const unit = Math.min(filesize(Math.floor(value), { standard: 'iec', output: 'exponent', round: 20 }), 5);
    const digits = unit === 0 || value >= 100 * 1024 ** unit ? 0 : value >= 10 * 1024 ** unit ? 1 : 2;
    return filesize(value, { standard: 'iec', exponent: unit, round: digits, pad: true });
  };

  export const SAMPLE_LIMIT = 64;
  export const SAMPLE_WINDOW = 600;
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
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { Col, Empty, Row, Skeleton, Space, Tag, Text } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import { api } from '../../api';
  import type { NodeView } from '../../api/types';
  import { session } from '../../stores/state.svelte';
  import HealthChart from './HealthChart.svelte';

  let { open = $bindable(false), id, name }: { open?: boolean; id: string; name: string } = $props();
  let health = $state<NodeView | null>(null);
  let samples = $state<Sample[]>([]);
  let loaded = $state(false);
  let failure = $state(false);
  let viewport = $state(768);
  const height = $derived(Math.max(64, Math.min(160, Math.floor((viewport - 440) / 2))));
  const sample = $derived(health?.sample ?? null);
  const status = $derived(failure ? '监测中断' : !health ? '等待上报' : !health.enabled ? '节点已停用' : !sample ? '等待上报' : health.stale ? '上报超时' : sample.healthy ? '运行正常' : '运行异常');
  const tone = $derived(failure ? 'warning' : !health || !sample || !health.enabled ? 'info' : health.stale ? 'warning' : sample.healthy ? 'success' : 'danger');
  const charts: { kind: HealthKind; title: string }[][] = [
    [{ kind: 'cpu', title: 'CPU' }, { kind: 'memory', title: '内存' }],
    [{ kind: 'connections', title: '连接数' }, { kind: 'traffic', title: '网络速率' }],
  ];

  $effect(() => {
    const token = session.token;
    const target = id;
    if (!open || !token || !target) return;
    let active = true;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let control: AbortController | undefined;
    untrack(() => { health = null; samples = []; failure = false; loaded = false; });
    const load = async (): Promise<void> => {
      if (!active || pending || document.hidden) return;
      clearTimeout(timer);
      pending = true;
      control = new AbortController();
      try {
        const result = await api.health(token, target, control.signal);
        if (!active || control.signal.aborted || session.token !== token) return;
        loaded = true;
        if (result.code || !result.data) { failure = true; return; }
        health = result.data.node;
        failure = false;
        if (result.data.cached) samples = [];
        for (const sample of result.data.samples) samples = appendSample(samples, sample);
        if (health.sample) samples = appendSample(samples, health.sample);
      } finally {
        pending = false;
        if (active) {
          if (!document.hidden) timer = setTimeout(() => void load(), 5000);
        }
      }
    };
    const visible = (): void => {
      clearTimeout(timer);
      if (document.hidden) control?.abort();
      else void load();
    };
    document.addEventListener('visibilitychange', visible);
    untrack(() => { void load(); });
    return () => {
      active = false;
      clearTimeout(timer);
      control?.abort();
      document.removeEventListener('visibilitychange', visible);
    };
  });
</script>

<svelte:window bind:innerHeight={viewport} />

<Dialog bind:open width={880}>
  {#snippet header()}
    <Space wrap size={8} alignment="center">
      <span>健康检查 - {health?.node.name || name}</span>
      <Tag {tone}>{status}</Tag>
    </Space>
  {/snippet}
  <Space direction="vertical" alignment="stretch" size={8} width="100%">
    {#if !loaded}<Skeleton rows={4} animated={false} />
    {:else if !health}<Empty description="暂无监测数据" />
    {:else}
      {#if !sample}<Text type="info">等待节点上报监测数据</Text>{/if}
      <Space direction="vertical" alignment="stretch" size={8} width="100%">
        {#each charts as row (row[0].kind)}
          <Space direction="vertical" alignment="stretch" size={4} width="100%">
            <Row gutter={12}>
              {#each row as chart (chart.kind)}
                <Col span={12} role="group" aria-label={`${chart.title}监测`}>
                  <HealthChart kind={chart.kind} {samples} {height} label={`${chart.title}采样曲线`} />
                </Col>
              {/each}
            </Row>
          </Space>
        {/each}
      </Space>
    {/if}
  </Space>
</Dialog>
