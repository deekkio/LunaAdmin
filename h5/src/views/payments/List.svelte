<script lang="ts">
  import { Card, Button, ButtonGroup, Dialog, Form, FormItem, Input, Textarea, Picker, CellGroup, Empty, Skeleton, Text, Grid, Row } from '@luna/components/h5';
  import { showToast } from '@luna/components/toast';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { Pager } from '../../stores/pager';
  const showSuccess = (): void => { showToast({ message: '支付配置已保存' }); };

  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import type { PaymentConfig } from '../../api/types';
  import { session } from '../../stores/session';
  import { paymentModel, paymentValue, paymentRules, providerNames } from './model';
  import type { FormResult } from '@luna/components/contracts';
  const tracker = new RequestTracker();
  const canWrite = $derived(session.root || (session.principal?.permissions.includes('payment:write') ?? false));
  const pager = new Pager<PaymentConfig>((offset, limit) => api.payments(session.token ?? '', offset, limit));
  let open = $state(false);
  let saving = $state(false);
  let model = $state(paymentModel());
  $effect(() => { void pager.refresh(); });
  $effect(() => { if (!open) { model = paymentModel(); tracker.reset(); } });
  const edit = (row?: PaymentConfig): void => {
    if (!canWrite) return;
    model = paymentModel(row);
    tracker.reset();
    open = true;
  };
  const save = async (result: FormResult): Promise<void> => {
    if (!result.valid || saving || !canWrite || !session.token) return;
    const token = session.token;
    const payload = paymentValue(model);
    saving = true;
    try {
      const reply = await api.savePayment(token, { ...payload, request: tracker.id(payload) });
      if (reply.code || session.token !== token) return;
      tracker.reset();
      showSuccess();
      open = false;
      await pager.refresh();
    } finally { saving = false; }
  };

</script>
<PageNavbar title="支付配置" rightText={canWrite ? '新增' : ''} onright={() => edit()} />
<Grid min={480} gap={16}>
  <Text size="small">共 {pager.total} 条配置</Text>
  <Card aria-label="支付配置">
    {#if pager.items.length}
      <CellGroup items={pager.items.map((row) => ({
        key: row.id, title: row.name, value: providerNames[row.provider],
        description: `${row.app_id} · ${row.enabled ? '已启用' : '已停用'}`,
        arrow: canWrite, clickable: canWrite,
      }))} onselect={(item) => { const row = pager.items.find((row) => row.id === item.key); if (row) edit(row); }} />
    {:else if pager.loading}<Skeleton rows={4} />
    {:else}
      <Empty imageSize={72} description="暂无支付配置" />
    {/if}
    {#snippet footer()}
      <Row justify="space-between">
        <Button variant="text" disabled={pager.loading} onclick={() => void pager.refresh()}>刷新</Button>
        {#if pager.total > 0}
          <ButtonGroup label="分页" variant="plain" disabled={pager.loading} items={[
            { key: 'prev', label: '上一页', disabled: pager.page <= 1 },
            { key: 'next', label: '下一页', disabled: pager.page * pager.pageSize >= pager.total },
          ]} onaction={(item) => pager.goto(pager.page + (item.key === 'prev' ? -1 : 1))} />
        {/if}
      </Row>
    {/snippet}
  </Card>
</Grid>
{#if open}
  <Dialog bind:open title={model.revision ? '编辑支付配置' : '新增支付配置'} beforeClose={() => !saving}>
    <Picker value={model.provider} label="支付方式" title="选择支付方式" disabled={saving || model.revision > 0}
      options={[{ value: 'alipay', label: '支付宝' }, { value: 'wechat', label: '微信支付' }]}
      onchange={(value) => (model.provider = value === 'wechat' ? 'wechat' : 'alipay')} />
    <Form id="payment-edit" {model} rules={paymentRules} disabled={saving} labelPosition="left" labelWidth={112} onsubmit={(result) => void save(result)}>

    <FormItem prop="name" label="配置名称"><Input bind:value={model.name} maxlength={80} /></FormItem>
    <FormItem prop="app_id" label={model.provider === 'alipay' ? '支付宝应用 ID' : '微信 AppID'}>
      <Input bind:value={model.app_id} autocomplete="off" />
    </FormItem>
    {#if model.provider === 'alipay'}
      <FormItem prop="merchant_id" label="支付宝收款账号 ID（seller_id）"><Input bind:value={model.merchant_id} autocomplete="off" /></FormItem>
    {/if}
    {#if model.provider === 'wechat'}
      <FormItem prop="merchant_id" label="微信支付商户号"><Input bind:value={model.merchant_id} autocomplete="off" /></FormItem>
      <FormItem prop="serial" label="商户 API 证书序列号"><Input bind:value={model.serial} autocomplete="off" /></FormItem>
      <FormItem prop="public_id" label="微信支付公钥 ID"><Input bind:value={model.public_id} placeholder="PUB_KEY_ID_..." autocomplete="off" /></FormItem>
      <FormItem prop="api_key" label="API v3 密钥" hint={model.has_api ? '已配置；留空保留原值' : '32 位字母或数字'}>
        <Input bind:value={model.api_key} type="password" autocomplete="new-password" maxlength={32} />
      </FormItem>
    {/if}
    <FormItem prop="notify_url" label="支付通知地址" hint="UserGateway 的公开地址，不附加支付单 ID"><Input bind:value={model.notify_url} placeholder="https://pay.example.com/v1/payments/notify" /></FormItem>
    <FormItem prop="private_key" label={model.provider === 'alipay' ? '应用私钥（RSA2）' : '商户 API 私钥'} hint={model.has_private ? '已配置；留空保留原值' : 'RSA 2048 位，PKCS#8 格式'}>
      <Textarea bind:value={model.private_key} rows={3} placeholder="PKCS#8 PEM 或 Base64；编辑时留空保留" autocomplete="off" />
    </FormItem>
    <FormItem prop="public_key" label={model.provider === 'alipay' ? '支付宝公钥' : '微信支付公钥'} hint={model.has_public ? '已配置；留空保留原值' : '支付平台提供的公钥，非商户应用公钥'}>
      <Textarea bind:value={model.public_key} rows={3} placeholder="PUBLIC KEY PEM 或 Base64；编辑时留空保留" autocomplete="off" />
    </FormItem>

    </Form>
    <Picker value={model.enabled ? 'yes' : 'no'} label="配置状态" title="选择配置状态" disabled={saving}
      options={[{ value: 'yes', label: '启用' }, { value: 'no', label: '停用' }]} onchange={(value) => (model.enabled = value === 'yes')} />
    {#snippet footer()}
      <Button variant="plain" disabled={saving} onclick={() => (open = false)}>取消</Button>
      <Button tone="primary" type="submit" form="payment-edit" loading={saving} disabled={saving}>保存</Button>
    {/snippet}
  </Dialog>
{/if}

