<script lang="ts">
  import ListSearch from '../../components/ListSearch.svelte';
  import type { AccessFilter } from '../../api/types';
  import IdentityTag from '../../components/IdentityTag.svelte';
  import { formatId } from '../../utils/format';
  import ListContent from '../../components/ListContent.svelte';
  import { onDestroy, untrack } from 'svelte';
  import { Card, Button, Link, Pagination, Table, Tag, Space, Row } from '@luna/components';
  import type { TableCell, TableColumn } from '@luna/components/contracts';
  import { api, listFilter } from '../../api';
  import type { Account, Role } from '../../api/types';
  import { session } from '../../stores/index.svelte';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';
  import { formatTime, stateText } from '../../utils/format';
  import { fetchRoles, roleNames, type AccountMode } from './accounts';
  import AccountDialog from '../../components/AccountDialog.svelte';

  let query = $state('');
  let status = $state('');
  let filter = $state<AccessFilter>(listFilter());
  const pager = new Pager<Account>((offset, limit) =>
    api.searchAccounts(session.token ?? '', offset, limit, filter),
  );
  let roles = $state<Role[] | null>(null);
  let roleBusy = $state(true);
  let open = $state(false);
  let id = $state('');
  let mode = $state<AccountMode>('detail');

  let sequence = 0;
  let alive = true;

  $effect(() => {
    if (session.token) untrack(() => void pager.refresh());
  });
  const search = (): void => {
    filter = listFilter(query, status);
    pager.page = 1;
    void pager.refresh();
  };
  $effect(() => {
    const token = session.token;
    if (token) untrack(() => void loadRoles(token));
  });
  onDestroy(() => {
    alive = false;
    sequence++;
  });

  const loadRoles = async (token = session.token): Promise<void> => {
    if (!token) return;
    const current = ++sequence;
    roleBusy = true;
    const result = await fetchRoles(token);
    if (!alive || current !== sequence || token !== session.token) return;
    roles = result;
    roleBusy = false;
  };

  const show = (row: Account | null, action: AccountMode): void => {
    if (action !== 'detail' && !session.canWrite) return;
    id = row?.id ?? '';
    mode = action;
    open = true;
  };
</script>

{#snippet stateCell(cell: TableCell<Account>)}
  <Tag tone={cell.row.state === 'active' ? 'success' : 'info'}>{stateText(cell.row.state)}</Tag>
{/snippet}

{#snippet rootCell(cell: TableCell<Account>)}
<IdentityTag root={cell.row.root} />
{/snippet}

{#snippet actionsCell(cell: TableCell<Account>)}
  <Space size={12} wrap={false}>
    <Link type="primary" underline="never"
      onclick={(event) => {
        event.stopPropagation();
        show(cell.row, 'detail');
      }}
    >
      详情
    </Link>
    {#if session.canWrite}
      <Link type="primary" underline="never"
        onclick={(event) => {
          event.stopPropagation();
          show(cell.row, 'edit');
        }}
      >
        编辑
      </Link>
      <Link type="danger" underline="never"
        onclick={(event) => {
          event.stopPropagation();
          show(cell.row, 'delete');
        }}
      >
        删除
      </Link>
    {/if}
  </Space>
{/snippet}

<Card fill aria-label="管理列表">
  {#snippet header()}
    <ListSearch bind:query bind:state={status} label="搜索管理员" placeholder="搜索账号或管理员 ID"
      disabled={pager.loading} onsearch={search} />
  {/snippet}
  {#snippet extra()}
    <Space wrap size={10}>
      {#if session.canWrite}<Button tone="primary" onclick={() => show(null, 'create')}>
          新增管理员
        </Button>{/if}
      <Button variant="plain" disabled={pager.loading} onclick={() => void pager.refresh()}>
        刷新
      </Button>
    </Space>
  {/snippet}
  <ListContent count={pager.items.length} loading={pager.loading} description={'暂无管理员'}>
    <Table tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }} border
      data={pager.items}
      columns={[
        { key: 'username', label: '账号' },
        {
          key: 'roles',
          label: '角色名称',
          formatter: (_: unknown, row: Account) =>
            roleBusy ? '加载中…' : roleNames(row.roles, roles),
        },
        { key: 'state', label: '状态', cell: stateCell },
        { key: 'root', label: '身份', cell: rootCell },
        { key: 'id', label: '管理员 ID', formatter: formatId },
        { fixed: 'right', key: 'actions', align: 'center', ellipsis: false, label: '操作', width: session.canWrite ? 200 : 90, cell: actionsCell },
      ] as unknown as TableColumn<Account>[]}
      rowKey="id"
      loading={pager.loading}
      emptyText="暂无管理员"
      onrowclick={(detail) => show(detail.row, 'detail')}
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

{#if open}
  <AccountDialog bind:open bind:mode {id} {roles} onsaved={() => void pager.refresh()} />
{/if}
