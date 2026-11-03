<script lang="ts">
  import { untrack } from 'svelte';
  import { Col, Dialog, Empty, Row, Skeleton, Space, Tag, Text } from '@luna/components';
  import { api } from '../api';
  import type { NodeView, Sample } from '../api/types';
  import { session } from '../stores/session';
  import { appendSample, type HealthKind } from '../views/nodes/health';
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
        health = result.data;
        failure = false;
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
      <span>健康检查 · {health?.node.name || name}</span>
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
