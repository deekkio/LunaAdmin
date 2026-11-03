import type { FormRules } from '@luna/components/contracts';
import type { Entry, EntryInput } from '../../api/information';
import { newRequestId } from '../../api/request';
import { requiredText, type FormModel } from '../../utils/rules';

export type EntryModel = {
  id: string;
  content: string;
  users: string;
  published: boolean;
  ttl: string;
}

const userPattern = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const userIds = (value: string): string[] => value.split(/\s+/).filter(Boolean);

export const entryModel = (row?: Entry, now = Math.floor(Date.now() / 1000)): EntryModel => ({
  id: row?.id ?? newRequestId(),
  content: row?.content ?? '',
  users: row?.users.join('\n') ?? '',
  published: row?.published ?? true,
  ttl: row?.expires_at == null ? '' : String(Math.max(1, row.expires_at - now)),
});

export const entryRules: FormRules<FormModel> = {
  content: [requiredText('正文'), {
    validator: (value) => {
      const text = String(value ?? '');
      if (!text.trim()) return '请输入正文';
      if (new TextEncoder().encode(text).length > 16_384) return '正文不能超过 16384 字节';
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return '正文不能包含控制字符';
    },
  }],
  users: [{ validator: (value) => {
    const ids = userIds(String(value ?? ''));
    if (ids.length > 1000) return '接收用户不能超过 1000 个';
    if (ids.some((id) => !userPattern.test(id) || /^0+$/.test(id))) return '请输入有效的 26 位大写用户 ID，每行一个';
    if (new Set(ids).size !== ids.length) return '接收用户不能重复';
  } }],
  ttl: [{ validator: (value) => {
    const text = String(value ?? '').trim();
    if (text && (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 31_536_000)) return '有效期须为 1 到 31536000 的整数秒，留空表示永久';
  } }],
};

export const entryValue = (model: EntryModel): EntryInput => ({
  version: 1,
  id: model.id,
  content: model.content,
  users: userIds(model.users),
  published: model.published,
  ttl: model.ttl.trim() ? Number(model.ttl) : null,
});
