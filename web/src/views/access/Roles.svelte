<script lang="ts">
  import { untrack } from 'svelte';
  import ListSearch from '../../components/ListSearch.svelte';
  import type { AccessFilter } from '../../api/types';
  import ListContent from '../../components/ListContent.svelte';
  import { Button, Card, Link, Pagination, Row, Space, Table, Tag } from '@luna/components';
  import type { TableCell, TableColumn } from '@luna/components/contracts';
  import { api, listFilter } from '../../api';
  import type { Role } from '../../api/types';
  import { session } from '../../stores/index.svelte';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';
  import { canEdit, isRoot, type RoleMode } from './roles';
  import RoleDialog from '../../components/RoleDialog.svelte';

  let query = $state('');
  let status = $state('');
  let filter = $state<AccessFilter>(listFilter());
  const pager = new Pager<Role>((offset, limit) => api.searchRoles(session.token ?? '', offset, limit, filter));
  let open = $state(false);
  let id = $state('');
  let mode = $state<RoleMode>('detail');

  $effect(() => {
    if (session.token) untrack(() => void pager.refresh());
  });
  const search = (): void => {
    filter = listFilter(query, status);
    pager.page = 1;
    void pager.refresh();
  };

  const show = (row: Role | null, action: RoleMode): void => {
    if (action !== 'detail' && !session.canWrite) return;
    if (action === 'edit' && !canEdit(row, session.principal?.root === true)) return;
    id = row?.id ?? '';
    mode = action;
    open = true;
  };
</script>

{#snippet stateCell(cell: TableCell<Role>)}<Tag tone={cell.row.enabled ? 'success' : 'info'}>
    {cell.row.enabled ? '已启用' : '已停用'}
  </Tag>{/snippet}
{#snippet typeCell(cell: TableCell<Role>)}<Tag tone={cell.row.system ? 'info' : 'neutral'}>
    {cell.row.system ? '系统角色' : '自定义角色'}
  </Tag>{/snippet}
{#snippet actionsCell(cell: TableCell<Role>)}
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
      <Link type="primary" underline="never" disabled={!canEdit(cell.row, session.principal?.root === true)} onclick={(event) => {
        event.stopPropagation();
        show(cell.row, 'edit');
      }}>编辑</Link>
    {/if}
  </Space>
{/snippet}

<Card fill aria-label="角色管理">
  {#snippet header()}
    <ListSearch bind:query bind:state={status} label="搜索角色" placeholder="搜索角色名称、代码或 ID"
      disabled={pager.loading} onsearch={search} />
  {/snippet}
  {#snippet extra()}<Space wrap size={10}>
      {#if session.canWrite}<Button tone="primary" onclick={() => show(null, 'create')}>
          新增角色
        </Button>{/if}
      <Button variant="plain" disabled={pager.loading} onclick={() => void pager.refresh()}>
        刷新
      </Button>
    </Space>{/snippet}
  <ListContent count={pager.items.length} loading={pager.loading} description={'暂无角色'}>
    <Table tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }} border
      data={pager.items}
      columns={[
        { key: 'name', label: '角色名称' },
        { key: 'code', label: '角色代码' },
        { key: 'enabled', label: '状态', cell: stateCell },
        { key: 'system', label: '类型', cell: typeCell },
        { key: 'permissions',
          label: '权限',
          formatter: (_: unknown, row: Role) =>
            isRoot(row) ? '全部权限' : `${row.permissions.length} 项`,
        },
        { fixed: 'right', key: 'actions', align: 'center', ellipsis: false, label: '操作', width: session.canWrite ? 140 : 80, cell: actionsCell },
      ] as unknown as TableColumn<Role>[]}
      rowKey="id"
      loading={pager.loading}
      emptyText="暂无角色"
      onrowclick={(detail) => show(detail.row, 'detail')}
    />
  </ListContent>
  {#snippet footer()}<Row justify="end">
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
    </Row>{/snippet}
</Card>

{#if open}<RoleDialog bind:open bind:mode {id} onsaved={() => void pager.refresh()} />{/if}
