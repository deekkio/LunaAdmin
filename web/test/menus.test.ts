import { describe, expect, test } from 'bun:test';
import type { NavMenu, Permission } from '../src/api/types';
import { pageModule } from './view';
import { menuId } from './router';

const { filterMenus, menuModel, menuValue, permName } = await pageModule(new URL('../src/views/access/Menus.svelte', import.meta.url));

const catalog: Permission[] = [
  { code: 'access:read', name: '查看权限', enabled: true, system: true },
  { code: 'node:write', name: '管理节点', enabled: false, system: false },
];

describe('menu permission names', () => {
  test('uses catalog names without changing the permission saved to the server', () => {
    const model = { ...menuModel(), perm: 'access:read' };
    expect(permName(model.perm, catalog)).toBe('查看权限');
    expect(menuValue(model).perm).toBe('access:read');
    expect(permName('node:write', catalog)).toBe('管理节点');
  });

  test('distinguishes public menus, failed catalogs and unregistered permissions', () => {
    expect(permName(null, null)).toBe('登录可见');
    expect(permName('', catalog)).toBe('登录可见');
    expect(permName('access:read', null)).toBe('-');
    expect(permName('unknown:read', catalog)).toBe('未登记权限');
  });
});

const entry = (id: string, title: string, children: NavMenu[] = [], enabled = true): NavMenu => ({
  group: false, hidden: false,
  id: menuId(id), title, code: id, path: `/${id}`, view: null, parent_id: null,
  icon: null, rank: 0, enabled, perm: null, children,
});

describe('menu tree filters', () => {
  const items = [entry('system', '系统管理', [
    entry('users', '用户列表'), entry('audit', '审计日志', [], false),
  ], false), entry('nodes', '节点管理')];

  test('keeps ancestors for descendant matches and retains a matching directory subtree', () => {
    const result = filterMenus(items, '用户');
    expect(result.map(item => item.id)).toEqual(['system'].map(menuId));
    expect(result[0]?.children.map(item => item.id)).toEqual(['users'].map(menuId));
    expect(filterMenus(items, '系统')[0]?.children).toHaveLength(2);
    expect(filterMenus(items, '/USERS')[0]?.children[0]?.id).toBe(menuId('users'));
    expect(items[0]?.children).toHaveLength(2);
    expect(filterMenus(items, 'missing')).toEqual([]);
  });

  test('filters status per node while preserving structural ancestors', () => {
    const result = filterMenus(items, '', 'active');
    expect(result.map(item => item.id)).toEqual(['system', 'nodes'].map(menuId));
    expect(result[0]?.enabled).toBe(false);
    expect(result[0]?.children.map(item => item.id)).toEqual(['users'].map(menuId));
    expect(filterMenus(items, '', 'disabled')[0]?.children.map(item => item.id)).toEqual(['audit'].map(menuId));
    expect(filterMenus(items, '用户', 'disabled')).toEqual([]);
  });
});


test('round-trips section and visibility settings without altering authorization or enablement', () => {
  const item = { ...entry('section', '分组'), group: true, hidden: true, enabled: false, perm: 'access:read' };
  const model = menuModel(item);
  expect(model.group).toBe(true);
  expect(model.hidden).toBe(true);
  expect(menuValue(model)).toMatchObject({ group: true, hidden: true, enabled: false, perm: 'access:read', view: null, parent_id: null });
  expect(menuModel().group).toBe(false);
  expect(menuModel().hidden).toBe(false);
});


test('creates without a client ID and preserves numeric identifiers when editing', () => {
  const model = menuModel();
  expect(model.id).toBeNull();
  expect(model.parent).toBeNull();
  model.parent = 12;
  expect(menuValue(model)).toMatchObject({ id: null, parent_id: 12 });
  const edited = menuModel({ ...entry('existing', '菜单'), id: 37, parent_id: 12 });
  expect(menuValue(edited)).toMatchObject({ id: 37, parent_id: 12 });
});
