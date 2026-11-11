<script lang="ts">
  import { untrack } from 'svelte';
  import ListSearch from '../../components/ListSearch.svelte';
  import type { AccessFilter } from '../../api/types';
  import {
    Empty,
    Skeleton,
    Card,
    ButtonGroup,
    CellGroup,
    Text,
    Space,
    Row,
    Grid,
    Button,
  } from '@luna/components/h5';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { api, listFilter } from '../../api';
  import type { Permission } from '../../api/types';
  import { session } from '../../stores/session';
  import { Pager } from '../../stores/pager';

  let query = $state('');
  let status = $state('');
  let filter = $state<AccessFilter>(listFilter());
  const pager = new Pager<Permission>((offset, limit) =>
    api.searchPerms(session.token ?? '', offset, limit, filter)
  );

  $effect(() => {
    if (session.token) untrack(() => void pager.refresh());
  });
  const search = (): void => {
    filter = listFilter(query, status);
    pager.page = 1;
    void pager.refresh();
  };
</script>

<PageNavbar title="权限管理" />

<div class="page">
<Grid min={480} gap={16}>
  <Row justify="space-between">
    <Text size="small">共 {pager.total} 条权限</Text>
  </Row>

  <Card aria-label="权限">
  {#snippet header()}
    <ListSearch bind:query bind:state={status} label="搜索权限" placeholder="搜索权限名称或权限码"
      disabled={pager.loading} onsearch={search} />
  {/snippet}
    {#if pager.items.length}
      <CellGroup
        items={pager.items.map((row) => ({
          key: row.code,
          title: row.name,
          value: row.enabled ? '已启用' : '已停用',
          description: `${row.code}${row.system ? ' · 系统' : ''}`,
        }))}
      />

      <Text tag="p" size="small">权限的创建与修改请在 PC 控制台完成。</Text>
    {:else if pager.loading}
      <Skeleton rows={4} />
    {:else}
      <Empty imageSize={72} description="暂无权限" />
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
</div>

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
