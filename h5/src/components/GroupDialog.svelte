<script lang="ts">
  import { Button, Dialog, Form, FormItem, Input, Space } from '@luna/components';
  import type { FormRules } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { api } from '../api';
  import { newRequestId } from '../api/request';
  import type { GroupView } from '../api/types';
  import { session } from '../stores/session';
  import type { FormModel } from '../utils/rules';

  let { open = $bindable(false), oncreated }: { open?: boolean; oncreated?: (group: GroupView) => void } = $props();
  let model = $state({ name: '' });
  let loading = $state(false);
  const rules: FormRules<FormModel> = { name: [{ required: true, max: 80, message: '请输入1到80个字符的分组名称' }] };
  $effect(() => { if (!open) model.name = ''; });
  const save = async (): Promise<void> => {
    if (loading || !session.canWrite) return;
    loading = true;
    try {
      const result = await api.saveGroup(session.token ?? '', { version: 1, request: newRequestId(), name: model.name.trim() });
      if (result.code || !result.data) return;
      oncreated?.(result.data);
      showMessage({ message: '分组已创建', type: 'success' });
      open = false;
    } finally { loading = false; }
  };
</script>

<Dialog bind:open title="新建分组" width={480} beforeClose={() => !loading}>
  <Form id="group-create" {model} {rules} labelPosition="left" labelWidth={96} disabled={loading} onsubmit={(result) => { if (result.valid) void save(); }}>
    <FormItem prop="name" label="分组名称"><Input bind:value={model.name} maxlength={80} /></FormItem>
  </Form>
  {#snippet footer()}
    <Space direction="vertical" alignment="end" width="100%" size={0}>
      <Space size={8} wrap>
        <Button type="button" disabled={loading} onclick={() => (open = false)}>取消</Button>
        <Button type="submit" form="group-create" tone="primary" {loading}>保存</Button>
      </Space>
    </Space>
  {/snippet}
</Dialog>
