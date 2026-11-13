<script module lang="ts">
  import { api } from '../../api';
  import type { LinkKind } from '../../api/types';

  export type LinkInfo = { id: string; url: string };

  export const readLinks = async (
    token: string,
    account: string,
    kind: LinkKind,
    signal: AbortSignal,
  ): Promise<LinkInfo[]> => {
    const links: LinkInfo[] = [];
    try {
      if (signal.aborted) return [];
      const response = await api.userLinks(token, account, signal);
      if (signal.aborted || response.code || !Array.isArray(response.data)) return [];
      for (const entry of response.data) {
        if (signal.aborted) return [];
        if (entry.kind !== kind) continue;
        if (typeof entry.id !== 'string' || !entry.id) return [];
        const result = await api.accessLink(token, entry.id, signal);
        if (signal.aborted || result.code) return [];
        if (result.data === null) {
          links.push({ id: entry.id, url: '' });
        } else {
          if (!result.data || typeof result.data.url !== 'string' || !result.data.url) return [];
          links.push({ id: entry.id, url: result.data.url });
        }
      }
    } catch {
      return [];
    }
    return signal.aborted ? [] : links;
  };
</script>

<script lang="ts">
  import { useRoute, useRouter } from 'luna-router';
  import { pagePath } from '../../router/router';
  import type { FormModel } from '../../api/types';
  import { onDestroy, untrack } from 'svelte';
  import Copy from '@lucide/svelte/icons/copy';
  import {
    Button,
    Empty,
    Form,
    FormItem,
    Input,
    InputNumber,
    Select,
    Text,
    Icon,
    Space,
  } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import type { FormRules } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { RequestTracker } from '../../api/request';
  import type { UserView } from '../../api/types';
  import { navigation, session } from '../../stores/state.svelte';

  import GroupField from '../../components/GroupField.svelte';

  interface Props {
    modal?: boolean;
    open?: boolean;
    id?: string;
    mode?: 'create' | 'edit' | 'detail';
    onsaved?: () => void;
  }

  const route = useRoute();
  let {
    modal = false,
    open = $bindable(true),
    id: sourceId,
    mode = $bindable('detail'),
    onsaved,
  }: Props = $props();
  const router = useRouter();
  let id = $derived(sourceId ?? String(route.params.id ?? ''));
  const close = (): void => {
    if (!modal && session.authenticated) void router.replace(pagePath(navigation.menu, 'users/List'));
  };
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
  let model = $state({ email: '', password: '', state: 'active', group: '', device_limit: 5 as number | undefined });
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
    device_limit: [
      { required: true, message: '请输入设备上限' },
      { validator: (value: unknown) => typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 64 ? '设备上限须为 1 到 64 的整数' : undefined },
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
        device_limit: user.device_limit,
      };
    loading = false;
  };

  const save = async (valid: boolean): Promise<void> => {
    const limit = model.device_limit;
    if (
      !valid ||
      limit === undefined || !Number.isInteger(limit) || limit < 1 || limit > 64 ||
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
        device_limit: limit,
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
              device_limit: payload.device_limit,
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

<Dialog height={480} bind:open {title} width={mode === 'detail' ? undefined : 520} beforeClose={() => !saving} onclosed={() => { model.password = ''; tracker.reset(); close(); }}>
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
      <FormItem prop="device_limit" label="设备上限">
        <InputNumber bind:value={model.device_limit} min={1} max={64} step={1} precision={0}
          stepStrictly disabledScientific inputmode="numeric" disabled={saving} aria-label="设备上限" />
      </FormItem>
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
