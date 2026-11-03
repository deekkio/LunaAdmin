<script lang="ts">
  import { formatId } from '../utils/format';
  import ListContent from './ListContent.svelte';
  import { onMount } from 'svelte';
  import {
    Button,
    Card,
    Dialog,
    Empty,
    Form,
    Input,
    Pagination,
    Row,
    Skeleton,
    Space,
    Table,
    Tag,
    Text,
  } from '@luna/components';
  import type {
    FormResult,
    FormRules,
    TableCell,
    TableColumn,
    TableKey,
  } from '@luna/components/contracts';
  import { showToast } from '@luna/components/toast';
  import { api } from '../api';
  import { RequestTracker } from '../api/request';
  import type { GroupView, NodeView, Plan } from '../api/types';
  import { PAGE_SIZES, Pager } from '../stores/pager';
  import { session } from '../stores/session';
  import { formatMoney } from '../utils/format';
  import { printAmount } from '../utils/amounts';
  import {
    nodeModel,
    nodeRules,
    nodeValue,
    type NodeModel,
  } from '../views/nodes/model';
  import {
    planModel,
    planRules,
    planValue,
    type PlanModel,
  } from '../views/plans/model';
  import EnrollDialog from './EnrollDialog.svelte';
  import GroupDialog from './GroupDialog.svelte';
  import NodeFields from './NodeFields.svelte';
  import PlanFields from './PlanFields.svelte';
  import HealthDialog from './HealthDialog.svelte';

  type Resource = Plan | NodeView;
  type Model = PlanModel | NodeModel;
  type Mode = 'create' | 'edit' | 'view';
  let {
    kind,
    initialId = '',
  }: { kind: 'plans' | 'nodes'; initialId?: string } = $props();
  const noun = $derived(kind === 'plans' ? '套餐' : '节点');
  const notify = (message: string, _type: 'success' | 'error' = 'success') =>
    showToast({ message });
  let query = $state('');
  let term = $state('');
  let selected = $state<TableKey[]>([]);
  let working = $state(false);
  let editorOpen = $state(false);
  let editorBusy = $state(false);
  let mode = $state<Mode>('create');
  let model = $state<Model | null>(null);
  let removeOpen = $state(false);
  let pending = $state<Resource[]>([]);
  let enrollOpen = $state(false);
  let groupOpen = $state(false);
  let groups = $state<Record<string, string>>({});
  let sequence = 0;
  let alive = true;
  let healthOpen = $state(false);
  let healthId = $state('');
  let healthName = $state('');
  const tracker = new RequestTracker();
  const deleteTracker = new RequestTracker();
  const pager = new Pager<Resource>((offset, limit) =>
    kind === 'plans'
      ? api.searchPlans(session.token ?? '', offset, limit, term)
      : api.searchNodes(session.token ?? '', offset, limit, term),
  );
  const checked = $derived(
    pager.items.filter((row) => selected.includes(rowId(row))),
  );
  const rules: FormRules = $derived(
    Object.fromEntries(
      Object.entries(
        model ? ('quota' in model ? planRules : nodeRules(model)) : {},
      ).map(([key, value]) => [`entry.${key}`, value]),
    ),
  );

  function rowId(row: Resource): string {
    return row.id;
  }
  function rowName(row: Resource): string {
    return 'node' in row ? row.node.name : row.name;
  }
  function makeModel(row?: Resource): Model {
    if (kind === 'plans') return planModel(row as Plan | undefined);
    return nodeModel(row as NodeView | undefined);
  }

  const loadGroups = async (): Promise<void> => {
    if (kind !== 'nodes' || !alive) return;
    const current = ++sequence;
    const token = session.token;
    if (!token) { groups = {}; return; }
    const items: GroupView[] = [];
    while (alive) {
      const result = await api.groups(token, items.length, 100);
      if (!alive || current !== sequence || token !== session.token) return;
      if (result.code || !result.data) return;
      items.push(...result.data.items);
      if (!result.data.items.length || items.length >= result.data.total) break;
    }
    groups = Object.fromEntries(items.map((group) => [group.id, group.name]));
  };

  const refresh = async (): Promise<void> => {
    selected = [];
    await Promise.all([pager.refresh(), loadGroups()]);
  };
  const search = (): void => {
    term = query.trim();
    pager.page = 1;
    void refresh();
  };
  const clearSearch = (): void => {
    query = '';
    search();
  };

  const openCreate = (): void => {
    if (working || editorBusy || !session.canWrite) return;
    mode = 'create';
    model = makeModel();
    tracker.reset();
    editorOpen = true;
  };
  const openRow = async (id: string, next: Mode): Promise<void> => {
    if (!id || working || editorBusy || (next === 'edit' && !session.canWrite))
      return;
    const token = session.token;
    if (!token) return;
    mode = next;
    model = null;
    tracker.reset();
    editorOpen = true;
    editorBusy = true;
    try {
      const result =
        kind === 'plans'
          ? await api.plan(token, id)
          : await api.node(token, id);
      if (session.token !== token) { editorOpen = false; return; }
      if (result.code || !result.data) return;
      model = makeModel(result.data);
    } catch {
      model = null;
    } finally {
      editorBusy = false;
    }
  };
  const save = async (): Promise<void> => {
    const token = session.token;
    if (!token || working || !session.canWrite || !model) return;
    working = true;
    try {
      const result =
        kind === 'plans'
          ? await (() => {
              const payload = planValue(model as PlanModel);
              return api.savePlan(token, {
                ...payload,
                request: tracker.id(payload),
              });
            })()
          : await (() => {
              const payload = nodeValue(model as NodeModel);
              return api.saveNode(token, {
                ...payload,
                request: tracker.id(payload),
              });
            })();
      if (result.code || session.token !== token) return;
      notify(`${noun}已保存`);
      tracker.reset();
      editorOpen = false;
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      working = false;
    }
  };
  const submit = (result: FormResult): void => {
    if (result.valid) void save();
  };

  const confirmRemove = (rows: Resource[]): void => {
    if (!rows.length || working || !session.canWrite) return;
    pending = [...rows];
    deleteTracker.reset();
    removeOpen = true;
  };
  const remove = async (): Promise<void> => {
    const token = session.token;
    if (!token || working || !session.canWrite || !pending.length) return;
    working = true;
    try {
      const payload = { version: 1, ids: pending.map(rowId) };
      const input = { ...payload, request: deleteTracker.id(payload) };
      const result =
        kind === 'plans'
          ? await api.deletePlans(token, input)
          : await api.deleteNodes(token, input);
      if (result.code || session.token !== token) return;
      notify(`已删除 ${pending.length} 个${noun}`);
      removeOpen = false;
      pending = [];
      deleteTracker.reset();
      await refresh();
    } finally {
      working = false;
    }
  };

  const showHealth = (row: Resource): void => {
    if (!('node' in row) || working || editorBusy) return;
    healthId = row.id;
    healthName = row.node.name;
    healthOpen = true;
  };

  onMount(() => {
    void refresh();
    if (initialId) void openRow(initialId, 'view');
    return () => { alive = false; sequence++; };
  });
</script>

{#snippet stateCell(cell: TableCell<Resource>)}
  <Tag tone={cell.row.enabled ? 'success' : 'info'}
    >{cell.row.enabled ? '已启用' : '已停用'}</Tag
  >
{/snippet}

{#snippet groupCell(cell: TableCell<Resource>)}
  {#if 'node' in cell.row}
    <Tag tone="info" title={groups[cell.row.group] ?? cell.row.group}>{groups[cell.row.group] ?? '-'}</Tag>
  {/if}
{/snippet}

{#snippet actionsCell(cell: TableCell<Resource>)}
  <Space size={0} wrap={false}>
    <Button
      variant="text"
      size="sm"
      type="button"
      disabled={working || editorBusy}
      onclick={() => void openRow(rowId(cell.row), 'view')}>查看</Button
    >
    {#if session.canWrite}
      <Button
        variant="text"
        size="sm"
        type="button"
        disabled={working || editorBusy}
        onclick={() => void openRow(rowId(cell.row), 'edit')}>编辑</Button
      >
    {/if}
    {#if kind === 'nodes'}
      <Button
        variant="text"
        size="sm"
        type="button"
        disabled={working || editorBusy}
        aria-label={`健康检查：${rowName(cell.row)}`}
        onclick={() => showHealth(cell.row)}>健康检查</Button>
    {/if}
    {#if session.canWrite}
      <Button
        variant="text"
        tone="danger"
        size="sm"
        type="button"
        disabled={working}
        onclick={() => confirmRemove([cell.row])}>删除</Button
      >
    {/if}
  </Space>
{/snippet}

<Card
  class="content-card"
  aria-label={kind === 'plans' ? '套餐管理' : '服务节点'}
>
  {#snippet header()}
    <Space wrap>
      <Space width={240}>
        <Input
          bind:value={query}
          aria-label={`搜索${noun}`}
          placeholder={kind === 'plans'
            ? '搜索套餐名称或 ID'
            : '搜索订阅名称、ID 或地址'}
          clearable
          onclear={clearSearch}
          onkeydown={(event) => {
            if (event.key === 'Enter') search();
          }}
        />
      </Space>
      <Button
        type="button"
        variant="plain"
        onclick={search}
        disabled={pager.loading}>搜索</Button
      >
    </Space>
  {/snippet}
  {#snippet extra()}
    <Space wrap size={8}>
      {#if session.canWrite}
        {#if kind === 'nodes'}<Button type="button" variant="plain" onclick={() => (groupOpen = true)}>新建分组</Button><Button
            type="button"
            variant="plain"
            onclick={() => (enrollOpen = true)}>注册节点</Button
          >{/if}
        <Button type="button" tone="primary" onclick={() => openCreate()}
          >新增{noun}</Button
        >
      {/if}
      {#if session.canWrite}
        <Button
          type="button"
          variant="plain"
          tone="danger"
          disabled={!checked.length || working}
          onclick={() => confirmRemove(checked)}>批量删除</Button
        >
      {/if}
      <Button
        type="button"
        variant="plain"
        disabled={pager.loading || working}
        onclick={() => void refresh()}>刷新</Button
      >
    </Space>
  {/snippet}
  <ListContent count={pager.items.length} loading={pager.loading} description={`暂无${noun}`}>
    <Table
      data={pager.items}
      rowKey={rowId}
      bind:selectedKeys={selected}
      loading={pager.loading}
      emptyText={`暂无${noun}`}
      ariaLabel={kind === 'plans' ? '套餐列表' : '节点列表'}
      columns={[
        { key: 'selection', type: 'selection', width: 48 },
        {
          key: 'name',
          label: kind === 'nodes' ? '订阅名称' : '名称',
          minWidth: kind === 'nodes' ? 110 : 140,
          formatter: (_: unknown, row: Resource) => rowName(row),
        },
        ...(kind === 'plans'
          ? [
              {
                key: 'price_minor',
                label: '价格（元）',
                minWidth: 120,
                formatter: (_: unknown, row: Resource) =>
                  'price_minor' in row
                    ? row.currency === 'CNY'
                      ? printAmount(row.price_minor, 2) + ' 元'
                      : formatMoney(row.price_minor, row.currency)
                    : '',
              },
              {
                key: 'quota_bytes',
                label: '流量（GB）',
                minWidth: 110,
                formatter: (_: unknown, row: Resource) =>
                  'quota_bytes' in row
                    ? printAmount(row.quota_bytes, 9) + ' GB'
                    : '',
              },
              { key: 'duration_days', label: '时长（天）', width: 110 },
            ]
          : [
              { key: 'group', label: '节点分组', width: 100, ellipsis: true, cell: groupCell },
              {
                key: 'endpoints',
                label: '接入地址',
                minWidth: 150,
                ellipsis: true,
                formatter: (_: unknown, row: Resource) =>
                  'node' in row ? row.node.endpoints.join('、') : '',
              },
              {
                key: 'id',
                label: '节点 ID',
                minWidth: 140,
                ellipsis: true,
                formatter: (_: unknown, row: Resource) => formatId(rowId(row)),
              },
            ]),
        { key: 'enabled', label: '状态', width: kind === 'nodes' ? 88 : 100, cell: stateCell },
        {
          key: 'actions',
          label: '操作',
          width: kind === 'nodes' ? (session.canWrite ? 260 : 160) : session.canWrite ? 180 : 80,
          minWidth: kind === 'nodes' ? (session.canWrite ? 260 : 160) : session.canWrite ? 180 : 80,
          fixed: 'right',
          ellipsis: false,
          cell: actionsCell,
        },
      ] as TableColumn<Resource>[]}
    />
  </ListContent>
  {#snippet footer()}
    <Row justify="end" align="middle">
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
          disabled={pager.loading || working}
          onchange={(page) => {
            selected = [];
            pager.goto(page);
          }}
          onsizechange={(size) => {
            selected = [];
            pager.resize(size);
          }}
        />
      </Space>
    </Row>
  {/snippet}
</Card>

<EnrollDialog bind:open={enrollOpen} />
<GroupDialog bind:open={groupOpen} oncreated={() => void loadGroups()} />

<Dialog
  bind:open={editorOpen}
  title={`${mode === 'create' ? '新增' : mode === 'edit' ? '编辑' : '查看'}${noun}`}
  width={kind === 'nodes' ? 380 : 507}
  beforeClose={() => !working && !editorBusy}
>
  {#if editorBusy}
    <Skeleton rows={6} animated={false} />
  {:else if model}
    <Form
      id="resource-edit"
      model={{ entry: model }}
      {rules}
      disabled={working || mode === 'view'}
      labelPosition="left" labelWidth={112}
      onsubmit={submit}
    >
      {#if 'quota' in model}
        <PlanFields bind:model prefix="entry." />
      {:else}
        <NodeFields bind:model prefix="entry." />
      {/if}
    </Form>
  {:else}
    <Empty description={kind === 'plans' ? '暂无套餐' : '暂无节点'} />
  {/if}
  {#snippet footer()}
    <Space direction="vertical" alignment="end" width="100%" size={0}>
      <Space direction={kind === 'nodes' ? 'vertical' : 'horizontal'} alignment="end" size={8} wrap>
        <Button
          type="button"
          variant="plain"
          disabled={working || editorBusy}
          onclick={() => (editorOpen = false)}
          >{mode === 'view' ? '关闭' : '取消'}</Button
        >
        {#if mode !== 'view'}<Button
            type="submit"
            form="resource-edit"
            tone="primary"
            disabled={working || editorBusy || !model}
            loading={working}>保存</Button
          >{/if}
      </Space>
    </Space>
  {/snippet}
</Dialog>

<Dialog
  bind:open={removeOpen}
  title={`删除${noun}`}
  width={520}
  beforeClose={() => !working}
>
  <Text tag="p">确认删除选中的 {pending.length} 个{noun}？</Text>
  <Text tag="p" type="info"
    >{kind === 'plans'
      ? '删除后停止展示与销售，已有订单和订阅记录保留。'
      : '删除后停止新的连接授权，已有订阅和流量账目保留。'}</Text
  >
  <Table
    data={pending}
    rowKey={rowId}
    columns={[
      {
        key: 'name',
        label: '名称',
        formatter: (_: unknown, row: Resource) => rowName(row),
      },
      ...(kind === 'nodes'
        ? [{
            key: 'id',
            label: 'ID',
            ellipsis: true,
            formatter: (_: unknown, row: Resource) => formatId(rowId(row)),
          }]
        : []),
    ]}
  />
  {#snippet footer()}
    <Space direction="vertical" alignment="end" width="100%" size={0}>
      <Space size={8} wrap>
        <Button
          type="button"
          variant="plain"
          disabled={working}
          onclick={() => (removeOpen = false)}>取消</Button
        >
        <Button
          type="button"
          tone="danger"
          loading={working}
          disabled={working}
          onclick={() => void remove()}>确认删除</Button
        >
      </Space>
    </Space>
  {/snippet}
</Dialog>

{#if healthOpen}
  <HealthDialog bind:open={healthOpen} id={healthId} name={healthName} />
{/if}
