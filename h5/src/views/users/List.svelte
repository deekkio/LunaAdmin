<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ActionSheet,
    Avatar,
    Card,
    ButtonGroup,
    Button,
    CellGroup,
    Cell,
    Empty,
    Icon,
    Skeleton,
    Space,
    Tag,
    Text,
    Row,
    Grid,
    Input,
  } from '@luna/components/h5';
  import More from '@lucide/svelte/icons/ellipsis';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { api } from '../../api';
  import type { UserView } from '../../api/types';
  import { session } from '../../stores/session';
  import { Pager } from '../../stores/pager';
  import { formatQuota, stateText } from '../../utils/format';
  import UserDialog from '../../components/UserDialog.svelte';
  import OrderHistory from '../../components/OrderHistory.svelte';

  let open = $state(false);
  let actions = $state(false);
  let selected = $state<UserView | null>(null);
  let id = $state('');
  let mode = $state<'create' | 'edit' | 'detail' | 'delete'>('detail');
  let query = $state('');
  let term = $state('');
  let account = $state('');
  let username = $state('');
  let ordersOpen = $state(false);

  const pager = new Pager<UserView>((offset, limit) =>
    api.searchUsers(session.token ?? '', offset, limit, term),
  );

  onMount(() => { void pager.refresh(); });

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

  const show = (row: UserView | null, action: typeof mode): void => {
    if (action !== 'detail' && !session.canWrite) return;
    id = row?.profile.account ?? '';
    mode = action;
    open = true;
  };
</script>

<PageNavbar
  title="用户列表"
  rightText={session.canWrite ? '新增' : ''}
  onright={() => show(null, 'create')}
/>

<Grid min={480} gap={16}>
  <Row justify="space-between">
    <Text size="small">共 {pager.total} 位用户</Text>
  </Row>
  <Card aria-label="用户列表">
    {#snippet header()}
      <Space wrap>
        <Space width={240}>
          <Input bind:value={query} aria-label="搜索用户" placeholder="搜索用户名或用户 ID" clearable onclear={clearSearch}
            onkeydown={(event) => { if (event.key === 'Enter') search(); }} />
        </Space>
        <Button variant="plain" disabled={pager.loading} onclick={search}>搜索</Button>
      </Space>
    {/snippet}
    {#if pager.items.length}
      <CellGroup>
        {#each pager.items as row (row.profile.account)}
          <Cell
            description={formatQuota(row.profile.quota)}
            clickable
            onclick={() => openDetail(row)}
          >
            <Text truncated title={row.profile.email}>{row.profile.email}</Text>
            {#snippet leading()}<Avatar
                label={row.profile.email.slice(0, 1).toUpperCase()}
              />{/snippet}
            {#snippet trailing()}
              <Space size={8}>
                <Tag size="small" tone={row.profile.state === 'active' ? 'success' : 'neutral'}>
                  {stateText(row.profile.state)}
                </Tag>
                  <Button
                    variant="text"
                    size="sm"
                    aria-label={`用户操作 ${row.profile.email}`}
                    onclick={(event) => {
                      event.stopPropagation();
                      selected = row;
                      actions = true;
                    }}
                    onkeydown={(event) => event.stopPropagation()}
                  >
                    <Icon icon={More} size={20} />
                  </Button>
              </Space>
            {/snippet}
          </Cell>
        {/each}
      </CellGroup>
    {:else if pager.loading}
      <Skeleton avatar rows={5} />
    {:else}
      <Empty imageSize={72} description="暂无用户" />
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


<ActionSheet
  bind:open={actions}
  layout="menu"
  ariaLabel="用户操作"
  options={[
    { value: 'detail', label: '查看详情' },
    ...(session.canRead('order:read') ? [{ value: 'orders', label: '订单' }] : []),
    { value: 'edit', label: '编辑用户', disabled: !session.canWrite },
    { value: 'delete', label: '删除用户', danger: true, disabled: !session.canWrite },
  ]}
  onselect={(action) => {
    if (selected && action === 'orders') related(selected);
    else if (selected)
      show(selected, action === 'delete' ? 'delete' : action === 'edit' ? 'edit' : 'detail');
  }}
/>

{#if open}
  <UserDialog bind:open {id} {mode} onsaved={() => void pager.refresh()} />
{/if}
{#if ordersOpen}<OrderHistory bind:open={ordersOpen} {account} {username} onsaved={() => void pager.refresh()} />{/if}
