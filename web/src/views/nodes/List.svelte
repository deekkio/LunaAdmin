<script module lang="ts">
  import type { FormModel } from '../../api/types';
  import type { FormRules } from '@luna/components/contracts';
  import type { NodeInput, NodeKey, NodeView, Suite } from '../../api/types';
  import { addYears, format } from 'date-fns';
  import isBase64 from 'validator/es/lib/isBase64';
  import isInt from 'validator/es/lib/isInt';
  import isIP from 'validator/es/lib/isIP';
  import { newRequestId } from '../../api/request';
  import { parseTime, timeInput, hex32Rules, futureRule } from '../../utils';

  export interface NodeModel {
    group: string;
    id: string;
    wire: string;
    request: string;
    name: string;
    endpoints: string;
    existing: boolean;
    trustUntil: string;
    trustEpoch: number;
    keys: NodeKey[];
    keyId: string;
    publicKey: string;
    keyUntil: string;
    suite: Suite;
    enabled: boolean;
  }

  export const nodeModel = (item?: NodeView): NodeModel => {
    const until = format(addYears(new Date(), 10), "yyyy-MM-dd'T'HH:mm:ss");
    return {
      id: item?.id ?? '',
      wire: item?.node.node ?? '',
      group: item?.group ?? '',
      request: newRequestId(),
      name: item?.node.name ?? '',
      endpoints: item?.node.endpoints.join(', ') ?? '',
      existing: Boolean(item),
      trustUntil: item ? timeInput(item.node.trust.until) : until,
      trustEpoch: item?.node.trust.until ?? 0,
      keys: item?.node.trust.keys.map((key) => ({ ...key })) ?? [],
      keyId: newRequestId(),
      publicKey: '',
      keyUntil: until,
      suite: item?.suite ?? 'aes-256-gcm',
      enabled: item?.enabled ?? true,
    };
  };

  const isEndpoint = (value: string): boolean => {
    const separator = value.lastIndexOf(':');
    if (separator <= 0 || !isInt(value.slice(separator + 1), { min: 1, max: 65_535 })) return false;
    const host = value.slice(0, separator);
    return host.startsWith('[') && host.endsWith(']')
      ? isIP(host.slice(1, -1), '6')
      : isIP(host, '4');
  };

  export const nodeRules = (model: NodeModel): FormRules<FormModel> => ({
    group: [{ required: true, message: '请输入节点分组' }],
    id: [{ validator: (value) => value && !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(String(value)) ? '节点 ID 必须为 ULID' : undefined }],
    name: [
      { required: true, message: '请输入订阅名称' },
      {
        validator: (value) => {
          const name = String(value ?? '').trim();
          if (
            !name ||
            new TextEncoder().encode(name).length > 80 ||
            /[\u0000-\u001f\u007f]/.test(name)
          )
            return '订阅名称应为 1 到 80 字节的有效文本';
        },
      },
    ],
    endpoints: [{
      required: true,
      message: '接入地址必须为 IPv4:端口或 [IPv6]:端口，多个用逗号分隔',
      validator: (value) => {
        const values = String(value ?? '').split(/[,，]/).map((value) => value.trim()).filter(Boolean);
        if (!values.length || values.some((value) => !isEndpoint(value))) return '接入地址必须为 IPv4:端口或 [IPv6]:端口，多个用逗号分隔';
      },
    }],
    trustUntil: [futureRule('信任到期时间')],
    ...(!model.existing
      ? {
          keyId: hex32Rules('密钥 ID'),
          publicKey: [{ required: true, message: '请输入节点公钥' }, {
            len: 44,
            message: '公钥必须是 44 位 Base64',
            validator: (value) => {
              const input = String(value);
              return isBase64(input) && input.endsWith('=') && !input.endsWith('==');
            },
          }],
          keyUntil: [
            futureRule('密钥到期时间'),
            {
              validator: (value: unknown) => {
                if (
                  (parseTime(String(value)) ?? 0) >
                  (parseTime(model.trustUntil) ?? 0)
                )
                  return '密钥到期不能晚于信任到期';
              },
            },
          ],
        }
      : {}),
    suite: [
      {
        required: true,
        enum: ['aes-256-gcm', 'chacha20-poly1305'],
        message: '请选择一个加密套件',
      },
    ],
  });

  export const nodeValue = (model: NodeModel): NodeInput => {
    if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(model.group)) throw new Error('请选择节点分组');
    const until =
      model.trustEpoch && model.trustUntil === timeInput(model.trustEpoch)
        ? model.trustEpoch
        : (parseTime(model.trustUntil) ?? 0);
    const keys = model.existing
      ? model.keys.map((key) => ({ ...key }))
      : [
          {
            key: model.keyId,
            public: model.publicKey.trim(),
            until: parseTime(model.keyUntil) ?? 0,
            state: 'active' as const,
          },
        ];
    const now = Date.now() / 1000;
    if (!keys.some((key) => key.state === 'active' && key.until > now))
      throw new Error('节点密钥已过期，请重新注册节点');
    if (keys.some((key) => key.until > until))
      throw new Error('信任到期不能早于密钥到期');
    return {
      version: 1,
      request: model.request,
      id: model.id || null,
      group: model.group,
      node: {
        node: model.wire,
        name: model.name.trim(),
        endpoints: model.endpoints
          .split(/[,，]/)
          .map((value) => value.trim())
          .filter(Boolean),
        trust: { until, keys },
      },
      suite: model.suite,
      enabled: model.enabled,
    };
  };
</script>

<script lang="ts">
  import { formatId } from '../../utils';
  import ListContent from '../../components/ListContent.svelte';
  import { onMount } from 'svelte';
  import { useRoute } from 'luna-router';
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
    RadioGroup,
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
  import type { GroupView } from '../../api/types';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';
  import { session } from '../../stores/state.svelte';
  import EnrollDialog from './EnrollDialog.svelte';
  import GroupDialog from './GroupDialog.svelte';
  import HealthDialog from './HealthDialog.svelte';

  import GroupField from '../../components/GroupField.svelte';

  type Mode = 'create' | 'edit' | 'view';
  const route = useRoute();
  let { initialId = String(route.params.id ?? '') }: { initialId?: string } = $props();
  const notify = (message: string, type: 'success' | 'error' = 'success') =>
    showMessage({ message, type });
  let query = $state('');
  let term = $state('');
  let selected = $state<TableKey[]>([]);
  let working = $state(false);
  let editorOpen = $state(false);
  let editorBusy = $state(false);
  let mode = $state<Mode>('create');
  let model = $state<NodeModel | null>(null);
  let removeOpen = $state(false);
  let pending = $state<NodeView[]>([]);
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
  const pager = new Pager<NodeView>((offset, limit) =>
    api.searchNodes(session.token ?? '', offset, limit, term),
  );
  const checked = $derived(
    pager.items.filter((row) => selected.includes(rowId(row))),
  );
  const rules: FormRules = $derived(
    Object.fromEntries(
      Object.entries(
        model ? nodeRules(model) : {},
      ).map(([key, value]) => [`entry.${key}`, value]),
    ),
  );

  function rowId(row: NodeView): string {
    return row.id;
  }
  function rowName(row: NodeView): string {
    return row.node.name;
  }

  const loadGroups = async (): Promise<void> => {
    if (!alive) return;
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
    model = nodeModel();
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
      const result = await api.node(token, id);
      if (session.token !== token) { editorOpen = false; return; }
      if (result.code || !result.data) return;
      model = nodeModel(result.data);
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
      const payload = nodeValue(model);
      const result = await api.saveNode(token, {
        ...payload,
        request: tracker.id(payload),
      });
      if (result.code || session.token !== token) return;
      notify(`节点已保存`);
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

  const confirmRemove = (rows: NodeView[]): void => {
    if (!rows.length || working || !session.canWrite) return;
    pending = [...rows];
    deleteTracker.reset();
    removeOpen = true;
  };
  const remove = async (rows: NodeView[] = pending): Promise<void> => {
    const token = session.token;
    if (!token || working || !session.canWrite || !rows.length) return;
    working = true;
    try {
      const payload = { version: 1, ids: rows.map(rowId) };
      const input = { ...payload, request: deleteTracker.id(payload) };
      const result = await api.deleteNodes(token, input);
      if (result.code || session.token !== token) return;
      notify(`已删除 ${rows.length} 个节点`);
      removeOpen = false;
      pending = [];
      deleteTracker.reset();
      await refresh();
    } finally {
      working = false;
    }
  };

  const showHealth = (row: NodeView): void => {
    if (working || editorBusy) return;
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

{#snippet stateCell(cell: TableCell<NodeView>)}
  <Tag tone={cell.row.enabled ? 'success' : 'info'}
    >{cell.row.enabled ? '已启用' : '已停用'}</Tag
  >
{/snippet}

{#snippet groupCell(cell: TableCell<NodeView>)}
  <Tag tone="info" title={groups[cell.row.group] ?? cell.row.group}>{groups[cell.row.group] ?? '-'}</Tag>
{/snippet}

{#snippet actionsCell(cell: TableCell<NodeView>)}
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
      <Link type="primary" underline="never"
        disabled={working || editorBusy}
        aria-label={`健康检查：${rowName(cell.row)}`}
        onclick={() => showHealth(cell.row)}>健康检查</Link>
    {#if session.canWrite}
      <Popconfirm title={`确认删除节点？`} description="已有订阅和流量账目保留。"
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
  aria-label="服务节点"
>
  {#snippet header()}
    <Space wrap>
      <Space width={240}>
        <Input
          bind:value={query}
          aria-label="搜索节点"
          placeholder="搜索订阅名称、ID 或地址"
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
        <Button type="button" variant="plain" onclick={() => (groupOpen = true)}>新建分组</Button><Button
            type="button"
            variant="plain"
            onclick={() => (enrollOpen = true)}>注册节点</Button
          >
        <Button type="button" tone="primary" onclick={() => openCreate()}
          >新增节点</Button
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
  <ListContent count={pager.items.length} loading={pager.loading} description="暂无节点">
    <Table border tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }}
      data={pager.items}
      rowKey={rowId}
      bind:selectedKeys={selected}
      loading={pager.loading}
      emptyText="暂无节点"
      ariaLabel="节点列表"
      columns={[
        { key: 'selection', type: 'selection', width: 48 },
        {
          key: 'name',
          label: '订阅名称',
          minWidth: 120,
          formatter: (_: unknown, row: NodeView) => rowName(row),
        },
        { key: 'group', label: '节点分组', width: 100, cell: groupCell },
        {
          key: 'endpoints',
          label: '接入地址',
          minWidth: 150,
          formatter: (_: unknown, row: NodeView) => row.node.endpoints.join('、'),
        },
        {
          key: 'id',
          label: '节点 ID',
          minWidth: 140,
          formatter: (_: unknown, row: NodeView) => formatId(rowId(row)),
        },
        { key: 'enabled', label: '状态', width: 88, cell: stateCell },
        {
          key: 'actions', align: 'center', ellipsis: false,
          label: '操作',
          width: session.canWrite ? 260 : 160,
          minWidth: session.canWrite ? 260 : 160,
          fixed: 'right',
          cell: actionsCell,
        },
      ] as TableColumn<NodeView>[]}
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

<Dialog height={mode === 'edit' ? 480 : 640}
  bind:open={editorOpen}
  title={`${mode === 'create' ? '新增' : mode === 'edit' ? '编辑' : '查看'}节点`}
  width={380}
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
      <Row gutter={8}>
        <Col span={24}><FormItem prop="entry.group" label="节点分组">
          <GroupField bind:value={model.group} />
        </FormItem></Col>
        <Col span={24}
          ><FormItem prop="entry.name" label="订阅名称"
            ><Input bind:value={model.name} /></FormItem
          ></Col
        >
        <Col span={24}
          ><FormItem prop="entry.id" label="节点 ID"
            ><Input
              bind:value={model.id}
              disabled
              placeholder="自动生成 ULID"
            /></FormItem
          ></Col
        >
        <Col span={24}
          ><FormItem prop="entry.suite" label="加密套件"
            ><RadioGroup
              bind:value={model.suite}
              options={[
                { label: 'AES-256-GCM', value: 'aes-256-gcm' },
                { label: 'ChaCha20-Poly1305', value: 'chacha20-poly1305' },
              ]}
            /></FormItem
          ></Col
        >
        <Col span={24}
          ><FormItem prop="entry.endpoints" label="接入地址"
            ><Input
              bind:value={model.endpoints}
              placeholder="IPv4:端口或 [IPv6]:端口，多个用逗号分隔"
            /></FormItem
          ></Col
        >
        {#if !model.existing}
          <Col span={24}><FormItem prop="entry.keyId" label="密钥 ID"><Input bind:value={model.keyId} /></FormItem></Col>
          <Col span={24}><FormItem prop="entry.publicKey" label="节点公钥"><Input bind:value={model.publicKey} placeholder="44 位 Base64" /></FormItem></Col>
        {/if}
        <Col span={24}
          ><FormItem label="启用节点"
            ><Switch bind:checked={model.enabled} /></FormItem
          ></Col
        >
      </Row>
    </Form>
  {:else}
    <Empty description="暂无节点" />
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
  title={`删除节点`}
  width={520}
  beforeClose={() => !working}
>
  <Text tag="p">确认删除选中的 {pending.length} 个节点？</Text>
  <Text tag="p" type="info"
    >删除后停止新的连接授权，已有订阅和流量账目保留。</Text
  >
  <Table border tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }}
    data={pending}
    rowKey={rowId}
    columns={[
      { key: 'name',
        label: '名称',
        formatter: (_: unknown, row: NodeView) => rowName(row),
      },
      {
        key: 'id',
        label: 'ID',
        formatter: (_: unknown, row: NodeView) => formatId(rowId(row)),
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

{#if healthOpen}
  <HealthDialog bind:open={healthOpen} id={healthId} name={healthName} />
{/if}
