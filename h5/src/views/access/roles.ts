import { api } from '../../api';
import type { Permission, Role } from '../../api/types';

export type RoleMode = 'create' | 'detail' | 'edit';

/** RoleInput 使用规范 ULID，新增时自动生成，避免让用户手动填写标识。 */
export const newRole = (): string => {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let value = BigInt(Date.now());
  for (const byte of crypto.getRandomValues(new Uint8Array(10)))
    value = (value << 8n) | BigInt(byte);
  let id = '';
  for (let index = 0; index < 26; index++) {
    id = alphabet[Number(value & 31n)] + id;
    value >>= 5n;
  }
  return id;
};

export const isRoot = (role: Role | null): boolean => Boolean(role?.system && role.code === 'root');

export const isAdmin = (role: Role | null): boolean => Boolean(role?.system && role.code === 'admin');

export const canEdit = (role: Role | null, root: boolean): boolean => !isRoot(role) && (!isAdmin(role) || root);

export const fetchPerms = async (token: string): Promise<Permission[] | null> => {
  const permissions: Permission[] = [];
  let offset = 0;
  while (true) {
    const result = await api.permissions(token, offset, 100);
    if (result.code || !result.data) return null;
    const page = result.data;
    permissions.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total) return permissions;
    if (!page.items.length) return null;
  }
};

const labels: Record<string, string> = {
  access: '系统权限',
  user: '用户管理',
  node: '节点管理',
  order: '订单管理',
  plan: '套餐管理',
  document: '文档管理',
  menu: '路由菜单',
  invite: '邀请码',
  payment: '支付管理',
};

export const permGroups = (permissions: readonly Permission[]) => {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const key = permission.code.split(':')[0] ?? '';
    const items = groups.get(key) ?? [];
    items.push(permission);
    groups.set(key, items);
  }
  return [...groups].map(([key, items]) => ({ key, label: labels[key] ?? key, items }));
};

export const mergeGrants = (
  selected: readonly string[],
  group: readonly string[],
  values: readonly string[],
): string[] => [...new Set([...selected.filter((code) => !group.includes(code)), ...values])];
