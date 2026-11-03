<script lang="ts">
  import { useRoute, useRouter } from 'luna-router';
  import UserDialog from '../../components/UserDialog.svelte';
  import { pagePath } from '../../router/views';
  import { navigation, session } from '../../stores/index.svelte';
  const route = useRoute();
  const router = useRouter();
  const id = $derived(String(route.params.id ?? ''));
  let open = $state(true);
  $effect(() => {
    if (!open && session.authenticated) void router.replace(pagePath(navigation.menu, 'Users'));
  });
</script>

<UserDialog bind:open {id} mode="detail" />
