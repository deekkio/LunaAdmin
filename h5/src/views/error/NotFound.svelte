<script lang="ts">
  import { Button, Result, Grid } from '@luna/components/h5';
  import { navigation } from '../../stores/navigation';
  import { homePath } from '../../layouts/home';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { useRoute, useRouter } from 'luna-router';

  const route = useRoute();
  const router = useRouter();

  const denied = $derived(route.path === '/denied');
</script>

<PageNavbar title={denied ? '无权访问' : '页面不存在'} back />

<Grid min={480} gap={16}>
  <Result
    status={denied ? 'error' : 'warning'}
    title={denied ? '403 · 没有访问权限' : '404 · 页面不存在'}
    description={denied ? '当前账户没有访问该页面的权限。' : '页面不存在或已被移除。'}
  />
  <Button
    tone="primary"
    block
    type="button"
    onclick={() => void router.replace(homePath(navigation.menu))}
  >
    返回首页
  </Button>
</Grid>
