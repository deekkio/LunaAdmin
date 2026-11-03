<script lang="ts">
  import {
    Empty,
    Skeleton,
    Text,
    Card,
    ButtonGroup,
    Button,
    CellGroup,
    Form,
    FormItem,
    Input,
    Switch,
    Textarea,
    Space,
    Dialog,
    Row,
    Grid,
  } from '@luna/components/h5';
  import { showToast } from '@luna/components/toast';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { api } from '../../api';
  import { newRequestId } from '../../api/request';
  import type { Tutorial } from '../../api/types';
  import { session } from '../../stores/session';
  import { Pager } from '../../stores/pager';
  import { formatTime } from '../../utils/format';
  import type { FormResult, FormRules } from '@luna/components/contracts';
  import { hex32Rules, requiredText, SLUG_PATTERN, type FormModel } from '../../utils/rules';

  const pager = new Pager<Tutorial>((offset, limit) => api.tutorials(session.token ?? '', offset, limit));

  $effect(() => {
    void pager.refresh();
  });

  const emptyForm = () => {
    return { id: '', slug: '', title: '', body: '', published: true };
  };

  let editorOpen = $state(false);
  let saving = $state(false);
  let form = $state(emptyForm());

  const openEditor = (): void => {
    form = emptyForm();
    editorOpen = true;
  };

  const rules: FormRules<FormModel> = {
    id: hex32Rules('教程 ID'),
    slug: [
      { required: true, message: '请输入 Slug' },
      { pattern: SLUG_PATTERN, message: 'Slug 只能包含小写字母、数字和中段连字符' },
    ],
    title: [requiredText('标题'), { max: 160, message: '标题不能超过 160 个字符' }],
    body: [requiredText('正文'), { max: 65_536, message: '正文过长' }],
  };

  const save = async (): Promise<void> => {
    if (saving) return;
    saving = true;
    const result = await api.saveTutorial(session.token ?? '', {
      version: 1,
      request: newRequestId(),
      id: form.id,
      slug: form.slug,
      title: form.title.trim(),
      body: form.body,
      published: form.published,
    });
    saving = false;
    if (result.code) return;
    showToast({ message: '教程已保存' });
    editorOpen = false;
    await pager.refresh();
  };

  const submit = (result: FormResult): void => {
    if (!result.valid) return;
    void save();
  };
</script>

<PageNavbar title="教程文档" rightText={session.canWrite ? '新增' : ''} onright={openEditor} />

<Grid min={480} gap={16}>
  <Row justify="space-between">
    <Text size="small">共 {pager.total} 条教程</Text>
  </Row>

  <Card aria-label="教程">
    {#if pager.items.length}
      <CellGroup
        items={pager.items.map((row) => ({
          key: row.id,
          title: row.title,
          value: row.published ? '已发布' : '草稿',
          description: `${row.slug} · ${formatTime(row.updated_at)}`,
        }))}
      />
    {:else if pager.loading}
      <Skeleton rows={4} />
    {:else}
      <Empty imageSize={72} description="暂无教程" />
    {/if}
    {#snippet footer()}
      {#if pager.total > 0}
        <Row justify="end">
          <Space>
            <ButtonGroup
              label="分页"
              block
              variant="plain"
              disabled={pager.loading}
              items={[
                { key: 'prev', label: '上一页', disabled: pager.page <= 1 },
                {
                  key: 'page',
                  label: `${pager.page} / ${Math.max(1, Math.ceil(pager.total / pager.pageSize))}`,
                  disabled: true,
                },
                {
                  key: 'next',
                  label: '下一页',
                  disabled: pager.page * pager.pageSize >= pager.total,
                },
              ]}
              onaction={(item) => pager.goto(pager.page + (item.key === 'prev' ? -1 : 1))}
            />
          </Space>
        </Row>
      {/if}
    {/snippet}
  </Card>
</Grid>


{#if editorOpen}
  <Dialog
    bind:open={editorOpen}
    title="新建教程"
    beforeClose={() => !saving}
  >
    <Form id="tutorial-editor" model={form} {rules} labelPosition="left" labelWidth={112} onsubmit={submit}>
      <FormItem prop="id" label="教程 ID">
        <Input bind:value={form.id} placeholder="32 位无连字符十六进制" />
      </FormItem>
      <FormItem prop="slug" label="Slug">
        <Input bind:value={form.slug} placeholder="getting-started" />
      </FormItem>
      <FormItem prop="title" label="标题">
        <Input bind:value={form.title} placeholder="不超过 160 字" />
      </FormItem>
      <FormItem prop="body" label="正文">
        <Textarea bind:value={form.body} rows={8} placeholder="正文内容" />
      </FormItem>
      <FormItem label="发布">
        <Space size={10}><Switch bind:checked={form.published} /></Space>
      </FormItem>
    </Form>
    {#snippet footer()}
      <Button variant="plain" type="button" onclick={() => (editorOpen = false)}>取消</Button>
      <Button
        tone="primary"
        type="submit"
        form="tutorial-editor"
        loading={saving}
        disabled={saving}
      >
        保存
      </Button>
    {/snippet}
  </Dialog>
{/if}
