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
  import { session, navigation, preferences, readUser, saveUser } from '../stores/state.svelte';
  import { router, pageTrail } from '../router/router';
  import { useRoute } from 'luna-router';
  import { menuIcon } from '../components/ReIcon';
  import { menuFind, menuOpen } from '@luna/components/menu';
  import type { NavRoute } from '../api/types';
  import logo from '../assets/luna.svg?no-inline';

  const route = useRoute();

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  const copy = $derived(preferences.locale.app);
  const menuPaths = (routes: readonly NavRoute[], trail: readonly NavRoute[] = []): Map<string, string> => {
    const paths = new Map<string, string>();
    const current = new Map(trail.map(item => [String(item.id), item.path]));
    const walk = (items: readonly NavRoute[]): void => {
      for (const item of items) {
        if (!item.group) paths.set(String(item.id), current.get(String(item.id)) ?? item.path);
        walk(item.children);
      }
    };
    walk(routes);
    return paths;
  };
  const menuItems = (routes: readonly NavRoute[], paths: ReadonlyMap<string, string> = new Map()): MenuItem[] =>
    routes.flatMap(item => {
      const children = menuItems(item.children, paths);
      if (item.group) return children.map((child, index) => index === 0 ? { ...child, group: item.title } : child);
      if (!item.view && !children.length) return [];
      return [{
        key: String(item.id), label: item.title,
        iconComponent: menuIcon(item.icon, children.length > 0),
        children: children.length ? children : undefined,
        ...((paths.get(String(item.id)) ?? item.path).includes(':') ? { disabled: true } : {}),
      }];
    });
  const trail = $derived(pageTrail(router, route));
  const paths = $derived(menuPaths(navigation.menu, trail));
  const items = $derived(menuItems(navigation.menu, paths));
  const active = $derived(String([...trail].reverse().find(item => paths.has(String(item.id)))?.id ?? ''));
  const crumbs = $derived(trail.map((entry, index) => ({
    label: entry.title,
    href: !entry.group && !entry.path.includes(':') && index < trail.length - 1 ? `#${entry.path}` : undefined,
    current: index === trail.length - 1,
  })));
  let openKeys = $state<string[]>([]);
  let popups = $state<string[]>([]);
  let menuMode = untrack(() => preferences.collapsed);
  let storage = '';

  const menuKeys = (
    items: readonly MenuItem[],
    path: string,
    saved: readonly string[] = [],
  ): string[] => {
    const selected = menuFind(items, path)?.path.map(item => item.key) ?? [];
    const expanded = new Set([...saved, ...selected]);
    const branches: string[] = [];
    const walk = (nodes: readonly MenuItem[]): void => {
      for (const item of nodes) {
        if (item.children?.length) {
          if (expanded.has(item.key)) branches.push(item.key);
          walk(item.children);
        }
      }
    };
    walk(items);
    return menuOpen(items, branches);
  };

  const readMenu = (account: string): string[] => {
    const stored = readUser();
    const value = stored?.token === session.token ? stored.sidebar : undefined;
    if (!value || value.account !== account || !Array.isArray(value.keys)) return [];
    return value.keys.filter((item): item is string => typeof item === 'string');
  };

  $effect(() => {
    const account = session.account;
    const loaded = navigation.loaded;
    const nodes = items;
    const path = active;
    const collapsed = preferences.collapsed;
    if (!loaded || !account) {
      untrack(() => { storage = ''; openKeys = []; popups = []; menuMode = collapsed; });
      return;
    }
    untrack(() => {
      const saved = storage === account ? openKeys : readMenu(account);
      storage = account;
      openKeys = menuKeys(nodes, path, saved);
      popups = [];
      menuMode = collapsed;
    });
  });

  $effect(() => {
    const keys = openKeys;
    if (!storage) return;
    saveUser({ sidebar: { account: storage, keys } });
  });

  // 折叠菜单的临时浮层状态不覆盖展开模式下保存的目录。
  const getOpen = (): string[] => (preferences.collapsed ? popups : openKeys);
  const setOpen = (keys: string[]): void => {
    // Menu 清理布局浮层时，不覆盖持久目录状态。
    if (menuMode !== preferences.collapsed) return;
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
    const path = paths.get(key);
    if (path && !path.includes(':') && path !== route.path) void router.push(path);
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

<Container style="height: 100vh;">
  <Aside
    id="admin-sidebar"
    width="auto"
    style="background: var(--ln-bg-1, #fff); overflow: {preferences.collapsed ? 'visible' : 'auto'};"
  >
    {#key navigation.routes}
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
        ariaLabel={copy.navigation}
        style="min-height: 100%; border-right: 1px solid var(--ln-border-1, #e4e7ed);"
      />
    {/key}
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
