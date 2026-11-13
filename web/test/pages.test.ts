import { describe, expect, test } from 'bun:test';
import { createMemoryHistory, createRouter } from 'luna-router/core';
import { buildRecords, createSync } from './router';
import { views, hasView } from './router';
import { pageModule } from './view';
import type { NavMenu } from '../src/api/types';

const { menuModel, menuRows, menuValue } = await pageModule(new URL('../src/views/access/Menus.svelte', import.meta.url));

describe('page coverage', () => {
  test('discovers real component paths and rejects business keys or paths outside the glob', () => {
    expect(Object.keys(views)).toContain('../views/nodes/List.svelte');
    expect(Object.keys(views)).toContain('../views/information/Notices.svelte');
    for (const path of ['dashboard/Overview', 'access/Menus', 'nodes/List']) expect(hasView(path)).toBe(true);
    for (const path of ['Nodes', 'NodeDetail', 'node-list', 'nodes/Detail', '../views/nodes/List', 'nodes/List.svelte'])
      expect(hasView(path)).toBe(false);
  });

  test('keeps unsupported server views on the missing page without a registered implementation', () => {
    const input = ['NodeSubscriptions', 'UserSubscriptions', 'nodes/Subscriptions', 'users/Subscriptions'].map((view, index) => ({
      id: index + 1, group: false, hidden: false, code: `removed${index}`, title: '订阅管理', path: `/removed${index}`, view,
      icon: null, rank: index, children: [],
    }));
    for (const item of input) expect(hasView(item.view)).toBe(false);
    const result = buildRecords([...input, {
      id: 5, group: false, hidden: false, code: 'nodes', title: '节点列表', path: '/nodes', view: 'nodes/List',
      icon: null, rank: 4, children: [],
    }], (view) => view === null || hasView(view) ? () => Promise.resolve({}) : undefined);
    expect(result.records.map(item => item.path)).toEqual(['/removed0', '/removed1', '/removed2', '/removed3', '/nodes']);
    expect(result.records.every(item => typeof item.lazy === 'function')).toBe(true);
    expect(result.menu).toHaveLength(5);
    expect(result.allowed.has('/nodes')).toBe(true);
  });

  test('installs only server routes, preserves infrastructure and removes deleted pages', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', name: 'login', meta: { public: true } },
        { path: '/denied', name: 'denied' },
        { path: '/:path(.*)*', name: 'missing' },
      ],
    });
    const sync = createSync(router);
    sync([{ path: '/', name: 'login', meta: { title: '服务端首页', dynamic: true } }]);
    await router.start();
    expect(router.currentRoute.meta.title).toBe('服务端首页');
    expect(router.resolve('/login').name).toBe('login');
    expect(router.resolve('/nodes/abc').name).toBe('missing');
    sync([{ path: '/custom', name: 'nodes', lazy: async () => ({}), meta: { title: '自定义节点', dynamic: true } }]);
    await router.replace('/');
    expect(router.currentRoute.path).toBe('/custom');
    expect(router.currentRoute.name).toBe('nav:nodes');
    expect(router.resolve('/nodes').name).toBe('missing');
    sync([]);
    await router.replace('/');
    expect(router.currentRoute.path).toBe('/denied');
    expect(router.resolve('/custom').name).toBe('missing');
    expect(router.resolve('/nodes').name).toBe('missing');
    expect(router.resolve('/login').name).toBe('login');
    router.destroy();
  });

  test('rolls back partial installation when a server route is invalid', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const sync = createSync(router);
    sync([{ path: '/old', name: 'old' }]);
    expect(() => sync([{ path: '/valid', name: 'valid' }, { path: '/broken/:(', name: 'broken' }])).toThrow();
    expect(router.resolve('/old').matched).toEqual([]);
    expect(router.resolve('/valid').matched).toEqual([]);
    sync([]);
    expect(router.resolve('/').matched[0]?.record.redirect).toBe('/denied');
    router.destroy();
  });
});

describe('menu editing', () => {
  const item: NavMenu = {
    id: 1,
    parent_id: null,
    code: 'nodes',
    title: '节点',
    path: '/nodes',
    view: null,
    icon: null,
    rank: 2,
    enabled: true, group: false, hidden: false,
    perm: null,
    children: [
      {
        id: 2,
        parent_id: 1,
        code: 'list',
        title: '列表',
        path: '/nodes/list',
        view: 'nodes/List',
        icon: null,
        rank: 1,
        enabled: false, group: false, hidden: false,
        perm: 'node:read',
        children: [],
      },
    ],
  };

  test('keeps hierarchy and disabled rows when flattening the management tree', () => {
    expect(
      menuRows([item]).map((row) => [row.id, row.depth, row.enabled]),
    ).toEqual([
      [1, 0, true],
      [2, 1, false],
    ]);
    expect(item.children[0].parent_id).toBe(item.id);
  });

  test('preserves null fields, negative rank and disabled state in the API payload', () => {
    const model = menuModel(item);
    model.rank = '-5';
    model.enabled = false;
    expect(menuValue(model)).toEqual({
      id: item.id,
      parent_id: null,
      code: 'nodes',
      title: '节点',
      path: '/nodes',
      view: null,
      icon: null,
      rank: -5,
      enabled: false, group: false, hidden: false,
      perm: null,
    });
  });
});
