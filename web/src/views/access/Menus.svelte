<script lang="ts">
  import type { FormModel } from '../../api/types';
  import ListContent from '../../components/ListContent.svelte';
  import {
    Card,
    Cascader,
    Col,
    Button,
    Dialog,
    Form,
    FormItem,
    Input,
    Link,
    Select,
    Row,
    Switch,
    Table,
    Tag,
    Space,
    Text,
  } from '@luna/components';
  import type {
    FormResult,
    FormRules,
    TableCell,
    TableColumn,
    TableKey,
  } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { useRouter } from 'luna-router';
  import { api } from '../../api';
  import { newRequestId, RequestTracker } from '../../api/request';
  import type { NavMenu, Permission } from '../../api/types';
  import { navigation, session } from '../../stores/index.svelte';
  import {
    menuModel,
    menuChoices,
    menuPath,
    viewLabel,
    menuValue,
    permName,
    filterMenus,
    menuRows,
  } from './model';
  import { fetchPerms } from './roles';
  import { hex32Rules,
    intIn,
    requiredText } from '../../utils/rules';
  import { viewEntries, viewKey, viewPaths } from '../../router/views';
  import { iconNames, OfflineIcon } from '../../components/ReIcon';

  const router = useRouter();
  const tracker = new RequestTracker();
  let items = $state<NavMenu[]>([]);
  let catalog = $state<Permission[] | null>(null);
  let loading = $state(false);
  let saving = $state(false);
  let open = $state(false);
  let existing = $state(false);
  let model = $state(menuModel());
  let query = $state('');
  let term = $state('');
  let filter = $state('all');
  let status = $state('all');
  let keys = $state<TableKey[]>([]);
  let sequence = 0;
  const visible = $derived(filterMenus(items, term, status));
  const branches = $derived(menuRows(visible).filter(item => item.children.length).map(item => item.id));
  const allOpen = $derived(branches.length > 0 && branches.every(key => keys.includes(key)));
  const parents = $derived([{ value: '', label: '顶级菜单' }, ...menuChoices(items, model.id)]);
  const permissions = $derived([
    { value: '', label: '登录可见' },
    ...(catalog ?? []).map(item => ({ value: item.code, label: item.name })),
    ...(model.perm && !catalog?.some(item => item.code === model.perm)
      ? [{ value: model.perm, label: '未登记权限' }] : []),
  ]);
  const rules: FormRules<FormModel> = {
    id: hex32Rules('菜单 ID'),
    code: [
      {
        required: true,
        pattern: /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
        message:
          '代码须以字母开头，由字母、数字、下划线或连字符组成，最长 64 位',
      },
    ],
    title: [
      requiredText('菜单名称'),
      {
        validator: (value) => {
          if (new TextEncoder().encode(String(value ?? '')).length > 160)
            return '名称最多 160 字节';
        },
      },
    ],
    path: [
      {
        required: true,
        pattern: /^\/(?:[A-Za-z0-9:_-]+(?:\/[A-Za-z0-9:_-]+)*)?$/,
        message: '路径须以 / 开头，不含空格、查询参数或结尾斜杠',
      },
      { max: 256, message: '路径不能超过 256 位' },
    ],
    view: [
      {
        validator: (value) => {
          const name = String(value ?? '').trim();
          if (name && !viewPaths[viewKey(name)])
            return '请选择已注册的视图，目录可留空';
        },
      },
    ],
    rank: [intIn(-1_000_000, 1_000_000, '排序须为 -1000000 到 1000000 的整数')],
    icon: [
      {
        pattern: /^[a-z0-9-]+$/,
        message: '图标名只允许小写字母、数字和连字符',
      },
      { max: 64, message: '图标名不能超过 64 位' },
    ],
    perm: [
      {
        pattern: /^[A-Za-z][A-Za-z0-9_-]*:[A-Za-z][A-Za-z0-9_-]*$/,
        message: '权限码须为 resource:action 格式',
      },
      { max: 64, message: '权限码不能超过 64 位' },
    ],
  };

  $effect(() => {
    void load();
  });

  const load = async (): Promise<void> => {
    const current = ++sequence;
    loading = true;
    const [result, entries] = await Promise.all([
      api.menus(session.token ?? ''),
      fetchPerms(session.token ?? ''),
    ]);
    if (current !== sequence) return;
    if (!result.code && result.data) items = result.data;
    catalog = entries;
    keys = [];
    loading = false;
  };

  const search = (): void => {
    term = query.trim();
    status = filter;
    keys = term || status !== 'all' ? menuRows(filterMenus(items, term, status)).filter(item => item.children.length).map(item => item.id) : [];
  };

  const edit = (item?: NavMenu): void => {
    if (!session.canWrite) return;
    model = menuModel(item);
    if (!item) model.id = newRequestId();
    existing = Boolean(item);
    tracker.reset();
    open = true;
  };

  const save = async (result: FormResult): Promise<void> => {
    if (!result.valid || saving || !session.canWrite) return;
    const payload = menuValue(model);
    saving = true;
    try {
      const response = await api.saveMenu(session.token ?? '', {
        ...payload,
        version: 1,
        request: tracker.id(payload),
      });
      if (response.code) return;
      open = false;
      tracker.reset();
      showMessage({ message: '菜单已保存', type: 'success' });
      await load();
      await navigation.load(true);
      await router.replace(router.currentRoute.fullPath);
    } finally {
      saving = false;
    }
  };
</script>

{#snippet nameCell(cell: TableCell<NavMenu>)}
  <Space width="100%">
    <OfflineIcon name={cell.row.icon} group={cell.row.children.length > 0} size={18} /><Text title={cell.row.title}>{cell.row.title}</Text>
  </Space>
{/snippet}
{#snippet statusCell(cell: TableCell<NavMenu>)}
  <Tag tone={cell.row.enabled ? 'success' : 'info'}>{cell.row.enabled ? '已启用' : '已停用'}</Tag>
{/snippet}
{#snippet routeCell(cell: TableCell<NavMenu>)}
  <Space direction="vertical" alignment="stretch" size={4} width="100%">
    <Text title={cell.row.path}>{cell.row.path}</Text>
    <Text size="small" type="info" title={viewLabel(cell.row.view)}>{viewLabel(cell.row.view)}</Text>
  </Space>
{/snippet}
{#snippet actionsCell(cell: TableCell<NavMenu>)}
  <Space size={12} wrap={false}>
  {#if session.canWrite}<Link type="primary" underline="never" onclick={() => edit(cell.row)}>
      编辑
    </Link>{/if}
  </Space>
{/snippet}

<Card fill class="content-card" aria-label="路由菜单">
  {#snippet header()}
    <Space wrap>
      <Space width={240}>
        <Input bind:value={query} aria-label="搜索菜单" placeholder="搜索菜单名称、代码或路径" clearable
          onclear={search} onkeydown={(event) => { if (event.key === 'Enter') search(); }} />
      </Space>
      <Space width={176}>
        <Select bind:value={filter} aria-label="筛选菜单状态" options={[
          { value: 'all', label: '全部状态' }, { value: 'active', label: '已启用' }, { value: 'disabled', label: '已停用' },
        ]} onchange={search} />
      </Space>
      <Button variant="plain" disabled={loading} onclick={search}>搜索</Button>
    </Space>
  {/snippet}
  {#snippet extra()}
    <Space wrap size={10}>
      {#if session.canWrite}<Button tone="primary" onclick={() => edit()}>新建菜单</Button>{/if}
      <Button variant="plain" disabled={loading || !branches.length} onclick={() => (keys = allOpen ? [] : [...branches])}>
        {allOpen ? '折叠全部' : '展开全部'}
      </Button>
      <Button variant="plain" onclick={() => void load()} disabled={loading}>刷新</Button>
    </Space>
  {/snippet}
  <ListContent count={visible.length} loading={loading} description={items.length ? '未找到匹配菜单' : '暂无菜单'}>
    <Table border tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }}
      data={visible}
      bind:expandRowKeys={keys}
      treeProps={{ children: 'children' }}
      rowKey="id"
      {loading}
      ariaLabel="路由菜单列表"
      emptyText="暂无菜单"
      columns={[
        { key: 'title', label: '菜单名称', minWidth: 200, cell: nameCell },
        { key: 'path', label: '路由 / 页面', cell: routeCell },
        {
          key: 'perm',
          label: '访问权限',
          formatter: (value: unknown) => permName(value, catalog),
        },
        { key: 'rank', label: '排序' },
        { key: 'enabled', label: '状态', cell: statusCell },
        { fixed: 'right', key: 'actions', align: 'center', ellipsis: false, label: '操作', width: 80, cell: actionsCell },
      ] as unknown as TableColumn<NavMenu>[]}
    />
  </ListContent>
</Card>

<Dialog bind:open title={existing ? '编辑菜单' : '新建菜单'} width={760} beforeClose={() => !saving}>
  <Form id="menu-edit" {model} {rules} disabled={saving} labelPosition="left" labelWidth={112} onsubmit={(result) => void save(result)}>
    <Text tag="p" type="info" size="small">基本信息</Text>
    <Row gutter={16}>
      <Col span={12} xs={24}><FormItem prop="title" label="菜单名称">
        <Input bind:value={model.title} placeholder="节点列表" />
      </FormItem></Col>
      <Col span={12} xs={24}><FormItem prop="code" label="菜单代码">
        <Input bind:value={model.code} placeholder="node_list" />
      </FormItem></Col>
      <Col span={24}><FormItem prop="parent" label="上级菜单">
        <Cascader options={parents} value={menuPath(items, model.parent)} placeholder="顶级菜单"
          checkStrictly clearable onchange={(value) => (model.parent = String(value.at(-1) ?? ''))} />
      </FormItem></Col>
      <Col span={12} xs={24}><FormItem prop="icon" label="图标">
        <Select bind:value={model.icon} filterable clearable placeholder="选择图标"
          options={iconNames.map(name => ({ value: name, label: name }))} />
      </FormItem></Col>
      <Col span={12} xs={24}><FormItem prop="rank" label="排序">
        <Input bind:value={model.rank} type="number" />
      </FormItem></Col>
    </Row>
    <Text tag="p" type="info" size="small">路由与访问</Text>
    <Row gutter={16}>
      <Col span={24}><FormItem prop="path" label="路由路径">
        <Input bind:value={model.path} placeholder="/nodes/list" />
      </FormItem></Col>
      <Col span={12} xs={24}><FormItem prop="view" label="页面">
        <Select bind:value={model.view} filterable options={[
          { value: '', label: '目录' },
          ...viewEntries.map(item => ({ value: item.name, label: viewLabel(item.name) })),
        ]} />
      </FormItem></Col>
      <Col span={12} xs={24}><FormItem prop="perm" label="访问权限">
        <Select bind:value={model.perm} options={permissions} filterable disabled={!catalog} />
      </FormItem></Col>
      <Col span={24}><FormItem label="启用">
        <Switch bind:checked={model.enabled} />
      </FormItem></Col>
    </Row>
  </Form>
  {#snippet footer()}
    <Button
      variant="plain"
      disabled={saving}
      onclick={() => {
        open = false;
      }}
    >
      取消
    </Button>
    <Button tone="primary" type="submit" form="menu-edit" loading={saving} disabled={saving}>
      保存
    </Button>
  {/snippet}
</Dialog>
