<script lang="ts">
  import { useRoute, useRouter } from 'luna-router';
  import AccountDialog from '../../components/AccountDialog.svelte';
  import type { AccountMode } from './accounts';
  import { pagePath } from '../../router/views';
  import { navigation } from '../../stores/navigation';
  import { session } from '../../stores/session';
  import PageNavbar from '../../components/PageNavbar.svelte';

  const route = useRoute();
  const router = useRouter();
  const id = $derived(String(route.params.id ?? ''));
  let open = $state(true);
  let mode = $state<AccountMode>('detail');
  const close = (): void => {
    if (session.authenticated) void router.replace(pagePath(navigation.menu, 'Accounts') ?? '/denied');
  };
</script>

<PageNavbar title="管理员详情" back />
<AccountDialog bind:open bind:mode {id} onclosed={close} />
