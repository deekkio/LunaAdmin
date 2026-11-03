<script lang="ts">
  import {
    Dialog,
    Skeleton,
    Button,
    Form,
    FormItem,
    Input,
    Tag,
    Checkbox,
    Divider,
    Space,
    Text,
    Descriptions,
  } from '@luna/components';
  import { messageBox } from '@luna/components/pc';
  import type { FormResult, FormRules } from '@luna/components/contracts';
  import { onDestroy } from 'svelte';
  import { api } from '../api';
  import { showMessage } from '@luna/components/message';
  import { RequestTracker } from '../api/request';
  import type { Order, OrderAccess } from '../api/types';
  import OrderEditor from './OrderEditor.svelte';
  import { session } from '../stores/session';
  import { formatTraffic, formatMoney, formatTime, orderStateText } from '../utils/format';
  import { intIn, currencyRule, ipv4Rule, type FormModel } from '../utils/rules';

  let { open = $bindable(false), id, username = '', onsaved }: {
    open?: boolean; id: string; username?: string; onsaved?: () => void;
  } = $props();
  let owner = $state('');
  let alive = true;
  onDestroy(() => { alive = false; seq++; });

  let order = $state<Order | null>(null);
  let grant = $state<OrderAccess | null>(null);
  let editorOpen = $state(false);
  let loading = $state(false);
  let settling = $state(false);
  const tracker = new RequestTracker();

  let seq = 0;
  $effect(() => {
    const orderId = id;
    if (!open || !orderId) return;
    void load(orderId);
  });

  const load = async (orderId: string): Promise<void> => {
    const current = ++seq;
    loading = true;
    owner = username;
    const result = await api.order(session.token ?? '', orderId);
    if (!alive || current !== seq) return;
    order = result.code ? null : result.data;
    grant = null;
    if (order?.state === 'paid') {
      const access = await api.orderAccess(session.token ?? '', order.id);
      if (!alive || current !== seq) return;
      grant = access.code ? null : access.data;
    }
    if (order) {
      model.price = String(order.price_minor);
      model.currency = order.currency;
    }
    if (order && !owner) {
      const result = await api.searchOrders(session.token ?? '', 0, 1, order.id, order.account);
      if (!alive || current !== seq) return;
      owner = result.data?.items.find(item => item.id === order?.id)?.username ?? '';
    }
    loading = false;
  };

  let model = $state({
    paymentRef: '',
    price: '',
    currency: 'CNY',
    tunnelIpv4: '',
    tunnelDns: '',
  });
  let withTunnel = $state(false);

  const rules: FormRules<FormModel> = {
    paymentRef: [{ required: true, message: '请输入支付流水号' }, { max: 128, message: '支付流水号不能超过 128 个字符' }],
    price: [intIn(1, Number.MAX_SAFE_INTEGER, '实际金额必须是正整数（最小货币单位）')],
    currency: [currencyRule()],
    tunnelIpv4: ipv4Rule('隧道 IPv4'),
    tunnelDns: ipv4Rule('DNS IPv4'),
  };

  const settle = async (): Promise<void> => {
    if (settling || !order || !session.canWrite) return;
    const reference = model.paymentRef.trim();
    const price = Number(model.price);
    const amount = formatMoney(price, model.currency);
    const confirmed = await messageBox.confirm(
      `确认对订单 ${order.id} 执行人工到账结算：${amount}，流水 ${reference}？`,
      '人工到账结算'
    );
    if (confirmed.action !== 'confirm') return;
    settling = true;
    const result = await api.settleOrder(session.token ?? '', order.id, {
      version: 1,
      request: tracker.id({
        orderId: order.id,
        reference,
        price,
        currency: model.currency,
        ipv4: model.tunnelIpv4,
        dns: model.tunnelDns,
      }),
      payment_ref: reference,
      price_minor: price,
      currency: model.currency,
      tunnel: withTunnel ? { ipv4: model.tunnelIpv4, dns_ipv4: model.tunnelDns } : null,
    });
    settling = false;
    if (!alive || result.code || !result.data) return;
    order = result.data;
    model.paymentRef = '';
    tracker.reset();
    showMessage({ message: '结算完成', type: 'success' });
    void load(order.id);
    onsaved?.();
  };

  const submit = (result: FormResult): void => {
    if (!result.valid) return;
    void settle();
  };
</script>

<Dialog bind:open title="订单详情" width={410} beforeClose={() => !settling}>
  {#if order}
    {@const record = order}
    <Descriptions border={false}
      columns={1}
      direction="horizontal"
      items={[
        { key: 'username', label: '用户', value: owner || '-' },
        { key: 'order', label: '订单 ID', value: String(order.id) },
        { key: 'plan', label: '购买套餐', value: String(order.name) },
        { key: 'state', label: '支付状态' },
        {
          key: 'price',
          label: '订单金额',
          value: String(formatMoney(order.price_minor, order.currency)),
        },
        { key: 'quota', label: '流量配额', value: formatTraffic(grant?.quota_bytes ?? order.quota_bytes) },
        ...(grant ? [
          { key: 'until', label: '到期时间', value: formatTime(grant.expires_at) },
        ] : []),
        { key: 'paid', label: '支付时间', value: String(formatTime(order.paid_at)) },
      ]}
    >
      {#snippet item(entry)}{#if entry.key === 'order'}<span class="mono">{entry.value}</span>
        {:else if entry.key === 'account'}<span class="mono">{entry.value}</span>
        {:else if entry.key === 'state'}
          <Tag
            tone={record.state === 'paid'
              ? 'success'
              : record.state === 'pending'
                ? 'warning'
                : 'info'}
          >
            {orderStateText(record.state)}
          </Tag>
        {:else}{entry.value}{/if}{/snippet}
    </Descriptions>

    {#if session.canWrite && order.state === 'pending'}
      <Divider contentPosition="left">人工到账结算</Divider>
      <Space
        direction="vertical"
        alignment="stretch"
        size={12}
        style="width: 100%; max-width: 420px;"
      >
        <Form id="order-settle" {model} {rules} labelPosition="left" labelWidth={112} onsubmit={submit}>
          <FormItem prop="paymentRef" label="支付流水">
            <Input bind:value={model.paymentRef} placeholder="支付渠道流水号" />
          </FormItem>
          <FormItem prop="price" label="实际金额（最小货币单位）">
            <Input bind:value={model.price} placeholder="如 1280 表示 12.80" />
          </FormItem>
          <FormItem prop="currency" label="货币（3 位大写）">
            <Input bind:value={model.currency} maxlength={3} />
          </FormItem>
          <FormItem><Checkbox bind:checked={withTunnel}>首次开通：填写隧道地址</Checkbox></FormItem>
          {#if withTunnel}
            <FormItem prop="tunnelIpv4" label="隧道 IPv4">
              <Input bind:value={model.tunnelIpv4} placeholder="10.8.0.1" />
            </FormItem>
            <FormItem prop="tunnelDns" label="DNS IPv4">
              <Input bind:value={model.tunnelDns} placeholder="10.8.0.2" />
            </FormItem>
          {/if}
        </Form>
        <div>
          <Button
            tone="primary"
            type="submit"
            form="order-settle"
            loading={settling}
            disabled={settling}
          >
            确认结算
          </Button>
        </div>
        <Text tag="p" size="small">
          结算要求支付流水、实际金额与货币一致，并需在弹窗中显式确认。相同内容失败重试会保留请求标识。
        </Text>
      </Space>
    {:else if order.state !== 'paid'}
      <Text tag="p" size="small">已取消的订单不能结算。</Text>
    {/if}
  {:else if loading}
    <Skeleton rows={6} animated={false} />
  {/if}
  {#snippet footer()}
    <Button variant="plain" type="button" disabled={settling} onclick={() => (open = false)}>关闭</Button>
    {#if order?.state === 'paid' && session.canWrite && session.canRead('order:write')}
      <Button tone="primary" disabled={settling} onclick={() => (editorOpen = true)}>编辑</Button>
    {/if}
  {/snippet}
</Dialog>

{#if editorOpen && order}<OrderEditor bind:open={editorOpen} {order} onsaved={() => { void load(id); onsaved?.(); }} />{/if}
