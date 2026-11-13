<script lang="ts">
  import { Button, Form, FormItem, Input, Space, Text } from '@luna/components';
  import type { FormResult, FormRules } from '@luna/components/contracts';
  import User from '@lucide/svelte/icons/user';
  import Lock from '@lucide/svelte/icons/lock';
  import logo from '../../assets/luna.svg';
  import { api } from '../../api';
  import { session, navigation } from '../../stores/state.svelte';
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
      if (session.token !== result.data.token) {
        loading = false;
        return;
      }
      if (me.code === '' && me.data) {
        session.setPrincipal(me.data);
        await navigation.load();
      }
      const next = router.currentRoute.query.next;
      const target =
        typeof next === 'string' && next.startsWith('/')
          ? next
          : navigation.firstPath;
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
  <section class="brand" aria-label="Luna">
    <Space size={12}>
      <img src={logo} alt="Luna" width="48" height="48" />
      <h1>Luna</h1>
    </Space>
    <div class="brand-content">
      <Space direction="vertical" alignment="start" size={16}>
        <h2 class="brand-title">
          统一管理，轻松掌控<br />让每一项服务井然有序
        </h2>
        <p class="brand-note">节点、用户、订单与权限，一站协同。</p>
      </Space>
    </div>
  </section>

  <section class="panel" aria-labelledby="login-title">
    <Space
      direction="vertical"
      alignment="stretch"
      size={24}
      class="login-form"
    >
      <img class="panel-logo" src={logo} alt="Luna" width="40" height="40" />
      <h2 id="login-title">管理员登录</h2>
      <Form
        labelPosition="left" labelWidth={112}
        {model}
        {rules}
        disabled={loading}
        scrollToError
        aria-label="管理员登录"
        onsubmit={submit}
      >
        <FormItem prop="account" reserveMessage>
          <Input
            bind:value={model.account}
            clearable
            size="large"
            placeholder="管理员账号"
            aria-label="管理员账号"
            autocomplete="username"
            autocapitalize="none"
            spellcheck={false}
          >
            {#snippet prefix()}
              <User size={16} aria-hidden="true" />
            {/snippet}
          </Input>
        </FormItem>
        <FormItem prop="password" reserveMessage>
          <Input
            bind:value={model.password}
            type="password" minlength={8} maxlength={16}
            showIcon
            clearable
            size="large"
            placeholder="管理员密码"
            aria-label="管理员密码"
            autocomplete="current-password"
          >
            {#snippet prefix()}
              <Lock size={16} aria-hidden="true" />
            {/snippet}
          </Input>
        </FormItem>
        <Button
          tone="primary"
          block
          size="lg"
          type="submit"
          {loading}
          disabled={loading}
        >
          登录控制台
        </Button>
      </Form>
      <Text tag="p" size="small">忘记密码请联系管理员</Text>
    </Space>
  </section>
</div>

<style>
  .login {
    display: flex;
    min-height: 100vh;
  }

  .brand {
    flex: 1 1 58%;
    display: flex;
    flex-direction: column;
    padding: 48px 56px;
    background: #07152f url('../../assets/login-bg.png') left center no-repeat;
    background-size: max(100%, 800px, 81vh) auto;
    color: #fff;
  }

  .brand-content {
    display: flex;
    flex: 1;
    align-items: center;
  }

  .brand h1 {
    margin: 0;
    font-size: 24px;
  }

  .brand-title {
    margin: 0;
    font-size: 32px;
    font-weight: 600;
    line-height: 1.35;
  }

  .brand-note {
    margin: 0;
    font-size: 14px;
    line-height: 1.7;
    color: rgb(255 255 255 / 72%);
  }

  .panel {
    flex: 1 1 42%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 40px;
    background: var(--ln-card-bg, #fff);
  }

  .panel > :global(.login-form) {
    width: 100%;
    max-width: 320px;
  }

  .panel h2 {
    margin: 0;
    font-size: 26px;
  }

  .panel-logo {
    display: none;
  }

  @media (max-width: 880px) {
    .brand {
      display: none;
    }
    .panel-logo {
      display: block;
    }
  }
</style>
