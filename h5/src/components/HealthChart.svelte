<script lang="ts">
  import { Empty } from '@luna/components';
  import type { ChartHandle, ChartInput } from '../views/nodes/charts';
  let { label, ...input }: ChartInput & { label: string } = $props();
  let failed = $state(false);

  function render(node: HTMLDivElement, initial: ChartInput) {
    let active = true;
    let value = initial;
    let chart: ChartHandle | undefined;
    void import('../views/nodes/charts').then(module => {
      if (active) chart = module.mountChart(node, value);
    }).catch(() => { if (active) failed = true; });
    return {
      update(next: ChartInput) { value = next; chart?.update(next); },
      destroy() { active = false; chart?.dispose(); },
    };
  }
</script>

{#if failed}<Empty imageSize={48} />
{:else}<div role="img" aria-label={label} use:render={input}></div>{/if}
