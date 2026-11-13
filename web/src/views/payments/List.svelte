<script module lang="ts">
  import type { FormModel } from '../../api/types';
  import type { FormRules } from '@luna/components/contracts';
  import type { PaymentConfig, PaymentInput, Provider } from '../../api/types';
  import { newRequestId } from '../../api/request';


  export const providerNames: Record<Provider, string> = { alipay: '支付宝', wechat: '微信支付' };

  export const paymentModel = (config?: PaymentConfig) => ({
    id: config?.id ?? newRequestId(),
    revision: config?.revision ?? 0,
    name: config?.name ?? '',
    provider: config?.provider ?? 'alipay' as Provider,
    app_id: config?.app_id ?? '',
    merchant_id: config?.merchant_id ?? '',
    serial: config?.serial ?? '',
    public_id: config?.public_id ?? '',
    notify_url: config?.notify_url ?? '',
    private_key: '',
    public_key: '',
    api_key: '',
    enabled: config?.enabled ?? true,
    has_private: config?.has_private ?? false,
    has_public: config?.has_public ?? false,
    has_api: config?.has_api ?? false,
    owner: config ? `${config.provider}:${config.app_id}:${config.merchant_id ?? ''}` : '',
  });
  export type PaymentModel = ReturnType<typeof paymentModel>;

  export const paymentValue = (model: PaymentModel): Omit<PaymentInput, 'request'> => ({
    version: 1,
    id: model.id,
    revision: model.revision,
    name: model.name.trim(),
    provider: model.provider,
    app_id: model.app_id.trim(),
    merchant_id: model.merchant_id.trim() || null,
    serial: model.provider === 'wechat' ? model.serial.trim() : null,
    public_id: model.provider === 'wechat' ? model.public_id.trim() : null,
    notify_url: model.notify_url.trim(),
    private_key: model.private_key.trim() || null,
    public_key: model.public_key.trim() || null,
    api_key: model.provider === 'wechat' ? model.api_key.trim() || null : null,
    enabled: model.enabled,
  });

  const keyRule = (flag: 'has_private' | 'has_public' | 'has_api', label: string) => ({
    validator: (value: unknown, data: FormModel): string | undefined => {
      const model = data as PaymentModel;
      if (flag === 'has_api' && model.provider !== 'wechat') return;
      const text = String(value ?? '').trim();
      const owner = `${model.provider}:${model.app_id.trim()}:${model.merchant_id.trim()}`;
      if (!text && (!model[flag] || owner !== model.owner)) return `请输入${label}`;
      if (text.length > 16384) return `${label}过长`;
      if (flag === 'has_api' && text && !/^[A-Za-z0-9]{32}$/.test(text)) return 'API v3 密钥必须为 32 位字母或数字';
    },
  });
  export const paymentRules: FormRules<FormModel> = {
    name: [{ required: true, message: '请输入配置名称' }, { max: 80, message: '名称不能超过 80 个字符' }],
    app_id: [{
      validator: (value, model) => {
        const valid = model.provider === 'wechat'
          ? /^wx[0-9a-fA-F]{16}$/.test(String(value ?? ''))
          : /^\d{16}$/.test(String(value ?? ''));
        if (!valid) return model.provider === 'wechat' ? '请输入微信 AppID（wx 开头的 18 位标识）' : '请输入 16 位支付宝应用 ID';
      },
    }],
    merchant_id: [{ validator: (value, model) => {
      if (model.provider === 'wechat' && !/^\d{6,32}$/.test(String(value ?? ''))) return '请输入有效的微信支付商户号';
      if (model.provider === 'alipay' && !/^\d{16}$/.test(String(value ?? ''))) return '请输入 16 位支付宝收款账号 ID';
    }}],
    serial: [{ validator: (value, model) => {
      if (model.provider === 'wechat' && !/^[A-Fa-f0-9]{32,64}$/.test(String(value ?? ''))) return '请输入商户 API 证书序列号';
    }}],
    public_id: [{ validator: (value, model) => {
      if (model.provider === 'wechat' && !/^PUB_KEY_ID_[A-Za-z0-9_]{1,117}$/.test(String(value ?? ''))) return '请输入微信支付公钥 ID（PUB_KEY_ID_ 开头）';
    }}],
    notify_url: [{ validator: (value) => {
      try {
        const url = new URL(String(value ?? ''));
        if (url.protocol === 'https:' && url.hostname && !url.username && !url.password && !url.hash && !url.search && url.pathname.replace(/\/$/, '').endsWith('/v1/payments/notify') && String(value).length <= 1024) return;
      } catch { /* 统一显示表单错误。 */ }
      return '请输入以 /v1/payments/notify 结尾的 HTTPS 通知地址';
    }}],
    private_key: [keyRule('has_private', '商户私钥')],
    public_key: [keyRule('has_public', '支付平台公钥')],
    api_key: [keyRule('has_api', 'API v3 密钥')],
  };
</script>

<script lang="ts">
  import { formatId } from '../../utils';
  import ListContent from '../../components/ListContent.svelte';
  import { Card, Button, Form, FormItem, Input, Link, Textarea, Pagination, Select, Switch, Table, Tag, Space, Row } from '@luna/components';
  import Dialog from '../../components/Dialog.svelte';
  import type { TableCell, TableColumn } from '@luna/components/contracts';
  import { showMessage } from '@luna/components/message';
  import { PAGE_SIZES, Pager } from '../../components/list.svelte';
  const showSuccess = (): void => { showMessage({ message: '支付配置已保存', type: 'success' }); };

  import { api } from '../../api';
  import { RequestTracker } from '../../api/request';
  import { session } from '../../stores/state.svelte';
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

