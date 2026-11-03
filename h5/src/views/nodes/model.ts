import type { FormRules } from '@luna/components/contracts';
import type { NodeInput, NodeKey, NodeView, Suite } from '../../api/types';
import { newRequestId } from '../../api/request';
import { parseTime, yearInput, timeInput } from '../../utils/format';
import {
  endpointsRule,
  hex32Rules,
  publicKeyRule,
  requiredText,
  futureRule,
  type FormModel,
} from '../../utils/rules';

export interface NodeModel {
  group: string;
  id: string;
  wire: string;
  request: string;
  name: string;
  endpoints: string;
  existing: boolean;
  trustUntil: string;
  trustEpoch: number;
  keys: NodeKey[];
  keyId: string;
  publicKey: string;
  keyUntil: string;
  suite: Suite;
  enabled: boolean;
}

export const nodeModel = (item?: NodeView): NodeModel => {
  const until = yearInput(10);
  return {
    id: item?.id ?? '',
    wire: item?.node.node ?? '',
    group: item?.group ?? '',
    request: newRequestId(),
    name: item?.node.name ?? '',
    endpoints: item?.node.endpoints.join(', ') ?? '',
    existing: Boolean(item),
    trustUntil: item ? timeInput(item.node.trust.until) : until,
    trustEpoch: item?.node.trust.until ?? 0,
    keys: item?.node.trust.keys.map((key) => ({ ...key })) ?? [],
    keyId: newRequestId(),
    publicKey: '',
    keyUntil: until,
    suite: item?.suite ?? 'aes-256-gcm',
    enabled: item?.enabled ?? true,
  };
};

export const nodeRules = (model: NodeModel): FormRules<FormModel> => ({
  group: [requiredText('节点分组')],
  id: [{ validator: (value) => value && !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(String(value)) ? '节点 ID 必须为 ULID' : undefined }],
  name: [
    requiredText('订阅名称'),
    {
      validator: (value) => {
        const name = String(value ?? '').trim();
        if (
          !name ||
          new TextEncoder().encode(name).length > 80 ||
          /[\u0000-\u001f\u007f]/.test(name)
        )
          return '订阅名称应为 1 到 80 字节的有效文本';
      },
    },
  ],
  endpoints: [endpointsRule()],
  trustUntil: [futureRule('信任到期时间')],
  ...(!model.existing
    ? {
        keyId: hex32Rules('密钥 ID'),
        publicKey: [requiredText('节点公钥'), publicKeyRule()],
        keyUntil: [
          futureRule('密钥到期时间'),
          {
            validator: (value: unknown) => {
              if (
                (parseTime(String(value)) ?? 0) >
                (parseTime(model.trustUntil) ?? 0)
              )
                return '密钥到期不能晚于信任到期';
            },
          },
        ],
      }
    : {}),
  suite: [
    {
      required: true,
      enum: ['aes-256-gcm', 'chacha20-poly1305'],
      message: '请选择一个加密套件',
    },
  ],
});

export const nodeValue = (model: NodeModel): NodeInput => {
  if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(model.group)) throw new Error('请选择节点分组');
  const until =
    model.trustEpoch && model.trustUntil === timeInput(model.trustEpoch)
      ? model.trustEpoch
      : (parseTime(model.trustUntil) ?? 0);
  const keys = model.existing
    ? model.keys.map((key) => ({ ...key }))
    : [
        {
          key: model.keyId,
          public: model.publicKey.trim(),
          until: parseTime(model.keyUntil) ?? 0,
          state: 'active' as const,
        },
      ];
  const now = Date.now() / 1000;
  if (!keys.some((key) => key.state === 'active' && key.until > now))
    throw new Error('节点密钥已过期，请重新注册节点');
  if (keys.some((key) => key.until > until))
    throw new Error('信任到期不能早于密钥到期');
  return {
    version: 1,
    request: model.request,
    id: model.id || null,
    group: model.group,
    node: {
      node: model.wire,
      name: model.name.trim(),
      endpoints: model.endpoints
        .split(/[,，]/)
        .map((value) => value.trim())
        .filter(Boolean),
      trust: { until, keys },
    },
    suite: model.suite,
    enabled: model.enabled,
  };
};

export interface InstallInput {
  control: string;
  origin: string;
  name: string;
}

export const control = (value: string): string => {
  if (!value.startsWith('https://') || /[\\\s@%]/.test(value)) throw new Error('Control 地址须为 HTTPS 地址');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Control 地址不能包含路径、查询参数或登录凭据');
  }
  return url.origin;
};

export const ingress = (origin: string): string => {
  const url = new URL(origin);
  return 'https://' + url.hostname + ':19447';
};

const quote = (value: string): string => "'" + value.replace(/'/g, "'\\''") + "'";

export const settings = (input: InstallInput): InstallInput => {
  const endpoint = control(input.control);
  const origin = control(input.origin);
  const name = input.name.trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('节点名称须为 1 到 80 个字符');
  return { control: endpoint, origin, name };
};

export const command = (origin: string): string => {
  const source = control(origin) + '/downloads/deploy.sh';
  const endpoint = /^[A-Za-z0-9:/.-]+$/.test(source) ? source : quote(source);
  return `curl -fsSL ${endpoint} -o deploy.sh && sh deploy.sh`;
};
