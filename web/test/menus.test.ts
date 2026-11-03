import { describe, expect, test } from 'bun:test';
import type { NavMenu, Permission } from '../src/api/types';
import { filterMenus, menuModel, menuValue, permName } from '../src/views/access/model';

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
  id, title, code: id, path: `/${id}`, view: null, parent_id: null,
  icon: null, rank: 0, enabled, perm: null, children,
});

describe('menu tree filters', () => {
  const items = [entry('system', '系统管理', [
    entry('users', '用户列表'), entry('audit', '审计日志', [], false),
  ], false), entry('nodes', '节点管理')];

  test('keeps ancestors for descendant matches and retains a matching directory subtree', () => {
    const result = filterMenus(items, '用户');
    expect(result.map(item => item.id)).toEqual(['system']);
    expect(result[0]?.children.map(item => item.id)).toEqual(['users']);
    expect(filterMenus(items, '系统')[0]?.children).toHaveLength(2);
    expect(filterMenus(items, '/USERS')[0]?.children[0]?.id).toBe('users');
    expect(items[0]?.children).toHaveLength(2);
    expect(filterMenus(items, 'missing')).toEqual([]);
  });

  test('filters status per node while preserving structural ancestors', () => {
    const result = filterMenus(items, '', 'active');
    expect(result.map(item => item.id)).toEqual(['system', 'nodes']);
    expect(result[0]?.enabled).toBe(false);
    expect(result[0]?.children.map(item => item.id)).toEqual(['users']);
    expect(filterMenus(items, '', 'disabled')[0]?.children.map(item => item.id)).toEqual(['audit']);
    expect(filterMenus(items, '用户', 'disabled')).toEqual([]);
  });
});
