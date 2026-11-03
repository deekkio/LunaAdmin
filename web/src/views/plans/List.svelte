<script lang="ts">
  import Resource from '../../components/Resource.svelte';
  let { initialId = '' }: { initialId?: string } = $props();
</script>

<Resource kind="plans" {initialId} />
