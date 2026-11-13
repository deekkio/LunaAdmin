<script module lang="ts">
  export interface InstallInput {
    control: string;
    origin: string;
    name: string;
  }

  export const control = (value: string): string => {
    if (!value.startsWith('https://') || /[\\\s@%]/.test(value)) throw new Error('Control 地址须为 HTTPS 地址');
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Control 地址不能包含路径、查询参数或登录凭据');
    }
    return url.origin;
  };

  export const ingress = (origin: string): string => {
    const url = new URL(origin);
    return 'https://' + url.hostname + ':19447';
  };

  const quote = (value: string): string => "'" + value.replace(/'/g, "'\\''") + "'";

  export const settings = (input: InstallInput): InstallInput => {
    const endpoint = control(input.control);
    const origin = control(input.origin);
    const name = input.name.trim();
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('节点名称须为 1 到 80 个字符');
    return { control: endpoint, origin, name };
  };

  export const command = (origin: string): string => {
    const source = control(origin) + '/downloads/deploy.sh';
    const endpoint = /^[A-Za-z0-9:/.-]+$/.test(source) ? source : quote(source);
    return `curl -fsSL ${endpoint} -o deploy.sh && sh deploy.sh`;
  };
</script>

<script lang="ts">
  import type { FormModel } from '../../api/types';
  import { onDestroy, untrack } from 'svelte';
  import { Button, Form, FormItem, Input, Space, Alert } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import type { FormRules } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { api } from '../../api';
  import type { Permit } from '../../api/types';
  import { session } from '../../stores/state.svelte';
  import { formatTime } from '../../utils';
  import GroupField from '../../components/GroupField.svelte';
  

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
    catch { showMessage({ message: '请检查 控制中心地址和节点名称', type: 'error' }); return; }
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
      if (alive && open && current === sequence) showMessage({ message: '注册码已复制', type: 'success' });
    } catch {
      if (alive && open && current === sequence) showMessage({ message: '注册码生成或复制失败，请重试并检查剪贴板权限', type: 'error' });
    } finally {
      if (current === sequence) loading = false;
    }
  };
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(command(window.location.origin)); showMessage({ message: '安装命令已复制', type: 'success' }); }
    catch { showMessage({ message: '复制失败，请检查浏览器剪贴板权限', type: 'error' }); }
  };
</script>

<Dialog height={400} bind:open title="注册节点" width={600} beforeClose={() => !loading}>
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
      <Space size={8} wrap>
        <Button type="button" tone="primary" onclick={() => void copy()}>复制安装命令</Button>
        <Button type="button" variant="plain" {loading} disabled={loading || !session.canWrite} onclick={() => void copyPermit()}>复制注册码</Button>
      </Space>
    </Space>
  {/snippet}
</Dialog>
