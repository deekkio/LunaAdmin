<script module lang="ts">
  import { api } from '../../api';
  import type { Role } from '../../api/types';

  export type AccountMode = 'create' | 'detail' | 'edit' | 'delete';

  /** 角色名称与选择项使用完整目录，避免只读取第一页后显示角色 ID。 */
  export const fetchRoles = async (token: string): Promise<Role[] | null> => {
    const roles: Role[] = [];
    let offset = 0;
    while (true) {
      const result = await api.roles(token, offset, 100);
      if (result.code || !result.data) return null;
      const page = result.data;
      roles.push(...page.items);
      offset += page.items.length;
      if (offset >= page.total) return roles;
      if (!page.items.length) return null;
    }
  };

  export const roleNames = (ids: readonly string[], roles: readonly Role[] | null): string => {
    if (!ids.length) return '未分配角色';
    if (!roles) return '-';
    const names = new Map(roles.map((role) => [role.id, role.name]));
    return ids.map((id) => names.get(id) ?? '不可用角色').join('、');
  };
</script>

<script lang="ts">
  import { useRoute, useRouter } from 'luna-router';
  import { pagePath } from '../../router/router';
  import type { FormModel } from '../../api/types';
  import IdentityTag from '../../components/IdentityTag.svelte';
  import { onDestroy, untrack } from 'svelte';
  import {
    Button,
    Form,
    FormItem,
    Input,
    CheckboxGroup,
    Text,
    Space,
    Skeleton,
    Empty,
    Descriptions,
    Select,
  } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import type { FormResult, FormRules } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { RequestTracker } from '../../api/request';
  import type { Account } from '../../api/types';
  import { navigation, session } from '../../stores/state.svelte';
  import { formatTime, stateText } from '../../utils';


  interface Props {
    modal?: boolean;
    open?: boolean;
    id?: string;
    mode?: AccountMode;
    roles?: Role[] | null;
    onsaved?: () => void;
    onclosed?: () => void;
  }

  const route = useRoute();
  let {
    modal = false,
    open = $bindable(true),
    id: sourceId,
    mode = $bindable('detail'),
    roles: source,
    onsaved,
    onclosed,
  }: Props = $props();
  const router = useRouter();
  let id = $derived(sourceId ?? String(route.params.id ?? ''));
  const close = (): void => {
    onclosed?.();
    if (!modal && session.authenticated) void router.replace(pagePath(navigation.menu, 'access/Accounts'));
  };
  const trackers = {
    create: new RequestTracker(),
    state: new RequestTracker(),
    roles: new RequestTracker(),
    delete: new RequestTracker(),
  };
  let account = $state<Account | null>(null);
  let catalog = $state<Role[] | null>(null);
  let assigned = $state<string[]>([]);
  let model = $state({ username: '', password: '', state: 'active' });
  let loading = $state(false);
  let busy = $state(false);
  let sequence = 0;
  let alive = true;
  const title = $derived(
    {
      create: '新增管理员',
      detail: '管理员详情',
      edit: '编辑管理员',
      delete: '删除管理员',
    }[mode],
  );
  const changed = $derived(
    Boolean(
      account &&
      (assigned.length !== account.roles.length ||
        assigned.some((role) => !account!.roles.includes(role))),
    ),
  );
  const choices = $derived(
    (catalog ?? []).map((role) => ({
      value: role.id,
      label: role.name,
      disabled: !role.enabled && !assigned.includes(role.id),
    })),
  );
  const rules: FormRules<FormModel> = $derived({
    ...(mode === 'create' ? {
      username: [
        { required: true, message: '请输入管理员账号' },
        { pattern: /^[A-Za-z]{1,64}$/, message: '账号须为 1–64 位英文字母' },
      ],
    } : {}),
    password: [
      { required: mode === 'create', message: '请输入密码' },
      { min: 8, max: 16, message: '密码长度必须在 8 到 16 位之间' },
      { pattern: /^[^\p{Cc}]+$/u, message: '密码不能包含控制字符' },
    ],
    state: [
      { required: true, pattern: /^(active|disabled)$/, message: '请选择管理员状态' },
    ],
  });

  const notify = (message: string): void => {
    showMessage({ message, type: 'success' });
  };
  const reset = (): void => {
    Object.values(trackers).forEach((tracker) => tracker.reset());
  };
  const accepts = (token: string | null, current: number): boolean =>
    alive && token === session.token && current === sequence;

  $effect(() => {
    if (!open) return;
    const key = id;
    const action = mode;
    untrack(() => void load(key, action));
  });
  onDestroy(() => {
    alive = false;
    sequence++;
    model.password = '';
    reset();
  });

  const load = async (key: string, action: AccountMode): Promise<void> => {
    const current = ++sequence;
    const token = session.token;
    loading = true;
    account = null;
    catalog = null;
    assigned = [];
    model = { username: '', password: '', state: 'active' };
    reset();
    if (action === 'create') {
      loading = false;
      return;
    }
    const [result, roles] = await Promise.all([
      api.account(token ?? '', key),
      action === 'edit' || action === 'detail'
        ? (source ?? fetchRoles(token ?? ''))
        : Promise.resolve([]),
    ]);
    if (!accepts(token, current)) return;
    account = result.code ? null : result.data;
    catalog = roles;
    if (account) {
      assigned = [...account.roles];
      model = { username: account.username, password: '', state: account.state };
    }
    loading = false;
  };

  const finish = async (message: string, self = false): Promise<void> => {
    if (self) {
      open = false;
      session.clear();
      await router.replace('/login');
      notify(`${message}，请重新登录`);
      return;
    }
    notify(message);
    onsaved?.();
  };

  const create = async (): Promise<void> => {
    if (busy || loading || !session.canWrite || !session.token) return;
    const token = session.token;
    const current = sequence;
    const payload = { username: model.username.trim(), password: model.password };
    busy = true;
    try {
      const result = await api.createAccount(token, {
        version: 1,
        request: trackers.create.id(payload),
        ...payload,
      });
      if (!accepts(token, current) || result.code || !result.data) return;
      model.password = '';
      trackers.create.reset();
      open = false;
      await finish('管理员已新增');
    } finally {
      busy = false;
    }
  };

  const save = async (): Promise<void> => {
    if (busy || loading || !account || !session.canWrite || !session.token || (!changed && model.state === account.state && !model.password)) return;
    const token = session.token;
    const current = sequence;
    const key = account.id;
    const payload = {
      state: model.state as 'active' | 'disabled',
      ...(changed ? { roles: [...assigned].sort() } : {}),
      ...(model.password ? { password: model.password } : {}),
    };
    busy = true;
    try {
      const result = await api.changeAccount(token, key, {
        version: 1,
        request: trackers.state.id({ id: key, ...payload }),
        ...payload,
      });
      if (!accepts(token, current) || result.code || !result.data) return;
      account = result.data;
      assigned = [...account.roles];
      model.password = '';
      trackers.state.reset();
      open = false;
      await finish('管理员已更新', key === session.account);
    } finally { busy = false; }
  };

  const remove = async (): Promise<void> => {
    if (busy || loading || !account || !session.canWrite || !session.token) return;
    const token = session.token;
    const current = sequence;
    const key = account.id;
    busy = true;
    try {
      const result = await api.deleteAccount(token, key, {
        version: 1,
        request: trackers.delete.id({ id: key }),
      });
      if (!accepts(token, current) || result.code) return;
      trackers.delete.reset();
      open = false;
      await finish('管理员已删除', key === session.account);
    } finally {
      busy = false;
    }
  };

  const submit = (result: FormResult): void => {
    if (!result.valid) return;
    if (mode === 'create') void create();
    else if (mode === 'edit') void save();
  };
</script>

<Dialog height={mode === 'create' ? 340 : mode === 'delete' ? 240 : 480}
  bind:open
  {title}
  width={mode === 'detail' ? 640 : 520}
  beforeClose={() => !busy}
  onclosed={() => {
    model.password = '';
    reset();
    close();
  }}
>
  {#if loading}
    <Skeleton rows={4} />
  {:else if mode !== 'create' && !account}
    <Empty description="暂无管理员" />
  {:else if mode === 'create'}
    <Form id="account-form" {model} {rules} disabled={busy} labelPosition="left" labelWidth={112} onsubmit={submit}>
      <FormItem prop="username" label="账号">
        <Input bind:value={model.username} aria-label="账号" placeholder="仅限 1–64 位英文字母"
          autocomplete="off" maxlength={64} />
      </FormItem>
      <FormItem prop="password" label="初始密码">
        <Input bind:value={model.password} aria-label="初始密码" type="password"
          minlength={8} maxlength={16} placeholder="8–16 位密码" autocomplete="new-password" />
      </FormItem>
      <Text tag="p" size="small">新增后可在编辑中分配角色。</Text>
    </Form>
  {:else if mode === 'edit' && account}
    <Form id="account-form" {model} {rules} disabled={busy} labelPosition="left" labelWidth={112} onsubmit={submit}>
      <FormItem label="账号"><Text truncated title={account.username}>{account.username}</Text></FormItem>
      <FormItem prop="password" label="新密码">
        <Input bind:value={model.password} aria-label="新密码" type="password"
          minlength={8} maxlength={16} placeholder="8–16 位，留空不修改" autocomplete="new-password" />
      </FormItem>
      <FormItem prop="state" label="状态">
        <Select bind:value={model.state} aria-label="管理员状态" options={[
          { label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' },
        ]} />
      </FormItem>
      <FormItem label="角色名称">
        {#if catalog}
          {#if catalog.length}
            <CheckboxGroup bind:value={assigned} options={choices} disabled={busy} aria-label="分配角色" />
          {:else}<Text>暂无可分配的角色</Text>{/if}
        {:else}
          <Empty description="暂无角色" />
        {/if}
      </FormItem>
    </Form>
  {:else if mode === 'delete' && account}
    <Text tag="p">确认删除管理员「{account.username}」吗？</Text>
  {:else if account}
    <Descriptions border={false}
      columns={2}
      direction="horizontal"
      items={[
        { key: 'username', label: '账号', value: account.username },
        { key: 'roles', label: '角色名称', value: roleNames(account.roles, catalog) },
        { key: 'state', label: '状态', value: stateText(account.state) },
        { key: 'root', label: '身份', value: account.root ? '超级管理员' : '普通管理员' },
        { key: 'id', label: '管理员 ID', value: account.id },
        { key: 'created', label: '创建时间', value: formatTime(account.created_at) },
      ]}
    >
      {#snippet item(entry)}
        {#if entry.key === 'root'}
          <IdentityTag root={account?.root ?? false} />
        {:else if entry.key === 'id'}
          <Text truncated title={String(entry.value)}>{entry.value}</Text>
        {:else}{entry.value}{/if}
      {/snippet}
    </Descriptions>
  {/if}
  {#snippet footer()}
    <Space wrap>
      <Button variant="plain" disabled={busy} onclick={() => (open = false)}>关闭</Button>
      {#if !loading && account && session.canWrite && (mode === 'detail' || mode === 'edit')}
        {#if mode === 'detail'}
          <Button tone="primary" onclick={() => (mode = 'edit')}>编辑</Button>
        {:else}
          <Button tone="primary" type="submit" form="account-form" loading={busy}
            disabled={busy || (!changed && model.state === account.state && !model.password)}>保存</Button>
        {/if}
      {:else if mode === 'create' && session.canWrite}
        <Button tone="primary" type="submit" form="account-form" loading={busy}
          disabled={busy || loading || (mode !== 'create' && !account)}>保存</Button>
      {:else if mode === 'delete' && session.canWrite}
        <Button tone="danger" loading={busy} disabled={busy || loading || !account} onclick={() => void remove()}>确认删除</Button>
      {/if}
    </Space>
  {/snippet}
</Dialog>
