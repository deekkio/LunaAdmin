<script lang="ts">
  import { useRoute, useRouter } from 'luna-router';
  import { navigation } from '../../stores/navigation';
  import { pagePath } from '../../router/views';
  import UserDialog from '../../components/UserDialog.svelte';
  const route = useRoute();
  const router = useRouter();
  const id = $derived(String(route.params.id ?? ''));
  let open = $state(true);
  $effect(() => { if (!open) void router.replace(pagePath(navigation.menu, 'Users') ?? '/denied'); });
</script>

<UserDialog bind:open {id} mode="detail" />
