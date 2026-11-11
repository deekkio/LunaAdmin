<script lang="ts">
  import Orders from '../../components/Orders.svelte';
  import PageNavbar from '../../components/PageNavbar.svelte';
</script>

<PageNavbar title="订单列表" />
<div class="page">
  
<Orders mobile />
</div>

<style>
  .page {
    height: calc(100dvh - 95px);
    display: flex;
    flex-direction: column;
    padding: 12px 14px 0;
  }
</style>
