<script lang="ts">
  import { untrack } from 'svelte';
  import {
    Alert,
    Button,
    Card,
    Col,
    Empty,
    Icon,
    Link,
    Row,
    Space,
    Table,
    Tag,
    Text,
  } from '@luna/components';
  import type { TableColumn } from '@luna/components/contracts';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import Plane from '@lucide/svelte/icons/plane';
  import Server from '@lucide/svelte/icons/server';
  import Users from '@lucide/svelte/icons/users';
  import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
  import Wallet from '@lucide/svelte/icons/wallet';
  import Megaphone from '@lucide/svelte/icons/megaphone';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import { api, listFilter } from '../../api';
  import type { Audit, Dashboard, Entry, NavRoute, Order } from '../../api/types';
  import { session, navigation } from '../../stores/index.svelte';
  import { formatMoney, formatTime } from '../../utils/format';
  import {
    axisLabels,
    mainCurrency,
    moneyValue,
    nodeSlices,
    orderSeries,
    rateMock,
    revenueSeries,
    seriesTrend,
    windowRange,
  } from './model';
  import { barsOption, donutOption, lineOption, mountChart, type ChartHandle } from './charts';
  import StatCard from './StatCard.svelte';

  let totals = $state<Dashboard | null>(null);
  let span = $state<Dashboard | null>(null);
  let windowDays = $state<7 | 30>(7);
  let orders = $state<Order[]>([]);
  let notices = $state<Entry[]>([]);
  let logins = $state<Audit[]>([]);
  let loading = $state(false);
  let listLoading = $state(false);
  let failed = $state(false);
  let error = $state('');
  let sequence = 0;

  const canNode = $derived(session.canRead('node:read'));
  const canOrder = $derived(session.canRead('order:read'));
  const canUser = $derived(session.canRead('user:read'));
  const canInfo = $derived(session.canRead('information:read'));
  const canAccess = $derived(session.canRead('access:read'));

  const daily = $derived(span?.daily ?? []);
  const currency = $derived(mainCurrency(daily));
  const orderTotal = $derived(daily.reduce((sum, bucket) => sum + bucket.orders, 0));
  const ordersTrend = $derived(seriesTrend(orderSeries(daily)));
  const todayOrders = $derived(orderSeries(daily).at(-1) ?? null);
  const revenuePoints = $derived(currency ? revenueSeries(daily, currency) : []);
  const revenueTrend = $derived(seriesTrend(revenuePoints));
  const todayRevenue = $derived.by(() => {
    const amount = daily.at(-1)?.revenue.find((item) => item.currency === currency);
    return amount ? moneyValue(amount.minor) : '';
  });
  const slices = $derived(totals ? nodeSlices(totals) : []);
  const sliceTotal = $derived(slices.reduce((sum, slice) => sum + slice.value, 0));

  const menuPath = (code: string): string | null => {
    const walk = (nodes: readonly NavRoute[]): string | null => {
      for (const node of nodes) {
        if (node.code === code) return node.path;
        const found = walk(node.children);
        if (found) return found;
      }
      return null;
    };
    return walk(navigation.menu);
  };
  const ordersLink = $derived(menuPath('orders'));
  const noticesLink = $derived(menuPath('announcements'));
  const loginsLink = $derived(menuPath('audits'));

  const orderColumns: TableColumn<Order>[] = [
    { key: 'id', label: '订单号', formatter: (value) => `#${String(value).slice(-8)}` },
    { key: 'username', label: '用户', formatter: (value) => String(value || '-') },
    { key: 'name', label: '套餐', formatter: formatId },
    { key: 'price_minor', label: '金额', formatter: (_, row) => formatMoney(row.price_minor, row.currency) },
    { key: 'created_at', label: '下单时间', formatter: (_, row) => formatTime(row.created_at) },
  ];
  const loginColumns: TableColumn<Audit>[] = [
    { key: 'username', label: '管理员' },
    { key: 'created_at', label: '登录时间', formatter: (_, row) => formatTime(row.created_at) },
    { key: 'ip', label: '登录IP', formatter: (value) => String(value || '内网') },
  ];

  function formatId(value: unknown): string {
    return value === null || value === undefined || value === '' ? '-' : String(value);
  }

  const loadLists = async (token: string): Promise<void> => {
    const current = sequence;
    listLoading = true;
    const [orderResult, noticeResult, loginResult] = await Promise.all([
      api.searchOrders(token, 0, 5),
      api.entries(token, 'announcements', 0, 5),
      api.searchAudits(token, 0, 5, listFilter('', '', '', 'admin:login')),
    ]);
    if (current !== sequence) return;
    orders = orderResult.code || orderResult.data === null ? [] : orderResult.data.items;
    notices = (noticeResult.code || noticeResult.data === null ? [] : noticeResult.data.items).filter((entry) => entry.published);
    logins = loginResult.code || loginResult.data === null ? [] : loginResult.data.items;
    listLoading = false;
  };

  const loadSpan = async (days: number): Promise<void> => {
    const token = session.token;
    if (!token) return;
    const current = ++sequence;
    loading = true;
    const result = await api.dashboard(token, windowRange(days));
    if (current !== sequence) return;
    span = result.code || result.data === null ? null : result.data;
    loading = false;
    const totalsNow = totals;
    const spanNow = span;
    untrack(() => drawCharts(totalsNow, spanNow));
  };

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
      api.dashboard(token, windowRange(windowDays)),
    ]);
    if (current !== sequence) return;
    totals = totalResult.code || totalResult.data === null ? null : totalResult.data;
    span = spanResult.code || spanResult.data === null ? null : spanResult.data;
    failed = !totals || !span;
    if (!failed) {
      const totalsNow = totals;
      const spanNow = span;
      untrack(() => void loadLists(token));
      untrack(() => drawCharts(totalsNow, spanNow));
    }
    loading = false;
  };

  const pick = (days: 7 | 30): void => {
    if (windowDays === days) return;
    windowDays = days;
    void loadSpan(days);
  };

  $effect(() => {
    const token = session.token;
    const principal = session.principal;
    if (token && principal) untrack(() => void refresh());
  });

  let donutHost = $state<HTMLDivElement | null>(null);
  let barsHost = $state<HTMLDivElement | null>(null);
  let rateHost = $state<HTMLDivElement | null>(null);
  let donutChart: ChartHandle | null = null;
  let barsChart: ChartHandle | null = null;
  let rateChart: ChartHandle | null = null;

  /** 以传入快照更新三只图表；由容器就绪与数据刷新后显式触发。 */
  const drawCharts = (totalsNow: Dashboard | null, spanNow: Dashboard | null): void => {
    if (donutHost) {
      donutChart ??= mountChart(donutHost, 190);
      const visible = nodeSlices(totalsNow ?? { online: null, offline: null, disabled: null }).filter((slice) => slice.value > 0);
      donutChart.render((tokens) => donutOption(tokens, visible));
    }
    const buckets = spanNow?.daily ?? [];
    if (barsHost && buckets.length) {
      const points = buckets.map((bucket, index) => ({ label: axisLabels(buckets)[index], value: bucket.orders }));
      barsChart ??= mountChart(barsHost, 210);
      barsChart.render((tokens) => barsOption(tokens, points));
    }
    if (rateHost) {
      rateChart ??= mountChart(rateHost, 190);
      rateChart.render((tokens) => lineOption(tokens, rateMock()));
    }
  };

  // 容器就绪后先绘制一次（此时可能仍是空数据骨架）。
  $effect(() => {
    if (!failed && (donutHost || barsHost || rateHost)) {
      const totalsNow = totals;
      const spanNow = span;
      untrack(() => drawCharts(totalsNow, spanNow));
    }
    return () => {
      donutChart?.dispose();
      donutChart = null;
      barsChart?.dispose();
      barsChart = null;
      rateChart?.dispose();
      rateChart = null;
    };
  });

  const slicePct = (value: number): string => (sliceTotal ? `${Math.round((value / sliceTotal) * 1000) / 10}%` : '-');
</script>

<div class="dashboard">
  <div class="banner">
    <div class="welcome">
      <Text size="large" class="title">欢迎回来，{session.principal?.username?.trim() || '管理员'} 👋</Text>
      <Text style="color: rgba(255, 255, 255, 0.85);">这里是您的 Luna 管理控制台</Text>
    </div>
    <Button tone="primary" class="refresh" disabled={loading} onclick={() => void refresh()}>
      <span class="icon" class:spinning={loading}><Icon icon={RotateCw} size={16} /></span>
      刷新
    </Button>
    <div class="plane" aria-hidden="true"><Icon icon={Plane} size={64} /></div>
  </div>

  {#if error}<Alert tone="danger" title={error} closable={false} />{/if}
  {#if failed}
    <Card><Empty imageSize={72} description="仪表盘数据加载失败，请点击刷新重试" /></Card>
  {:else}
    <Row gutter={16}>
      {#if canNode}
        <Col xs={24} sm={12} md={6}>
          <StatCard icon={Server} tone="primary" label="节点总数" value={String(totals?.nodes ?? '')} loading={loading} />
        </Col>
      {/if}
      {#if canUser}
        <Col xs={24} sm={12} md={6}>
          <StatCard icon={Users} tone="success" label="总用户数" value={String(totals?.users ?? '')} loading={loading} />
        </Col>
      {/if}
      {#if canOrder}
        <Col xs={24} sm={12} md={6}>
          <StatCard
            icon={ShoppingCart}
            tone="warning"
            label={windowDays === 7 ? '近7天下单' : '近30天下单'}
            value={String(orderTotal)}
            trend={ordersTrend}
            series={orderSeries(daily)}
            loading={loading}
          />
        </Col>
      {/if}
      {#if canOrder}
        <Col xs={24} sm={12} md={6}>
          <StatCard
            icon={Wallet}
            tone="danger"
            label="今日营收"
            value={todayRevenue}
            suffix={currency ? (currency === 'CNY' ? '元' : currency) : ''}
            trend={revenueTrend}
            series={revenuePoints}
            loading={loading}
          />
        </Col>
      {/if}
    </Row>

    {#if canNode}
      <Row gutter={16}>
        <Col xs={24} md={15}>
          <Card aria-label="节点相关数据">
            {#snippet header()}<Text class="card-title">节点相关数据</Text>{/snippet}
            {#snippet extra()}
              {#if ordersLink}<Link href={`#${ordersLink}`} underline="never" class="more">更多 ›</Link>{/if}
            {/snippet}
            <div class="node-panes">
              <div class="pane donut-pane">
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
              <div class="divider"></div>
              <div class="pane">
                <div class="pane-head">
                  <Text class="pane-title">近7天节点在线率</Text>
                  <Tag size="small" tone="warning">模拟数据</Tag>
                </div>
                <div class="rate" bind:this={rateHost}></div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={9}>
          <Card aria-label="套餐下单情况">
            {#snippet header()}
              <Space size={8}>
                <Text class="card-title">套餐下单情况</Text>
                <Space size={4}>
                  <Button size="sm" tone={windowDays === 7 ? 'primary' : undefined} variant={windowDays === 7 ? undefined : 'plain'} disabled={loading} onclick={() => pick(7)}>近7天</Button>
                  <Button size="sm" tone={windowDays === 30 ? 'primary' : undefined} variant={windowDays === 30 ? undefined : 'plain'} disabled={loading} onclick={() => pick(30)}>近30天</Button>
                </Space>
              </Space>
            {/snippet}
            <div class="bar-total">
              <span class="big">{orderTotal.toLocaleString('zh-CN')}</span>
              <span class="trend-label">下单量</span>
              {#if ordersTrend !== null}
                <span class={`trend ${ordersTrend >= 0 ? 'up' : 'down'}`}>{ordersTrend >= 0 ? '↑' : '↓'} {Math.abs(ordersTrend)}%</span>
              {/if}
            </div>
            <div class="bars" bind:this={barsHost}></div>
          </Card>
        </Col>
      </Row>
    {/if}

    <Row gutter={16}>
      {#if canOrder}
        <Col xs={24} md={12}>
          <Card fill aria-label="最近新订单">
            {#snippet header()}<Text class="card-title">最近新订单</Text>{/snippet}
            {#snippet extra()}
              {#if ordersLink}<Link href={`#${ordersLink}`} underline="never" class="more">更多 ›</Link>{/if}
            {/snippet}
            <Table
              tableLayout="auto"
              data={orders}
              columns={orderColumns}
              rowKey="id"
              loading={listLoading}
              emptyText="暂无订单"
            />
          </Card>
        </Col>
      {/if}
      {#if canInfo}
        <Col xs={24} md={12}>
          <Card fill aria-label="系统公告">
            {#snippet header()}
              <Space size={6}><Icon icon={Megaphone} size={16} /><Text class="card-title">系统公告</Text></Space>
            {/snippet}
            {#snippet extra()}
              {#if noticesLink}<Link href={`#${noticesLink}`} underline="never" class="more">更多 ›</Link>{/if}
            {/snippet}
            <div class="notices">
              {#each notices as entry (entry.id)}
                <div class="notice">
                  <span class={`dot ${['success', 'warning', 'danger', 'primary'][entry.title.length % 4]}`}></span>
                  <Text truncated class="notice-title">{entry.title}</Text>
                  <span class="notice-date">{formatTime(entry.created_at).slice(5, 10)}</span>
                </div>
              {:else}
                <Empty description="暂无公告" imageSize={56} />
              {/each}
            </div>
          </Card>
        </Col>
      {/if}
      {#if canAccess}
        <Col xs={24}>
          <Card fill aria-label="管理员登录记录">
            {#snippet header()}
              <Space size={6}><Icon icon={ShieldCheck} size={16} /><Text class="card-title">管理员登录记录</Text></Space>
            {/snippet}
            {#snippet extra()}
              {#if loginsLink}<Link href={`#${loginsLink}`} underline="never" class="more">更多 ›</Link>{/if}
            {/snippet}
            <Table
              tableLayout="auto"
              data={logins}
              columns={loginColumns}
              rowKey="id"
              loading={listLoading}
              emptyText="暂无登录记录"
            />
          </Card>
        </Col>
      {/if}
    </Row>
  {/if}
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .banner {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 24px 28px;
    border-radius: 14px;
    background: linear-gradient(120deg, var(--ln-primary, #165dff) -8%, #6d9dff 38%, #cfe0ff 78%, #eaf2ff 100%);
  }
  .welcome {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .welcome :global(.title) {
    font-size: 22px;
    font-weight: 600;
    color: #fff;
  }
  .welcome :global(.ln-text) {
    color: rgba(255, 255, 255, 0.82);
  }
  .plane {
    position: absolute;
    right: 148px;
    top: 50%;
    transform: translateY(-50%) rotate(-8deg);
    color: rgba(255, 255, 255, 0.5);
    pointer-events: none;
  }
  .refresh {
    position: relative;
    z-index: 1;
  }
  .refresh :global(.icon) {
    display: inline-flex;
    margin-right: 4px;
  }
  .refresh :global(.spinning) {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .card-title {
    font-weight: 600;
  }
  .more {
    font-size: 13px;
  }
  .node-panes {
    display: flex;
    gap: 20px;
  }
  .pane {
    flex: 1;
    min-width: 0;
  }
  .donut-pane {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .donut {
    width: 190px;
    height: 190px;
    flex: none;
  }
  .legend {
    display: flex;
    flex-direction: column;
    gap: 12px;
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
  .divider {
    width: 1px;
    align-self: stretch;
    background: var(--ln-border-1, #ebeef5);
  }
  .pane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .pane-title {
    font-weight: 600;
  }
  .rate {
    width: 100%;
    height: 190px;
  }
  .bar-total {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
  }
  .big {
    font-size: 28px;
    font-weight: 600;
    color: var(--ln-text-1, #303133);
  }
  .trend-label {
    font-size: 13px;
    color: var(--ln-text-2, #606266);
  }
  .trend {
    font-size: 12px;
  }
  .trend.up { color: var(--ln-success, #23c343); }
  .trend.down { color: var(--ln-danger, #f56c6c); }
  .bars {
    width: 100%;
    height: 210px;
  }
  .notices {
    display: flex;
    flex-direction: column;
    min-height: 120px;
  }
  .notice {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 2px;
    border-bottom: 1px solid var(--ln-border-2, #f0f2f5);
  }
  .notice:last-child {
    border-bottom: none;
  }
  .notice :global(.notice-title) {
    flex: 1;
    min-width: 0;
    color: var(--ln-text-1, #303133);
  }
  .notice-date {
    color: var(--ln-text-3, #86909c);
    font-size: 12px;
    flex: none;
  }
</style>
