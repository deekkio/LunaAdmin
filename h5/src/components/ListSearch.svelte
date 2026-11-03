<script lang="ts">
  import { Button, Input, Select, Space } from '@luna/components';
  let {
    query = $bindable(''), state = $bindable(''), kind = $bindable(''),
    label = '搜索', placeholder = '', states = true, kinds = [], kindLabel = '筛选类型',
    disabled = false, onsearch,
  }: {
    query?: string; state?: string; kind?: string;
    label?: string; placeholder?: string; states?: boolean;
    kinds?: readonly { value: string; label: string }[];
    kindLabel?: string; disabled?: boolean; onsearch: () => void;
  } = $props();
</script>

<Space wrap>
  <Space width={240}>
    <Input bind:value={query} aria-label={label} {placeholder} maxlength={128} clearable {disabled}
      onkeydown={(event) => { if (event.key === 'Enter') onsearch(); }} />
  </Space>
  {#if states}<Space width={176}>
    <Select bind:value={state} aria-label="筛选状态" placeholder="全部状态" {disabled}
      options={[{ value: '', label: '全部状态' }, { value: 'active', label: '启用' }, { value: 'disabled', label: '禁用' }]}
      onchange={(value: string | string[]) => { state = String(value); onsearch(); }} />
  </Space>{/if}
  {#if kinds.length}<Space width={176}>
    <Select bind:value={kind} aria-label={kindLabel} placeholder={kinds[0]?.label ?? kindLabel} options={[...kinds]} {disabled}
      onchange={(value: string | string[]) => { kind = String(value); onsearch(); }} />
  </Space>{/if}
  <Button variant="plain" {disabled} onclick={onsearch}>搜索</Button>
</Space>
