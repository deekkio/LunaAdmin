<script lang="ts">
  import { Card, Icon, Skeleton, Text } from '@luna/components';
  import type { Component } from 'svelte';
  import { onDestroy } from 'svelte';
  import { mountChart, sparkOption, type ChartHandle } from './charts';

  interface Props {
    icon: Component;
    tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
    label: string;
    value: string;
    suffix?: string;
    trend?: number | null;
    series?: readonly number[];
    loading?: boolean;
  }

  let { icon, tone = 'primary', label, value, suffix = '', trend = null, series = [], loading = false }: Props = $props();

  let host = $state<HTMLDivElement | null>(null);
  let chart: ChartHandle | null = null;

  $effect(() => {
    const target = host;
    const points = [...series];
    if (!target || points.length < 2) return;
    chart ??= mountChart(target, 48);
    chart.render((tokens) => sparkOption(tokens, points, tone));
  });

  onDestroy(() => {
    chart?.dispose();
    chart = null;
  });

  const trendClass = (value: number | null): string =>
    value === null ? '' : value >= 0 ? 'up' : 'down';
</script>

<Card class="stat-card" aria-label={label}>
  <div class="stat">
    <span class={`tile ${tone}`} aria-hidden="true">
      <Icon {icon} size={22} />
    </span>
    <div class="meta">
      <Text size="small" style="color: var(--ln-text-2, #606266);" class="label">{label}</Text>
      <Skeleton loading={loading || !value} keepLayout rows={1} animated={false} ariaLabel={`${label}加载中`}>
        <span class="value">
          {value}
          {#if suffix}<span class="suffix">{suffix}</span>{/if}
        </span>
      </Skeleton>
      {#if trend !== null}
        <span class={`trend ${trendClass(trend)}`}>
          {trend >= 0 ? '↑' : '↓'}
          {trend >= 0 ? '+' : ''}{trend}%
        </span>
      {/if}
    </div>
    <div class="spark" bind:this={host} aria-hidden="true"></div>
  </div>
</Card>

<style>
  .stat {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 76px;
  }
  .tile {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 12px;
  }
  .tile.primary { background: color-mix(in srgb, var(--ln-primary, #165dff) 12%, transparent); color: var(--ln-primary, #165dff); }
  .tile.success { background: color-mix(in srgb, var(--ln-success, #23c343) 12%, transparent); color: var(--ln-success, #23c343); }
  .tile.warning { background: color-mix(in srgb, var(--ln-warning, #e6a23c) 14%, transparent); color: var(--ln-warning, #e6a23c); }
  .tile.danger { background: color-mix(in srgb, var(--ln-danger, #f56c6c) 12%, transparent); color: var(--ln-danger, #f56c6c); }
  .tile.info { background: color-mix(in srgb, var(--ln-info, #909399) 12%, transparent); color: var(--ln-info, #909399); }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .label {
    white-space: nowrap;
  }
  .value {
    font-size: 24px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--ln-text-1, #303133);
    white-space: nowrap;
  }
  .suffix {
    font-size: 13px;
    font-weight: 400;
    color: var(--ln-text-2, #606266);
    margin-left: 2px;
  }
  .trend {
    font-size: 12px;
    white-space: nowrap;
  }
  .trend.up { color: var(--ln-success, #23c343); }
  .trend.down { color: var(--ln-danger, #f56c6c); }
  .spark {
    flex: 1;
    min-width: 0;
    align-self: flex-end;
    height: 48px;
  }
</style>
