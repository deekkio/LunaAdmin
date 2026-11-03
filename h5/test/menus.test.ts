import { describe, expect, test } from 'bun:test';
import type { NavMenu } from '../src/api/types';
import { filterMenus } from '../src/views/access/menus';

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
