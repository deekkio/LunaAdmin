<script lang="ts">
  import type { FormModel } from '../../api/types';
  import {
    Card,
    Button,
    Form,
    FormItem,
    Input,
    Link,
    Pagination,
    Switch,
    Table,
    Tag,
    Textarea,
    Space,
    Col,
    Row,
  } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import type { TableCell, FormResult, FormRules, TableColumn } from '@luna/components/contracts';
  import { api } from '../../api';
  import { showMessage } from '@luna/components/message';
  import { newRequestId } from '../../api/request';
  import type { Tutorial } from '../../api/types';
  import { session } from '../../stores/state.svelte';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';
  import { formatTime, hex32Rules } from '../../utils';

  const pager = new Pager<Tutorial>((offset, limit) => api.tutorials(session.token ?? '', offset, limit));

  $effect(() => {
    void pager.refresh();
  });

  const emptyModel = () => {
    return { id: '', slug: '', title: '', body: '', published: true };
  };

  let editOpen = $state(false);
  let saving = $state(false);
  let model = $state(emptyModel());
  let existing = $state(false);

  const rules: FormRules<FormModel> = {
    id: hex32Rules('教程 ID'),
    slug: [
      { required: true, message: '请输入 Slug' },
      { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: 'Slug 只能包含小写字母、数字和中段连字符，且不能以连字符开头或结尾' },
    ],
    title: [{ required: true, message: '请输入标题' }, { max: 160, message: '标题不能超过 160 个字符' }],
    body: [{ required: true, message: '请输入正文' }, { max: 65_536, message: '正文过长' }],
  };

  const openCreate = (): void => {
    model = emptyModel();
    existing = false;
    editOpen = true;
  };

  const openEdit = (row: Tutorial): void => {
    model = { id: row.id, slug: row.slug, title: row.title, body: row.body, published: row.published };
    existing = true;
    editOpen = true;
  };

  const save = async (): Promise<void> => {
    if (saving) return;
    saving = true;
    const result = await api.saveTutorial(session.token ?? '', {
      version: 1,
      request: newRequestId(),
      id: model.id,
      slug: model.slug,
      title: model.title.trim(),
      body: model.body,
      published: model.published,
    });
    saving = false;
    if (result.code) return;
    showMessage({ message: '教程已保存', type: 'success' });
    editOpen = false;
    await pager.refresh();
  };

  const submit = (result: FormResult): void => {
    if (!result.valid) return;
    void save();
  };
</script>

{#snippet stateCell(cell: TableCell<Tutorial>)}
  <Tag tone={cell.row.published ? 'success' : 'info'}>{cell.row.published ? '已发布' : '草稿'}</Tag>
{/snippet}

{#snippet actionsCell(cell: TableCell<Tutorial>)}
  <Space size={12} wrap={false}>
  {#if session.canWrite}
    <Link type="primary" underline="never" onclick={() => openEdit(cell.row)}>编辑</Link>
  {/if}
  </Space>
{/snippet}

<Card fill class="content-card" aria-label="教程">
  {#snippet extra()}
    <Space wrap size={10}>
      {#if session.canWrite}
        <Button tone="primary" type="button" onclick={openCreate}>新建教程</Button>
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

  <Table tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }} border
    data={pager.items}
    columns={[
      { key: 'title', label: '标题' },
      { key: 'slug', label: 'Slug', width: 200 },
      { key: 'published', label: '状态', width: 100, cell: stateCell },
      { key: 'updated_at',
        label: '更新时间',
        width: 180,
        formatter: (_: unknown, row: Tutorial) => formatTime(row.updated_at),
      },
      { fixed: 'right', key: 'actions', align: 'center', ellipsis: false, label: '操作', width: 90, cell: actionsCell },
    ] as unknown as TableColumn<Tutorial>[]}
    rowKey="id"
    loading={pager.loading}
    emptyText="暂无教程"
    onrowclick={(detail) => (session.canWrite ? openEdit(detail.row) : undefined)}
  />

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

<Dialog
  bind:open={editOpen}
  title={existing ? '编辑教程' : '新建教程'}
  width={680}
  onclose={() => (editOpen = false)}
>
  <Form id="tutorial-edit" {model} {rules} labelPosition="left" labelWidth={112} onsubmit={submit}>
    <Row gutter={18}>
      <Col span={12} xs={24} sm={12}>
        <FormItem prop="id" label="教程 ID">
          <Input bind:value={model.id} placeholder="32 位无连字符十六进制" disabled={existing} />
        </FormItem>
      </Col>
      <Col span={12} xs={24} sm={12}>
        <FormItem prop="slug" label="Slug">
          <Input bind:value={model.slug} placeholder="getting-started" />
        </FormItem>
      </Col>
    </Row>
    <FormItem prop="title" label="标题">
      <Input bind:value={model.title} placeholder="不超过 160 字" />
    </FormItem>
    <FormItem prop="body" label="正文">
      <Textarea bind:value={model.body} rows={12} placeholder="支持任意文本内容" />
    </FormItem>
    <FormItem label="发布">
      <Space size={10}>
        <Switch bind:checked={model.published} />
        <Tag tone={model.published ? 'success' : 'info'}>{model.published ? '已发布' : '草稿'}</Tag>
      </Space>
    </FormItem>
  </Form>
  {#snippet footer()}
    <Button variant="plain" type="button" onclick={() => (editOpen = false)}>取消</Button>
    <Button tone="primary" type="submit" form="tutorial-edit" loading={saving} disabled={saving}>
      保存
    </Button>
  {/snippet}
</Dialog>
