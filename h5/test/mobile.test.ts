import { describe, expect, test } from 'bun:test';
import type { NavRoute } from '../src/api/types';
import { mobilePage } from '../src/layouts/mobile';

const routes: NavRoute[] = [{
  code: 'directory', title: '业务中心', path: '/directory', view: null, icon: null, rank: 0,
  children: [{ code: 'staff', title: '管理成员', path: '/staff', view: 'Accounts', icon: null, rank: 0, children: [] }],
}];

describe('mobile page hierarchy', () => {
  test('only keeps the registered home and mobile shells in the bottom navigation', () => {
    expect(mobilePage('/hub', '/hub', undefined, routes)).toEqual({ root: true, tab: '/hub', parent: '/hub' });
    expect(mobilePage('/menu', '/hub', undefined, routes)).toEqual({ root: true, tab: '/menu', parent: '/hub' });
    expect(mobilePage('/profile', '/hub', undefined, routes)).toEqual({ root: true, tab: '/profile', parent: '/hub' });
  });

  test('returns details to actual parent pages and lists to the server menu tree', () => {
    expect(mobilePage('/staff/abc', '/hub', '/staff', routes).parent).toBe('/staff');
    // 目录会重定向到首个子页，返回目录会原地循环，应返回菜单树。
    expect(mobilePage('/staff', '/hub', '/directory', routes).parent).toBe('/menu');
    expect(mobilePage('/members', '/hub', '', routes).parent).toBe('/menu');
  });

  test('avoids missing, recursive or unresolved parameter parents', () => {
    for (const parent of [null, undefined, '/same', '/missing', '/members/:id']) {
      expect(mobilePage('/same', '/hub', parent, routes)).toEqual({ root: false, tab: '', parent: '/menu' });
    }
    expect(mobilePage('/login', '/hub', undefined, routes).root).toBe(false);
  });
});
