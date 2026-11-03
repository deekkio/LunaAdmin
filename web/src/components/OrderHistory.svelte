<script lang="ts">
  import { Button, Dialog } from '@luna/components';
  import Orders from './Orders.svelte';
  let { open = $bindable(false), account, username, onsaved }: {
    open?: boolean; account: string; username: string; onsaved?: () => void;
  } = $props();
</script>

<Dialog bind:open title={`订单 - ${username}`} width={1080}>
  <Orders {account} {onsaved} />
  {#snippet footer()}<Button variant="plain" type="button" onclick={() => (open = false)}>关闭</Button>{/snippet}
</Dialog>
