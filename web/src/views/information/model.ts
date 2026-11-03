import type { FormModel } from '../../api/types';
import type { FormRules } from '@luna/components/contracts';
import type { Entry, EntryInput, EntryKind } from '../../api/types';
import { newRequestId } from '../../api/request';
import { requiredText } from '../../utils/rules';

export type EntryModel = {
  id: string;
  content: string;
  kind: EntryKind;
  published: boolean;
  ttl: number | undefined;
}

export const entryModel = (row?: Entry, now = Math.floor(Date.now() / 1000)): EntryModel => ({
  id: row?.id ?? newRequestId(),
  content: row?.content ?? '',
  kind: row?.kind === 'notice' ? 'notices' : 'announcements',
  published: row?.published ?? true,
  ttl: row?.expires_at == null ? undefined : Math.max(1, Math.ceil((row.expires_at - now) / 60)),
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
  kind: [{ validator: (value) => {
    if (value !== 'announcements' && value !== 'notices') return '请选择公告类型';
  } }],
  ttl: [{ validator: (value) => {
    if (value !== undefined && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 525600)) return '有效期须为 1 到 525600 的整数分钟，留空表示永久';
  } }],
};

export const entryValue = (model: EntryModel): EntryInput => ({
  version: 1,
  id: model.id,
  content: model.content,
  users: [],
  published: model.published,
  ttl: model.ttl === undefined ? null : model.ttl * 60,
});
