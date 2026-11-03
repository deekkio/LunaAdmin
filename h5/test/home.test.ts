import { describe, expect, test } from 'bun:test';
import type { NavRoute } from '../src/api/types';
import { homeLinks, homePath } from '../src/layouts/home';
import { pagePath } from '../src/router/views';
import { buildRecords } from '../src/router/routes';
import { viewPaths } from '../src/router/views';
import { viewKey } from '../src/router/views';

const entry = (path: string, view: string | null, children: NavRoute[] = [], title = path): NavRoute => ({
  path, view, children, code: path, title, icon: null, rank: 0,
});
const resolve = (view: string | null) => view ? viewPaths[viewKey(view)] : undefined;

describe('server mobile navigation', () => {
  test('uses the registered dashboard or the first server entry without inventing paths', () => {
    expect(homePath([entry('/apps', null, [entry('/hub', 'dashboard/Overview')])])).toBe('/hub');
    expect(homePath([entry('/', 'Dashboard')])).toBe('/');
    expect(homePath([entry('/members', 'Users')])).toBe('/members');
    expect(homePath([])).toBe('/denied');
    expect(pagePath([], 'Users')).toBeUndefined();
  });

  test('preserves arbitrary server titles, hierarchy, sorting and view aliases', () => {
    const input = [entry('/apps', null, [
      { ...entry('people', 'users-list', [], '客户目录'), rank: 2, icon: 'shield' },
      { ...entry('catalog', null, [entry('all', 'Plans', [], '可售套餐')], '商品中心'), rank: 1 },
    ], '业务工作台')];
    const copy = structuredClone(input);
    const menu = buildRecords(input, resolve).menu;
    expect(homeLinks(menu)).toEqual([
      { path: '/apps/catalog/all', label: '可售套餐', icon: null, view: 'Plans', parent: '/apps/catalog' },
      { path: '/apps/people', label: '客户目录', icon: 'shield', view: 'users-list', parent: '/apps' },
    ]);
    expect(input).toEqual(copy);
    expect(pagePath(menu, 'Users')).toBe('/apps/people');
  });

  test('empty or restricted server trees never inject unreturned business entries', () => {
    expect(homeLinks([])).toEqual([]);
    expect(homeLinks([entry('/messages', 'Announcements', [], '运营消息')]).map(item => item.path)).toEqual(['/messages']);
    expect(homeLinks([entry('/billing', null, [entry('/settings', 'Payments', [], '结算配置')])])[0]?.label).toBe('结算配置');
  });

  test('excludes dashboard, navigation shells, dynamic details and unknown views', () => {
    expect(homeLinks([
      entry('/home', 'Dashboard'), entry('/menu', 'Menu'), entry('/me', 'Profile'),
      entry('/members/:id', 'UserDetail'), entry('/unknown', 'Unknown'),
    ])).toEqual([]);
  });
});
