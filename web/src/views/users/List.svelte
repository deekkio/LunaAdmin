<script lang="ts">
  import { formatId, formatTraffic, formatTime, stateText } from '../../utils';
  import ListContent from '../../components/ListContent.svelte';
  import { onMount } from 'svelte';
  import { Card, Button, Input, Link, Pagination, Popconfirm, Table, Tag, Space, Row } from '@luna/components';
  import type { TableCell, TableColumn } from '@luna/components/contracts';
  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import { showMessage } from '@luna/components/message';
  import type { UserView } from '../../api/types';
  import { session } from '../../stores/state.svelte';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';
  import UserDetail from './Detail.svelte';
  import Devices from './Devices.svelte';
  import Dialog from '../../components/Dialog.svelte';
  import Orders from '../orders/List.svelte';

  let open = $state(false);
  let id = $state('');
  let mode = $state<'create' | 'edit' | 'detail'>('detail');
  let query = $state('');
  let term = $state('');
  let account = $state('');
  let username = $state('');
  let ordersOpen = $state(false);
  let devicesOpen = $state(false);
  let deleting = $state(false);
  let alive = true;
  const tracker = new RequestTracker();

  const pager = new Pager<UserView>((offset, limit) =>
    api.searchUsers(session.token ?? '', offset, limit, term),
  );

  onMount(() => {
    void pager.refresh();
    return () => { alive = false; tracker.reset(); };
  });

  const remove = async (row: UserView): Promise<void> => {
    const token = session.token;
    if (!token || deleting || !session.canWrite) return;
    const account = row.profile.account;
    deleting = true;
    try {
      const response = await api.deleteUser(token, account, {
        version: 1, request: tracker.id({ account }),
      });
      if (!alive || response.code || session.token !== token) return;
      tracker.reset();
      showMessage({ message: '用户已删除', type: 'success' });
      await pager.refresh();
    } finally { deleting = false; }
  };

  const openDetail = (row: UserView): void => {
    show(row, 'detail');
  };

  const search = (): void => { term = query.trim(); pager.page = 1; void pager.refresh(); };
  const clearSearch = (): void => { query = ''; search(); };
  const related = (row: UserView): void => {
    account = row.profile.account;
    username = row.profile.email;
    ordersOpen = true;
  };

  const showDevices = (row: UserView): void => {
    if (!session.canRead('user:read')) return;
    account = row.profile.account;
    username = row.profile.email;
    devicesOpen = true;
  };

  const show = (row: UserView | null, action: typeof mode): void => {
    if (action !== 'detail' && !session.canWrite) return;
    id = row?.profile.account ?? '';
    mode = action;
    open = true;
  };
</script>

{#snippet stateCell(cell: TableCell<UserView>)}
  <Tag tone={cell.row.profile.state === 'active' ? 'success' : 'info'}>
    {stateText(cell.row.profile.state)}
  </Tag>
{/snippet}

{#snippet actionsCell(cell: TableCell<UserView>)}
  <Space size={12} wrap={false}>
  <Link type="primary" underline="never" onclick={() => openDetail(cell.row)}>详情</Link>
  {#if session.canRead('user:read')}
    <Link type="primary" underline="never" onclick={() => showDevices(cell.row)}>设备</Link>
  {/if}
  {#if session.canRead('order:read')}
    <Link type="primary" underline="never" onclick={() => related(cell.row)}>订单</Link>
  {/if}
  {#if session.canWrite}
    <Link type="primary" underline="never" onclick={() => show(cell.row, 'edit')}>
      编辑
    </Link>
    <Popconfirm title="确认删除用户？" description="删除后无法登录或建立新连接；订单、订阅和审计记录保留。"
      confirmText="删除" cancelText="取消" confirmTone="danger" disabled={deleting}
      onconfirm={() => void remove(cell.row)}>
      {#snippet reference(state)}
        <Link type="danger" underline="never" disabled={state.disabled} aria-haspopup={state.haspopup}
          aria-expanded={state.expanded} aria-controls={state.open ? state.controls : undefined}>删除</Link>
      {/snippet}
    </Popconfirm>
  {/if}
  </Space>
{/snippet}

<Card fill class="content-card" aria-label="用户">
  {#snippet header()}
    <Space wrap>
      <Space width={240}>
        <Input bind:value={query} aria-label="搜索用户" placeholder="搜索用户名或用户 ID" clearable
          onclear={clearSearch} onkeydown={(event) => { if (event.key === 'Enter') search(); }} />
      </Space>
      <Button variant="plain" type="button" disabled={pager.loading} onclick={search}>搜索</Button>
    </Space>
  {/snippet}
  {#snippet extra()}
    <Space wrap size={10}>
      {#if session.canWrite}<Button
          tone="primary"
          type="button"
          onclick={() => show(null, 'create')}
        >
          新增用户
        </Button>{/if}
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

  <ListContent count={pager.items.length} loading={pager.loading} description={'暂无用户'}>
    <Table tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }} border
      data={pager.items}
      columns={[
        { key: 'email',
          label: '邮箱',
          minWidth: 200,
          formatter: (_: unknown, row: UserView) => row.profile.email,
        },
        {
          key: 'account',
          label: '账户 ID',
          width: 160,
          className: 'user-account',
          ellipsis: true,
          showOverflowTooltip: true,
          formatter: (_: unknown, row: UserView) => formatId(row.profile.account),
        },
        { key: 'state', label: '状态', width: 100, cell: stateCell },
        { key: 'quota',
          label: '流量用量',
          formatter: (_: unknown, row: UserView) => row.profile.quota
            ? `${formatTraffic(row.profile.quota.used_bytes)} / ${formatTraffic(row.profile.quota.limit_bytes)}`
            : '-',
        },
        { key: 'expires_at',
          label: '服务到期',
          width: 130,
          formatter: (_: unknown, row: UserView) => formatTime(row.profile.expires_at),
        },
        {
          key: 'actions', align: 'center', ellipsis: false,
          label: '操作',
          width: session.canWrite ? 300 : session.canRead('order:read') ? 200 : 140,
          fixed: 'right',
          cell: actionsCell,
        },
      ] as unknown as TableColumn<UserView>[]}
      rowKey={(row) => row.profile.account}
      loading={pager.loading}
      emptyText="暂无用户"
      ariaLabel="用户列表"
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
  <UserDetail modal bind:open {id} {mode} onsaved={() => void pager.refresh()} />
{/if}
{#if ordersOpen}
  <Dialog bind:open={ordersOpen} title={`订单 - ${username}`} width={1080}>
    <Orders {account} onsaved={() => void pager.refresh()} />
    {#snippet footer()}<Button variant="plain" type="button" onclick={() => (ordersOpen = false)}>关闭</Button>{/snippet}
  </Dialog>
{/if}
{#if devicesOpen}<Devices bind:open={devicesOpen} {account} {username} />{/if}

<style>
  :global(.ln-table__cell.user-account) {
    max-width: 160px;
  }
</style>
