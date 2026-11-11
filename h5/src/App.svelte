<script lang="ts">
  import { ConfigProvider, H5Root, TabBar } from '@luna/components/h5';
  import { zhCN } from '@luna/components/locale/zh-CN';
  import User from '@lucide/svelte/icons/user';
  import { RouterProvider, RouterView } from 'luna-router';
  import { onDestroy } from 'svelte';
  import { session } from './stores/session';
  import { navigation } from './stores/navigation';
  import { router } from './router';
  import { homeLinks, homePath } from './layouts/home';
  import { menuIcon } from './layouts/icons';
  import { mobilePage } from './layouts/mobile';
  import { pagePath } from './router/views';

  let current = $state.raw(router.currentRoute);
  onDestroy(
    router.subscribe((route) => {
      current = route;
    }),
  );
  const onPublicRoute = $derived(Boolean(current.meta.public));
  const links = $derived(homeLinks(navigation.menu));
  const ordersPath = $derived(pagePath(navigation.menu, 'Orders'));
  const tabs = $derived([
    { value: homePath(navigation.menu), label: '首页', icon: menuIcon('layout-dashboard') },
    ...(links.length > 0
      ? [{ value: '/menu', label: '服务', icon: menuIcon('apps') }]
      : []),
    ...(ordersPath ? [{ value: ordersPath, label: '订单', icon: menuIcon('shopping-cart') }] : []),
    { value: '/profile', label: '我的', icon: User },
  ]);
  const page = $derived(
    mobilePage(current.path, homePath(navigation.menu), current.meta.parent, navigation.menu),
  );
  const showTabs = $derived(
    session.authenticated && !onPublicRoute && current.matched.length > 0 && page.root,
  );

  // 会话清除时同步重置动态导航。
  $effect(() => {
    if (!session.authenticated && navigation.loaded) navigation.reset();
  });

  // 401 清除会话后回到登录页。
  $effect(() => {
    if (!session.authenticated && current.matched.length > 0 && !onPublicRoute) {
      void router.replace({ path: '/login', query: { next: current.fullPath } });
    }
  });
</script>

<H5Root>
  <ConfigProvider locale={zhCN}>
    <RouterProvider {router} onError={(error) => console.error(error)}>
      <RouterView />
      {#if showTabs}
        <TabBar
          items={tabs}
          value={page.tab}
          fixed
          placeholder
          safeArea
          ariaLabel="主导航"
          onchange={(value) => void router.push(value)}
        />
      {/if}
    </RouterProvider>
  </ConfigProvider>
</H5Root>
