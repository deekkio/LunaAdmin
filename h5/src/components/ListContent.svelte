<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Empty } from '@luna/components/h5';

  let { count, loading = false, description = '暂无数据', children }: {
    count: number; loading?: boolean; description?: string; children?: Snippet;
  } = $props();
</script>

{#if count > 0}
  {@render children?.()}
{:else}
  <Empty imageSize={64} {description} aria-busy={loading} />
{/if}
