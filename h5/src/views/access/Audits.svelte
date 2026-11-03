<script lang="ts">
  import { untrack } from 'svelte';
  import { Descriptions } from '@luna/components';
  import ListSearch from '../../components/ListSearch.svelte';
  import type { AccessFilter } from '../../api/types';
  import { RequestTracker } from '../../api/request';
  import { formatId, actionText } from '../../utils/format';
  import {
    Dialog,
    Empty,
    Skeleton,
    Text,
    Card,
    ButtonGroup,
    CellGroup,
    Space,
    Row,
    Grid,
    Button,
  } from '@luna/components/h5';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { showToast } from '@luna/components/toast';
  import { api, listFilter } from '../../api';
  import type { Audit } from '../../api/types';
  import { session } from '../../stores/session';
  import { Pager } from '../../stores/pager';
  import { formatTime } from '../../utils/format';

  let query = $state('');
  let filter = $state<AccessFilter>(listFilter());
  let pending = $state<AccessFilter>(listFilter());
  let count = $state(0);
  let open = $state(false);
  let clearing = $state(false);
  const tracker = new RequestTracker();
  const pager = new Pager<Audit>((offset, limit) => api.searchAudits(session.token ?? '', offset, limit, filter));

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
      showToast({ message: `已清理 ${result.data.count} 条日志` });
      pager.page = 1;
      await pager.refresh();
    } finally { clearing = false; }
  };
</script>

<PageNavbar title="审计日志" />

<Grid min={480} gap={16}>
  <Row justify="space-between">
    <Text size="small">共 {pager.total} 条记录</Text>
  </Row>

  <Card aria-label="审计">
  {#snippet header()}
    <ListSearch bind:query label="搜索日志" placeholder="搜索操作者、对象或请求标识"
      states={false} disabled={pager.loading || clearing} onsearch={search} />
  {/snippet}
  {#snippet extra()}<Space wrap>
      {#if session.canWrite}<Button variant="plain" tone="danger" disabled={pager.loading || clearing || !pager.total} onclick={openClear}>清理日志</Button>{/if}
    <Button variant="plain" disabled={pager.loading || clearing} onclick={() => void pager.refresh()}>刷新</Button>
  </Space>{/snippet}
    {#if pager.items.length}
      <CellGroup
        items={pager.items.map((row) => ({
          key: String(row.id),
          title: `${actionText(row.action)} · ${formatId(row.target)}`,
          value: row.username,
          description: `${formatTime(row.created_at)}${row.request ? ` · ${formatId(row.request)}` : ''}`,
        }))}
      />
    {:else if pager.loading}
      <Skeleton rows={4} />
    {:else}
      <Empty imageSize={72} description="暂无记录" />
    {/if}
    {#snippet footer()}
      {#if pager.total > 0}
        <Row justify="end">
          <Space>
            <ButtonGroup
              label="分页"
              block
              variant="plain"
              disabled={pager.loading}
              items={[
                { key: 'prev', label: '上一页', disabled: pager.page <= 1 },
                {
                  key: 'page',
                  label: `${pager.page} / ${Math.max(1, Math.ceil(pager.total / pager.pageSize))}`,
                  disabled: true,
                },
                {
                  key: 'next',
                  label: '下一页',
                  disabled: pager.page * pager.pageSize >= pager.total,
                },
              ]}
              onaction={(item) => pager.goto(pager.page + (item.key === 'prev' ? -1 : 1))}
            />
          </Space>
        </Row>
      {/if}
    {/snippet}
  </Card>
</Grid>


<Dialog bind:open title="清理日志" beforeClose={() => !clearing}>
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
