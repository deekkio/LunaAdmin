import { describe, expect, test } from 'bun:test';
import { createMemoryHistory, createRouter } from 'luna-router/core';
import type { NavRoute, Principal } from '../src/api/types';
import { createGuard } from './router';
import { buildRecords, createSync, menuId } from './router';
import { pagePath } from './router';

const entry = (path: string, view = 'nodes/List'): NavRoute => ({
  id: menuId(path), group: false, hidden: false,
  code: 'page', title: '服务端页面', path, view, icon: null, rank: 0, children: [],
});

const createState = (path: string, routes: NavRoute[]) => {
  const counts = { read: 0, page: 0, missing: 0 };
  const history = createMemoryHistory();
  history.replace(path);
  const router = createRouter({
    history,
    routes: [
      { path: '/login', name: 'login', meta: { public: true } },
      { path: '/denied', name: 'denied' },
      { path: '/:path(.*)*', name: 'missing', lazy: async () => { counts.missing++; return { default: () => {} }; } },
    ],
  });
  const sync = createSync(router);
  const principal: Principal = { account: 'fixture', username: 'fixture', root: false, roles: [], permissions: [] };
  const session = {
    authenticated: true,
    token: 'fixture' as string | null,
    principal: null as Principal | null,
    restore: async () => {
      if (!session.authenticated) return false;
      if (!session.principal) { counts.read++; session.principal = principal; }
      return true;
    },
  };
  let menu: NavRoute[] = [];
  const navigation = {
    loaded: false,
    get firstPath() { return menu[0]?.path ?? '/denied'; },
    load: async () => {
      const result = buildRecords(routes, () => async () => { counts.page++; return { default: () => {} }; });
      sync(result.records);
      menu = result.menu;
      navigation.loaded = true;
    },
    reset: () => {
      sync([]);
      menu = [];
      navigation.loaded = false;
    },
  };
  router.beforeEach(createGuard(session, navigation));
  return { router, session, navigation, counts, sync };
};

describe('navigation guard', () => {
  test('rematches the first deep link after loading and preserves its query and hash', async () => {
    const state = createState('/custom/nodes?tab=active#details', [entry('/custom/nodes')]);
    await state.router.start();
    expect(state.router.currentRoute.fullPath).toBe('/custom/nodes?tab=active#details');
    expect(state.router.currentRoute.name).toBe(`nav:${menuId('/custom/nodes')}`);
    expect(state.router.currentRoute.meta.title).toBe('服务端页面');
    expect(state.counts).toEqual({ read: 1, page: 1, missing: 0 });
    state.router.destroy();
  });

  test('starts at the first server page and sends an empty tree to denied', async () => {
    for (const routes of [[entry('/custom/start')], []]) {
      const state = createState('/?tab=one#section', routes);
      await state.router.start();
      expect(state.router.currentRoute.fullPath).toBe(`${routes.length ? '/custom/start' : '/denied'}?tab=one#section`);
      expect(state.router.resolve('/dashboard').name).toBe('missing');
      state.router.destroy();
    }
  });

  test('uses a server root page without redirecting back to the bootstrap root', async () => {
    const state = createState('/', [entry('/')]);
    await state.router.start();
    expect(state.router.currentRoute.name).toBe(`nav:${menuId('/')}`);
    expect(state.counts.page).toBe(1);
    state.router.destroy();
  });

  test('clears installed routes when logging out and keeps the requested deep link', async () => {
    const state = createState('/custom/nodes', [entry('/custom/nodes')]);
    await state.router.start();
    state.session.authenticated = false;
    state.session.token = null;
    state.session.principal = null;
    await state.router.replace('/custom/nodes?tab=one');
    expect(state.router.currentRoute.path).toBe('/login');
    expect(state.router.currentRoute.query.next).toBe('/custom/nodes?tab=one');
    expect(state.router.resolve('/custom/nodes').name).toBe('missing');
    expect(state.navigation.firstPath).toBe('/denied');
    state.router.destroy();
  });

  test('replaces a removed current page with the missing view after refreshing', async () => {
    const state = createState('/custom/nodes', [entry('/custom/nodes')]);
    await state.router.start();
    state.sync([]);
    await state.router.replace(state.router.currentRoute.fullPath);
    expect(state.router.currentRoute.name).toBe('missing');
    expect(state.counts.missing).toBe(1);
    state.router.destroy();
  });
});

test('finds return paths from custom server trees and never guesses a business path', () => {
  const routes = [{ ...entry('/custom', ''), view: null, children: [entry('/custom/people', 'users/List')] }];
  expect(pagePath(routes, 'users/List')).toBe('/custom/people');
  expect(pagePath([entry('/custom/people/:id', 'users/Detail')], 'users/List')).toBe('/denied');
  expect(pagePath([], 'users/List')).toBe('/denied');
});

test('a stale identity response cannot clear the replacement session navigation', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  let resets = 0;
  const session = { authenticated: true, restore: async () => false };
  const navigation = { loaded: true, firstPath: '/new-account', load: async () => {}, reset: () => { resets++; } };
  try {
    await createGuard(session, navigation)(router.resolve('/private'), router.currentRoute);
    expect(resets).toBe(0);
    expect(navigation.firstPath).toBe('/new-account');
  } finally { router.destroy(); }
});
