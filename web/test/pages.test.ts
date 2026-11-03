import { describe, expect, test } from 'bun:test';
import { createMemoryHistory, createRouter } from 'luna-router/core';
import { buildRecords, createSync } from '../src/router/routes';
import { viewEntries, viewKey, viewPaths } from '../src/router/views';
import { menuModel, menuRows, menuValue } from '../src/views/access/model';
import type { NavMenu } from '../src/api/types';

describe('page coverage', () => {
  test('every registered view has an implementation', async () => {
    for (const entry of viewEntries) {
      expect(
        await Bun.file(
          new URL(`../src/views/${entry.file}`, import.meta.url),
        ).exists(),
      ).toBe(true);
    }
    for (const name of [
      'Dashboard',
      'Menus',
    ]) {
      expect(viewPaths[viewKey(name)]).toBeDefined();
    }
    expect(viewPaths[viewKey('node-list')]).toBe(
      '../views/nodes/List.svelte',
    );
    expect(viewPaths[viewKey('nodes/Detail')]).toBe(
      '../views/nodes/Detail.svelte',
    );
  });

  test('omits removed subscription views from server navigation', () => {
    const input = ['NodeSubscriptions', 'UserSubscriptions', 'nodes/Subscriptions', 'users/Subscriptions'].map((view, index) => ({
      code: `removed${index}`, title: '订阅管理', path: `/removed${index}`, view,
      icon: null, rank: index, children: [],
    }));
    for (const item of input) expect(viewPaths[viewKey(item.view)]).toBeUndefined();
    const result = buildRecords([...input, {
      code: 'nodes', title: '节点列表', path: '/nodes', view: 'Nodes',
      icon: null, rank: 4, children: [],
    }], (view) => view && viewPaths[viewKey(view)] ? () => Promise.resolve({}) : undefined);
    expect(result.records.map((item) => item.path)).toEqual(['/nodes']);
    expect(result.menu.map((item) => item.path)).toEqual(['/nodes']);
    expect([...result.allowed]).toEqual(['/nodes']);
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
    sync([{ path: '/custom', name: 'nodes', meta: { title: '自定义节点', dynamic: true } }]);
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
    id: 'a'.repeat(32),
    parent_id: null,
    code: 'nodes',
    title: '节点',
    path: '/nodes',
    view: null,
    icon: null,
    rank: 2,
    enabled: true,
    perm: null,
    children: [
      {
        id: 'b'.repeat(32),
        parent_id: 'a'.repeat(32),
        code: 'list',
        title: '列表',
        path: '/nodes/list',
        view: 'Nodes',
        icon: null,
        rank: 1,
        enabled: false,
        perm: 'node:read',
        children: [],
      },
    ],
  };

  test('keeps hierarchy and disabled rows when flattening the management tree', () => {
    expect(
      menuRows([item]).map((row) => [row.id, row.depth, row.enabled]),
    ).toEqual([
      ['a'.repeat(32), 0, true],
      ['b'.repeat(32), 1, false],
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
      enabled: false,
      perm: null,
    });
  });
});
