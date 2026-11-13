<script module lang="ts">
  import type { FormModel } from '../../api/types';
  import type { FormRules } from '@luna/components/contracts';
  import type { Plan, PlanInput } from '../../api/types';
  import { newRequestId } from '../../api/request';
  import { parseAmount, printAmount, hex32Rules, intIn } from '../../utils';

  export interface PlanModel {
    id: string;
    request: string;
    name: string;
    price: string;
    currency: string;
    days: string;
    quota: string;
    enabled: boolean;
  }

  export const planModel = (item?: Plan): PlanModel => ({
    id: item?.id ?? newRequestId(),
    request: newRequestId(),
    name: item?.name ?? '',
    price: item ? printAmount(item.price_minor, 2) : '',
    currency: item?.currency ?? 'CNY',
    days: item ? String(item.duration_days) : '30',
    quota: item ? printAmount(item.quota_bytes, 9) : '',
    enabled: item?.enabled ?? true,
  });

  export const planRules: FormRules<FormModel> = {
    id: hex32Rules('套餐 ID'),
    name: [
      { required: true, message: '请输入套餐名称' },
      { max: 80, message: '名称不能超过 80 个字符' },
    ],
    price: [
      {
        required: true,
        message: '请输入价格（元）',
        validator: (value) => {
          if (parseAmount(String(value ?? ''), 2) === null)
            return '请输入非负金额，最多两位小数';
        },
      },
    ],
    currency: [{ required: true, message: '请输入货币代码' }, { pattern: /^[A-Z]{3}$/, message: '货币代码必须是 3 位大写字母' }],
    days: [intIn(1, 3650, '时长必须在 1 到 3650 天之间')],
    quota: [
      {
        required: true,
        message: '请输入流量（GB）',
        validator: (value) => {
          const amount = parseAmount(String(value ?? ''), 9);
          if (amount === null || amount <= 0)
            return '请输入大于 0 的流量，最多九位小数';
        },
      },
    ],
  };

  export const planValue = (model: PlanModel): PlanInput => {
    const price = parseAmount(model.price, 2);
    const quota = parseAmount(model.quota, 9);
    if (price === null || quota === null || quota <= 0)
      throw new Error('请检查价格与流量');
    return {
      version: 1,
      request: model.request,
      id: model.id,
      name: model.name.trim(),
      price_minor: price,
      currency: model.currency,
      duration_days: Number(model.days),
      quota_bytes: quota,
      nodes: [],
      enabled: model.enabled,
    };
  };
</script>

<script lang="ts">
  import ListContent from '../../components/ListContent.svelte';
  import { onMount } from 'svelte';
  import {
    Button,
    Card,
    Col,
    Empty,
    Form,
    FormItem,
    Input,
    Link,
    Pagination,
    Popconfirm,
    Row,
    Skeleton,
    Space,
    Switch,
    Table,
    Tag,
    Text,
  } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import type {
    FormResult,
    TableCell,
    TableColumn,
    TableKey,
  } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';
  import { session } from '../../stores/state.svelte';
  import { formatMoney } from '../../utils';

  type Mode = 'create' | 'edit' | 'view';
  let { initialId = '' }: { initialId?: string } = $props();
  const notify = (message: string, type: 'success' | 'error' = 'success') =>
    showMessage({ message, type });
  let query = $state('');
  let term = $state('');
  let selected = $state<TableKey[]>([]);
  let working = $state(false);
  let editorOpen = $state(false);
  let editorBusy = $state(false);
  let mode = $state<Mode>('create');
  let model = $state<PlanModel | null>(null);
  let removeOpen = $state(false);
  let pending = $state<Plan[]>([]);
  const tracker = new RequestTracker();
  const deleteTracker = new RequestTracker();
  const pager = new Pager<Plan>((offset, limit) =>
    api.searchPlans(session.token ?? '', offset, limit, term),
  );
  const checked = $derived(
    pager.items.filter((row) => selected.includes(rowId(row))),
  );
  const rules: FormRules = $derived(
    Object.fromEntries(
      Object.entries(
        model ? planRules : {},
      ).map(([key, value]) => [`entry.${key}`, value]),
    ),
  );

  function rowId(row: Plan): string {
    return row.id;
  }
  function rowName(row: Plan): string {
    return row.name;
  }

  const refresh = async (): Promise<void> => {
    selected = [];
    await pager.refresh();
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
    model = planModel();
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
      const result = await api.plan(token, id);
      if (session.token !== token) { editorOpen = false; return; }
      if (result.code || !result.data) return;
      model = planModel(result.data);
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
      const payload = planValue(model);
      const result = await api.savePlan(token, {
        ...payload,
        request: tracker.id(payload),
      });
      if (result.code || session.token !== token) return;
      notify(`套餐已保存`);
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

  const confirmRemove = (rows: Plan[]): void => {
    if (!rows.length || working || !session.canWrite) return;
    pending = [...rows];
    deleteTracker.reset();
    removeOpen = true;
  };
  const remove = async (rows: Plan[] = pending): Promise<void> => {
    const token = session.token;
    if (!token || working || !session.canWrite || !rows.length) return;
    working = true;
    try {
      const payload = { version: 1, ids: rows.map(rowId) };
      const input = { ...payload, request: deleteTracker.id(payload) };
      const result = await api.deletePlans(token, input);
      if (result.code || session.token !== token) return;
      notify(`已删除 ${rows.length} 个套餐`);
      removeOpen = false;
      pending = [];
      deleteTracker.reset();
      await refresh();
    } finally {
      working = false;
    }
  };

  onMount(() => {
    void refresh();
    if (initialId) void openRow(initialId, 'view');
  });
</script>

{#snippet stateCell(cell: TableCell<Plan>)}
  <Tag tone={cell.row.enabled ? 'success' : 'info'}
    >{cell.row.enabled ? '已启用' : '已停用'}</Tag
  >
{/snippet}

{#snippet actionsCell(cell: TableCell<Plan>)}
  <Space size={12} wrap={false}>
    <Link type="primary" underline="never"
      disabled={working || editorBusy}
      onclick={() => void openRow(rowId(cell.row), 'view')}>查看</Link
    >
    {#if session.canWrite}
      <Link type="primary" underline="never"
        disabled={working || editorBusy}
        onclick={() => void openRow(rowId(cell.row), 'edit')}>编辑</Link
      >
    {/if}
    {#if session.canWrite}
      <Popconfirm title={`确认删除套餐？`} description="已有订单和订阅记录保留。"
        confirmText="删除" cancelText="取消" confirmTone="danger" disabled={working}
        onconfirm={() => void remove([cell.row])}>
        {#snippet reference(state)}
          <Link type="danger" underline="never" disabled={state.disabled} aria-haspopup={state.haspopup}
            aria-expanded={state.expanded} aria-controls={state.open ? state.controls : undefined}>删除</Link>
        {/snippet}
      </Popconfirm>
    {/if}
  </Space>
{/snippet}

<Card
  fill
  class="content-card"
  aria-label="套餐管理"
>
  {#snippet header()}
    <Space wrap>
      <Space width={240}>
        <Input
          bind:value={query}
          aria-label="搜索套餐"
          placeholder="搜索套餐名称或 ID"
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
        <Button type="button" tone="primary" onclick={() => openCreate()}
          >新增套餐</Button
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
  <ListContent count={pager.items.length} loading={pager.loading} description="暂无套餐">
    <Table border tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }}
      data={pager.items}
      rowKey={rowId}
      bind:selectedKeys={selected}
      loading={pager.loading}
      emptyText="暂无套餐"
      ariaLabel="套餐列表"
      columns={[
        { key: 'selection', type: 'selection', width: 48 },
        {
          key: 'name',
          label: '名称',
          minWidth: 120,
          formatter: (_: unknown, row: Plan) => rowName(row),
        },
        { key: 'price_minor',
          label: '价格（元）',
          minWidth: 120,
          formatter: (_: unknown, row: Plan) => row.currency === 'CNY'
            ? printAmount(row.price_minor, 2) + ' 元'
            : formatMoney(row.price_minor, row.currency),
        },
        { key: 'quota_bytes',
          label: '流量（GB）',
          minWidth: 110,
          formatter: (_: unknown, row: Plan) => printAmount(row.quota_bytes, 9) + ' GB',
        },
        { key: 'duration_days', label: '时长（天）', width: 110 },
        { key: 'enabled', label: '状态', width: 100, cell: stateCell },
        {
          key: 'actions', align: 'center', ellipsis: false,
          label: '操作',
          width: session.canWrite ? 180 : 80,
          minWidth: session.canWrite ? 180 : 80,
          fixed: 'right',
          cell: actionsCell,
        },
      ] as TableColumn<Plan>[]}
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

<Dialog height={640}
  bind:open={editorOpen}
  title={`${mode === 'create' ? '新增' : mode === 'edit' ? '编辑' : '查看'}套餐`}
  width={507}
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
      <Row gutter={16}>
        <Col span={24}
          ><FormItem prop="entry.name" label="名称"
            ><Input bind:value={model.name} /></FormItem
          ></Col
        >
        <Col span={24}
          ><FormItem
            prop="entry.price"
            label={model.currency === 'CNY'
              ? '价格（元）'
              : `价格（${model.currency}）`}
            ><Input
              bind:value={model.price}
              inputmode="decimal"
              placeholder="12.80"
            /></FormItem
          ></Col
        >
        <Col span={24}
          ><FormItem prop="entry.quota" label="流量（GB）"
            ><Input
              bind:value={model.quota}
              inputmode="decimal"
              placeholder="100"
            /></FormItem
          ></Col
        >
        <Col span={24}
          ><FormItem prop="entry.days" label="时长（天）"
            ><Input
              bind:value={model.days}
              inputmode="numeric"
              placeholder="30"
            /></FormItem
          ></Col
        >
        <Col span={24}
          ><FormItem label="启用套餐"
            ><Switch bind:checked={model.enabled} /></FormItem
          ></Col
        >
      </Row>
    </Form>
  {:else}
    <Empty description="暂无套餐" />
  {/if}
  {#snippet footer()}
    <Space direction="vertical" alignment="end" width="100%" size={0}>
      <Space size={8} wrap>
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

<Dialog height={480}
  bind:open={removeOpen}
  title={`删除套餐`}
  width={520}
  beforeClose={() => !working}
>
  <Text tag="p">确认删除选中的 {pending.length} 个套餐？</Text>
  <Text tag="p" type="info"
    >删除后停止展示与销售，已有订单和订阅记录保留。</Text
  >
  <Table border tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }}
    data={pending}
    rowKey={rowId}
    columns={[
      { key: 'name',
        label: '名称',
        formatter: (_: unknown, row: Plan) => rowName(row),
      },
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
