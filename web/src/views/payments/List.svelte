<script lang="ts">
  import { formatId } from '../../utils/format';
  import ListContent from '../../components/ListContent.svelte';
  import { Card, Button, Dialog, Form, FormItem, Input, Link, Textarea, Pagination, Select, Switch, Table, Tag, Space, Row } from '@luna/components';
  import type { TableCell, TableColumn } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';
  const showSuccess = (): void => { showMessage({ message: '支付配置已保存', type: 'success' }); };

  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import type { PaymentConfig } from '../../api/types';
  import { session } from '../../stores/index.svelte';
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
{#snippet status(cell: TableCell<PaymentConfig>)}
  <Tag tone={cell.row.enabled ? 'success' : 'info'}>{cell.row.enabled ? '已启用' : '已停用'}</Tag>
{/snippet}
{#snippet actions(cell: TableCell<PaymentConfig>)}
  <Space size={12} wrap={false}>
  {#if canWrite}<Link type="primary" underline="never" onclick={() => edit(cell.row)}>编辑</Link>{/if}
  </Space>
{/snippet}
<Card fill aria-label="支付配置">
  {#snippet extra()}
    <Space wrap>
      {#if canWrite}<Button tone="primary" onclick={() => edit()}>新增配置</Button>{/if}
      <Button variant="plain" onclick={() => void pager.refresh()} disabled={pager.loading}>刷新</Button>
    </Space>
  {/snippet}
  <ListContent count={pager.items.length} loading={pager.loading} description={'暂无支付配置'}>
    <Table tableLayout="auto" showOverflowTooltip={false} cellStyle={{ whiteSpace: 'nowrap' }} border data={pager.items} rowKey="id" loading={pager.loading} emptyText="暂无支付配置"
      columns={[
        { key: 'name', label: '配置名称' },
        { key: 'provider', label: '支付方式', formatter: (_: unknown, row: PaymentConfig) => providerNames[row.provider] },
        { key: 'app_id', label: '应用 ID', formatter: formatId },
        { key: 'merchant_id', label: '商户号', formatter: (_: unknown, row: PaymentConfig) => row.merchant_id ?? '-' },
        { key: 'enabled', label: '状态', cell: status, width: 100 },
        { fixed: 'right', key: 'actions', align: 'center', ellipsis: false, label: '操作', cell: actions, width: 90 },
      ] as unknown as TableColumn<PaymentConfig>[]}
      onrowclick={(detail) => edit(detail.row)} />
  </ListContent>
  {#snippet footer()}
    <Row justify="end">
      <Space>
        <Pagination total={pager.total} currentPage={pager.page} pageSize={pager.pageSize} pageSizes={PAGE_SIZES}
          background showTotal showSizes showJumper disabled={pager.loading}
          onchange={(page) => pager.goto(page)} onsizechange={(size) => pager.resize(size)} />
      </Space>
    </Row>
  {/snippet}
</Card>
{#if open}
  <Dialog bind:open title={model.revision ? '编辑支付配置' : '新增支付配置'} width={600} beforeClose={() => !saving}>
    <Form id="payment-edit" {model} rules={paymentRules} disabled={saving} labelPosition="left" labelWidth={112} onsubmit={(result) => void save(result)}>
      <FormItem label="支付方式">
        <Select value={model.provider} disabled={model.revision > 0} options={[
          { value: 'alipay', label: '支付宝' }, { value: 'wechat', label: '微信支付' },
        ]} onchange={(value: string | string[]) => (model.provider = value === 'wechat' ? 'wechat' : 'alipay')} />
      </FormItem>

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

      <FormItem label="启用配置"><Switch bind:checked={model.enabled} /></FormItem>
    </Form>
    {#snippet footer()}
      <Button variant="plain" disabled={saving} onclick={() => (open = false)}>取消</Button>
      <Button tone="primary" type="submit" form="payment-edit" loading={saving} disabled={saving}>保存</Button>
    {/snippet}
  </Dialog>
{/if}

