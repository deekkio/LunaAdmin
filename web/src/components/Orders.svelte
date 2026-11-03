<script lang="ts">
  import ListContent from './ListContent.svelte';
  import { onMount } from 'svelte';
  import { Button, Card, Input, Link, Select, Pagination, Popconfirm, Row, Space, Table, Tag } from '@luna/components';
  import { CellGroup, Empty, Skeleton } from '@luna/components/h5';
  import type { TableCell, TableColumn } from '@luna/components/contracts';
  import { api } from '../api';
  import type { Order, OrderFilter } from '../api/types';
  import { session } from '../stores/index.svelte';
  import { PAGE_SIZES, Pager } from './list.svelte';
  import { formatMoney } from '../utils/format';
  import { orderStateText } from '../views/orders/model';
  import OrderDialog from './OrderDialog.svelte';
  import OrderEditor from './OrderEditor.svelte';
  import { RequestTracker } from '../api/request';
  import { showMessage } from '@luna/components/message';
  import Purchase from './Purchase.svelte';

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
  let creating = $state(false);
  let filter = $state<OrderFilter | ''>('');
  let deleting = $state(false);
  let status = $state<OrderFilter | null>(null);
  const tracker = new RequestTracker();
  const labels = { paid: '已支付', pending: '未支付', expired: '已过期', deleted: '已删除' };
  const remove = async (row: Order): Promise<void> => {
    const token = session.token;
    if (!token || row.status === 'deleted' || deleting || !session.canWrite || !session.canRead('order:write')) return;
    deleting = true;
    try {
      const input = { version: 1, request: tracker.id({ order: row.id }) };
      const result = await api.deleteOrder(token, row.id, input);
      if (result.code || session.token !== token) return;
      tracker.reset();
      showMessage({ message: '订单已删除', type: 'success' });
      await pager.refresh(); onsaved?.();
    } finally { deleting = false; }
  };
  const pager = new Pager<Order>((offset, limit) =>
    api.searchOrders(session.token ?? '', offset, limit, term, account, filter || null),
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
    status = row.status ?? null;
    open = true;
  };
  onMount(() => {
    void pager.refresh();
    if (initialId) { id = initialId; open = true; }
  });
</script>

{#snippet stateCell(cell: TableCell<Order>)}
  <Tag tone={cell.row.status === 'deleted' || cell.row.status === 'expired' ? 'info' : cell.row.state === 'paid' ? 'success' : 'warning'}>
    {cell.row.status ? labels[cell.row.status] : orderStateText(cell.row.state)}
  </Tag>
{/snippet}
{#snippet actionsCell(cell: TableCell<Order>)}
  <Space size={12} wrap={false}>
  <Link type="primary" underline="never" onclick={() => show(cell.row)}>详情</Link>
  {#if cell.row.state === 'paid' && session.canWrite && session.canRead('order:write')}
    <Link type="primary" underline="never" disabled={cell.row.status === 'deleted'} onclick={() => { editing = cell.row; editorOpen = true; }}>编辑</Link>
  {/if}
  {#if account && session.canWrite && session.canRead('order:write')}
    <Popconfirm title="确认删除订单？" description="删除后将撤销该订单的剩余套餐额度，保留已用流量和结算记录。"
      confirmText="删除" cancelText="取消" confirmTone="danger" disabled={deleting || cell.row.status === 'deleted'}
      onconfirm={() => void remove(cell.row)}>
      {#snippet reference(state)}
        <Link type="danger" underline="never" disabled={state.disabled} aria-haspopup={state.haspopup}
          aria-expanded={state.expanded} aria-controls={state.open ? state.controls : undefined}>删除</Link>
      {/snippet}
    </Popconfirm>
  {/if}
  </Space>
{/snippet}

<Card fill={!account} class="content-card" aria-label={account ? '历史订单' : '订单列表'}>
  {#snippet header()}
    <Space wrap width={account ? 'min(494px, 100%)' : 'min(310px, 100%)'}>
      <Space width={240}>
        <Input bind:value={query} aria-label="搜索订单" placeholder="搜索用户名、订单号、套餐或流水号"
          clearable onclear={clearSearch} onkeydown={(event) => { if (event.key === 'Enter') search(); }} />
      </Space>
      {#if account}
        <Space width={176}>
          <Select bind:value={filter} placeholder="订单状态" clearable
            options={Object.entries(labels).map(([value, label]) => ({ value, label }))}
            onchange={() => { pager.page = 1; void pager.refresh(); }} />
        </Space>
      {/if}
      <Button variant="plain" type="button" disabled={pager.loading} onclick={search}>搜索</Button>
    </Space>
  {/snippet}
  {#snippet extra()}
    <Space wrap={false}>
      {#if account && session.canWrite && session.canRead('order:write') && session.canRead('plan:read')}
        <Button tone="primary" type="button" onclick={() => (creating = true)}>新增</Button>
      {/if}
      <Button variant="plain" type="button" disabled={pager.loading} onclick={() => void pager.refresh()}>刷新</Button>
    </Space>
  {/snippet}
  {#if mobile}
    {#if pager.items.length}
      <CellGroup items={pager.items.map(row => ({
        key: row.id, title: row.username ?? '-', value: orderStateText(row.state),
        description: `${row.name} · ${formatMoney(row.price_minor, row.currency)}`,
        arrow: true, clickable: true,
      }))} onselect={(item) => { const row = pager.items.find(row => row.id === item.key); if (row) show(row); }} />
    {:else if pager.loading}<Skeleton rows={4} />
    {:else}<Empty imageSize={72} description="暂无订单" />{/if}
  {:else}
    <ListContent count={pager.items.length} loading={pager.loading} description={'暂无订单'}>
      <Table border tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }} data={pager.items} rowKey="id" loading={pager.loading} emptyText="暂无订单" ariaLabel="订单列表"
        columns={[
          { key: 'username', label: '用户名', minWidth: account ? 96 : 200 },
          { key: 'kind', label: '类型', width: account ? undefined : 88, minWidth: account ? 64 : undefined, formatter: (_, row: Order) => row.kind === 'gift' ? '赠送' : '充值' },
          { key: 'name', label: '套餐', minWidth: account ? 100 : 140 },
          { key: 'price_minor', label: '订单金额', minWidth: account ? 96 : 110, formatter: (_: unknown, row: Order) => formatMoney(row.price_minor, row.currency) },
          { key: 'state', label: '支付状态', width: account ? undefined : 100, minWidth: account ? 88 : undefined, cell: stateCell },
          { key: 'actions', align: 'center', ellipsis: false, label: '操作', width: account ? 180 : 140, fixed: 'right', cell: actionsCell },
        ] as TableColumn<Order>[]} />
    </ListContent>
  {/if}
  {#snippet footer()}
    <Row justify="end">
      <Space>
        <Pagination total={pager.total} currentPage={pager.page} pageSize={pager.pageSize} pageSizes={PAGE_SIZES}
          background showTotal showSizes showJumper disabled={pager.loading}
          onchange={(page) => pager.goto(page)} onsizechange={(size) => pager.resize(size)} />
      </Space>
    </Row>
  {/snippet}
</Card>

{#if open}<OrderDialog bind:open {id} {username} {status} onsaved={() => { void pager.refresh(); onsaved?.(); }} />{/if}

{#if editorOpen && editing}<OrderEditor bind:open={editorOpen} order={editing} onsaved={() => { void pager.refresh(); onsaved?.(); }} />{/if}

{#if creating && account}<Purchase bind:open={creating} {account} onsaved={() => { void pager.refresh(); onsaved?.(); }} />{/if}

