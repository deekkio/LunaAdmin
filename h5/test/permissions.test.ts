import { expect, test } from 'bun:test';
import { buildRecords } from '../src/router/routes';
import { homeLinks } from '../src/layouts/home';
import type { NavRoute } from '../src/api/types';

// /routes 已由服务端按账号权限裁剪，前端不可从角色或本地业务表补菜单。
test('uses only server-authorized business entries and removes them when the tree is revoked', () => {
  const route: NavRoute = { code: 'customers', title: '客户', path: '/customers', view: 'Users', icon: 'users', rank: 0, children: [] };
  const resolve = (view: string | null) => view === 'Users' ? () => Promise.resolve({}) : undefined;
  expect(homeLinks(buildRecords([route], resolve).menu).map(item => item.path)).toEqual(['/customers']);
  expect(buildRecords([], resolve).allowed.size).toBe(0);
  expect(homeLinks(buildRecords([], resolve).menu)).toEqual([]);
});
