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

