<script module lang="ts">
  import type { FormModel } from '../../api/types';
  import type { FormRules } from '@luna/components/contracts';
  import type { Entry, EntryInput, EntryKind } from '../../api/types';
  import { newRequestId } from '../../api/request';

  export type EntryModel = {
    id: string;
    content: string;
    kind: EntryKind;
    published: boolean;
    ttl: number | undefined;
  }

  export const entryModel = (row?: Entry, now = Math.floor(Date.now() / 1000)): EntryModel => ({
    id: row?.id ?? newRequestId(),
    content: row?.content ?? '',
    kind: row?.kind === 'notice' ? 'notices' : 'announcements',
    published: row?.published ?? true,
    ttl: row?.expires_at == null ? undefined : Math.max(1, Math.ceil((row.expires_at - now) / 60)),
  });

  export const entryRules: FormRules<FormModel> = {
    content: [{ required: true, message: '请输入正文' }, {
      validator: (value) => {
        const text = String(value ?? '');
        if (!text.trim()) return '请输入正文';
        if (new TextEncoder().encode(text).length > 16_384) return '正文不能超过 16384 字节';
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return '正文不能包含控制字符';
      },
    }],
    kind: [{ validator: (value) => {
      if (value !== 'announcements' && value !== 'notices') return '请选择公告类型';
    } }],
    ttl: [{ validator: (value) => {
      if (value !== undefined && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 525600)) return '有效期须为 1 到 525600 的整数分钟，留空表示永久';
    } }],
  };

  export const entryValue = (model: EntryModel): EntryInput => ({
    version: 1,
    id: model.id,
    content: model.content,
    users: [],
    published: model.published,
    ttl: model.ttl === undefined ? null : model.ttl * 60,
  });
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Card, Empty, Form, FormItem, Input, InputNumber, Link, Select, Pagination, Popconfirm, Row, Skeleton, Space, Switch, Table, Tag, Text, Textarea } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import type { FormResult, TableCell, TableColumn } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';
  import { session } from '../../stores/state.svelte';
  import { formatTime, intIn } from '../../utils';

  let { kind = 'announcements' }: { kind?: EntryKind } = $props();
  type Mode = 'create' | 'edit' | 'view';
  const noun = '公告';
  const title = '系统公告';
  const canWrite = $derived(session.canWrite && session.canRead('information:write'));
  let query = $state('');
  let term = $state('');
  let editorOpen = $state(false);
  let editorBusy = $state(false);
  let mode = $state<Mode>('create');
  let model = $state<EntryModel | null>(null);
  let working = $state(false);
  let settingsOpen = $state(false);
  let settingsBusy = $state(false);
  let settings = $state<{ threshold: string } | null>(null);
  let alive = true;
  const tracker = new RequestTracker();
  const pager = new Pager<Entry>((offset, limit) => api.entries(session.token ?? '', kind, offset, limit, term));
  const settingRules: FormRules<FormModel> = {
    threshold: [intIn(1, 100, '阈值必须在 1 到 100 之间', '请输入低额度阈值')],
  };
  const notify = (message: string): void => { showMessage({ message, type: 'success' }); };

  const search = (): void => {
    term = query.trim();
    pager.page = 1;
    void pager.refresh();
  };
  const clearSearch = (): void => { query = ''; search(); };
  const create = (): void => {
    if (!canWrite || working || editorBusy) return;
    mode = 'create';
    model = entryModel();
    editorOpen = true;
  };
  const openRow = async (row: Entry, next: Mode): Promise<void> => {
    const token = session.token;
    if (!token || working || editorBusy || (next === 'edit' && !canWrite)) return;
    mode = next;
    model = null;
    editorOpen = true;
    editorBusy = true;
    try {
      const result = await api.entry(token, kind, row.id);
      if (!alive || session.token !== token) return;
      if (!result.code && result.data) model = entryModel(result.data);
    } finally { editorBusy = false; }
  };
  const save = async (result: FormResult): Promise<void> => {
    const token = session.token;
    if (!result.valid || !token || !canWrite || working || !model || mode === 'view') return;
    working = true;
    try {
      const reply = await api.saveEntry(token, model.kind, entryValue(model));
      if (reply.code || !alive || session.token !== token) return;
      notify(`${noun}已保存`);
      editorOpen = false;
      await pager.refresh();
    } finally { working = false; }
  };
  const remove = async (row: Entry): Promise<void> => {
    const token = session.token;
    if (!token || !canWrite || working) return;
    const payload = { version: 1, id: row.id };
    working = true;
    try {
      const result = await api.deleteEntry(token, kind, row.id, { version: 1, request: tracker.id(payload) });
      if (result.code || !alive || session.token !== token) return;
      notify(`${noun}已删除`);
      tracker.reset();
      await pager.refresh();
    } finally { working = false; }
  };
  const openSettings = async (): Promise<void> => {
    const token = session.token;
    if (!token || settingsBusy || working) return;
    settings = null;
    settingsOpen = true;
    settingsBusy = true;
    try {
      const result = await api.settings(token);
      if (!alive || session.token !== token) return;
      if (!result.code && result.data) settings = { threshold: String(result.data.threshold) };
    } finally { settingsBusy = false; }
  };
  const saveSettings = async (result: FormResult): Promise<void> => {
    const token = session.token;
    if (!result.valid || !token || !settings || !canWrite || working) return;
    working = true;
    try {
      const reply = await api.saveSettings(token, Number(settings.threshold));
      if (reply.code || !alive || session.token !== token) return;
      notify('提醒设置已保存');
      settingsOpen = false;
    } finally { working = false; }
  };

  onMount(() => {
    void pager.refresh();
    return () => { alive = false; };
  });
</script>

{#snippet stateCell(cell: TableCell<Entry>)}
  <Tag tone={cell.row.published ? 'success' : 'info'}>{cell.row.published ? '已发布' : '草稿'}</Tag>
{/snippet}

{#snippet actionsCell(cell: TableCell<Entry>)}
  <Space size={12} wrap={false}>
    <Link type="primary" underline="never" disabled={working || editorBusy} onclick={() => void openRow(cell.row, 'view')}>查看</Link>
    {#if canWrite}
      <Link type="primary" underline="never" disabled={working || editorBusy} onclick={() => void openRow(cell.row, 'edit')}>编辑</Link>
      <Popconfirm title="确认删除公告？" description="删除后用户将无法查看该信息。" confirmText="删除" cancelText="取消"
        confirmTone="danger" disabled={working} onconfirm={() => void remove(cell.row)}>
        {#snippet reference(state)}
          <Link type="danger" underline="never" disabled={state.disabled} aria-haspopup={state.haspopup}
            aria-expanded={state.expanded} aria-controls={state.open ? state.controls : undefined}>删除</Link>
        {/snippet}
      </Popconfirm>
    {/if}
  </Space>
{/snippet}

<Card fill class="content-card" aria-label={title}>
  {#snippet header()}
    <Space>
      <Input bind:value={query} aria-label={`搜索${noun}`} placeholder="搜索公告类型或正文" maxlength={160} clearable onclear={clearSearch} onkeydown={(event) => { if (event.key === 'Enter') search(); }} />
      <Button variant="plain" disabled={pager.loading} onclick={search}>搜索</Button>
    </Space>
  {/snippet}
  {#snippet extra()}
    <Space wrap size={8}>
      {#if canWrite}
        <Button variant="plain" disabled={settingsBusy || working} onclick={() => void openSettings()}>提醒设置</Button>
      {/if}
      {#if canWrite}<Button tone="primary" disabled={working || editorBusy} onclick={create}>新增{noun}</Button>{/if}
      <Button variant="plain" disabled={pager.loading || working} onclick={() => void pager.refresh()}>刷新</Button>
    </Space>
  {/snippet}
  <Table tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }}
    border
    data={pager.items}
    rowKey="id"
    loading={pager.loading}
    emptyText={`暂无${noun}`}
    ariaLabel={title}
    columns={[
      { key: 'kind', label: '公告类型', width: 140, formatter: (_: unknown, row: Entry) => row.kind === 'notice' ? '重要通知' : '系统公告' },
      { key: 'content', label: '正文', minWidth: 180 },
      { key: 'published', label: '状态', width: 88, cell: stateCell },
      { key: 'expires_at', label: '过期时间', width: 180, formatter: (_: unknown, row: Entry) => row.expires_at === null ? '永久' : formatTime(row.expires_at) },
      { key: 'updated_at', label: '更新时间', width: 180, formatter: (_: unknown, row: Entry) => formatTime(row.updated_at) },
      { fixed: 'right', key: 'actions', align: 'center', ellipsis: false, label: '操作', width: canWrite ? 180 : 72, cell: actionsCell },
    ] as TableColumn<Entry>[]}
  />
  {#snippet footer()}
    <Row justify="end">
      <Space>
      <Pagination total={pager.total} currentPage={pager.page} pageSize={pager.pageSize} pageSizes={PAGE_SIZES} background showTotal showSizes showJumper disabled={pager.loading || working} onchange={(page) => pager.goto(page)} onsizechange={(size) => pager.resize(size)} />
      </Space>
    </Row>
  {/snippet}
</Card>

<Dialog height={600} bind:open={editorOpen} title={`${mode === 'create' ? '新增' : mode === 'edit' ? '编辑' : '查看'}${noun}`} width={640} beforeClose={() => !working && !editorBusy}>
  {#if editorBusy}
    <Skeleton rows={6} animated={false} />
  {:else if model}
    <Form id="information-edit" {model} rules={entryRules} disabled={working || mode === 'view'} labelPosition="left" labelWidth={112} onsubmit={(result) => void save(result)}>
      <FormItem prop="kind" label="公告类型"><Select bind:value={model.kind} options={[{ label: '系统公告', value: 'announcements' }, { label: '重要通知', value: 'notices' }]} /></FormItem>
      <FormItem prop="content" label="正文"><Textarea bind:value={model.content} rows={8} placeholder="正文内容" /></FormItem>
      <FormItem label="接收用户"><Text>全体用户</Text></FormItem>
      <FormItem prop="ttl" label="有效期（分钟）">
        <InputNumber bind:value={model.ttl} min={1} max={525600} precision={0} placeholder="永久" />
      </FormItem>
      <FormItem label="发布"><Switch bind:checked={model.published} /></FormItem>
    </Form>
  {:else}<Empty description="暂无公告" />{/if}
  {#snippet footer()}
    <Button variant="plain" disabled={working || editorBusy} onclick={() => (editorOpen = false)}>{mode === 'view' ? '关闭' : '取消'}</Button>
    {#if mode !== 'view'}<Button tone="primary" type="submit" form="information-edit" loading={working} disabled={working || editorBusy || !model || !canWrite}>保存</Button>{/if}
  {/snippet}
</Dialog>

<Dialog height={320} bind:open={settingsOpen} title="提醒设置" width={420} beforeClose={() => !working && !settingsBusy}>
  {#if settingsBusy}<Skeleton rows={3} animated={false} />
  {:else if settings}
    <Form id="information-settings" model={settings} rules={settingRules} disabled={working || !canWrite} labelPosition="left" labelWidth={112} onsubmit={(result) => void saveSettings(result)}>
      <FormItem prop="threshold" label="低额度阈值 %">
        <Space direction="vertical" alignment="stretch" size={8}>
          <Input bind:value={settings.threshold} placeholder="1 到 100" />
          <Text size="small">剩余流量低于该比例时，系统会向用户发送额度提醒。</Text>
        </Space>
      </FormItem>
    </Form>
  {:else}<Empty description="暂无提醒设置" />{/if}
  {#snippet footer()}
    <Button variant="plain" disabled={working || settingsBusy} onclick={() => (settingsOpen = false)}>{canWrite ? '取消' : '关闭'}</Button>
    {#if canWrite}<Button tone="primary" type="submit" form="information-settings" loading={working} disabled={working || settingsBusy || !settings}>保存</Button>{/if}
  {/snippet}
</Dialog>
