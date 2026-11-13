<script lang="ts">
  import { untrack } from 'svelte';
  import { Link, Pagination, Popconfirm, Table } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import type { TableCell, TableColumn } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import type { UserDevice } from '../../api/types';
  import { session } from '../../stores/state.svelte';
  import { formatTime } from '../../utils';

  let { open = $bindable(false), account, username }: {
    open?: boolean; account: string; username: string;
  } = $props();
  let items = $state<UserDevice[]>([]);
  let total = $state<number | null>(null);
  let page = $state(1);
  let size = $state(10);
  let loading = $state(false);
  let failed = $state(false);
  let deleting = $state(false);
  const tracker = new RequestTracker();
  let sequence = 0;
  let control: AbortController | null = null;

  const load = async (index: number): Promise<void> => {
    const token = session.token;
    const id = account;
    if (!open || !token || !session.canRead('user:read')) return;
    const current = ++sequence;
    control?.abort();
    const request = new AbortController();
    control = request;
    const valid = (): boolean => current === sequence && open && account === id && session.token === token;
    page = index;
    loading = true;
    failed = false;
    try {
      const response = await api.devices(token, id, (index - 1) * size, size, request.signal);
      if (!valid()) return;
      if (response.code || !response.data) {
        items = [];
        total = null;
        failed = true;
        if (response.code !== 'unauthenticated')
          showMessage({ message: response.message || '设备列表加载失败', type: 'error' });
        return;
      }
      items = response.data.items;
      total = response.data.total;
    } finally {
      if (valid()) loading = false;
    }
  };

  const remove = async (row: UserDevice): Promise<void> => {
    const token = session.token;
    const id = account;
    if (!open || !token || deleting || !session.canRead('user:write')) return;
    deleting = true;
    try {
      const response = await api.deleteDevice(token, id, {
        version: 1, request: tracker.id({ account: id, device: row.id }), device: row.id,
      });
      if (!open || account !== id || session.token !== token) return;
      if (response.code) {
        if (response.code !== 'unauthenticated')
          showMessage({ message: response.message || '设备下线失败', type: 'error' });
        return;
      }
      tracker.reset();
      await load(items.length === 1 && page > 1 ? page - 1 : page);
    } finally { deleting = false; }
  };

  $effect(() => {
    const token = session.token;
    const id = account;
    if (open && token && id && session.canRead('user:read')) {
      untrack(() => {
        items = [];
        total = null;
        void load(1);
      });
    } else {
      items = [];
      total = null;
      loading = false;
    }
    return () => { sequence++; control?.abort(); control = null; };
  });
</script>

{#snippet actionsCell(cell: TableCell<UserDevice>)}
  <Popconfirm title="确认下线此设备？" description="将移除此设备并撤销连接授权，已有连接可能需要短暂时间断开。"
    confirmText="下线" cancelText="取消" confirmTone="danger" disabled={loading || deleting}
    onconfirm={() => void remove(cell.row)}>
    {#snippet reference(state)}
      <Link type="danger" underline="never" disabled={state.disabled} aria-haspopup={state.haspopup}
        aria-expanded={state.expanded} aria-controls={state.open ? state.controls : undefined}>下线</Link>
    {/snippet}
  </Popconfirm>
{/snippet}

<Dialog bind:open title={`设备 - ${username}`} width={640} height={520}
  bodyStyle="display: flex; flex-direction: column; gap: 16px; overflow: hidden;">
  <div class="devices">
    <Table border tableLayout="fixed" showOverflowTooltip
      cellStyle={{ whiteSpace: 'nowrap' }}
      data={items} rowKey="id" {loading} emptyText={failed ? '设备列表加载失败' : '暂无设备'} ariaLabel="用户设备列表"
      columns={[
        { key: 'id', label: '设备 ID', width: 120 },
        { key: 'model', label: '设备名称 / 型号', minWidth: 136, formatter: (_: unknown, row: UserDevice) => row.model?.trim() || '—' },
        { key: 'state', label: '状态', width: 80, formatter: (_: unknown, row: UserDevice) => row.state === 'disabled' ? '已停用' : row.expires_at * 1000 <= Date.now() ? '已过期' : '有效' },
        { key: 'last_seen', label: '最近上线', minWidth: 176, formatter: (_: unknown, row: UserDevice) => row.last_seen ? formatTime(row.last_seen) : '—' },
        ...(session.canRead('user:write') ? [{ key: 'actions', label: '操作', width: 64, fixed: 'right', showOverflowTooltip: false, cell: actionsCell }] : []),
      ] as TableColumn<UserDevice>[]}
    />
  </div>
  <Pagination total={total ?? 0} currentPage={page} pageSize={size} pageSizes={[10, 20, 50, 100]}
    style="flex: 0 0 auto; width: max-content; max-width: 100%; align-self: flex-end;"
    background showTotal showSizes showJumper disabled={loading || total === null}
    onchange={(index) => void load(index)}
    onsizechange={(value) => { size = value; void load(1); }} />
</Dialog>

<style>
  .devices {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }
</style>
