import type { MenuInput, NavMenu, Permission } from '../../api/types';

export const permName = (value: unknown, catalog: readonly Permission[] | null): string => {
  if (!value) return '登录可见';
  if (!catalog) return '-';
  return catalog.find(item => item.code === value)?.name ?? '未登记权限';
};

export interface MenuRow extends NavMenu {
  depth: number;
}

/** 保留命中项的祖先；目录命中时显示其子树，状态筛选仍逐项生效。 */
export const filterMenus = (items: readonly NavMenu[], query = '', state = 'all'): NavMenu[] => {
  const term = query.trim().toLowerCase();
  const visit = (source: readonly NavMenu[], parent = false): NavMenu[] =>
    source.flatMap(item => {
      const matches = parent || !term || [item.title, item.code, item.path].some(value => value.toLowerCase().includes(term));
      const children = visit(item.children, matches);
      const enabled = state === 'all' || item.enabled === (state === 'active');
      return (matches && enabled) || children.length ? [{ ...item, children }] : [];
    });
  return visit(items);
};

export const menuRows = (items: readonly NavMenu[], depth = 0): MenuRow[] =>
  [...items]
    .sort((a, b) => a.rank - b.rank)
    .flatMap((item) => [
      { ...item, depth },
      ...menuRows(item.children, depth + 1),
    ]);

export const menuModel = (item?: NavMenu) => ({
  id: item?.id ?? '',
  parent: item?.parent_id ?? '',
  code: item?.code ?? '',
  title: item?.title ?? '',
  path: item?.path ?? '',
  view: item?.view ?? '',
  icon: item?.icon ?? '',
  rank: String(item?.rank ?? 0),
  enabled: item?.enabled ?? true,
  perm: item?.perm ?? '',
});

export const menuValue = (
  model: ReturnType<typeof menuModel>,
): Omit<MenuInput, 'version' | 'request'> => ({
  id: model.id.trim(),
  parent_id: model.parent || null,
  code: model.code.trim(),
  title: model.title.trim(),
  path: model.path.trim(),
  view: model.view.trim() || null,
  icon: model.icon.trim() || null,
  rank: Number(model.rank),
  enabled: model.enabled,
  perm: model.perm.trim() || null,
});

/** 保留树结构，并排除当前菜单及其后代，阻止循环选择。 */
interface MenuChoice { value: string; label: string; children?: MenuChoice[] }

export const menuChoices = (items: readonly NavMenu[], excluded = ''): MenuChoice[] =>
  items.filter(item => item.id !== excluded).map((item): MenuChoice => ({
    value: item.id, label: item.title,
    ...(item.children.length ? { children: menuChoices(item.children, excluded) } : {}),
  }));

export const menuPath = (items: readonly NavMenu[], key: string): string[] => {
  for (const item of items) {
    if (item.id === key) return [item.id];
    const path = menuPath(item.children, key);
    if (path.length) return [item.id, ...path];
  }
  return [];
};

const viewNames: Readonly<Record<string, string>> = {"Announcements": "公告管理", "Notices": "系统提醒", "Dashboard": "仪表盘", "Nodes": "节点列表", "NodeDetail": "节点详情", "Users": "用户列表", "UserDetail": "用户详情", "Orders": "订单列表", "OrderDetail": "订单详情", "Plans": "套餐管理", "Tutorials": "教程管理", "Invites": "邀请码", "Accounts": "管理列表", "AccountDetail": "管理员详情", "Roles": "角色管理", "RoleDetail": "角色详情", "Permissions": "权限管理", "Menus": "路由菜单", "Audits": "审计日志", "Payments": "支付配置"};
export const viewLabel = (value: unknown): string => value ? viewNames[String(value)] ?? String(value) : '目录';

const actions: Readonly<Record<string, string>> = {
  'audit:clear': '清理日志',
  'admin:bootstrap': '初始化管理员', 'admin:login': '管理员登录', 'admin:logout': '管理员退出',
  'user:group': '迁移用户分组', 'user:create': '新增用户', 'user:change': '更新用户', 'user:delete': '删除用户', 'user:reset_password': '重置用户密码',
  'access:create_account': '新增管理员', 'access:change_account': '更新管理员', 'access:reset_password': '重置管理员密码',
  'access:save_role': '保存角色', 'access:save_perm': '保存权限', 'access:assign': '分配角色', 'access:grant': '分配权限', 'access:read': '查看权限',
  'group:create': '新建节点分组',
  'node:permit': '生成节点部署授权', 'node:enroll': '注册节点', 'node:save': '保存节点', 'node:delete': '删除节点', 'node:machine': '签发节点凭据',
  'plan:save': '保存套餐', 'plan:delete': '删除套餐', 'document:save': '保存文档', 'invite:create': '生成邀请码',
  'subscription:link': '生成订阅链接',
  'order:delete': '删除订单', 'order:create': '新增订单', 'order:settle': '确认收款', 'order:paid': '订单支付', 'payment:close': '关闭支付', 'menu:save': '保存路由菜单',
};

export const actionText = (value: string): string => actions[value] ?? '其他操作';
