import { describe, expect, test } from 'bun:test';
import { parse } from 'svelte/compiler';
import { buildRecords, createSync, pageTrail, menuId } from './router';
import { createMemoryHistory, createRouter } from 'luna-router/core';
import type { NavRoute } from '../src/api/types';

const source = await Bun.file(new URL('../src/layouts/AdminLayout.svelte', import.meta.url)).text();
const ast = parse(source, { modern: true });
const script = ast.instance!.content.body
  .filter(node => node.type === 'VariableDeclaration' && node.declarations.some(entry => entry.id.type === 'Identifier' && ['menuItems', 'menuKeys', 'readMenu', 'menuPaths'].includes(entry.id.name)))
  .map(node => source.slice(node.start!, node.end!)).join('\n');
const { menuFind, menuOpen } = await import(new URL('./src/menu.js', import.meta.resolve('@luna/components/menu')).href);
const stored = new Map<string, string>();
const session = { token: 'fixture-a' };
const readUser = () => {
  try { return JSON.parse(stored.get('user') ?? 'null'); } catch { return null; }
};
const saveUser = (patch: Record<string, unknown>) => {
  const user = readUser();
  if (user?.token === session.token) stored.set('user', JSON.stringify({ ...user, ...patch }));
};
const { menuItems, menuKeys, readMenu, menuPaths } = new Function('menuFind', 'menuOpen', 'readUser', 'menuIcon', 'session',
  new Bun.Transpiler({ loader: 'ts' }).transformSync(script) + '\nreturn { menuItems, menuKeys, readMenu, menuPaths };')(
    menuFind, menuOpen, readUser,
    (icon: string | null, branch: boolean) => ({ icon, branch }),
    session,
  );
const effect = ast.instance!.content.body.find(node => node.type === 'ExpressionStatement'
  && node.expression.type === 'CallExpression' && node.expression.callee.type === 'Identifier'
  && node.expression.callee.name === '$effect' && source.slice(node.start!, node.end!).includes('saveUser('))!;
const saveMenu = new Function('saveUser', 'openKeys', 'storage', '$effect',
  new Bun.Transpiler({ loader: 'ts' }).transformSync(source.slice(effect.start!, effect.end!)));

const key = (path: string): string => String(menuId(path));
const route = (path: string, title: string, view: string | null, children: NavRoute[] = [], icon: string | null = null): NavRoute => ({
  id: menuId(path), group: false, hidden: false,
  code: path, path, title, view, children, icon, rank: 0,
});

describe('menu groups', () => {
  test('renders root directory titles once while retaining server labels, icons and order', () => {
    const input = [
      route('/home', '工作台', 'dashboard/Overview', [], 'home'),
      route('/members', '客户业务', null, [
        route('/members/list', '自定义客户目录', 'users/List', [], 'users'),
        route('/members/invites', '自定义邀请入口', 'invites/Invite', [], 'ticket'),
      ]),
      route('/billing', '结算中心', null, [route('/billing/orders', '订单记录', 'orders/List')]),
    ];
    input[1]!.group = true;
    input[2]!.group = true;
    const copy = structuredClone(input);
    expect(menuItems(input)).toEqual([
      { key: key('/home'), label: '工作台', iconComponent: { icon: 'home', branch: false }, children: undefined },
      { key: key('/members/list'), label: '自定义客户目录', iconComponent: { icon: 'users', branch: false }, children: undefined, group: '客户业务' },
      { key: key('/members/invites'), label: '自定义邀请入口', iconComponent: { icon: 'ticket', branch: false }, children: undefined },
      { key: key('/billing/orders'), label: '订单记录', iconComponent: { icon: null, branch: false }, children: undefined, group: '结算中心' },
    ]);
    expect(input).toEqual(copy);
  });

  test('retains deeper directories and their expansion state beneath a root group', () => {
    const root = route('/access', '管理分组', null, [
      route('/access/config', '自定义设置', null, [route('/access/config/menus', '路由菜单', 'access/Menus')]),
    ]);
    root.group = true;
    const mapped = menuItems([root]);
    expect(mapped[0]).toMatchObject({ key: key('/access/config'), label: '自定义设置', group: '管理分组',
      iconComponent: { branch: true }, children: [{ key: key('/access/config/menus'), label: '路由菜单' }] });
    expect(mapped[0].children[0].group).toBeUndefined();
    expect(menuKeys(mapped, key('/access/config/menus'), [key('/access')])).toEqual([key('/access/config')]);
  });

  test('keeps root pages with children and does not create empty or restricted groups', () => {
    expect(menuItems([])).toEqual([]);
    expect(menuItems([route('/empty', '无入口', null)])).toEqual([]);
    const mapped = menuItems([route('/custom', '业务页面', 'dashboard/Overview', [route('/custom/list', '可用页面', 'users/List')])]);
    expect(mapped[0]).toMatchObject({ key: key('/custom'), label: '业务页面', children: [{ key: key('/custom/list') }] });
    expect(mapped[0].group).toBeUndefined();
  });
});

const items = [
  { key: '/' },
  { key: '/nodes', children: [{ key: '/nodes/list' }] },
  {
    key: '/access',
    children: [
      { key: '/access/accounts' },
      { key: '/access/config', children: [{ key: '/access/config/menus' }] },
    ],
  },
];

describe('menu expansion', () => {
  test('opens every ancestor when a nested page is loaded directly', () => {
    expect(menuKeys(items, '/access/config/menus')).toEqual(['/access', '/access/config']);
    expect(menuKeys(items, '/access/config')).toEqual(['/access', '/access/config']);
    expect(menuKeys(items, '/nodes/list')).toEqual(['/nodes']);
  });

  test('restores other open groups in parent-first order', () => {
    expect(menuKeys(items, '/nodes/list', ['/access/config', '/access'])).toEqual(['/nodes', '/access', '/access/config']);
  });

  test('prunes removed, leaf and inaccessible groups', () => {
    const nodes = [...items, { key: '/hidden', disabled: true, children: [{ key: '/hidden/list' }] }];
    expect(menuKeys(nodes, '/', ['/missing', '/nodes/list', '/hidden', '/access/config'])).toEqual([]);
    expect(menuKeys(nodes, '/hidden/list', ['/nodes'])).toEqual(['/nodes']);
  });

  test('uses menu identities and never guesses selection from address prefixes', () => {
    expect(menuKeys(items, '/nodes/00000000-0000-4000-8000-000000000001')).toEqual([]);
    expect(menuKeys(items, '/nodes/list')).toEqual(['/nodes']);
    expect(menuKeys(items, '/nodes-extra/list')).toEqual([]);
    expect(menuKeys(items, '/')).toEqual([]);
  });

  test('preserves input state and respects a manually closed inactive branch', () => {
    const saved = ['/nodes'];
    expect(menuKeys(items, '/', saved)).toEqual(['/nodes']);
    expect(saved).toEqual(['/nodes']);
    expect(menuKeys(items, '/', [])).toEqual([]);
  });
});


test('restores persistent sidebar state only for the same account', () => {
  stored.clear();
  stored.set('user', JSON.stringify({ token: 'fixture-a', expires_at: Date.now() / 1000 + 60,
    navigation: { version: 5, account: 'first', routes: [] },
    sidebar: { account: 'first', keys: ['/nodes', 1] },
  }));
  expect(readMenu('first')).toEqual(['/nodes']);
  expect(readMenu('other')).toEqual([]);
  saveUser({ sidebar: { account: 'first', keys: '/nodes' } });
  expect(readMenu('first')).toEqual([]);
  saveUser({ sidebar: 'invalid' });
  expect(readMenu('first')).toEqual([]);
  const before = stored.get('user');
  saveMenu(saveUser, ['/ignored'], '', (read: () => void) => read());
  expect(stored.get('user')).toBe(before);
  saveMenu(saveUser, ['/access'], 'first', (read: () => void) => read());
  expect(readMenu('first')).toEqual(['/access']);
  expect(readUser().navigation).toEqual({ version: 5, account: 'first', routes: [] });
  expect([...stored.keys()]).toEqual(['user']);
  stored.set('user', JSON.stringify({ ...readUser(), token: 'fixture-b' }));
  expect(readMenu('first')).toEqual([]);
});

test('distinguishes explicit section headings from ordinary root directories', () => {
  const nodes = [route('/root', '可折叠目录', null, [route('/root/list', '列表', 'users/List')])];
  expect(menuItems(nodes)[0]).toMatchObject({ key: key('/root'), children: [{ key: key('/root/list') }] });
  expect(menuItems(nodes)[0].group).toBeUndefined();
  expect(menuItems([{ ...nodes[0]!, group: true }])[0]).toMatchObject({ key: key('/root/list'), group: '可折叠目录' });
});

test('uses the actual parameter ancestry for expansion and never navigates a template address', () => {
  const result = buildRecords([route('/teams/:team', '团队', null, [
    route('/members/:team/:member', '成员', 'users/List'),
  ])], () => async () => ({}));
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  createSync(router)(result.records);
  const trail = pageTrail(router, router.resolve('/members/north/42'));
  const paths = menuPaths(result.menu, trail);
  const items = menuItems(result.menu, paths);
  expect(paths.get(key('/teams/:team'))).toBe('/teams/north');
  expect(paths.get(key('/members/:team/:member'))).toBe('/members/north/42');
  expect(items[0].disabled).toBeUndefined();
  expect(menuKeys(items, key('/members/:team/:member'))).toEqual([key('/teams/:team')]);
  expect(menuItems(result.menu)[0].disabled).toBe(true);
  router.destroy();
});

test('layout changes cannot overwrite saved tree branches, while user toggles still apply', () => {
  const names = ['openKeys', 'popups', 'menuMode', 'getOpen', 'setOpen'];
  const binding = ast.instance!.content.body
    .filter(node => node.type === 'VariableDeclaration' && node.declarations.some(entry => entry.id.type === 'Identifier' && names.includes(entry.id.name)))
    .map(node => source.slice(node.start!, node.end!)).join('\n');
  const preferences = { collapsed: false };
  const state = new Function('preferences', '$state', 'untrack',
    new Bun.Transpiler({ loader: 'ts' }).transformSync(binding) + `
      return { getOpen, setOpen, commit: () => { menuMode = preferences.collapsed; },
        saved: () => openKeys, floating: () => popups };
    `)(preferences, (value: unknown) => value, (read: () => unknown) => read());
  state.setOpen(['/active', '/other']);
  preferences.collapsed = true;
  state.setOpen([]);
  state.commit();
  state.setOpen(['/popup']);
  expect(state.floating()).toEqual(['/popup']);
  expect(state.saved()).toEqual(['/active', '/other']);
  preferences.collapsed = false;
  state.setOpen([]);
  expect(state.saved()).toEqual(['/active', '/other']);
  state.commit();
  expect(state.getOpen()).toEqual(['/active', '/other']);
  state.setOpen(['/other']);
  expect(state.saved()).toEqual(['/other']);
});
