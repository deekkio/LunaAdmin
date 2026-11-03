<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Button, DatePicker, Dialog, Empty, Form, FormItem, Input, Select, Skeleton } from '@luna/components';
  import { showMessage } from '@luna/components/message';
  import { api } from '../api';
  import { RequestTracker } from '../api/request';
  import type { Order, OrderAccess, Plan } from '../api/types';
  import { session } from '../stores/index.svelte';
  import { applyPlan, orderModel, orderRules, orderValue, type OrderModel } from '../views/orders/model';

  let { open = $bindable(false), order, onsaved }: {
    open?: boolean; order: Order; onsaved?: () => void;
  } = $props();
  let grant = $state<OrderAccess | null>(null);
  let model = $state<OrderModel | null>(null);
  let plans = $state<Plan[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let alive = true;
  const tracker = new RequestTracker();
  onDestroy(() => { alive = false; tracker.reset(); });
  onMount(() => { void load(); });

  const load = async (): Promise<void> => {
    try {
      const result = await api.orderAccess(session.token ?? '', order.id);
      if (!alive || result.code || !result.data || result.data.account !== order.account) return;
      grant = result.data;
      model = orderModel(grant, order.paid_at ?? order.created_at);
      if (session.canRead('plan:read')) {
        const entries: Plan[] = [];
        for (let offset = 0; ; offset += 100) {
          const reply = await api.searchPlans(session.token ?? '', offset, 100);
          if (!alive || reply.code || !reply.data) return;
          entries.push(...reply.data.items.filter(item => item.enabled));
          if (!reply.data.items.length || offset + reply.data.items.length >= reply.data.total) break;
        }
        plans = entries;
      }
    } finally { if (alive) loading = false; }
  };

  const save = async (): Promise<void> => {
    if (!model || saving || loading || !session.canWrite || !session.canRead('order:write')) return;
    saving = true;
    try {
      const input = orderValue(model, '');
      input.request = tracker.id(input);
      const reply = await api.saveOrder(session.token ?? '', order.id, input);
      if (!alive || reply.code || !reply.data) return;
      tracker.reset(); open = false;
      showMessage({ message: '订单权益已更新', type: 'success' });
      onsaved?.();
    } catch (error) {
      showMessage({ message: error instanceof Error ? error.message : '请检查订单内容', type: 'error' });
    } finally { if (alive) saving = false; }
  };
</script>

<Dialog bind:open title="编辑订单" width={560} beforeClose={() => !saving}>
  {#if loading}<Skeleton rows={4} animated={false} />
  {:else if model && grant}
    <Form id="order-edit" {model} rules={orderRules} labelPosition="left" labelWidth={112}
      disabled={saving} onsubmit={(result) => { if (result.valid) void save(); }}>
      <FormItem prop="plan" label="套餐">
        <Select bind:value={model.plan} filterable
          options={[
            ...(!plans.some(item => item.id === grant?.plan) ? [{ value: grant.plan, label: grant.name }] : []),
            ...plans.map(item => ({ value: item.id, label: item.name })),
          ]}
          onchange={(value: string | string[]) => {
            const plan = plans.find(item => item.id === value);
            if (model && plan) model = applyPlan(model, plan);
          }} />
      </FormItem>
      <FormItem prop="quota" label="流量（GB）"><Input bind:value={model.quota} inputmode="decimal" /></FormItem>
      <FormItem prop="until" label="到期时间"><DatePicker type="datetime" precision="second" bind:value={model.until} ariaLabel="订单到期时间" /></FormItem>
      <FormItem prop="state" label="状态"><Select bind:value={model.state} options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '禁用' }]} /></FormItem>
    </Form>
  {:else}<Empty description="暂无订单权益" />{/if}
  {#snippet footer()}
    <Button variant="plain" disabled={saving} onclick={() => (open = false)}>取消</Button>
    <Button tone="primary" type="submit" form="order-edit" loading={saving} disabled={saving || loading || !model}>保存</Button>
  {/snippet}
</Dialog>
