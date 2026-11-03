<script lang="ts">
  import { Descriptions } from '@luna/components';
  import IdentityTag from './IdentityTag.svelte';
  import { onDestroy, untrack } from 'svelte';
  import {
    Button,
    Dialog,
    Form,
    FormItem,
    Input,
    CheckboxGroup,
    Text,
    Space,
    Skeleton,
    Empty,
    Picker,
  } from '@luna/components/h5';
  import type { FormResult, FormRules } from '@luna/components/contracts';
  import { showToast } from '@luna/components/toast';
  import { useRouter } from 'luna-router';
  import { api } from '../api';
  import { RequestTracker } from '../api/request';
  import type { Account, Role } from '../api/types';
  import { session } from '../stores/session';
  import { fetchRoles, roleNames, type AccountMode } from '../views/access/accounts';
  import { formatTime, stateText } from '../utils/format';
  import type { FormModel } from '../utils/rules';

  interface Props {
    open?: boolean;
    id?: string;
    mode?: AccountMode;
    roles?: Role[] | null;
    onsaved?: () => void;
    onclosed?: () => void;
  }

  let {
    open = $bindable(false),
    id = '',
    mode = $bindable('detail'),
    roles: source,
    onsaved,
    onclosed,
  }: Props = $props();
  const router = useRouter();
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
    showToast({ message });
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

<Dialog
  bind:open
  {title}
  beforeClose={() => !busy}
  onclosed={() => {
    model.password = '';
    reset();
    onclosed?.();
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
        <Picker title="管理员状态" bind:value={model.state} aria-label="管理员状态" options={[
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
