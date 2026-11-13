<script lang="ts">
  import type { FormModel } from '../../api/types';
  import { untrack } from 'svelte';
  import ListSearch from '../../components/ListSearch.svelte';
  import type { AccessFilter } from '../../api/types';
  import ListContent from '../../components/ListContent.svelte';
  import {
    Card,
    Button,
    Link,
    Form,
    FormItem,
    Input,
    Pagination,
    Switch,
    Table,
    Tag,
    Space,
    Text,
    Row,
  } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import type { TableCell, FormResult, FormRules, TableColumn } from '@luna/components/contracts';
  import { api, listFilter } from '../../api';
  import { showMessage } from '@luna/components/message';
  import { newRequestId } from '../../api/request';
  import type { Permission } from '../../api/types';
  import { session } from '../../stores/state.svelte';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';

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

  const emptyModel = () => {
    return { code: '', name: '', enabled: true };
  };

  let editOpen = $state(false);
  let saving = $state(false);
  let model = $state(emptyModel());
  let existing = $state(false);

  const rules: FormRules<FormModel> = {
    code: [
      { required: true, message: '请输入权限码' },
      { pattern: /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/, message: '权限码必须是 resource:action 形式，且以小写字母开头' },
    ],
    name: [{ required: true, message: '请输入权限名称' }, { max: 64, message: '名称不能超过 64 个字符' }],
  };

  const openCreate = (): void => {
    model = emptyModel();
    existing = false;
    editOpen = true;
  };

  const openEdit = (row: Permission): void => {
    model = { code: row.code, name: row.name, enabled: row.enabled };
    existing = true;
    editOpen = true;
  };

  const save = async (): Promise<void> => {
    if (saving) return;
    saving = true;
    const result = await api.savePerm(session.token ?? '', {
      version: 1,
      request: newRequestId(),
      code: model.code,
      name: model.name.trim(),
      enabled: model.enabled,
    });
    saving = false;
    if (result.code) return;
    showMessage({ message: '权限已保存', type: 'success' });
    editOpen = false;
    await pager.refresh();
  };

  const submit = (result: FormResult): void => {
    if (!result.valid) return;
    void save();
  };
</script>

{#snippet stateCell(cell: TableCell<Permission>)}
  <Tag tone={cell.row.enabled ? 'success' : 'info'}>{cell.row.enabled ? '已启用' : '已停用'}</Tag>
{/snippet}

{#snippet systemCell(cell: TableCell<Permission>)}
  {#if cell.row.system}<Tag tone="info">系统</Tag>{:else}<Text type="info">自定义</Text>{/if}
{/snippet}

{#snippet actionsCell(cell: TableCell<Permission>)}
  <Space size={12} wrap={false}>
  {#if session.canWrite}
    <Link type="primary" underline="never" onclick={() => openEdit(cell.row)}>编辑</Link>
  {/if}
  </Space>
{/snippet}

<Card fill class="content-card" aria-label="权限">
  {#snippet header()}
    <ListSearch bind:query bind:state={status} label="搜索权限" placeholder="搜索权限名称或权限码"
      disabled={pager.loading} onsearch={search} />
  {/snippet}
  {#snippet extra()}
    <Space wrap size={10}>
      {#if session.canWrite}
        <Button tone="primary" type="button" onclick={openCreate}>新建权限</Button>
      {/if}
      <Button
        variant="plain"
        type="button"
        onclick={() => void pager.refresh()}
        disabled={pager.loading}
      >
        刷新
      </Button>
    </Space>
  {/snippet}

  <ListContent count={pager.items.length} loading={pager.loading} description={'暂无权限'}>
    <Table tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }} border
      data={pager.items}
      columns={[
        { key: 'name', label: '名称' },
        { key: 'code', label: '权限码' },
        { key: 'enabled', label: '状态', cell: stateCell },
        { key: 'system', label: '类型', cell: systemCell },
        { fixed: 'right', key: 'actions', align: 'center', ellipsis: false, label: '操作', width: 90, cell: actionsCell },
      ] as unknown as TableColumn<Permission>[]}
      rowKey="code"
      loading={pager.loading}
      emptyText="暂无权限"
      onrowclick={(detail) => (session.canWrite ? openEdit(detail.row) : undefined)}
    />
  </ListContent>

  {#snippet footer()}
    <Row justify="end">
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
          disabled={pager.loading}
          onchange={(page) => pager.goto(page)}
          onsizechange={(size) => pager.resize(size)}
        />
      </Space>
    </Row>
  {/snippet}
</Card>

<Dialog height={340}
  bind:open={editOpen}
  title={existing ? '编辑权限' : '新建权限'}
  width={480}
  onclose={() => (editOpen = false)}
>
  <Form id="perm-edit" {model} {rules} labelPosition="left" labelWidth={112} onsubmit={submit}>
    <FormItem prop="code" label="权限码">
      <Input bind:value={model.code} placeholder="user:read" />
    </FormItem>
    <FormItem prop="name" label="名称">
      <Input bind:value={model.name} placeholder="查看用户" />
    </FormItem>
    <FormItem label="启用">
      <Space size={10}>
        <Switch bind:checked={model.enabled} />
      </Space>
    </FormItem>
  </Form>
  {#snippet footer()}
    <Button variant="plain" type="button" onclick={() => (editOpen = false)}>取消</Button>
    <Button tone="primary" type="submit" form="perm-edit" loading={saving} disabled={saving}>
      保存
    </Button>
  {/snippet}
</Dialog>
