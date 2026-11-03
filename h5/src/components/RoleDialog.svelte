<script lang="ts">
  import { Descriptions, Scrollbar } from '@luna/components';
  import { onDestroy, untrack } from 'svelte';
  import {
    Button, Dialog, Form, FormItem, Input, Switch, Checkbox, CheckboxGroup,
    Tabs, Card, Text, Tag, Space, Grid, Row, Skeleton, Empty,
  } from '@luna/components/h5';
  import type { FormResult, FormRules } from '@luna/components/contracts';
  import { showToast } from '@luna/components/toast';
  import { api } from '../api';
  import { RequestTracker } from '../api/request';
  import type { Permission, Role } from '../api/types';
  import { session } from '../stores/session';
  import { canEdit, fetchPerms, isRoot, mergeGrants, newRole, permGroups, type RoleMode } from '../views/access/roles';
  import { ROLE_CODE_PATTERN, type FormModel } from '../utils/rules';

  interface Props {
    open?: boolean;
    id?: string;
    mode?: RoleMode;
    onsaved?: () => void;
    onclosed?: () => void;
  }
  let { open = $bindable(false), id = '', mode = $bindable('detail'), onsaved, onclosed }: Props = $props();
  const tracker = new RequestTracker();
  let role = $state<Role | null>(null);
  let catalog = $state<Permission[] | null>(null);
  let selected = $state<string[]>([]);
  let model = $state({ id: '', code: '', name: '', enabled: true });
  let section = $state('base');
  let query = $state('');
  let loading = $state(false);
  let busy = $state(false);
  let sequence = 0;
  let alive = true;
  const title = $derived({ create: '新增角色', detail: '角色详情', edit: '编辑角色' }[mode]);
  const full = $derived(isRoot(role));
  const editable = $derived(session.canWrite && canEdit(role, session.principal?.root === true));
  const locked = $derived(Boolean(role?.system));
  const groups = $derived(permGroups(catalog ?? []));
  const visible = $derived(permGroups((catalog ?? []).filter((item) => {
    const term = query.trim().toLowerCase();
    return !term || `${item.name} ${item.code}`.toLowerCase().includes(term);
  })));
  const granted = $derived(full ? (catalog ?? []).filter((item) => item.enabled).map((item) => item.code) : (role?.permissions ?? []));
  const missing = $derived(granted.filter((code) => !catalog?.some((item) => item.code === code)));
  const changed = $derived(Boolean(role
    ? selected.length !== role.permissions.length || selected.some((code) => !role!.permissions.includes(code))
    : selected.length));
  const dirty = $derived(mode === 'create' || Boolean(role && (
    model.name.trim() !== role.name || model.enabled !== role.enabled || changed
  )));
  const rules: FormRules<FormModel> = {
    code: [
      { required: true, message: '请输入角色代码' },
      { pattern: ROLE_CODE_PATTERN, message: '代码以小写字母开头，可包含小写字母、数字、下划线和连字符' },
      { max: 64, message: '角色代码不能超过 64 个字符' },
      { validator: (value) => mode === 'create' && ['root', 'admin'].includes(String(value)) ? 'root 和 admin 为系统保留代码' : undefined },
    ],
    name: [
      { required: true, message: '请输入角色名称' },
      { max: 64, message: '角色名称不能超过 64 个字符' },
      { validator: (value) => String(value ?? '').trim() ? undefined : '请输入角色名称' },
    ],
  };
  const accepts = (token: string | null, current: number): boolean => alive && token === session.token && current === sequence;
  const notify = (message: string): void => { showToast({ message }); };

  $effect(() => {
    if (!open) return;
    const key = id;
    const action = mode;
    untrack(() => void load(key, action));
  });
  onDestroy(() => { alive = false; sequence++; tracker.reset(); });

  const load = async (key: string, action: RoleMode): Promise<void> => {
    const current = ++sequence;
    const token = session.token;
    loading = true;
    role = null;
    selected = [];
    query = '';
    section = 'base';
    tracker.reset();
    const [result, permissions] = await Promise.all([
      action === 'create' ? Promise.resolve(null) : api.role(token ?? '', key),
      fetchPerms(token ?? ''),
    ]);
    if (!accepts(token, current)) return;
    role = result?.code ? null : (result?.data ?? null);
    catalog = permissions;
    if (role) {
      model = { id: role.id, code: role.code, name: role.name, enabled: role.enabled };
      selected = [...role.permissions];
      if (role.system) section = 'grants';
    } else if (action === 'create') {
      model = { id: newRole(), code: '', name: '', enabled: true };
    }
    loading = false;
  };

  const save = async (): Promise<void> => {
    if (busy || loading || !editable || !dirty || !session.token || selected.length > 256
      || (mode !== 'create' && !role) || (locked && (!catalog || !changed))) return;
    const token = session.token;
    const current = sequence;
    const payload = {
      id: model.id, code: model.code, name: model.name.trim(), enabled: model.enabled,
      ...(catalog && changed ? { permissions: [...selected].sort() } : {}),
    };
    busy = true;
    try {
      const result = locked
        ? await api.grant(token, model.id, { version: 1, request: tracker.id(payload), permissions: [...selected].sort() })
        : await api.saveRole(token, { version: 1, request: tracker.id(payload), ...payload });
      if (!accepts(token, current) || result.code || !result.data) return;
      tracker.reset();
      open = false;
      notify(mode === 'create' ? '角色已新增' : '角色已更新');
      onsaved?.();
    } finally { busy = false; }
  };
  const submit = (result: FormResult): void => {
    if (result.valid) void save();
    else section = 'base';
  };
</script>

{#snippet basic()}
  <Grid min={260} gap={16}>
    <FormItem prop="name" label="角色名称">
      <Input bind:value={model.name} aria-label="角色名称" maxlength={64} disabled={locked} placeholder="例如：运营管理员" />
    </FormItem>
    <FormItem prop="code" label="角色代码">
      <Input bind:value={model.code} aria-label="角色代码" maxlength={64} disabled={mode === 'edit'} placeholder="例如：operator" />
    </FormItem>
  </Grid>
  <FormItem label="启用角色"><Switch bind:checked={model.enabled} aria-label="启用角色" disabled={busy || locked} /></FormItem>
  {#if locked}<Text tag="p" type="info" size="small">系统角色的基本信息由系统维护，可编辑角色权限。</Text>{/if}
{/snippet}

{#snippet permissions()}
  <Grid min={720} gap={16}>
    <Row justify="space-between" align="middle">
      <Space width={240}>
        <Input bind:value={query} aria-label="搜索权限" placeholder="搜索权限名称或权限码" clearable disabled={busy} />
      </Space>
      <Space wrap>
        <Button variant="text" disabled={busy || !catalog} onclick={() => { selected = catalog!.filter((item) => item.enabled).map((item) => item.code); }}>全选</Button>
        <Button variant="text" disabled={busy || !selected.length} onclick={() => (selected = [])}>清空</Button>
      </Space>
    </Row>
    {#if selected.length > 256}<Text type="danger">最多授予 256 项权限，请调整选择。</Text>{/if}
    {#if catalog}
      <Grid min={260} gap={16}>
        {#each visible as group (group.key)}
          {@const codes = group.items.filter((item) => item.enabled || selected.includes(item.code)).map((item) => item.code)}
          {@const count = codes.filter((code) => selected.includes(code)).length}
          <Card aria-label={group.label}>
            <Grid min={520} gap={12} role="group" aria-label={group.label}>
              <Row justify="space-between" align="middle">
                <Checkbox label={group.label} checked={codes.length > 0 && count === codes.length}
                  indeterminate={count > 0 && count < codes.length} disabled={busy || !codes.length}
                  onchange={(checked) => { selected = mergeGrants(selected, codes, checked ? codes : []); }} />
                <Text type="info" size="small">{count} / {codes.length}</Text>
              </Row>
              <CheckboxGroup value={selected.filter((code) => group.items.some((item) => item.code === code))}
                options={group.items.map((item) => ({ value: item.code, label: `${item.name}${item.enabled ? '' : '（已停用）'}`, disabled: !item.enabled && !selected.includes(item.code) }))}
                disabled={busy} onchange={(values) => { selected = mergeGrants(selected, group.items.map((item) => item.code), values.map(String)); }} />
            </Grid>
          </Card>
        {:else}<Empty description={query.trim() ? '未找到匹配权限' : '暂无可用权限'} />{/each}
      </Grid>
    {:else}
      <Empty description="暂无权限" />
    {/if}
  </Grid>
{/snippet}

<Dialog bind:open {title}  beforeClose={() => !busy} {onclosed}>
  {#if loading}<Skeleton rows={4} />
  {:else if mode !== 'create' && !role}
    <Empty description="暂无角色" />
  {:else if (mode === 'create' || mode === 'edit') && editable}
    <Form id="role-form" {model} {rules} disabled={busy} labelPosition="left" labelWidth={112} onsubmit={submit}>
      <Tabs bind:value={section} type="card" animated={false} aria-label="角色编辑"
        items={[
          { name: 'base', label: '基本信息', disabled: busy },
          { name: 'grants', label: '角色权限', disabled: busy },
        ]}>
        {#snippet children(active)}
          <Scrollbar height="min(480px, calc(100dvh - 280px))" native>
            <div hidden={active?.name !== 'base'}>{@render basic()}</div>
            <div hidden={active?.name !== 'grants'}>{@render permissions()}</div>
          </Scrollbar>
        {/snippet}
      </Tabs>
    </Form>
  {:else if role}
    <Descriptions border={false} columns={2} direction="horizontal" items={[
      { key: 'name', label: '角色名称', value: role.name }, { key: 'code', label: '角色代码', value: role.code },
      { key: 'state', label: '状态', value: role.enabled ? '已启用' : '已停用' },
      { key: 'system', label: '类型', value: role.system ? '系统角色' : '自定义角色' },
      { key: 'id', label: '角色 ID', value: role.id },
    ]}>
      {#snippet item(entry)}
        {#if entry.key === 'state'}
          <Tag tone={role?.enabled ? 'success' : 'info'}>{entry.value}</Tag>
        {:else if entry.key === 'system'}
          <Tag tone={role?.system ? 'info' : 'neutral'}>{entry.value}</Tag>
        {:else}{entry.value}{/if}
      {/snippet}
    </Descriptions>
    {#if catalog}
      <Grid min={260} gap={16}>
        {#each groups as group (group.key)}
          {@const items = group.items.filter((item) => granted.includes(item.code))}
          {#if items.length}<Card aria-label={group.label}><Grid min={520} gap={12}>
            <Text>{group.label}</Text><Space wrap>{#each items as item (item.code)}<Tag>{item.name}</Tag>{/each}</Space>
          </Grid></Card>{/if}
        {/each}
      </Grid>
      {#if missing.length}<Space wrap>{#each missing as code (code)}<Tag tone="warning">{code}（不可用）</Tag>{/each}</Space>{/if}
      {#if !granted.length}<Empty description="尚未配置权限" />{/if}
    {:else}<Empty description="暂无权限" />{/if}
  {/if}
  {#snippet footer()}
    <Button variant="plain" disabled={busy} onclick={() => (open = false)}>{mode === 'detail' ? '关闭' : '取消'}</Button>
    {#if !loading && role && mode === 'detail' && editable}
      <Button tone="primary" onclick={() => (mode = 'edit')}>编辑</Button>
    {:else if (mode === 'create' || mode === 'edit') && editable}
      <Button tone="primary" type="submit" form="role-form" loading={busy}
        disabled={busy || loading || !editable || !dirty || selected.length > 256 || (locked && (!catalog || !changed)) || (mode !== 'create' && !role)}>保存</Button>
    {/if}
  {/snippet}
</Dialog>
