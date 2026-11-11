<script lang="ts">
  import { untrack } from 'svelte';
  import { Icon } from '@luna/components';
  import { Alert, Button, Card, Empty, Grid, Skeleton, Text } from '@luna/components/h5';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import Plane from '@lucide/svelte/icons/plane';
  import Server from '@lucide/svelte/icons/server';
  import Users from '@lucide/svelte/icons/users';
  import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
  import Wallet from '@lucide/svelte/icons/wallet';
  import { api } from '../../api';
  import type { Dashboard, DashboardDaily } from '../../api/dashboard';
  import type { Order } from '../../api/types';
  import { session } from '../../stores/session';
  import { formatMoney } from '../../utils/format';
  import {
    mainCurrency,
    moneyValue,
    nodeSlices,
    orderSeries,
    revenueSeries,
    seriesTrend,
    windowRange,
  } from './model';
  import { donutOption, mountChart, sparkOption, type ChartHandle } from './charts';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { onDestroy } from 'svelte';
  import { format } from 'date-fns';

  let totals = $state<Dashboard | null>(null);
  let span = $state<Dashboard | null>(null);
  let orders = $state<Order[]>([]);
  let loading = $state(false);
  let listLoading = $state(false);
  let failed = $state(false);
  let error = $state('');
  let sequence = 0;

  const canNode = $derived(session.canRead('node:read'));
  const canOrder = $derived(session.canRead('order:read'));
  const canUser = $derived(session.canRead('user:read'));

  const daily = $derived<DashboardDaily[]>(span?.daily ?? []);
  const currency = $derived(mainCurrency(daily));
  const orderPoints = $derived(orderSeries(daily));
  const ordersTrend = $derived(seriesTrend(orderPoints));
  const revenuePoints = $derived(currency ? revenueSeries(daily, currency) : []);
  const revenueTrend = $derived(seriesTrend(revenuePoints));
  const todayOrders = $derived(orderPoints.at(-1) ?? null);
  const todayRevenue = $derived.by(() => {
    const amount = daily.at(-1)?.revenue.find((item) => item.currency === currency);
    return amount ? moneyValue(amount.minor) : '';
  });
  const slices = $derived(totals ? nodeSlices(totals) : []);
  const sliceTotal = $derived(slices.reduce((sum, slice) => sum + slice.value, 0));
  const slicePct = (value: number): string => (sliceTotal ? `${Math.round((value / sliceTotal) * 1000) / 10}%` : '-');

  const stats = $derived.by(() => {
    const items: { icon: typeof Server; tone: string; label: string; value: string; trend: number | null; series: number[]; visible: boolean }[] = [
      { icon: Server, tone: 'primary', label: '节点总数', value: String(totals?.nodes ?? ''), trend: null, series: [], visible: canNode },
      { icon: Users, tone: 'success', label: '用户总数', value: String(totals?.users ?? ''), trend: null, series: [], visible: canUser },
      { icon: ShoppingCart, tone: 'warning', label: '今日下单', value: todayOrders === null ? '' : String(todayOrders), trend: ordersTrend, series: orderPoints, visible: canOrder },
      { icon: Wallet, tone: 'danger', label: '今日营收', value: todayRevenue, trend: revenueTrend, series: revenuePoints, visible: canOrder },
    ];
    return items.filter((item) => item.visible);
  });

  const refresh = async (): Promise<void> => {
    const token = session.token;
    if (!token) return;
    const current = ++sequence;
    loading = true;
    failed = false;
    error = '';
    listLoading = true;
    const [totalResult, spanResult] = await Promise.all([
      api.dashboard(token, { version: 1, start: null, end: null }),
      api.dashboard(token, windowRange(7)),
    ]);
    if (current !== sequence) return;
    totals = totalResult.code || totalResult.data === null ? null : totalResult.data;
    span = spanResult.code || spanResult.data === null ? null : spanResult.data;
    failed = !totals || !span;
    if (!failed) {
      const orderResult = await api.searchOrders(token, 0, 3);
      if (current !== sequence) return;
      orders = orderResult.code || orderResult.data === null ? [] : orderResult.data.items;
    }
    listLoading = false;
    loading = false;
  };

  $effect(() => {
    const token = session.token;
    const principal = session.principal;
    if (token && principal) untrack(() => void refresh());
  });

  let donutHost = $state<HTMLDivElement | null>(null);
  let donutChart: ChartHandle | null = null;
  $effect(() => {
    const target = donutHost;
    const values = slices;
    if (!target) return;
    donutChart ??= mountChart(target, 168);
    donutChart.render((tokens) => donutOption(tokens, values));
  });

  let sparkHosts = $state<HTMLDivElement[]>([]);
  let sparkCharts: (ChartHandle | null)[] = [];
  $effect(() => {
    const hosts = sparkHosts;
    if (hosts.length !== stats.length) return;
    for (let index = 0; index < hosts.length; index += 1) {
      const points = stats[index]?.series ?? [];
      if (points.length < 2) continue;
      sparkCharts[index] ??= mountChart(hosts[index], 40);
      const series = points;
      const tone = stats[index]!.tone;
      sparkCharts[index]!.render((tokens) => sparkOption(tokens, series, tone));
    }
  });

  onDestroy(() => {
    donutChart?.dispose();
    donutChart = null;
    for (const chart of sparkCharts) chart?.dispose();
    sparkCharts = [];
  });
</script>

<PageNavbar title="仪表盘" />
<div class="dashboard">
  <div class="banner">
    <div class="welcome">
      <Text class="title">欢迎回来，{session.principal?.username?.trim() || '管理员'}</Text>
      <Text class="subtitle">Luna 管理控制台</Text>
    </div>
    <Button tone="primary" size="sm" class="refresh" disabled={loading} onclick={() => void refresh()}>
      <span class="icon" class:spinning={loading}><Icon icon={RotateCw} size={14} /></span>
      刷新
    </Button>
    <div class="plane" aria-hidden="true"><Icon icon={Plane} size={44} /></div>
  </div>

  {#if error}<Alert tone="danger" title={error} closable={false} />{/if}
  {#if failed}
    <Card><Empty imageSize={64} description="数据加载失败，请刷新重试" /></Card>
  {:else}
    <Grid min={152} gap={12}>
      {#each stats as item, index (item.label)}
        <Card class="stat-card" aria-label={item.label}>
          <div class="stat">
            <div class="head">
              <span class={`tile ${item.tone}`} aria-hidden="true"><Icon icon={item.icon} size={18} /></span>
              <Text size="small" class="label">{item.label}</Text>
            </div>
            <Skeleton loading={loading || !item.value} keepLayout rows={1} animated={false} ariaLabel={`${item.label}加载中`}>
              <span class="value">{item.value}</span>
            </Skeleton>
            {#if item.trend !== null}
              <span class={`trend ${item.trend >= 0 ? 'up' : 'down'}`}>{item.trend >= 0 ? '↑' : '↓'} {item.trend >= 0 ? '+' : ''}{Math.abs(item.trend)}%</span>
            {/if}
            <div class="spark" bind:this={sparkHosts[index]} aria-hidden="true"></div>
          </div>
        </Card>
      {/each}
    </Grid>

    {#if canNode}
      <Card aria-label="节点状态">
        {#snippet header()}<Text class="card-title">节点状态</Text>{/snippet}
        {#snippet extra()}
          {#if slices.some((slice) => slice.value > 0)}
            <Text size="small" style="color: var(--ln-text-3, #86909c);">共 {sliceTotal} 个</Text>
          {/if}
        {/snippet}
        <div class="node-panes">
          <div class="donut" bind:this={donutHost}></div>
          <div class="legend">
            {#each slices as slice (slice.name)}
              <div class="legend-row">
                <span class={`dot ${slice.color}`}></span>
                <span class="name">{slice.name}</span>
                <span class="count">{slice.value}</span>
                <span class="pct">{slicePct(slice.value)}</span>
              </div>
            {/each}
          </div>
        </div>
      </Card>
    {/if}

    {#if canOrder}
      <Card aria-label="最近订单">
        {#snippet header()}<Text class="card-title">最近订单</Text>{/snippet}
        <div class="orders">
          {#each orders as order (order.id)}
            <div class="order">
              <span class="bar"></span>
              <div class="order-main">
                <Text truncated class="order-id">#{order.id.slice(-8)}</Text>
                <Text size="small" style="color: var(--ln-text-3, #86909c);">{format(order.created_at * 1000, 'HH:mm')}</Text>
              </div>
              <span class="order-price">{formatMoney(order.price_minor, order.currency)}</span>
            </div>
          {:else}
            <Empty description={listLoading ? '加载中…' : '暂无订单'} imageSize={48} />
          {/each}
        </div>
      </Card>
    {/if}
  {/if}
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 0 14px 96px;
  }
  .banner {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 16px;
    border-radius: 14px;
    background: linear-gradient(120deg, var(--ln-primary, #165dff) -8%, #6d9dff 38%, #cfe0ff 78%, #eaf2ff 100%);
  }
  .welcome {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .welcome :global(.title) {
    font-size: 17px;
    font-weight: 600;
    color: #fff;
  }
  .welcome :global(.subtitle) {
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
  }
  .refresh {
    position: relative;
    z-index: 1;
    flex: none;
  }
  .refresh :global(.icon) {
    display: inline-flex;
    margin-right: 3px;
  }
  .refresh :global(.spinning) {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .plane {
    position: absolute;
    right: 96px;
    top: 50%;
    transform: translateY(-50%) rotate(-8deg);
    color: rgba(255, 255, 255, 0.45);
    pointer-events: none;
  }
  .card-title {
    font-weight: 600;
  }
  .stat-card :global(.stat) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 92px;
  }
  .stat .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    flex: none;
  }
  .tile.primary { background: color-mix(in srgb, var(--ln-primary, #165dff) 12%, transparent); color: var(--ln-primary, #165dff); }
  .tile.success { background: color-mix(in srgb, var(--ln-success, #23c343) 12%, transparent); color: var(--ln-success, #23c343); }
  .tile.warning { background: color-mix(in srgb, var(--ln-warning, #e6a23c) 14%, transparent); color: var(--ln-warning, #e6a23c); }
  .tile.danger { background: color-mix(in srgb, var(--ln-danger, #f56c6c) 12%, transparent); color: var(--ln-danger, #f56c6c); }
  .stat :global(.label) {
    color: var(--ln-text-2, #606266);
  }
  .stat :global(.value) {
    font-size: 22px;
    font-weight: 600;
    color: var(--ln-text-1, #303133);
    line-height: 1.2;
  }
  .trend {
    font-size: 12px;
  }
  .trend.up { color: var(--ln-success, #23c343); }
  .trend.down { color: var(--ln-danger, #f56c6c); }
  .spark {
    height: 40px;
    align-self: flex-end;
    width: 100%;
  }
  .node-panes {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .donut {
    width: 148px;
    height: 148px;
    flex: none;
  }
  .legend {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .legend-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--ln-text-1, #303133);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .dot.primary { background: var(--ln-primary, #165dff); }
  .dot.success { background: var(--ln-success, #23c343); }
  .dot.warning { background: var(--ln-warning, #e6a23c); }
  .dot.danger { background: var(--ln-danger, #f56c6c); }
  .count {
    font-weight: 600;
  }
  .pct {
    color: var(--ln-text-3, #86909c);
    font-size: 12px;
  }
  .orders {
    display: flex;
    flex-direction: column;
  }
  .order {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 2px;
    border-bottom: 1px solid var(--ln-border-2, #f0f2f5);
  }
  .order:last-child {
    border-bottom: none;
  }
  .bar {
    width: 3px;
    height: 22px;
    border-radius: 2px;
    background: var(--ln-primary, #165dff);
    flex: none;
  }
  .order-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .order-main :global(.order-id) {
    font-size: 13px;
    color: var(--ln-text-1, #303133);
  }
  .order-price {
    font-weight: 600;
    color: var(--ln-text-1, #303133);
    flex: none;
  }
</style>
