// 表单校验规则的共享预设，配合 LunaUI Form/FormItem 使用。
import type { FormRule } from '@luna/components/contracts';
import { isEndpoint, isId, parseTime } from './format';

export type FormModel = Record<string, unknown>;

export const HEX32_PATTERN = /^[0-9a-f]{32}$/;
export const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;
export const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_-]*$/;
export const PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/;

export const requiredText = (label: string): FormRule<FormModel> => ({
  required: true,
  message: `请输入${label}`,
});

export const hex32Rules = (label: string): readonly FormRule<FormModel>[] => [
  requiredText(label),
  { pattern: HEX32_PATTERN, message: `${label}必须是 32 位无连字符十六进制` },
];

/** 整数文本规则：非空时必须是 [min, max] 内的整数。 */
export const intIn = (
  min: number,
  max: number,
  message: string,
  emptyMessage = '请输入数值'
): FormRule<FormModel> => ({
  required: true,
  message: emptyMessage,
  validator: (value) => {
    const amount = Number(String(value ?? '').trim());
    if (!Number.isInteger(amount) || amount < min || amount > max) return message;
  },
});

/** 逐行校验的文本域规则（接入地址、节点 ID 列表等）。 */
export const eachLine = (
  message: string,
  isValid: (line: string) => boolean,
  options: { unique?: boolean; minCount?: number } = {}
): FormRule<FormModel> => {
  return {
    required: true,
    message,
    validator: (value) => {
      const lines = String(value ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (options.minCount !== undefined && lines.length < options.minCount) return message;
      if (options.unique && new Set(lines).size !== lines.length) return message;
      if (lines.some((line) => !isValid(line))) return message;
    },
  };
};

/** 本地日期时间须晚于当前时间，可选最大天数。 */
export const futureRule = (label: string, maxDays?: number): FormRule<FormModel> => ({
  required: true,
  message: `请选择${label}`,
  validator: (value) => {
    const seconds = parseTime(String(value ?? ''));
    if (seconds === null) return `${label}格式不正确`;
    if (seconds <= Date.now() / 1000) return `${label}必须晚于当前时间`;
    if (maxDays !== undefined && seconds > Date.now() / 1000 + maxDays * 86_400) {
      return `${label}不能超过 ${maxDays} 天`;
    }
  },
});

export const endpointsRule = (): FormRule<FormModel> => ({
  required: true,
  message: '接入地址必须为 IPv4:端口或 [IPv6]:端口，多个用逗号分隔',
  validator: (value) => {
    const values = String(value ?? '').split(/[,，]/).map((value) => value.trim()).filter(Boolean);
    if (!values.length || values.some((value) => !isEndpoint(value))) return '接入地址必须为 IPv4:端口或 [IPv6]:端口，多个用逗号分隔';
  },
});

export const nodeIdsRule = (): FormRule<FormModel> =>
  eachLine(
    '节点必须是不重复的 32 位无连字符十六进制 ID，每行一个',
    isId,
    { unique: true, minCount: 1 }
  );

export const publicKeyRule = (): FormRule<FormModel> => ({
  pattern: PUBLIC_KEY_PATTERN,
  message: '公钥必须是 44 位 Base64',
});

export const currencyRule = (): FormRule<FormModel> => ({
  pattern: CURRENCY_PATTERN,
  message: '货币代码必须是 3 位大写字母',
});

export const ipv4Rule = (label: string): readonly FormRule<FormModel>[] => [
  { required: true, message: `请输入${label}` },
  { pattern: IPV4_PATTERN, message: `${label}必须是合法的 IPv4 地址` },
];
