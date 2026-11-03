import type { NavRoute } from '../api/types';

export const viewKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export const viewEntries = [
  { name: 'Announcements', file: 'information/Announcements.svelte', aliases: [] },
  { name: 'Notices', file: 'information/Notices.svelte', aliases: [] },
  { name: 'Payments', file: 'payments/List.svelte', aliases: [] },
  { name: 'Dashboard', file: 'dashboard/Overview.svelte', aliases: [] },
  {
    name: 'Nodes',
    file: 'nodes/List.svelte',
    aliases: ['node-list', 'nodes-list'],
  },
  { name: 'NodeDetail', file: 'nodes/Detail.svelte', aliases: [] },
  {
    name: 'Users',
    file: 'users/List.svelte',
    aliases: ['user-list', 'users-list'],
  },
  { name: 'UserDetail', file: 'users/Detail.svelte', aliases: [] },
  {
    name: 'Orders',
    file: 'orders/List.svelte',
    aliases: ['order-list', 'orders-list'],
  },
  { name: 'OrderDetail', file: 'orders/Detail.svelte', aliases: [] },
  {
    name: 'Plans',
    file: 'plans/List.svelte',
    aliases: ['plan-list', 'plans-list', 'plan-management'],
  },
  {
    name: 'Tutorials',
    file: 'tutorials/List.svelte',
    aliases: ['tutorial-list', 'tutorials-list'],
  },
  {
    name: 'Invites',
    file: 'invites/Invite.svelte',
    aliases: ['invite-list', 'invites-list'],
  },
  {
    name: 'Accounts',
    file: 'access/Accounts.svelte',
    aliases: ['admins', 'account-list', 'accounts-list'],
  },
  { name: 'AccountDetail', file: 'access/Account.svelte', aliases: [] },
  {
    name: 'Roles',
    file: 'access/Roles.svelte',
    aliases: ['role-list', 'roles-list'],
  },
  { name: 'RoleDetail', file: 'access/Role.svelte', aliases: [] },
  {
    name: 'Permissions',
    file: 'access/Permissions.svelte',
    aliases: ['permission-list', 'permissions-list'],
  },
  {
    name: 'Menus',
    file: 'access/Menus.svelte',
    aliases: ['menu-list', 'menus-list'],
  },
  { name: 'Menu', file: 'menu/Menu.svelte', aliases: ['home'] },
  { name: 'Profile', file: 'profile/Profile.svelte', aliases: [] },
  {
    name: 'Audits',
    file: 'access/Audits.svelte',
    aliases: ['audit-list', 'audits-list'],
  },
];

export const viewPaths: Record<string, string> = Object.fromEntries(
  viewEntries.flatMap((entry) =>
    [entry.name, entry.file.replace('.svelte', ''), ...entry.aliases].map(
      (name) => [viewKey(name), `../views/${entry.file}`],
    ),
  ),
);

/** 只解析服务端树中实际存在的页面，不恢复固定业务路径。 */
export const pagePath = (routes: readonly NavRoute[], view: string): string | undefined => {
  const file = viewPaths[viewKey(view)];
  if (!file) return undefined;
  for (const item of routes) {
    if (item.view && !item.path.includes(':') && viewPaths[viewKey(item.view)] === file) return item.path;
    const path = pagePath(item.children, view);
    if (path) return path;
  }
  return undefined;
};
