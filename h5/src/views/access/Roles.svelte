<script lang="ts">
  import { untrack } from 'svelte';
  import ListSearch from '../../components/ListSearch.svelte';
  import type { AccessFilter } from '../../api/types';
  import {
    ActionSheet,
    Button,
    ButtonGroup,
    Card,
    Cell,
    CellGroup,
    Empty,
    Grid,
    Icon,
    Row,
    Skeleton,
    Space,
    Tag,
    Text,
  } from '@luna/components/h5';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import More from '@lucide/svelte/icons/ellipsis';
  import { api, listFilter } from '../../api';
  import type { Role } from '../../api/types';
  import { session } from '../../stores/session';
  import { Pager } from '../../stores/pager';
  import { canEdit, isRoot, type RoleMode } from './roles';
  import RoleDialog from '../../components/RoleDialog.svelte';

  let query = $state('');
  let status = $state('');
  let filter = $state<AccessFilter>(listFilter());
  const pager = new Pager<Role>((offset, limit) => api.searchRoles(session.token ?? '', offset, limit, filter));
  let open = $state(false);
  let id = $state('');
  let mode = $state<RoleMode>('detail');
  let actions = $state(false);
  let selected = $state<Role | null>(null);
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

<PageNavbar
  title="角色管理"
  rightText={session.canWrite ? '新增' : ''}
  onright={() => show(null, 'create')}
/>
<Grid min={480} gap={16}>
  <Row><Text size="small">共 {pager.total} 条角色</Text></Row>
  <Card aria-label="角色管理">
  {#snippet header()}
    <ListSearch bind:query bind:state={status} label="搜索角色" placeholder="搜索角色名称、代码或 ID"
      disabled={pager.loading} onsearch={search} />
  {/snippet}
    {#if pager.items.length}
      <CellGroup>
        {#each pager.items as row (row.id)}
          <Cell
            clickable
            description={`${row.code} · ${isRoot(row) ? '全部权限' : `${row.permissions.length} 项权限`}${row.system ? ' · 系统角色' : ''}`}
            onclick={() => show(row, 'detail')}
          >
            <Text truncated title={row.name}>{row.name}</Text>
            {#snippet trailing()}<Space size={8}>
                <Tag size="small" tone={row.enabled ? 'success' : 'neutral'}>
                  {row.enabled ? '已启用' : '已停用'}
                </Tag>
                {#if session.canWrite}<Button
                    variant="text"
                    size="sm"
                    aria-label={`角色操作 ${row.name}`}
                    onclick={(event) => {
                      event.stopPropagation();
                      selected = row;
                      actions = true;
                    }}
                    onkeydown={(event) => event.stopPropagation()}
                  >
                    <Icon icon={More} size={20} />
                  </Button>{/if}
              </Space>{/snippet}
          </Cell>
        {/each}
      </CellGroup>
    {:else if pager.loading}<Skeleton rows={4} />
    {:else}<Empty description="暂无角色" />{/if}
    {#snippet footer()}{#if pager.total > 0}<Row justify="end">
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
        </Row>{/if}{/snippet}
  </Card>
</Grid>

<ActionSheet
  bind:open={actions}
  layout="menu"
  ariaLabel="角色操作"
  options={[
    { value: 'detail', label: '查看详情' },
    { value: 'edit', label: '编辑', disabled: !session.canWrite || !canEdit(selected, session.principal?.root === true) },
  ]}
  onselect={(action) => {
    if (selected)
      show(
        selected,
        action === 'edit' ? 'edit' : 'detail',
      );
  }}
/>

{#if open}<RoleDialog bind:open bind:mode {id} onsaved={() => void pager.refresh()} />{/if}
