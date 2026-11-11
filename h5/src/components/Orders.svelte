<script lang="ts">
  import ListContent from './ListContent.svelte';
  import { onMount } from 'svelte';
  import { Button, Card, Input, Pagination, Row, Space, Table, Tag } from '@luna/components';
  import { ButtonGroup, CellGroup, Empty, Skeleton } from '@luna/components/h5';
  import type { TableCell, TableColumn } from '@luna/components/contracts';
  import { api } from '../api';
  import type { Order } from '../api/types';
  import { session } from '../stores/session';
  import { PAGE_SIZES, Pager } from '../stores/pager';
  import { formatMoney, orderStateText } from '../utils/format';
  import OrderDialog from './OrderDialog.svelte';
  import OrderEditor from './OrderEditor.svelte';

  let { account = null, initialId = '', mobile = false, onsaved }: {
    account?: string | null; initialId?: string; mobile?: boolean; onsaved?: () => void;
  } = $props();
  let query = $state('');
  let term = $state('');
  let open = $state(false);
  let id = $state('');
  let username = $state('');
  let editing = $state<Order | null>(null);
  let editorOpen = $state(false);
  const pager = new Pager<Order>((offset, limit) =>
    api.searchOrders(session.token ?? '', offset, limit, term, account),
  );
  const search = (): void => {
    term = query.trim();
    pager.page = 1;
    void pager.refresh();
  };
  const clearSearch = (): void => { query = ''; search(); };
  const show = (row: Order): void => {
    id = row.id;
    username = row.username ?? '';
    open = true;
  };
  onMount(() => {
    void pager.refresh();
    if (initialId) { id = initialId; open = true; }
  });
</script>

{#snippet stateCell(cell: TableCell<Order>)}
  <Tag tone={cell.row.state === 'paid' ? 'success' : cell.row.state === 'pending' ? 'warning' : 'info'}>
    {orderStateText(cell.row.state)}
  </Tag>
{/snippet}
{#snippet actionsCell(cell: TableCell<Order>)}
  <Button variant="text" size="sm" type="button" onclick={() => show(cell.row)}>详情</Button>
  {#if cell.row.state === 'paid' && session.canWrite && session.canRead('order:write')}
    <Button variant="text" size="sm" type="button" onclick={() => { editing = cell.row; editorOpen = true; }}>编辑</Button>
  {/if}
{/snippet}

{#if mobile}
  <div class="m-page">
    <div class="m-toolbar">
      <Input
        bind:value={query}
        aria-label="搜索订单"
        placeholder="搜索用户名、订单号、套餐或流水号"
        clearable
        onclear={clearSearch}
        onkeydown={(event) => { if (event.key === 'Enter') search(); }}
      />
      <Button variant="plain" type="button" disabled={pager.loading} onclick={search}>搜索</Button>
      <Button variant="plain" type="button" disabled={pager.loading} onclick={() => void pager.refresh()}>刷新</Button>
    </div>
    <div class="m-list">
      {#if pager.items.length}
        <CellGroup items={pager.items.map(row => ({
          key: row.id, title: row.username ?? '-', value: orderStateText(row.state),
          description: `${row.name} · ${formatMoney(row.price_minor, row.currency)}`,
          arrow: true, clickable: true,
        }))} onselect={(item) => { const row = pager.items.find(row => row.id === item.key); if (row) show(row); }} />
      {:else if pager.loading}
        <Skeleton rows={4} />
      {:else}
        <Empty imageSize={72} description="暂无订单" />
      {/if}
    </div>
    <div class="m-pager">
      <ButtonGroup
        label="分页"
        block
        variant="plain"
        disabled={pager.loading}
        items={[
          { key: 'prev', label: '上一页', disabled: pager.page <= 1 },
          { key: 'page', label: `${pager.page} / ${Math.max(1, Math.ceil(pager.total / pager.pageSize))}`, disabled: true },
          { key: 'next', label: '下一页', disabled: pager.page * pager.pageSize >= pager.total },
        ]}
        onaction={(item) => pager.goto(pager.page + (item.key === 'prev' ? -1 : 1))}
      />
    </div>
  </div>
{:else}
  <Card class="content-card" aria-label={account ? '历史订单' : '订单列表'}>
    {#snippet header()}
      <Space wrap>
        <Space width={240}>
          <Input bind:value={query} aria-label="搜索订单" placeholder="搜索用户名、订单号、套餐或流水号"
            clearable onclear={clearSearch} onkeydown={(event) => { if (event.key === 'Enter') search(); }} />
        </Space>
        <Button variant="plain" type="button" disabled={pager.loading} onclick={search}>搜索</Button>
      </Space>
    {/snippet}
    {#snippet extra()}
      <Button variant="plain" type="button" disabled={pager.loading} onclick={() => void pager.refresh()}>刷新</Button>
    {/snippet}
    <ListContent count={pager.items.length} loading={pager.loading} description={'暂无订单'}>
      <Table data={pager.items} rowKey="id" loading={pager.loading} emptyText="暂无订单" ariaLabel="订单列表"
        columns={[
          { key: 'username', label: '用户名', minWidth: 200 },
          { key: 'name', label: '套餐', minWidth: 140 },
          { key: 'price_minor', label: '订单金额', minWidth: 110, formatter: (_: unknown, row: Order) => formatMoney(row.price_minor, row.currency) },
          { key: 'state', label: '支付状态', width: 100, cell: stateCell },
          { key: 'actions', label: '操作', width: 140, fixed: 'right', ellipsis: false, cell: actionsCell },
        ] as TableColumn<Order>[]} />
    </ListContent>
    {#snippet footer()}
      <Row justify="end">
        <Space>
          <Pagination total={pager.total} currentPage={pager.page} pageSize={pager.pageSize} pageSizes={PAGE_SIZES}
            background showTotal showSizes showJumper disabled={pager.loading}
            onchange={(page) => pager.goto(page)} onsizechange={(size) => pager.resize(size)} />
          <Button variant="plain" type="button" disabled={pager.loading} onclick={() => void pager.refresh()}>刷新</Button>
        </Space>
      </Row>
    {/snippet}
  </Card>
{/if}

{#if open}<OrderDialog bind:open {id} {username} onsaved={() => { void pager.refresh(); onsaved?.(); }} />{/if}

{#if editorOpen && editing}<OrderEditor bind:open={editorOpen} order={editing} onsaved={() => { void pager.refresh(); onsaved?.(); }} />{/if}

<style>
  .m-page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .m-toolbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .m-toolbar :global(.ln-input) {
    flex: 1;
    min-width: 0;
  }
  .m-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .m-pager {
    flex: none;
  }
</style>
