<script lang="ts">
  import Resource from '../../components/Resource.svelte';
  import PageNavbar from '../../components/PageNavbar.svelte';
  let { initialId = '' }: { initialId?: string } = $props();
</script>

<PageNavbar title="套餐管理" />
<Resource kind="plans" {initialId} />
