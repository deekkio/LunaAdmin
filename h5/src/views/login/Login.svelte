<script lang="ts">
  import { Button, Form, FormItem, Input, Space, Text } from '@luna/components/h5';
  import logo from '../../assets/luna.svg';
  import type { FormResult, FormRules } from '@luna/components/contracts';
  import User from '@lucide/svelte/icons/user';
  import Lock from '@lucide/svelte/icons/lock';
  import { api } from '../../api';
  import { session } from '../../stores/session';
  import { navigation } from '../../stores/navigation';
  import { useRouter } from 'luna-router';

  const router = useRouter();

  let model = $state({ account: '', password: '' });
  let loading = $state(false);

  const rules: FormRules<Record<string, unknown>> = {
    account: [{ required: true, message: '请输入账号' }],
    password: [
      { required: true, message: '请输入密码' },
      { min: 8, max: 16, message: '密码长度必须在 8 到 16 位之间' },
    ],
  };

  const login = async (): Promise<void> => {
    if (loading) return;
    loading = true;
    const result = await api.login({
      version: 1,
      username: model.account.trim(),
      password: model.password,
    });
    if (result.code === '' && result.data) {
      session.start(result.data.token, result.data.expires_at);
      const me = await api.me(result.data.token);
      if (me.code === '' && me.data) {
        session.setPrincipal(me.data);
        await navigation.load();
      }
      const next = router.currentRoute.query.next;
      const target =
        typeof next === 'string' && next.startsWith('/') ? next : navigation.firstPath;
      await router.replace(target);
    }
    loading = false;
  };

  const submit = (result: FormResult): void => {
    if (!result.valid) return;
    void login();
  };
</script>

<div class="login">
  <Space direction="vertical" alignment="center" size={28} width="100%">
    <Space direction="vertical" alignment="center" size={12} width="100%">
      <svg width="64" height="64" viewBox="0 0 1024 1024" fill="none" aria-hidden="true" focusable="false">
        <use href={`${logo}#rocket-vertical`} />
      </svg>
      <Text
        tag="div"
        role="heading"
        aria-level={1}
        size="large"
        style="color: var(--ln-text-1, #303133);"
      >登录控制台</Text>
      <Text size="small" style="color: var(--ln-text-2, #606266);"
      >登录 Luna，随时管理你的服务。</Text>
    </Space>
    <Form class="login-form" {model} {rules} labelPosition="top" onsubmit={submit}>
      <FormItem prop="account" reserveMessage>
        <Input bind:value={model.account} placeholder="账号" autocomplete="username" clearable>
          {#snippet prefix()}
            <User size={16} aria-hidden="true" />
          {/snippet}
        </Input>
      </FormItem>
      <FormItem prop="password" reserveMessage>
        <Input
          bind:value={model.password}
          type="password"
          showIcon
          clearable
          minlength={8}
          maxlength={16}
          placeholder="密码"
          autocomplete="current-password"
        >
          {#snippet prefix()}
            <Lock size={16} aria-hidden="true" />
          {/snippet}
        </Input>
      </FormItem>
      <Button tone="primary" block size="lg" type="submit" {loading} disabled={loading}>登录</Button>
    </Form>
  </Space>
</div>

<style>
  .login {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
  }
  .login :global(.login-form) {
    width: min(320px, 100%);
  }
</style>
