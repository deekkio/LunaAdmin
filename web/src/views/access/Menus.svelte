<script module lang="ts">
  import type { MenuInput, NavMenu, Permission } from '../../api/types';

  export const permName = (value: unknown, catalog: readonly Permission[] | null): string => {
    if (!value) return '登录可见';
    if (!catalog) return '-';
    return catalog.find(item => item.code === value)?.name ?? '未登记权限';
  };

  export interface MenuRow extends NavMenu {
    depth: number;
  }

  /** 保留命中项的祖先；目录命中时显示其子树，状态筛选仍逐项生效。 */
  export const filterMenus = (items: readonly NavMenu[], query = '', state = 'all'): NavMenu[] => {
    const term = query.trim().toLowerCase();
    const visit = (source: readonly NavMenu[], parent = false): NavMenu[] =>
      source.flatMap(item => {
        const matches = parent || !term || [item.title, item.code, item.path].some(value => value.toLowerCase().includes(term));
        const children = visit(item.children, matches);
        const enabled = state === 'all' || item.enabled === (state === 'active');
        return (matches && enabled) || children.length ? [{ ...item, children }] : [];
      });
    return visit(items);
  };

  export const menuRows = (items: readonly NavMenu[], depth = 0): MenuRow[] =>
    [...items]
      .sort((a, b) => a.rank - b.rank)
      .flatMap((item) => [
        { ...item, depth },
        ...menuRows(item.children, depth + 1),
      ]);

  export const menuModel = (item?: NavMenu) => ({
    id: item?.id ?? null,
    parent: item?.parent_id ?? null,
    code: item?.code ?? '',
    title: item?.title ?? '',
    path: item?.path ?? '',
    view: item?.view ?? '',
    icon: item?.icon ?? '',
    rank: String(item?.rank ?? 0),
    enabled: item?.enabled ?? true,
    group: item?.group ?? false,
    hidden: item?.hidden ?? false,
    perm: item?.perm ?? '',
  });

  export const menuValue = (
    model: ReturnType<typeof menuModel>,
  ): Omit<MenuInput, 'version' | 'request'> => ({
    id: model.id,
    parent_id: model.parent,
    code: model.code.trim(),
    title: model.title.trim(),
    path: model.path.trim(),
    view: model.view.trim() || null,
    icon: model.icon.trim() || null,
    rank: Number(model.rank),
    enabled: model.enabled,
    group: model.group,
    hidden: model.hidden,
    perm: model.perm.trim() || null,
  });

  /** 保留树结构，并排除当前菜单及其后代，阻止循环选择。 */
  interface MenuChoice { value: number; label: string; children?: MenuChoice[] }

  export const menuChoices = (items: readonly NavMenu[], excluded: number | null = null): MenuChoice[] =>
    items.filter(item => item.id !== excluded).map((item): MenuChoice => ({
      value: item.id, label: item.title,
      ...(item.children.length ? { children: menuChoices(item.children, excluded) } : {}),
    }));

  export const menuPath = (items: readonly NavMenu[], key: number | null): number[] => {
    for (const item of items) {
      if (item.id === key) return [item.id];
      const path = menuPath(item.children, key);
      if (path.length) return [item.id, ...path];
    }
    return [];
  };

  export const viewLabel = (value: unknown): string => value ? String(value) : '目录';

  const actions: Readonly<Record<string, string>> = {
    'audit:clear': '清理日志',
    'admin:bootstrap': '初始化管理员', 'admin:login': '管理员登录', 'admin:logout': '管理员退出',
    'user:group': '迁移用户分组', 'user:create': '新增用户', 'user:change': '更新用户', 'user:delete': '删除用户', 'user:reset_password': '重置用户密码',
    'access:create_account': '新增管理员', 'access:change_account': '更新管理员', 'access:reset_password': '重置管理员密码',
    'access:save_role': '保存角色', 'access:save_perm': '保存权限', 'access:assign': '分配角色', 'access:grant': '分配权限', 'access:read': '查看权限',
    'group:create': '新建节点分组',
    'node:permit': '生成节点部署授权', 'node:enroll': '注册节点', 'node:save': '保存节点', 'node:delete': '删除节点', 'node:machine': '签发节点凭据',
    'plan:save': '保存套餐', 'plan:delete': '删除套餐', 'document:save': '保存文档', 'invite:create': '生成邀请码',
    'subscription:link': '生成订阅链接',
    'order:delete': '删除订单', 'order:create': '新增订单', 'order:settle': '确认收款', 'order:paid': '订单支付', 'payment:close': '关闭支付', 'menu:save': '保存路由菜单',
  };

  export const actionText = (value: string): string => actions[value] ?? '其他操作';
</script>

<script lang="ts">
  import type { FormModel } from '../../api/types';
  import ListContent from '../../components/ListContent.svelte';
  import {
    Card,
    Cascader,
    Col,
    Button,
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
  import Dialog from '../../components/Dialog.svelte';
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
  import { RequestTracker } from '../../api/request';
  import { navigation, session } from '../../stores/state.svelte';
  import { fetchPerms } from './Role.svelte';
  import { intIn } from '../../utils';
  import { views, hasView } from '../../router/router';
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
  const parents = $derived([{ value: 0, label: '顶级菜单' }, ...menuChoices(items, model.id)]);
  const permissions = $derived([
    { value: '', label: '登录可见' },
    ...(catalog ?? []).map(item => ({ value: item.code, label: item.name })),
    ...(model.perm && !catalog?.some(item => item.code === model.perm)
      ? [{ value: model.perm, label: '未登记权限' }] : []),
  ]);
  const rules: FormRules<FormModel> = {
    code: [
      {
        required: true,
        pattern: /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
        message:
          '代码须以字母开头，由字母、数字、下划线或连字符组成，最长 64 位',
      },
    ],
    title: [
      { required: true, message: '请输入菜单名称' },
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
          if (name && !hasView(name))
            return '请选择页面组件，目录可留空';
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
    existing = Boolean(item);
    tracker.reset();
    open = true;
  };

  const save = async (result: FormResult): Promise<void> => {
    if (!result.valid || saving || !session.canWrite) return;
    if (model.group && (model.parent || model.view)) {
      showMessage({ message: '分组标题须位于顶层，且不绑定页面', type: 'warning' });
      return;
    }
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
  <Space size={6}>
    <Tag tone={cell.row.enabled ? 'success' : 'info'}>{cell.row.enabled ? '已启用' : '已停用'}</Tag>
    {#if cell.row.hidden}<Tag tone="info">侧栏隐藏</Tag>{/if}
  </Space>
{/snippet}
{#snippet routeCell(cell: TableCell<NavMenu>)}
  <Space direction="vertical" alignment="stretch" size={4} width="100%">
    <Text title={cell.row.path}>{cell.row.path}</Text>
    <Text size="small" type="info" title={viewLabel(cell.row.view)}>{cell.row.group ? '分组标题' : viewLabel(cell.row.view)}</Text>
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
          checkStrictly clearable disabled={model.group} onchange={(value) => {
            const id = value.at(-1);
            model.parent = typeof id === 'number' && id > 0 ? id : null;
          }} />
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
        <Select bind:value={model.view} filterable disabled={model.group} options={[
          { value: '', label: '目录' },
          ...Object.keys(views).map(file => file.slice('../views/'.length, -'.svelte'.length)).sort()
            .map(path => ({ value: path, label: path })),
        ]} />
      </FormItem></Col>
      <Col span={12} xs={24}><FormItem prop="perm" label="访问权限">
        <Select bind:value={model.perm} options={permissions} filterable disabled={!catalog} />
      </FormItem></Col>
      <Col span={24}><FormItem label="启用">
        <Switch bind:checked={model.enabled} />
      </FormItem></Col>
      <Col span={12} xs={24}><FormItem label="分组标题">
        <Switch checked={model.group} onchange={(value) => {
          model.group = value;
          if (value) { model.parent = null; model.view = ''; }
        }} />
      </FormItem></Col>
      <Col span={12} xs={24}><FormItem label="侧栏显示">
        <Switch checked={!model.hidden} onchange={(value) => (model.hidden = !value)} />
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
