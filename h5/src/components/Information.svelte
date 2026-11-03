<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Card, Dialog, Empty, Form, FormItem, Input, Pagination, Row, Skeleton, Space, Switch, Table, Tag, Text, Textarea } from '@luna/components';
  import type { FormResult, FormRules, TableCell, TableColumn } from '@luna/components/contracts';
  import { showToast } from '@luna/components/toast';
  import PageNavbar from './PageNavbar.svelte';
  import { api } from '../api';
  import { RequestTracker } from '../api/request';
  import type { Entry, Kind } from '../api/information';
  import { PAGE_SIZES, Pager } from '../stores/pager';
  import { session } from '../stores/session';
  import { formatTime } from '../utils/format';
  import { entryModel, entryRules, entryValue, type EntryModel } from '../views/information/model';
  import { intIn, type FormModel } from '../utils/rules';

  let { kind }: { kind: Kind } = $props();
  type Mode = 'create' | 'edit' | 'view';
  const noun = $derived(kind === 'announcements' ? '公告' : '系统提醒');
  const title = $derived(kind === 'announcements' ? '公告管理' : '系统提醒');
  const canWrite = $derived(session.canWrite && session.canRead('information:write'));
  let query = $state('');
  let term = $state('');
  let editorOpen = $state(false);
  let editorBusy = $state(false);
  let mode = $state<Mode>('create');
  let model = $state<EntryModel | null>(null);
  let working = $state(false);
  let removeOpen = $state(false);
  let pending = $state<Entry | null>(null);
  let settingsOpen = $state(false);
  let settingsBusy = $state(false);
  let settings = $state<{ threshold: string } | null>(null);
  let alive = true;
  const tracker = new RequestTracker();
  const pager = new Pager<Entry>((offset, limit) => api.entries(session.token ?? '', kind, offset, limit, term));
  const settingRules: FormRules<FormModel> = {
    threshold: [intIn(1, 100, '阈值必须在 1 到 100 之间', '请输入低额度阈值')],
  };
  const notify = (message: string): void => { showToast({ message }); };

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
      const reply = await api.saveEntry(token, kind, entryValue(model));
      if (reply.code || !alive || session.token !== token) return;
      notify(`${noun}已保存`);
      editorOpen = false;
      await pager.refresh();
    } finally { working = false; }
  };
  const confirmRemove = (row: Entry): void => {
    if (!canWrite || working) return;
    pending = row;
    tracker.reset();
    removeOpen = true;
  };
  const remove = async (): Promise<void> => {
    const token = session.token;
    if (!token || !pending || !canWrite || working) return;
    const row = pending;
    const payload = { version: 1, id: row.id };
    working = true;
    try {
      const result = await api.deleteEntry(token, kind, row.id, { version: 1, request: tracker.id(payload) });
      if (result.code || !alive || session.token !== token) return;
      notify(`${noun}已删除`);
      removeOpen = false;
      pending = null;
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
  <Space size={0} wrap={false}>
    <Button variant="text" size="sm" disabled={working || editorBusy} onclick={() => void openRow(cell.row, 'view')}>查看</Button>
    {#if canWrite}
      <Button variant="text" size="sm" disabled={working || editorBusy} onclick={() => void openRow(cell.row, 'edit')}>编辑</Button>
      <Button variant="text" tone="danger" size="sm" disabled={working} onclick={() => confirmRemove(cell.row)}>删除</Button>
    {/if}
  </Space>
{/snippet}

<PageNavbar {title} />

<Card fill class="content-card" aria-label={title}>
  {#snippet header()}
    <Space>
      <Input bind:value={query} aria-label={`搜索${noun}`} placeholder="搜索公告类型或正文" maxlength={160} clearable onclear={clearSearch} onkeydown={(event) => { if (event.key === 'Enter') search(); }} />
      <Button variant="plain" disabled={pager.loading} onclick={search}>搜索</Button>
    </Space>
  {/snippet}
  {#snippet extra()}
    <Space wrap size={8}>
      {#if kind === 'notices'}
        <Button variant="plain" disabled={settingsBusy || working} onclick={() => void openSettings()}>提醒设置</Button>
      {/if}
      {#if canWrite}<Button tone="primary" disabled={working || editorBusy} onclick={create}>新增{noun}</Button>{/if}
      <Button variant="plain" disabled={pager.loading || working} onclick={() => void pager.refresh()}>刷新</Button>
    </Space>
  {/snippet}
  <Table
    data={pager.items}
    rowKey="id"
    loading={pager.loading}
    emptyText={`暂无${noun}`}
    ariaLabel={title}
    columns={[
      { key: 'title', label: '公告类型', minWidth: 160, ellipsis: true },
      { key: 'content', label: '正文', minWidth: 200, ellipsis: true },
      { key: 'users', label: '接收用户', width: 110, formatter: (_: unknown, row: Entry) => row.users.length ? `${row.users.length} 位用户` : '全体用户' },
      { key: 'published', label: '状态', width: 88, cell: stateCell },
      { key: 'expires_at', label: '过期时间', width: 180, formatter: (_: unknown, row: Entry) => row.expires_at === null ? '永久' : formatTime(row.expires_at) },
      { key: 'updated_at', label: '更新时间', width: 180, formatter: (_: unknown, row: Entry) => formatTime(row.updated_at) },
      { key: 'actions', label: '操作', width: canWrite ? 180 : 72, fixed: 'right', ellipsis: false, cell: actionsCell },
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

<Dialog bind:open={editorOpen} title={`${mode === 'create' ? '新增' : mode === 'edit' ? '编辑' : '查看'}${noun}`} width={640} beforeClose={() => !working && !editorBusy}>
  {#if editorBusy}
    <Skeleton rows={6} animated={false} />
  {:else if model}
    <Form id="information-edit" {model} rules={entryRules} disabled={working || mode === 'view'} labelPosition="left" labelWidth={112} onsubmit={(result) => void save(result)}>
      <FormItem label="信息 ID"><Input value={model.id} disabled /></FormItem>
      <FormItem prop="content" label="正文"><Textarea bind:value={model.content} rows={8} placeholder="正文内容" /></FormItem>
      <FormItem prop="users" label="接收用户"><Textarea bind:value={model.users} rows={3} placeholder="留空发送给全体用户；指定用户时每行一个用户 ID" /></FormItem>
      <FormItem prop="ttl" label="有效期（秒）">
        <Space direction="vertical" alignment="stretch" size={8}>
          <Input bind:value={model.ttl} placeholder="留空表示永久，最长 31536000 秒" />
          <Text size="small">有效期从保存时开始计算；编辑时显示当前剩余秒数。</Text>
        </Space>
      </FormItem>
      <FormItem label="发布"><Switch bind:checked={model.published} /></FormItem>
    </Form>
  {:else}<Empty description="信息加载失败，请关闭后重试" />{/if}
  {#snippet footer()}
    <Button variant="plain" disabled={working || editorBusy} onclick={() => (editorOpen = false)}>{mode === 'view' ? '关闭' : '取消'}</Button>
    {#if mode !== 'view'}<Button tone="primary" type="submit" form="information-edit" loading={working} disabled={working || editorBusy || !model || !canWrite}>保存</Button>{/if}
  {/snippet}
</Dialog>

<Dialog bind:open={removeOpen} title={`删除${noun}`} width={400} beforeClose={() => !working}>
  <Text tag="p">确认删除“{pending?.title}”？删除后用户将无法查看该信息。</Text>
  {#snippet footer()}
    <Button variant="plain" disabled={working} onclick={() => (removeOpen = false)}>取消</Button>
    <Button tone="danger" loading={working} disabled={working || !canWrite} onclick={() => void remove()}>删除</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={settingsOpen} title="提醒设置" width={420} beforeClose={() => !working && !settingsBusy}>
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
  {:else}<Empty description="提醒设置加载失败，请关闭后重试" />{/if}
  {#snippet footer()}
    <Button variant="plain" disabled={working || settingsBusy} onclick={() => (settingsOpen = false)}>{canWrite ? '取消' : '关闭'}</Button>
    {#if canWrite}<Button tone="primary" type="submit" form="information-settings" loading={working} disabled={working || settingsBusy || !settings}>保存</Button>{/if}
  {/snippet}
</Dialog>
