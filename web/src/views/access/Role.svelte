<script lang="ts">
  import { useRoute, useRouter } from 'luna-router';
  import RoleDialog from '../../components/RoleDialog.svelte';
  import type { RoleMode } from './roles';
  import { pagePath } from '../../router/views';
  import { navigation, session } from '../../stores/index.svelte';

  const route = useRoute();
  const router = useRouter();
  const id = $derived(String(route.params.id ?? ''));
  let open = $state(true);
  let mode = $state<RoleMode>('detail');
  const close = (): void => {
    if (session.authenticated) void router.replace(pagePath(navigation.menu, 'Roles'));
  };
</script>

<RoleDialog bind:open bind:mode {id} onclosed={close} />
