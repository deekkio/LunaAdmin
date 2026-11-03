<script lang="ts">
  import { Tree, Icon, Tag, Space } from '@luna/components';
  import { Button, Card, Empty, Input, Picker, Skeleton, Text, Grid } from '@luna/components/h5';
  import { api } from '../../api';
  import type { NavMenu } from '../../api/types';
  import { session } from '../../stores/session';
  import { filterMenus, menuRows, viewLabel } from './menus';
  import { menuIcon } from '../../layouts/icons';
  import PageNavbar from '../../components/PageNavbar.svelte';

  let items = $state<NavMenu[]>([]);
  let loading = $state(false);
  let loaded = $state(false);
  let sequence = 0;
  let query = $state('');
  let term = $state('');
  let filter = $state('all');
  let status = $state('all');
  let keys = $state<(string | number)[]>([]);
  const visible = $derived(filterMenus(items, term, status));
  const rows = $derived(menuRows(visible));
  const branches = $derived(rows.filter(item => item.children.length).map(item => item.id));
  const allOpen = $derived(branches.length > 0 && branches.every(key => keys.includes(key)));
  $effect(() => {
    void load();
  });

  const load = async (): Promise<void> => {
    const current = ++sequence;
    loading = true;
    const result = await api.menus(session.token ?? '');
    if (current !== sequence) return;
    if (!result.code && result.data) items = result.data;
    keys = [];
    loaded = true;
    loading = false;
  };

  const search = (): void => {
    term = query.trim(); status = filter;
    keys = term || status !== 'all' ? menuRows(filterMenus(items, term, status)).filter(item => item.children.length).map(item => item.id) : [];
  };
</script>

<PageNavbar title="路由菜单" back />

<Grid min={480} gap={16}>
  <Card aria-label="路由菜单">
    {#snippet header()}
      <Space wrap>
        <Space width={240}>
          <Input bind:value={query} aria-label="搜索菜单" placeholder="搜索菜单名称、代码或路径" clearable
            onclear={search} onkeydown={(event) => { if (event.key === 'Enter') search(); }} />
        </Space>
        <Space width={176}>
          <Picker bind:value={filter} title="菜单状态" aria-label="筛选菜单状态" options={[
            { value: 'all', label: '全部状态' }, { value: 'active', label: '已启用' }, { value: 'disabled', label: '已停用' },
          ]} onchange={search} />
        </Space>
        <Button variant="plain" disabled={loading} onclick={search}>搜索</Button>
      </Space>
    {/snippet}
    {#snippet extra()}
      <Space wrap>
        <Button variant="plain" disabled={loading || !branches.length} onclick={() => (keys = allOpen ? [] : [...branches])}>
          {allOpen ? '折叠全部' : '展开全部'}
        </Button>
        <Button variant="plain" disabled={loading} onclick={() => void load()}>刷新</Button>
      </Space>
    {/snippet}
  {#if rows.length}
    <Tree data={visible} labelKey="title" bind:expandedKeys={keys} estimateSize={64}
      selectable={false} ariaLabel="路由菜单">
      {#snippet node(entry)}
        <Space direction="vertical" alignment="stretch" size={4}>
          <Space>
            <Icon icon={menuIcon(entry.raw.icon, entry.raw.children.length > 0)} size={18} />
            <Text>{entry.raw.title}</Text>
            <Tag tone={entry.raw.enabled ? 'success' : 'info'}>{entry.raw.enabled ? '已启用' : '已停用'}</Tag>
          </Space>
          <Text size="small">{entry.raw.path} · {viewLabel(entry.raw.view)}</Text>
        </Space>
      {/snippet}
    </Tree>
  {:else if loading}<Skeleton rows={4} />
  {:else if loaded}
    <Empty imageSize={72} description={items.length ? '未找到匹配菜单' : '暂无菜单'} />
  {/if}
    {#snippet footer()}<Text size="small">菜单的新建与修改请在 PC 控制台完成。</Text>{/snippet}
  </Card>
</Grid>

