<script lang="ts">
  import type { FormModel } from '../../api/types';
  import { onDestroy, onMount } from 'svelte';
  import { Button, Empty, Form, FormItem, Select, Skeleton, Text } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import type { FormRules } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import type { Plan } from '../../api/types';
  import { session } from '../../stores/state.svelte';
  import { formatMoney, formatTraffic } from '../../utils';
  

  let { open = $bindable(false), account, onsaved }: {
    open?: boolean; account: string; onsaved?: () => void;
  } = $props();
  let plans = $state<Plan[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let alive = true;
  let model = $state<{ plan: string; kind: 'recharge' | 'gift' }>({ plan: '', kind: 'recharge' });
  const plan = $derived(plans.find(item => item.id === model.plan));
  const tracker = new RequestTracker();
  const rules: FormRules<FormModel> = {
    plan: [{ required: true, message: '请选择套餐' }],
    kind: [{ validator: value => { if (value !== 'recharge' && value !== 'gift') return '请选择订单类型'; } }],
  };
  onDestroy(() => { alive = false; tracker.reset(); });
  onMount(() => { void load(); });
  const load = async (): Promise<void> => {
    const token = session.token;
    try {
      for (let offset = 0; token; offset += 100) {
        const reply = await api.searchPlans(token, offset, 100);
        if (!alive || session.token !== token || reply.code || !reply.data) return;
        plans.push(...reply.data.items.filter(item => item.enabled));
        if (!reply.data.items.length || offset + reply.data.items.length >= reply.data.total) break;
      }
    } finally { if (alive) loading = false; }
  };
  const save = async (): Promise<void> => {
    const token = session.token;
    if (!token || !plan || saving || !session.canWrite || !session.canRead('order:write')) return;
    saving = true;
    try {
      const payload = { account, plan: model.plan, kind: model.kind };
      const reply = await api.createOrder(token, { version: 1, request: tracker.id(payload), ...payload });
      if (!alive || session.token !== token || reply.code || !reply.data) return;
      tracker.reset(); open = false;
      showMessage({ message: model.kind === 'gift' ? '赠送成功' : '充值成功', type: 'success' });
      onsaved?.();
    } finally { if (alive) saving = false; }
  };
</script>

<Dialog height={440} bind:open title="新增订单" width={440} beforeClose={() => !saving}>
  {#if loading}<Skeleton rows={4} animated={false} />
  {:else if plans.length}
    <Form id="order-create" {model} {rules} labelPosition="left" labelWidth={96} disabled={saving} onsubmit={result => { if (result.valid) void save(); }}>
      <FormItem prop="kind" label="类型"><Select bind:value={model.kind} options={[{ label: '充值', value: 'recharge' }, { label: '赠送', value: 'gift' }]} /></FormItem>
      <FormItem prop="plan" label="套餐"><Select bind:value={model.plan} filterable options={plans.map(item => ({ value: item.id, label: item.name }))} /></FormItem>
      <FormItem label="订单金额"><Text>{plan ? formatMoney(model.kind === 'gift' ? 0 : plan.price_minor, plan.currency) : '-'}</Text></FormItem>
      <FormItem label="套餐额度"><Text>{plan ? formatTraffic(plan.quota_bytes) : '-'}</Text></FormItem>
      <FormItem label="有效期"><Text>{plan ? `${plan.duration_days} 天` : '-'}</Text></FormItem>
    </Form>
  {:else}<Empty description="暂无可用套餐" />{/if}
  {#snippet footer()}
    <Button variant="plain" disabled={saving} onclick={() => (open = false)}>取消</Button>
    <Button tone="primary" type="submit" form="order-create" loading={saving} disabled={loading || saving || !plan}>{model.kind === 'gift' ? '确认赠送' : '确认充值'}</Button>
  {/snippet}
</Dialog>
