<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { Button, Dialog, Form, FormItem, Input, Space, Alert } from '@luna/components/h5';
  import type { FormRules } from '@luna/components/contracts';
  import { showToast } from '@luna/components/toast';
  import { api } from '../api';
  import type { Permit } from '../api/types';
  import { session } from '../stores/session';
  import { control, ingress, command, settings } from '../views/nodes/model';
  import { formatTime } from '../utils/format';
  import GroupField from './GroupField.svelte';
  import type { FormModel } from '../utils/rules';

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let model = $state({ control: '', name: 'Luna', group: '' });
  let permit = $state<Permit | null>(null);
  let loading = $state(false);
  let expired = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sequence = 0;
  let alive = true;
  const rules: FormRules<FormModel> = {
    control: [{ required: true, validator: (value: unknown) => {
      try { control(String(value ?? '')); } catch { return '请输入有效的 控制中心 HTTPS 地址，不包含路径或查询参数'; }
    } }],
    name: [{ required: true, max: 80, message: '节点名称须为 1 到 80 个字符' }],
  };

  const clear = (): void => {
    sequence++;
    clearTimeout(timer);
    permit = null;
    loading = false;
    expired = false;
  };
  $effect(() => {
    if (!open) { clear(); return; }
    untrack(() => {
      if (!model.control) model.control = ingress(window.location.origin);
    });
  });
  onDestroy(() => { alive = false; clear(); });

  const copyPermit = async (): Promise<void> => {
    if (loading || !session.canWrite) return;
    try { settings({ control: model.control, origin: window.location.origin, name: model.name }); }
    catch { showToast({ message: '请检查 控制中心地址和节点名称' }); return; }
    clear();
    loading = true;
    const current = ++sequence;
    try {
      const response = await api.enroll(session.token ?? '', 600, model.group || null);
      if (!alive || !open || current !== sequence) return;
      if (response.code || !response.data) return;
      const remaining = response.data.expires_at * 1000 - Date.now();
      if (!Number.isSafeInteger(response.data.expires_at) || remaining <= 0 || !/^[A-Za-z0-9_-]{43}$/.test(response.data.token)) { expired = true; return; }
      permit = response.data;
      timer = setTimeout(() => { permit = null; expired = true; }, remaining);
      await navigator.clipboard.writeText(permit.token);
      if (alive && open && current === sequence) showToast({ message: '注册码已复制' });
    } catch {
      if (alive && open && current === sequence) showToast({ message: '注册码生成或复制失败，请重试并检查剪贴板权限' });
    } finally {
      if (current === sequence) loading = false;
    }
  };
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(command(window.location.origin)); showToast({ message: '安装命令已复制' }); }
    catch { showToast({ message: '复制失败，请检查浏览器剪贴板权限' }); }
  };
</script>

<Dialog bind:open title="注册节点" width="100%" beforeClose={() => !loading}>
  <Space direction="vertical" alignment="stretch" width="100%" size={16}>
    <Alert tone={expired ? 'warning' : 'info'}
      title={expired ? '注册码已过期，点击“复制注册码”获取新授权' : permit ? `注册码为单次授权，有效期至 ${formatTime(permit.expires_at)}` : '点击“复制注册码”生成单次授权，有效期10分钟'}
      closable={false} />
    <Form id="node-enroll" {model} {rules} labelPosition="left" labelWidth={112} disabled={loading}>
      <FormItem prop="name" label="节点名称">
        <Input bind:value={model.name} placeholder="例如 Tokyo" />
      </FormItem>
      <FormItem prop="group" label="节点分组">
        <GroupField bind:value={model.group} optional disabled={loading} onchange={clear} />
      </FormItem>
      <FormItem prop="control" label="控制中心地址">
        <Input bind:value={model.control} placeholder="https://控制中心地址:19447" />
      </FormItem>
    </Form>
  </Space>
  {#snippet footer()}
    <Space direction="vertical" alignment="end" width="100%" size={0}>
      <Space direction="vertical" alignment="end" size={8}>
        <Button type="button" tone="primary" onclick={() => void copy()}>复制安装命令</Button>
        <Button type="button" variant="plain" {loading} disabled={loading || !session.canWrite} onclick={() => void copyPermit()}>复制注册码</Button>
      </Space>
    </Space>
  {/snippet}
</Dialog>
