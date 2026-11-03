<script lang="ts">
  import { useRoute } from 'luna-router';
  import List from './List.svelte';
  const route = useRoute();
  const id = $derived(String(route.params.id ?? ''));
</script>

<List initialId={id} />
