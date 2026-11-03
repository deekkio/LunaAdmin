<script lang="ts">
  import Resource from '../../components/Resource.svelte';
  import PageNavbar from '../../components/PageNavbar.svelte';
  let { initialId = '' }: { initialId?: string } = $props();
</script>

<PageNavbar title="服务节点" />
<Resource kind="nodes" {initialId} />
