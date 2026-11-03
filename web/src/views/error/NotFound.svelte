<script lang="ts">
  import { Button, Result } from '@luna/components';
  import { useRoute, useRouter } from 'luna-router';
  import { navigation } from '../../stores/index.svelte';

  const route = useRoute();
  const router = useRouter();

  const denied = $derived(route.path === '/denied');
</script>

<Result
  status={denied ? 'error' : 'warning'}
  title={denied ? '403' : '404'}
  description={denied ? '没有访问该页面的权限。' : '页面不存在或已被移除。'}
>
  {#snippet extra()}
    <Button tone="primary" type="button" disabled={navigation.firstPath === route.path} onclick={() => void router.push(navigation.firstPath)}>
      返回控制台
    </Button>
  {/snippet}
</Result>
