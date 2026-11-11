<script lang="ts">
  import Resource from '../../components/Resource.svelte';
  import PageNavbar from '../../components/PageNavbar.svelte';
  let { initialId = '' }: { initialId?: string } = $props();
</script>

<PageNavbar title="服务节点" />
<div class="page">
  
<Resource kind="nodes" {initialId} mobile />
</div>

<style>
  .page {
    height: calc(100dvh - 95px);
    display: flex;
    flex-direction: column;
    padding: 12px 14px 0;
  }
</style>
