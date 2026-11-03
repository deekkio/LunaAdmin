import type { NavMenu } from '../../api/types';

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
