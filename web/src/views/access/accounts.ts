import { api } from '../../api';
import type { Role } from '../../api/types';

export type AccountMode = 'create' | 'detail' | 'edit' | 'delete';

/** 角色名称与选择项使用完整目录，避免只读取第一页后显示角色 ID。 */
export const fetchRoles = async (token: string): Promise<Role[] | null> => {
  const roles: Role[] = [];
  let offset = 0;
  while (true) {
    const result = await api.roles(token, offset, 100);
    if (result.code || !result.data) return null;
    const page = result.data;
    roles.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total) return roles;
    if (!page.items.length) return null;
  }
};

export const roleNames = (ids: readonly string[], roles: readonly Role[] | null): string => {
  if (!ids.length) return '未分配角色';
  if (!roles) return '-';
  const names = new Map(roles.map((role) => [role.id, role.name]));
  return ids.map((id) => names.get(id) ?? '不可用角色').join('、');
};
