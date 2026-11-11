<script lang="ts">
  import { Descriptions } from '@luna/components';
  import IdentityTag from '../../components/IdentityTag.svelte';
  import {
    Avatar,
    Button,
    Card,
    Cell,
    CellGroup,
    Dialog,
    Form,
    FormItem,
    Input,
    Space,
    Text,
    Grid,
  } from '@luna/components/h5';
  import type { FormResult, FormRules } from '@luna/components/contracts';
  import { showToast } from '@luna/components/toast';
  import { useRouter } from 'luna-router';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import { session } from '../../stores/session';
  import { navigation } from '../../stores/navigation';
  import { homeLinks } from '../../layouts/home';
  import { menuIcon } from '../../layouts/icons';
  import type { FormModel } from '../../utils/rules';

  const router = useRouter();
  const tracker = new RequestTracker();
  const username = $derived(session.principal?.username ?? '管理员');
  let model = $state({ password: '', confirm: '' });
  const links = $derived(homeLinks(navigation.menu));
  let infoOpen = $state(false);
  let open = $state(false);
  let saving = $state(false);
  let logoutOpen = $state(false);
  let leaving = $state(false);

  const rules: FormRules<FormModel> = {
    password: [
      { required: true, message: '请输入新密码' },
      { min: 8, max: 16, message: '密码长度必须在 8 到 16 位之间' },
      { pattern: /^[^\p{Cc}]+$/u, message: '密码不能包含控制字符' },
    ],
    confirm: [
      { required: true, message: '请再次输入新密码' },
      { validator: (value, data) => value === data.password || '两次输入的密码不一致' },
    ],
  };

  const reset = (): void => {
    model = { password: '', confirm: '' };
    tracker.reset();
  };

  const save = async (): Promise<void> => {
    if (saving || !session.canWrite || !session.token || !session.account) return;
    const token = session.token;
    const account = session.account;
    saving = true;
    try {
      const result = await api.resetPassword(token, account, {
        version: 1,
        request: tracker.id({ account, password: model.password }),
        password: model.password,
      });
      if (result.code || session.token !== token) return;
      open = false;
      reset();
      session.clear();
      await router.replace({ path: '/login', query: { next: '/profile' } });
      showToast({ message: '密码已修改，请重新登录' });
    } finally {
      saving = false;
    }
  };

  const submit = (result: FormResult): void => {
    if (result.valid) void save();
  };

  const logout = async (): Promise<void> => {
    if (leaving || !session.token) return;
    const token = session.token;
    leaving = true;
    try {
      await api.logout(token);
      if (session.token !== token) return;
      session.clear();
      await router.replace('/login');
    } finally {
      leaving = false;
    }
  };
</script>

<PageNavbar title="我的" />
<div class="page">
<Grid min={480} gap={24}>
  <Card aria-label="当前账号">
    <Cell clickable={false}>
      {#snippet leading()}
        <Avatar
          size={48}
          label={(Array.from(username)[0] ?? '').toUpperCase()}
          style="margin-right: 14px;"
        />
      {/snippet}
      <Space size={16} wrap={false}>
        <Text tag="div" role="heading" aria-level={1} size="large" truncated title={username}>
          {username}
        </Text>
        <IdentityTag root={session.root} />
      </Space>
    </Cell>
  </Card>

  <Grid min={480} gap={12}>
    <Card aria-label="账号与安全">
      <CellGroup>
        <Cell
          title="账号资料"
          description="查看当前登录账号"
          icon={menuIcon('user-cog')}
          arrow
          onclick={() => {
            infoOpen = true;
          }}
        />
        {#if session.canWrite}
          <Cell
            title="修改密码"
            description="定期更新密码，保护账号安全"
            icon={menuIcon('key-round')}
            arrow
            onclick={() => {
              reset();
              open = true;
            }}
          />
        {:else}
          <Cell
            title="账号安全"
            description="如需修改密码，请联系超级管理员。"
            icon={menuIcon('key-round')}
          />
        {/if}
        {#if links.length > 0}
          <Cell
            title="服务中心"
            description="查看当前账号可访问的管理菜单"
            icon={menuIcon('shield-check')}
            arrow
            onclick={() => void router.push('/menu')}
          />
        {/if}
      </CellGroup>
    </Card>
  </Grid>

  <Button
    tone="danger"
    variant="plain"
    block
    size="lg"
    onclick={() => {
      logoutOpen = true;
    }}
  >
    退出登录
  </Button>
</Grid>
</div>

<Dialog bind:open={infoOpen} title="账号资料" cancelButton="关闭">
  <Descriptions columns={1} direction="horizontal" border={false} items={[
    { key: 'username', label: '用户名', value: username },
    { key: 'id', label: '账号 ID', value: session.account },
    { key: 'identity', label: '身份' },
  ]}>
    {#snippet item(entry)}
      {#if entry.key === 'identity'}<IdentityTag root={session.root} />{:else}{entry.value || '-'}{/if}
    {/snippet}
  </Descriptions>
</Dialog>

<Dialog bind:open title="修改密码" beforeClose={() => !saving} onclosed={reset}>
  <Form id="profile-password" {model} {rules} disabled={saving} labelPosition="left" labelWidth={112} onsubmit={submit}>
    <FormItem prop="password">
      <Input
        bind:value={model.password}
        type="password"
        placeholder="新密码（8–16 位）"
        aria-label="新密码"
        autocomplete="new-password"
        minlength={8}
        maxlength={16}
      />
    </FormItem>
    <FormItem prop="confirm">
      <Input
        bind:value={model.confirm}
        type="password"
        placeholder="再次输入新密码"
        aria-label="确认新密码"
        autocomplete="new-password"
        minlength={8}
        maxlength={16}
      />
    </FormItem>
    <Button tone="primary" block type="submit" loading={saving} disabled={saving}>保存密码</Button>
  </Form>
</Dialog>

<Dialog
  bind:open={logoutOpen}
  title="退出登录"
  cancelButton="取消"
  confirmButton={{ text: '退出登录', tone: 'danger' }}
  beforeConfirm={logout}
>
  <Text>确认退出当前账号吗？</Text>
</Dialog>

<style>
  .page {
    padding: 16px 14px 96px;
  }
</style>
