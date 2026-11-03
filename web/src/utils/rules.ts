// 表单校验规则的共享预设，配合 LunaUI Form/FormItem 使用。
import type { FormRule } from '@luna/components/contracts';
import isHexadecimal from 'validator/es/lib/isHexadecimal';
import isInt from 'validator/es/lib/isInt';
import isIP from 'validator/es/lib/isIP';
import type { FormModel } from '../api/types';
import { parseTime } from './format';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export const requiredText = (label: string): FormRule<FormModel> => ({
  required: true,
  message: `请输入${label}`,
});

export const hex32Rules = (label: string): readonly FormRule<FormModel>[] => [
  requiredText(label),
  {
    len: 32,
    message: `${label}必须是 32 位无连字符十六进制`,
    validator: (value) => {
      const input = String(value);
      return isHexadecimal(input) && input === input.toLowerCase()
        && !input.startsWith('0x') && !input.startsWith('0h');
    },
  },
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
    if (!isInt(String(value ?? '').trim(), { min, max })) return message;
  },
});

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

export const currencyRule = (): FormRule<FormModel> => ({
  pattern: CURRENCY_PATTERN,
  message: '货币代码必须是 3 位大写字母',
});

export const ipv4Rule = (label: string): readonly FormRule<FormModel>[] => [
  { required: true, message: `请输入${label}` },
  { validator: (value) => isIP(String(value), '4'), message: `${label}必须是合法的 IPv4 地址` },
];
