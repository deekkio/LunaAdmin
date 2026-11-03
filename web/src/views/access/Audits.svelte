<script lang="ts">
  import { untrack } from 'svelte';
  import { Descriptions } from '@luna/components';
  import ListSearch from '../../components/ListSearch.svelte';
  import type { AccessFilter } from '../../api/types';
  import { RequestTracker } from '../../api/request';
  import { formatId } from '../../utils/format';
  import { actionText } from './model';
  import ListContent from '../../components/ListContent.svelte';
  import { Card, Button, Dialog, Text, Pagination, Table, Space, Row } from '@luna/components';
  import type { TableColumn } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { api, listFilter } from '../../api';
  import type { Audit } from '../../api/types';
  import { session } from '../../stores/index.svelte';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';
  import { formatTime } from '../../utils/format';

  let query = $state('');
  let filter = $state<AccessFilter>(listFilter());
  let pending = $state<AccessFilter>(listFilter());
  let count = $state(0);
  let open = $state(false);
  let clearing = $state(false);
  const tracker = new RequestTracker();
  const pager = new Pager<Audit>((offset, limit) => api.searchAudits(session.token ?? '', offset, limit, filter));

  const columns: TableColumn<Audit>[] = [
    { key: 'id', label: '#', width: 72 },
    { key: 'username', label: '操作者', width: 120 },
    { key: 'action', label: '操作', formatter: (value) => actionText(String(value)) },
    { key: 'target', label: '对象', formatter: formatId },
    { key: 'request', label: '请求标识', formatter: formatId },
    { key: 'created_at', label: '时间', formatter: (_, row) => formatTime(row.created_at) },
  ];

  $effect(() => {
    if (session.token) untrack(() => void pager.refresh());
  });
  const search = (): void => {
    filter = listFilter(query);
    pager.page = 1;
    void pager.refresh();
  };
  const openClear = (): void => {
    if (clearing || pager.loading || !pager.total || !session.canWrite) return;
    pending = { ...filter };
    count = pager.total;
    tracker.reset();
    open = true;
  };
  const clear = async (): Promise<void> => {
    const token = session.token;
    if (!token || clearing || !session.canWrite) return;
    clearing = true;
    try {
      const payload = { version: 1, filter: { ...pending } };
      const result = await api.clearAudits(token, { ...payload, request: tracker.id(payload) });
      if (result.code || !result.data || token !== session.token) return;
      tracker.reset();
      open = false;
      showMessage({ message: `已清理 ${result.data.count} 条日志`, type: 'success' });
      pager.page = 1;
      await pager.refresh();
    } finally { clearing = false; }
  };
</script>

<Card fill class="content-card" aria-label="审计">
  {#snippet header()}
    <ListSearch bind:query label="搜索日志" placeholder="搜索操作者、对象或请求标识"
      states={false} disabled={pager.loading || clearing} onsearch={search} />
  {/snippet}
  {#snippet extra()}
    <Space wrap size={10}>
      {#if session.canWrite}<Button variant="plain" tone="danger" disabled={pager.loading || clearing || !pager.total} onclick={openClear}>清理日志</Button>{/if}
      <Button
        variant="plain"
        type="button"
        onclick={() => void pager.refresh()}
        disabled={pager.loading}
      >
        刷新
      </Button>
    </Space>
  {/snippet}

  <ListContent count={pager.items.length} loading={pager.loading} description={'暂无记录'}>
    <Table tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }} border
      data={pager.items}
      {columns}
      rowKey="id"
      loading={pager.loading}
      emptyText="暂无记录"
    />
  </ListContent>

  {#snippet footer()}
    <Row justify="end">
      <Space>
        <Pagination
          total={pager.total}
          currentPage={pager.page}
          pageSize={pager.pageSize}
          pageSizes={PAGE_SIZES}
          background
          showTotal
          showSizes
          showJumper
          disabled={pager.loading}
          onchange={(page) => pager.goto(page)}
          onsizechange={(size) => pager.resize(size)}
        />
      </Space>
    </Row>
  {/snippet}
</Card>

<Dialog bind:open title="清理日志" width={480} beforeClose={() => !clearing}>
  <Text tag="p">清理当前搜索匹配的审计日志，此操作无法恢复。</Text>
  <Descriptions columns={1} direction="horizontal" border={false} items={[
    { key: 'query', label: '搜索内容', value: pending.query || '全部' },
    { key: 'count', label: '日志数量', value: `${count} 条` },
  ]} />
  {#snippet footer()}
    <Button variant="plain" disabled={clearing} onclick={() => (open = false)}>取消</Button>
    <Button tone="danger" loading={clearing} disabled={clearing} onclick={() => void clear()}>确认清理</Button>
  {/snippet}
</Dialog>
