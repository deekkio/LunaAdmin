<script lang="ts">
  import ListSearch from '../../components/ListSearch.svelte';
  import type { AccessFilter } from '../../api/types';
  import IdentityTag from '../../components/IdentityTag.svelte';
  import { onDestroy, untrack } from 'svelte';
  import {
    ActionSheet,
    Empty,
    Skeleton,
    Text,
    Card,
    ButtonGroup,
    Button,
    CellGroup,
    Cell,
    Space,
    Row,
    Grid,
    Tag,
    Icon,
  } from '@luna/components/h5';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import More from '@lucide/svelte/icons/ellipsis';
  import { api, listFilter } from '../../api';
  import type { Account, Role } from '../../api/types';
  import { session } from '../../stores/session';
  import { Pager } from '../../stores/pager';
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
  let actions = $state(false);
  let selected = $state<Account | null>(null);
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

<PageNavbar
  title="管理列表"
  rightText={session.canWrite ? '新增' : ''}
  onright={() => show(null, 'create')}
/>
<div class="page">
<Grid min={480} gap={16}>
  <Row><Text size="small">共 {pager.total} 条管理员</Text></Row>
  <Card aria-label="管理列表">
  {#snippet header()}
    <ListSearch bind:query bind:state={status} label="搜索管理员" placeholder="搜索账号或管理员 ID"
      disabled={pager.loading} onsearch={search} />
  {/snippet}
    {#if pager.items.length}
      <CellGroup>
        {#each pager.items as row (row.id)}
          <Cell
            description={`${roleBusy ? '角色名称加载中' : roleNames(row.roles, roles)} · 创建于 ${formatTime(row.created_at)}`}
            clickable
            onclick={() => show(row, 'detail')}
          >
            <Text truncated title={row.username}>{row.username}</Text>
            {#snippet trailing()}
              <Space size={8}>
                <IdentityTag root={row.root} />
                <Tag size="small" tone={row.state === 'active' ? 'success' : 'neutral'}>
                  {stateText(row.state)}
                </Tag>
                {#if session.canWrite}
                  <Button
                    variant="text"
                    size="sm"
                    aria-label={`管理员操作 ${row.username}`}
                    onclick={(event) => {
                      event.stopPropagation();
                      selected = row;
                      actions = true;
                    }}
                    onkeydown={(event) => event.stopPropagation()}
                  >
                    <Icon icon={More} size={20} />
                  </Button>
                {/if}
              </Space>
            {/snippet}
          </Cell>
        {/each}
      </CellGroup>
    {:else if pager.loading}<Skeleton rows={4} />
    {:else}
      <Empty description="暂无管理员" />
    {/if}
    {#snippet footer()}
      {#if pager.total > 0}
        <Row justify="end">
          <ButtonGroup
            label="分页"
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
        </Row>
      {/if}
    {/snippet}
  </Card>
</Grid>
</div>

<ActionSheet
  bind:open={actions}
  layout="menu"
  ariaLabel="管理员操作"
  options={[
    { value: 'detail', label: '查看详情' },
    { value: 'edit', label: '编辑管理员', disabled: !session.canWrite },
    { value: 'delete', label: '删除管理员', danger: true, disabled: !session.canWrite },
  ]}
  onselect={(action) => {
    if (selected)
      show(selected, action === 'delete' ? 'delete' : action === 'edit' ? 'edit' : 'detail');
  }}
/>

{#if open}
  <AccountDialog bind:open bind:mode {id} {roles} onsaved={() => void pager.refresh()} />
{/if}

<style>
  .page {
  height: calc(100dvh - 95px);
  display: flex;
  flex-direction: column;
  padding: 12px 14px 0;
}
.page :global(.ln-grid) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.page :global(.ln-card) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.page :global(.ln-card__body) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.page :global(.ln-card__head),
.page :global(.ln-card__footer) {
  flex: none;
}
</style>
