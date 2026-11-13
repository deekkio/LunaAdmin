<script lang="ts">
  import PcRoot from '@luna/components/pc-root';
  import { ConfigProvider } from '@luna/components';
  import { watchTheme } from '@luna/components/theme';
  import { RouterProvider, RouterView } from 'luna-router';
  import AdminLayout from './layouts/AdminLayout.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { session, preferences } from './stores/state.svelte';
  import { router } from './router/router';

  let current = $state.raw(router.currentRoute);
  onDestroy(router.subscribe(route => { current = route; }));
  const onPublicRoute = $derived(Boolean(current.meta.public));

  onMount(() => watchTheme((_, mode) => { preferences.mode = mode; }));

  $effect(() => {
    document.documentElement.lang = preferences.language;
    document.title = `${String(current.meta.title ?? 'Luna')} · ${preferences.locale.app.brand}`;
  });

  // 401 清除会话后回到登录页。
  $effect(() => {
    if (!session.authenticated && current.matched.length > 0 && !onPublicRoute) {
      void router.replace({ path: '/login', query: { next: current.fullPath } });
    }
  });
</script>

<PcRoot>
  <ConfigProvider locale={preferences.locale}>
    <RouterProvider {router} onError={(error) => console.error(error)}>
      {#if session.authenticated && !onPublicRoute}
        <AdminLayout>
          {#key current.name}
            <RouterView />
          {/key}
        </AdminLayout>
      {:else}
        {#key current.name}
          <RouterView />
        {/key}
      {/if}
    </RouterProvider>
  </ConfigProvider>
</PcRoot>
