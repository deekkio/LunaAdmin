<script lang="ts">
  import { useRoute } from 'luna-router';
  import Orders from '../../components/Orders.svelte';
  const route = useRoute();
  const id = $derived(String(route.params.id ?? ''));
</script>

<Orders initialId={id} />
