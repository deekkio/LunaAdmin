<script lang="ts">
  import { onMount } from 'svelte';
  import { Select } from '@luna/components';
  import { api } from '../api';
  import type { GroupView } from '../api/types';
  import { session } from '../stores/state.svelte';

  let { value = $bindable(''), disabled = false, optional = false, ready = false, onchange }: {
    value?: string; disabled?: boolean; optional?: boolean; ready?: boolean; onchange?: () => void;
  } = $props();
  let groups = $state<GroupView[]>([]);
  let loading = $state(false);
  const options = $derived([
    ...(optional ? [{ label: '安装时选择', value: '' }] : []),
    ...groups.map((group) => ({ label: group.name, value: group.id, disabled: ready && group.nodes === 0 })),
  ]);
  onMount(() => {
    let alive = true;
    loading = true;
    void (async () => {
      const items: GroupView[] = [];
      try {
        while (alive) {
          const result = await api.groups(session.token ?? '', items.length, 100);
          if (!alive || result.code || !result.data) return;
          items.push(...result.data.items);
          if (items.length >= result.data.total || !result.data.items.length) break;
        }
        if (!alive) return;
        groups = items.filter((group) => group.name !== '默认分组');
      } finally { if (alive) loading = false; }
    })();
    return () => { alive = false; };
  });
</script>

<Select bind:value {options} disabled={disabled || loading} placeholder="选择分组" onchange={() => onchange?.()} />
