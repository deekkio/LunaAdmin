<script lang="ts">
  import {
    Aside,
    Avatar,
    Breadcrumb,
    Button,
    Container,
    Dropdown,
    Header,
    Icon,
    Link,
    Main,
    Menu,
    Row,
    Space,
    Text,
  } from '@luna/components';
  import type { DropdownItem, MenuItem } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { onMount, untrack, type Snippet } from 'svelte';
  import PanelClose from '@lucide/svelte/icons/panel-left-close';
  import PanelOpen from '@lucide/svelte/icons/panel-left-open';
  import Maximize from '@lucide/svelte/icons/maximize';
  import Minimize from '@lucide/svelte/icons/minimize';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Languages from '@lucide/svelte/icons/languages';
  import { api } from '../api';
  import { session, navigation, preferences } from '../stores/index.svelte';
  import { router } from '../router';
  import { pageTrail } from '../router/routes';
  import { useRoute } from 'luna-router';
  import { menuIcon } from '../components/ReIcon';
  import { menuOpen } from '@luna/components/menu';
  import type { NavRoute } from '../api/types';
  import logo from '../assets/luna.svg?no-inline';

  const route = useRoute();

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  const copy = $derived(preferences.text);
  const menuItems = (routes: readonly NavRoute[]): MenuItem[] => {
    return routes.map((route) => ({
      key: route.path,
      label: route.title,
      iconComponent: menuIcon(route.icon, route.children.length > 0),
      children: route.children.length ? menuItems(route.children) : undefined,
    }));
  };
  const items = $derived(menuItems(navigation.menu));
  const active = $derived(route.path);
  const trail = $derived(pageTrail(navigation.menu, active));
  const crumbs = $derived(trail.map((entry, index) => ({
    label: entry.title,
    href: index < trail.length - 1 ? `#${entry.path}` : undefined,
    current: index === trail.length - 1,
  })));
  let openKeys = $state<string[]>([]);
  let popups = $state<string[]>([]);
  let storage = '';

  const menuKeys = (
    items: readonly MenuItem[],
    path: string,
    saved: readonly string[] = [],
  ): string[] => {
    const branches: string[] = [];
    let selected: string[] = [];
    let length = -1;
    const walk = (nodes: readonly MenuItem[], parents: string[]): void => {
      for (const item of nodes) {
        if (item.disabled) continue;
        const branch = Boolean(item.children?.length);
        const chain = branch ? [...parents, item.key] : parents;
        if (path === item.key) {
          selected = chain;
          length = Infinity;
        } else if (item.key !== '/' && path.startsWith(`${item.key}/`) && item.key.length > length) {
          selected = chain;
          length = item.key.length;
        }
        if (branch) {
          branches.push(item.key);
          walk(item.children!, chain);
        }
      }
    };
    walk(items, []);
    const expanded = new Set([...saved, ...selected]);
    return menuOpen(items, branches.filter((key) => expanded.has(key)));
  };

  const readMenu = (account: string): string[] => {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem('m') ?? 'null');
      if (!value || typeof value !== 'object' || !('account' in value) || value.account !== account || !('keys' in value) || !Array.isArray(value.keys)) return [];
      return value.keys.filter((item): item is string => typeof item === 'string');
    } catch {
      return [];
    }
  };

  $effect(() => {
    const account = session.account;
    const loaded = navigation.loaded;
    const nodes = items;
    const path = active;
    if (!loaded || !account) return;
    untrack(() => {
      const saved = storage === account ? openKeys : readMenu(account);
      storage = account;
      openKeys = menuKeys(nodes, path, saved);
      popups = [];
    });
  });

  $effect(() => {
    const keys = openKeys;
    if (!storage) return;
    try {
      sessionStorage.setItem('m', JSON.stringify({ account: storage, keys }));
    } catch {
      // 浏览器禁用存储时仍保留本次页面内的展开状态。
    }
  });

  // 折叠菜单的临时浮层状态不覆盖展开模式下保存的目录。
  const getOpen = (): string[] => (preferences.collapsed ? popups : openKeys);
  const setOpen = (keys: string[]): void => {
    if (preferences.collapsed) popups = keys;
    else openKeys = keys;
  };

  const username = $derived(session.principal?.username?.trim() || copy.administrator);
  const initial = $derived((Array.from(username)[0] ?? '').toUpperCase());
  const modeIcon = $derived(
    preferences.mode === 'system' ? Monitor : preferences.mode === 'dark' ? Moon : Sun,
  );
  let full = $state(false);
  let supported = $state(false);

  onMount(() => {
    const sync = (): void => {
      full = Boolean(document.fullscreenElement);
    };
    supported =
      document.fullscreenEnabled &&
      typeof document.documentElement.requestFullscreen === 'function';
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  });

  const toggleFull = async (): Promise<void> => {
    if (!supported) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      showMessage({ type: 'error', message: copy.fullError });
    }
  };

  const themes = $derived<DropdownItem[]>([
    { value: 'light', label: copy.light },
    { value: 'dark', label: copy.dark },
    { value: 'system', label: copy.system },
  ]);
  const languages: DropdownItem[] = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en-US', label: 'English' },
  ];

  const userActions = $derived.by<DropdownItem[]>(() => [
    { value: 'logout', label: copy.logout, danger: true },
  ]);

  const onselect = (key: string): void => {
    if (key !== active) void router.push(key);
  };

  const oncommand = async (value: string): Promise<void> => {
    if (value !== 'logout') return;
    const token = session.token;
    if (token) await api.logout(token);
    if (session.token !== token) return;
    session.clear();
    void router.push('/login');
  };
</script>

{#snippet brand(collapsed: boolean)}
  <Header height="56px" style="border-bottom: 1px solid var(--ln-border-1, #e4e7ed);">
    <Row align="middle" justify={collapsed ? 'center' : 'start'} style="height: 100%;">
      <Link href={`#${navigation.firstPath}`} underline="never" aria-label={copy.brand} title={copy.brand}>
        <Space size={8} wrap={false}>
          <svg width="24" height="24" viewBox="0 0 1024 1024" fill="none" aria-hidden="true" focusable="false">
            <use href={`${logo}#rocket-vertical`} />
          </svg>
          {#if !collapsed}
            <Text truncated size="large" style="font-weight: 600; color: var(--ln-text-1, #303133);">
              {copy.brand}
            </Text>
          {/if}
        </Space>
      </Link>
    </Row>
  </Header>
{/snippet}

{#snippet footer(collapsed: boolean)}
  {#if !collapsed}
    <Text size="small" style="color: var(--ln-text-3, #86909c);">{copy.version} v1.0.0</Text>
  {/if}
{/snippet}

<Container style="height: 100vh;">
  <Aside
    id="admin-sidebar"
    width="auto"
    style="background: var(--ln-bg-1, #fff); overflow: {preferences.collapsed ? 'visible' : 'auto'};"
  >
    <Menu
      {items}
      value={active}
      bind:openKeys={getOpen, setOpen}
      collapsed={preferences.collapsed}
      width={220}
      collapsedWidth={64}
      bordered={false}
      {onselect}
      header={brand}
      footer={footer}
      ariaLabel={copy.navigation}
      style="min-height: 100%; border-right: 1px solid var(--ln-border-1, #e4e7ed);"
    />
  </Aside>
  <Container direction="vertical" style="min-height: 0;">
    <Header
      height="56px"
      style="background: var(--ln-bg-1, #fff); border-bottom: 1px solid var(--ln-border-1, #e4e7ed);"
    >
      <Row justify="space-between" align="middle" style="height: 100%;">
        <Space size={12}>
          <Button
            variant="text"
            shape="circle"
            aria-label={preferences.collapsed ? copy.expand : copy.collapse}
            title={preferences.collapsed ? copy.expand : copy.collapse}
            aria-controls="admin-sidebar"
            aria-expanded={!preferences.collapsed}
            onclick={preferences.toggleMenu}
          >
            <Icon icon={preferences.collapsed ? PanelOpen : PanelClose} size={18} />
          </Button>
          <Space>
            <Breadcrumb items={crumbs} ariaLabel={copy.breadcrumb} />
          </Space>
        </Space>
        <Space size={8}>
          <Button
            variant="text"
            shape="circle"
            aria-label={full ? copy.exitFull : copy.enterFull}
            title={supported ? (full ? copy.exitFull : copy.enterFull) : copy.fullUnavailable}
            aria-pressed={full}
            disabled={!supported}
            onclick={() => void toggleFull()}
          >
            <Icon icon={full ? Minimize : Maximize} size={18} />
          </Button>
          <Dropdown
            items={themes}
            value={preferences.mode}
            placement="bottom-end"
            showArrow={false}
            oncommand={preferences.setMode}
          >
            {#snippet reference(state)}
              <Button
                {...state}
                variant="text"
                shape="circle"
                aria-label={copy.theme}
                title={copy.theme}
              >
                <Icon icon={modeIcon} size={18} />
              </Button>
            {/snippet}
          </Dropdown>
          <Dropdown
            items={languages}
            value={preferences.language}
            placement="bottom-end"
            showArrow={false}
            oncommand={preferences.setLanguage}
          >
            {#snippet reference(state)}
              <Button
                {...state}
                variant="text"
                shape="circle"
                aria-label={copy.language}
                title={copy.language}
              >
                <Icon icon={Languages} size={18} />
              </Button>
            {/snippet}
          </Dropdown>
          <Dropdown
            items={userActions}
            placement="bottom-end"
            showArrow={false}
            oncommand={(value) => void oncommand(value)}
          >
            {#snippet reference(state)}
              <Button {...state} variant="text" aria-label={username} title={username}>
                <Space>
                  <Avatar label={initial} size="small" />
                  <Text truncated style="max-width: 160px;">{username}</Text>
                </Space>
              </Button>
            {/snippet}
          </Dropdown>
        </Space>
      </Row>
    </Header>
    <Main fill>
      {@render children()}
    </Main>
  </Container>
</Container>
