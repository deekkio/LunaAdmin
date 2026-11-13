<script module lang="ts">
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
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { Alert, Button, Card, Col, DatePicker, Empty, Row, Skeleton, Space, Statistic, Text } from '@luna/components';
  import { api } from '../../api';
  import type { Dashboard } from '../../api/types';
  import { session } from '../../stores/state.svelte';

  let range = $state<string[] | null>(null);
  let values = $state<Dashboard | null>(null);
  let loading = $state(false);
  let error = $state('');
  let failed = $state(false);
  let sequence = 0;
  const metrics = [
    { key: 'recharge', label: '充值总额', permission: 'order:read', tone: 'primary' },
    { key: 'online', label: '在线节点', permission: 'node:read', tone: 'success' },
    { key: 'offline', label: '离线节点', permission: 'node:read', tone: 'warning' },
    { key: 'users', label: '注册用户', permission: 'user:read', tone: 'info' },
  ] as const;
  const shown = $derived(metrics.filter((item) => session.canRead(item.permission)));

  $effect(() => {
    const token = session.token;
    const principal = session.principal;
    if (token && principal) untrack(() => void load(token));
  });

  const load = async (token = session.token): Promise<void> => {
    let query;
    try {
      query = dateRange(range?.[0] ?? '', range?.[1] ?? '');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : '日期范围无效';
      return;
    }
    const current = ++sequence;
    loading = true;
    error = '';
    failed = false;
    const result = await api.dashboard(token ?? '', query);
    if (current !== sequence) return;
    values = result.code ? null : result.data;
    failed = Boolean(result.code) || result.data === null;
    loading = false;
  };

  const reset = (): void => {
    range = null;
    void load();
  };
</script>


<Card aria-label="仪表盘">
  {#snippet header()}
    <Space wrap size={12}>
      <Space width={280}>
        <DatePicker type="daterange" ariaLabel="统计日期范围" startPlaceholder="开始日期" endPlaceholder="结束日期" valueFormat="YYYY-MM-DD" min="1970-01-01" max="2100-12-31" clearable valueOnClear={null} bind:value={range} />
      </Space>
      <Button tone="primary" disabled={loading} loading={loading} onclick={() => void load()}>查询</Button>
      <Button variant="plain" disabled={loading} onclick={reset}>全部日期</Button>
    </Space>
  {/snippet}
  {#snippet extra()}
    <Button variant="plain" disabled={loading} onclick={() => void load()}>刷新</Button>
  {/snippet}
  <Space direction="vertical" alignment="stretch" width="100%" size={20}>
  {#if error}<Alert tone="danger" title={error} closable={false} />{/if}
  {#if failed}
    <Empty imageSize={64} />
  {:else}
  <Row gutter={16}>
    {#each shown as item (item.key)}
      {@const fill = item.tone === 'primary' ? 'var(--ln-tag-fill, var(--ln-primary-l9))' : `var(--ln-${item.tone}-l9)`}
      {@const line = item.tone === 'primary' ? 'var(--ln-tag-line, var(--ln-primary-l8))' : `var(--ln-${item.tone}-l8)`}
      {@const ink = item.tone === 'primary' ? 'var(--ln-tag-ink, var(--ln-primary))' : `var(--ln-${item.tone})`}
      <Col xs={24} sm={12} md={6}>
        <Card tone={item.tone} aria-label={item.label} style={`--ln-card-bg: ${fill}; --ln-statistic-color: ${ink}; --ln-text-2: ${ink}; border-color: ${line};`}>
          <Skeleton loading={loading || values?.[item.key] == null} keepLayout rows={1} animated={false} ariaLabel={`${item.label}加载中`}>
          {#if item.key === 'recharge'}
            {#if values?.recharge?.length}
              {#each values.recharge as amount (amount.currency)}
                <Statistic ellipsis title={item.label} value={moneyValue(amount.minor)} suffix={amount.currency === 'CNY' ? '元' : amount.currency} />
              {/each}
            {:else}
              <Statistic ellipsis title={item.label} value="0.00" suffix="元" />
            {/if}
          {:else}
            <Statistic ellipsis title={item.label} value={values?.[item.key] ?? ''} />
          {/if}
          </Skeleton>
        </Card>
      </Col>
    {/each}
  </Row>
  {/if}
  {#if !shown.length && !session.restoring}<Text tag="p">当前账号暂无统计数据的查看权限。</Text>{/if}
  </Space>
</Card>
