<script lang="ts">
  import type { FormModel } from '../api/types';
  import { onDestroy, untrack } from 'svelte';
  import Copy from '@lucide/svelte/icons/copy';
  import {
    Button,
    Dialog,
    Empty,
    Form,
    FormItem,
    Input,
    Select,
    Text,
    Icon,
    Space,
  } from '@luna/components';
  import type { FormRules } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { api } from '../api';
  import { RequestTracker } from '../api/request';
  import type { LinkKind, UserView } from '../api/types';
  import { readLinks, type LinkInfo } from '../views/users/model';
  import { session } from '../stores/index.svelte';
  
  import GroupField from './GroupField.svelte';

  interface Props {
    open?: boolean;
    id?: string;
    mode?: 'create' | 'edit' | 'detail';
    onsaved?: () => void;
  }

  let {
    open = $bindable(false),
    id = '',
    mode = $bindable('detail'),
    onsaved,
  }: Props = $props();
  const tracker = new RequestTracker();
  let user = $state<UserView | null>(null);
  let loading = $state(false);
  let saving = $state(false);
  interface LinkState { items: LinkInfo[]; busy: boolean }
  const kinds: LinkKind[] = ['subscription', 'dedicated'];
  let links = $state<Record<LinkKind, LinkState>>({
    subscription: { items: [], busy: false },
    dedicated: { items: [], busy: false },
  });
  let model = $state({ email: '', password: '', state: 'active', group: '' });
  let sequence = 0;
  let alive = true;
  const title = $derived(
    {
      create: '新增用户',
      edit: '编辑用户',
      detail: '用户详情',
    }[mode],
  );
  const rules: FormRules<FormModel> = $derived({
    ...(mode === 'create' ? {
      email: [
        { required: true, message: '请输入邮箱' },
        { type: 'email' as const, message: '邮箱格式不正确' },
        { pattern: /^[\x21-\x7e]{1,254}$/, message: '邮箱须使用 ASCII 字符，最多 254 位' },
      ],
      password: [
        { required: true, min: 12, max: 128, message: '密码须为 12 到 128 位' },
        { validator: (value: unknown) => new TextEncoder().encode(String(value ?? '')).length > 128 || /\p{Cc}/u.test(String(value ?? '')) ? '密码不能超过 128 字节或包含控制字符' : undefined },
      ],
    } : mode === 'edit' ? {
      password: [
        { min: 8, max: 16, message: '密码长度必须在 8 到 16 位之间' },
        { pattern: /^[^\p{Cc}]+$/u, message: '密码不能包含控制字符' },
      ],
    } : {}),
    state: [
      { required: true, pattern: /^(active|disabled)$/, message: '请选择账户状态' },
    ],
  });

  $effect(() => {
    const key = id;
    const action = mode;
    if (open && action !== 'create') untrack(() => void load(key));
  });
  $effect(() => {
    if (!open || mode !== 'detail' || !user || !session.canRead('user:write')) {
      links = { subscription: { items: [], busy: false }, dedicated: { items: [], busy: false } };
      return;
    }
    const account = user.profile.account;
    const token = session.token;
    if (!token) return;
    let active = true;
    const control = new AbortController();
    links = { subscription: { items: [], busy: true }, dedicated: { items: [], busy: true } };
    for (const kind of kinds) {
      void readLinks(token, account, kind, control.signal).then((items) => {
        if (active) links[kind] = { items, busy: false };
      });
    }
    return () => { active = false; control.abort(); };
  });
  onDestroy(() => {
    alive = false;
    sequence++;
    model.password = '';
    tracker.reset();
  });

  const load = async (key: string): Promise<void> => {
    const current = ++sequence;
    loading = true;
    user = null;
    model.password = '';
    const response = await api.user(session.token ?? '', key);
    if (!alive || current !== sequence) return;
    user = response.code ? null : response.data;
    if (user)
      model = {
        email: user.profile.email,
        password: '',
        state: user.profile.state,
        group: user.group.id,
      };
    loading = false;
  };

  const save = async (valid: boolean): Promise<void> => {
    if (
      !valid ||
      saving ||
      loading ||
      !session.canWrite ||
      (mode !== 'create' && !user)
    )
      return;
    const token = session.token;
    const current = sequence;
    saving = true;
    try {
      const payload = {
        email: model.email.trim().toLowerCase(),
        password: model.password,
        state: model.state as 'active' | 'disabled',
      };
      const response =
        mode === 'create'
          ? await api.createUser(token ?? '', {
              ...payload,
              version: 1,
              request: tracker.id(payload),
            })
          : await api.changeUser(token ?? '', id, {
              version: 1,
              state: payload.state,
              ...(payload.password ? { password: payload.password } : {}),
            });
      if (!alive || current !== sequence || token !== session.token || response.code || !response.data) return;
      model.password = '';
      tracker.reset();
      showMessage({
        message: mode === 'create' ? '用户已新增' : '用户已更新',
        type: 'success',
      });
      open = false;
      onsaved?.();
    } finally {
      saving = false;
    }
  };

  const saveGroup = async (valid: boolean): Promise<void> => {
    if (!valid || saving || loading || !user || !session.canWrite || !session.canRead('user:write')
      || !session.canRead('node:read') || model.group === user.group.id) return;
    const current = sequence;
    const account = user.profile.account;
    const token = session.token;
    saving = true;
    try {
      const response = await api.changeUser(token ?? '', account, { version: 1, group: model.group });
      if (!alive || !open || current !== sequence || token !== session.token || response.code || !response.data) return;
      user = response.data;
      model.group = user.group.id;
      showMessage({ message: '节点分组已更新', type: 'success' });
      onsaved?.();
    } finally { saving = false; }
  };

  const copyLink = async (kind: LinkKind): Promise<void> => {
    const state = links[kind];
    if (state.busy || !state.items.length || !user) return;
    const account = user.profile.account;
    const token = session.token;
    const current = sequence;
    const valid = (): boolean => alive && open && mode === 'detail' && current === sequence
      && user?.profile.account === account && token === session.token && links[kind] === state;
    state.busy = true;
    try {
      for (const item of state.items) {
        if (item.url) continue;
        if (!valid() || !session.canWrite || user?.profile.state !== 'active') return;
        const response = await api.mintLink(token ?? '', item.id);
        if (!valid() || response.code || !response.data) return;
        item.url = response.data.url;
      }
      if (!valid()) return;
      const value = state.items.map((item) => item.url).filter(Boolean).join('\n');
      if (!value) return;
      await navigator.clipboard.writeText(value);
      if (valid()) showMessage({ message: '连接已复制', type: 'success' });
    } catch {
      if (valid()) showMessage({ message: '复制失败，请检查浏览器剪贴板权限', type: 'error' });
    } finally { if (valid()) state.busy = false; }
  };

</script>

<Dialog bind:open {title} width={mode === 'detail' ? undefined : 520} beforeClose={() => !saving} onclosed={() => { model.password = ''; tracker.reset(); }}>
  {#if loading}
    <Text tag="p" size="small" role="status">加载中…</Text>
  {:else if mode === 'create' || (mode === 'edit' && user)}
    <Form
      id="user-form"
      {model}
      {rules}
      labelPosition="left" labelWidth={112}
      onsubmit={(result) => void save(result.valid)}
    >
      {#if mode === 'create'}
        <FormItem prop="email" label="邮箱">
          <Input
            bind:value={model.email}
            type="email"
            autocomplete="off"
            disabled={saving}
            placeholder="请输入邮箱"
          />
        </FormItem>
        <FormItem prop="password" label="初始密码">
          <Input
            bind:value={model.password}
            type="password"
            minlength={12}
            maxlength={128}
            autocomplete="new-password"
            disabled={saving}
            placeholder="12 到 128 位"
          />
        </FormItem>
      {:else if user}
        <FormItem label="账户 ID"><Text truncated title={user.profile.account}><span class="mono">{user.profile.account}</span></Text></FormItem>
        <FormItem label="邮箱"><Text truncated title={user.profile.email}>{user.profile.email}</Text></FormItem>
      {/if}
      {#if mode === 'edit'}
        <FormItem prop="password" label="新密码">
          <Input bind:value={model.password} aria-label="新密码" type="password"
            minlength={8} maxlength={16} autocomplete="new-password" disabled={saving} placeholder="8–16 位，留空不修改" />
        </FormItem>
      {/if}
      <FormItem prop="state" label="账户状态">
        <Select
          bind:value={model.state}
          disabled={saving}
          options={[
            { value: 'active', label: '启用' },
            { value: 'disabled', label: '禁用' },
          ]}
        />
      </FormItem>
    </Form>
  {:else if user}
      <Form id="user-group" {model} labelPosition="left" labelWidth={112}
        rules={{ group: [{ required: true, message: '请选择节点分组' }] }}
        onsubmit={(result) => void saveGroup(result.valid)}>
        <FormItem prop="group" label="节点分组">
          {#if session.canRead('node:read')}
            <GroupField bind:value={model.group} ready disabled={saving || !session.canWrite || !session.canRead('user:write')} />
          {:else}
            <Select value={user.group.id} options={[{ label: user.group.name, value: user.group.id }]} disabled />
          {/if}
        </FormItem>
        {#each kinds as kind (kind)}
          {@const title = kind === 'subscription' ? '订阅连接' : '独享连接'}
          <FormItem label={title}>
            <Space width="100%" size={8} fill>
              <Space direction="vertical" alignment="stretch" size={8}>
                {#each links[kind].items as item (item.id)}
                  <Input value={item.url} aria-label={title} title={item.url} readonly spellcheck={false} />
                {:else}
                  <Input value="" aria-label={title} aria-busy={links[kind].busy} readonly spellcheck={false} />
                {/each}
              </Space>
              {#snippet spacer()}
                <Button type="button" variant="plain" loading={links[kind].busy}
                  disabled={links[kind].busy || !links[kind].items.length ||
                    (links[kind].items.some((item) => !item.url) && (!session.canWrite || user?.profile.state !== 'active'))}
                  aria-label={`复制${title}`} onclick={() => void copyLink(kind)}>
                  <Icon icon={Copy} size={16} />复制
                </Button>
              {/snippet}
            </Space>
          </FormItem>
        {/each}
      </Form>
  {:else}
    <Empty description="暂无用户" />
  {/if}
  {#snippet footer()}
    <Space direction="vertical" alignment="end" width="100%" size={0}>
      <Space size={8} wrap>
        <Button
          variant="plain"
          disabled={saving}
          onclick={() => {
            open = false;
          }}
        >
          关闭
        </Button>
        {#if (mode === 'create' || mode === 'edit') && session.canWrite}
          <Button
            tone="primary"
            type="submit"
            form="user-form"
            loading={saving}
            disabled={saving || loading || (mode !== 'create' && !user)}
          >
            保存
          </Button>
        {:else if mode === 'detail' && user && session.canWrite && session.canRead('user:write') && session.canRead('node:read')}
          <Button tone="primary" type="submit" form="user-group" loading={saving}
            disabled={saving || loading || model.group === user.group.id}>保存</Button>
        {/if}
      </Space>
    </Space>
  {/snippet}
</Dialog>
