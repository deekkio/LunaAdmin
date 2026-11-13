import { describe, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import * as runtime from 'svelte/internal/client';
import english from '../src/locale/lang/en';
import chinese from '../src/locale/lang/zh-cn';
import type { NavRoute, Principal, Result, UnauthorizedHandler } from '../src/api/types';
import { buildRecords, createGuard, createSync, hasView, visibleMenu } from './router';
import { createMemoryHistory, createRouter, type Router } from 'luna-router/core';

const source = await Bun.file(new URL('../src/stores/state.svelte.ts', import.meta.url)).text();
const script = new Bun.Transpiler({ loader: 'ts' }).transformSync(source)
  .replace(/^import[\s\S]*?;\s*$/gm, '');
const compiled = compileModule(script, { filename: 'state.svelte.js', generate: 'client' }).js.code
  .replace(/^import[^\n]*;\s*$/gm, '').replace(/\bexport const /g, 'const ');
const create = new Function('$', 'api', 'applyRoutes', 'visibleMenu', 'setUnauthorizedHandler', 'english', 'chinese',
  'readPreference', 'setTheme', 'localStorage', `${compiled}\nreturn { session, navigation, preferences, readUser, saveUser };`);

const principal: Principal = { account: 'fixture', username: 'fixture', root: false, roles: [], permissions: ['user:read'] };
let identity = 0;
const entry = (path: string, options: Partial<NavRoute> = {}): NavRoute => ({
  id: ++identity, code: `page${identity}`, title: path, path,
  view: 'users/List', icon: null, rank: 0, children: [], group: false, hidden: false, ...options,
});
const logged = (patch: Record<string, unknown> = {}): string => JSON.stringify({
  token: 'fixture-a', expires_at: Date.now() / 1000 + 60, ...patch,
});
const cache = (routes: NavRoute[], account = 'fixture', version = 5): string =>
  logged({ navigation: { version, account, routes } });
const storedUser = (state: { stored: Map<string, string> }) => {
  const value = state.stored.get('user');
  return value === undefined ? null : JSON.parse(value);
};
const reply = (routes: NavRoute[]): Result<NavRoute[]> => ({ code: '', message: '', data: routes });
const defer = () => {
  let resolve!: (value: Result<NavRoute[]>) => void;
  const promise = new Promise<Result<NavRoute[]>>((done) => { resolve = done; });
  return { resolve, promise };
};

const createState = (values: Record<string, string> = {}, broken = false, router?: Router) => {
  const stored = new Map(Object.entries(values));
  const reads: string[] = [];
  const calls: string[] = [];
  const installs: NavRoute[][] = [];
  const modes: string[] = [];
  const counts = { page: 0 };
  const restores: string[] = [];
  const sync = router ? createSync(router) : undefined;
  let handler!: UnauthorizedHandler;
  let read = async (_token: string): Promise<Result<NavRoute[]>> => reply([]);
  let profile = async (_token: string): Promise<Result<Principal>> => ({ code: '', message: '', data: principal });
  const stores = create(runtime,
    { routes: (token: string) => { calls.push(token); return read(token); },
      me: (token: string) => { restores.push(token); return profile(token); } },
    (routes: NavRoute[]) => {
      installs.push(routes);
      const result = buildRecords(routes, view => view && hasView(view)
        ? async () => { counts.page++; return { default: () => {} }; } : undefined);
      sync?.(result.records);
      return result.routes;
    },
    visibleMenu,
    (value: UnauthorizedHandler) => { handler = value; },
    english, chinese, () => 'system', (mode: string) => { modes.push(mode); },
    {
      getItem: (key: string) => { if (broken) throw new Error('fixture storage'); reads.push(key); return stored.get(key) ?? null; },
      setItem: (key: string, value: string) => { if (broken) throw new Error('fixture storage'); stored.set(key, value); },
      removeItem: (key: string) => { if (broken) throw new Error('fixture storage'); stored.delete(key); },
    },
  ) as typeof import('../src/stores/state.svelte');
  return { ...stores, stored, reads, calls, installs, modes, counts, restores,
    unauthorized: (token: string | null | undefined) => handler(token),
    respond: (value: typeof read) => { read = value; },
    identify: (value: typeof profile) => { profile = value; },
  };
};

describe('session state', () => {
  test('restores the principal through me once and skips anonymous or resolved sessions', async () => {
    const state = createState();
    expect(await state.session.restore()).toBe(false);
    expect(state.restores).toEqual([]);
    state.session.start('fixture-a', Date.now() / 1000 + 60);
    expect(await state.session.restore()).toBe(true);
    expect(state.session.principal).toEqual(principal);
    expect(await state.session.restore()).toBe(true);
    expect(state.restores).toEqual(['fixture-a']);
  });

  test('keeps the session available for retry when restoration has a transient failure', async () => {
    for (const identify of [
      async () => ({ code: 'unavailable', message: '', data: null }),
      async () => { throw new Error('fixture request'); },
    ]) {
      const state = createState({ user: cache([entry('/old')]) });
      state.identify(identify);
      expect(await state.session.restore()).toBe(false);
      expect(state.session.token).toBe('fixture-a');
      expect(state.session.principal).toBeNull();
      expect(state.stored.has('user')).toBe(true);
      expect(storedUser(state)?.navigation).toBeDefined();
    }
  });

  test('lets the existing unauthorized handler clear an expired restored session', async () => {
    const state = createState({ user: cache([entry('/old')]) });
    state.identify(async token => {
      state.unauthorized(token);
      return { code: 'unauthenticated', message: '', data: null };
    });
    expect(await state.session.restore()).toBe(false);
    expect(state.session.token).toBeNull();
    expect(state.stored.has('user')).toBe(false);
    expect(storedUser(state)?.navigation).toBeUndefined();
  });

  test('does not replace or clear a new session after a late restoration result', async () => {
    for (const result of [
      { code: '', message: '', data: principal },
      { code: 'unauthorized', message: '', data: null },
      new Error('fixture request'),
    ]) {
      const state = createState({ user: logged() });
      let finish!: (value: Result<Principal> | Error) => void;
      const response = new Promise<Result<Principal>>((resolve, reject) => {
        finish = value => value instanceof Error ? reject(value) : resolve(value);
      });
      state.identify(() => response);
      const pending = state.session.restore();
      state.session.start('fixture-b', Date.now() / 1000 + 60);
      state.session.setPrincipal({ ...principal, account: 'current' });
      finish(result);
      expect(await pending).toBe(false);
      expect(state.session.token).toBe('fixture-b');
      expect(state.session.account).toBe('current');
      expect(JSON.parse(state.stored.get('user')!).token).toBe('fixture-b');
    }
  });

  test('restores a valid short-key session and derives permissions from the current principal', () => {
    const state = createState({ user: JSON.stringify({ token: 'fixture-a', expires_at: Date.now() / 1000 + 60 }) });
    expect(state.session.authenticated).toBe(true);
    expect(state.session.restoring).toBe(true);
    state.session.setPrincipal(principal);
    expect(state.session.account).toBe('fixture');
    expect(state.session.canRead('user:read')).toBe(true);
    expect(state.session.canRead('access:read')).toBe(false);
    expect(state.session.canWrite).toBe(false);
    state.session.setPrincipal({ ...principal, roles: ['admin'] });
    expect(state.session.canWrite).toBe(true);
    state.session.setPrincipal({ ...principal, root: true });
    expect(state.session.canRead('access:read')).toBe(true);
  });

  test('renews the same token without discarding its principal or nested navigation and sidebar', async () => {
    const sidebar = { account: 'fixture', keys: ['group'] };
    const state = createState({ user: logged({
      navigation: { version: 5, account: 'fixture', routes: [entry('/cached')] }, sidebar,
    }) });
    state.session.setPrincipal(principal);
    await state.navigation.load();
    const navigation = storedUser(state).navigation;
    const expiresAt = Date.now() / 1000 + 120;
    state.session.start('fixture-a', expiresAt);
    expect(state.session.principal).toEqual(principal);
    expect(state.navigation.loaded).toBe(true);
    expect(storedUser(state)).toEqual({ token: 'fixture-a', expires_at: expiresAt, navigation, sidebar });
    expect(state.readUser()).toEqual(storedUser(state));
    expect([...state.stored.keys()]).toEqual(['user']);
    state.session.start('fixture-b', expiresAt);
    expect(state.session.principal).toBeNull();
    expect(state.navigation.loaded).toBe(false);
    expect(storedUser(state)).toEqual({ token: 'fixture-b', expires_at: expiresAt });
  });

  test('does not revive a removed user or overwrite a different stored token during renewal', () => {
    for (const user of [undefined, logged({ token: 'fixture-b', sidebar: { account: 'other', keys: ['current'] } })]) {
      const state = createState({ user: logged() });
      if (user === undefined) state.stored.delete('user');
      else state.stored.set('user', user);
      state.session.start('fixture-a', Date.now() / 1000 + 120);
      expect(state.stored.get('user')).toBe(user);
      expect(state.session.token).toBe('fixture-a');
    }
  });

  test('clears an old tab without deleting the new stored session on logout or unauthorized response', () => {
    for (const logout of [true, false]) {
      const state = createState({ user: logged() });
      state.session.setPrincipal(principal);
      const user = logged({ token: 'fixture-b', navigation: { version: 5, account: 'other', routes: [] },
        sidebar: { account: 'other', keys: ['current'] } });
      state.stored.set('user', user);
      if (logout) state.session.clear();
      else expect(state.unauthorized('fixture-a')).toBe(true);
      expect(state.session.token).toBeNull();
      expect(state.session.principal).toBeNull();
      expect(state.navigation.loaded).toBe(false);
      expect(state.stored.get('user')).toBe(user);
      expect([...state.stored.keys()]).toEqual(['user']);
    }
  });

  test('rejects expired or malformed sessions and does not consult legacy keys', () => {
    for (const user of [
      'invalid', '{}',
      JSON.stringify({ token: 'fixture', expires_at: Date.now() / 1000 - 1 }),
      JSON.stringify({ token: '', expires_at: Date.now() / 1000 + 60 }),
      JSON.stringify({ token: '  \t ', expires_at: Date.now() / 1000 + 60 }),
    ]) {
      const state = createState({ user, admin: JSON.stringify({ token: 'legacy', expires_at: Date.now() / 1000 + 60 }) });
      expect(state.session.authenticated).toBe(false);
      expect(state.stored.has('user')).toBe(false);
      expect(state.reads).toEqual(['user', 'p']);
    }
  });

  test('clears old identity and navigation on token changes and ignores stale or repeated 401s', async () => {
    const state = createState();
    state.session.start('fixture-a', Date.now() / 1000 + 60);
    state.session.setPrincipal(principal);
    state.respond(async () => reply([entry('/first')]));
    await state.navigation.load();
    state.session.start('fixture-b', Date.now() / 1000 + 60);
    expect(state.session.principal).toBeNull();
    expect(state.navigation.menu).toEqual([]);
    expect(state.navigation.loaded).toBe(false);
    expect(state.unauthorized('fixture-a')).toBe(false);
    expect(state.session.token).toBe('fixture-b');
    expect(state.unauthorized('fixture-b')).toBe(true);
    expect(state.unauthorized('fixture-b')).toBe(false);
    expect(state.session.token).toBeNull();
    expect(state.stored.has('user')).toBe(false);
    expect(state.installs.at(-1)).toEqual([]);
  });
});

describe('navigation state', () => {
  test('deduplicates pending loads and rejects results from a previous token', async () => {
    const state = createState();
    const first = defer();
    const second = defer();
    state.respond((token) => token === 'fixture-a' ? first.promise : second.promise);
    state.session.start('fixture-a', Date.now() / 1000 + 60);
    state.session.setPrincipal(principal);
    const pending = [state.navigation.load(), state.navigation.load()];
    expect(state.calls).toEqual(['fixture-a']);
    state.session.start('fixture-b', Date.now() / 1000 + 60);
    state.session.setPrincipal(principal);
    const current = state.navigation.load();
    second.resolve(reply([entry('/current')]));
    await current;
    first.resolve(reply([entry('/stale')]));
    await Promise.all(pending);
    expect(state.navigation.firstPath).toBe('/current');
    expect(state.navigation.menu.map(item => item.path)).toEqual(['/current']);
    expect(state.installs.at(-1)?.map(item => item.path)).toEqual(['/current']);
  });

  test('clears a pending load immediately on logout and does not install its late response', async () => {
    const state = createState();
    const response = defer();
    state.respond(() => response.promise);
    state.session.start('fixture-a', Date.now() / 1000 + 60);
    state.session.setPrincipal(principal);
    const pending = state.navigation.load();
    state.session.clear();
    const count = state.installs.length;
    response.resolve(reply([entry('/late')]));
    await pending;
    expect(state.navigation.loaded).toBe(false);
    expect(state.navigation.firstPath).toBe('/denied');
    expect(state.installs).toHaveLength(count);
  });

  test('uses loaded state until an explicit refresh and removes deleted server entries', async () => {
    const state = createState();
    state.session.start('fixture-a', Date.now() / 1000 + 60);
    state.session.setPrincipal(principal);
    state.respond(async () => reply([entry('/custom')]));
    await state.navigation.load();
    await state.navigation.load();
    expect(state.calls).toHaveLength(1);
    state.respond(async () => reply([]));
    await state.navigation.load(true);
    expect(state.calls).toHaveLength(2);
    expect(state.navigation.firstPath).toBe('/denied');
    expect(state.navigation.loaded).toBe(true);
    expect(storedUser(state).navigation.routes).toEqual([]);
  });

  test('completes an uncached load with an empty tree on failed or malformed responses', async () => {
    for (const response of [
      async () => ({ code: 'unavailable', message: '', data: null }),
      async () => ({ code: '', message: '', data: {} as NavRoute[] }),
      async () => { throw new Error('fixture request'); },
    ]) {
      const state = createState({ user: logged() });
      state.session.setPrincipal(principal);
      state.respond(response);
      await state.navigation.load();
      expect(state.navigation.menu).toEqual([]);
      expect(state.navigation.firstPath).toBe('/denied');
      expect(state.navigation.loaded).toBe(true);
      expect(state.calls).toEqual(['fixture-a']);
    }
  });
});

describe('navigation cache', () => {
  test('clears invalid navigation without losing the session or sidebar and resets nested fields together', async () => {
    const sidebar = { account: 'fixture', keys: ['group'] };
    const state = createState({ user: logged({ navigation: { version: 4, account: 'fixture', routes: [] }, sidebar }) });
    const user = storedUser(state);
    state.session.setPrincipal(principal);
    const response = defer();
    state.respond(() => response.promise);
    const pending = state.navigation.load();
    expect(storedUser(state)).toEqual({ token: user.token, expires_at: user.expires_at, sidebar });
    expect([...state.stored.keys()]).toEqual(['user']);
    response.resolve(reply([]));
    await pending;
    expect(storedUser(state).sidebar).toEqual(sidebar);
    expect(storedUser(state).navigation).toEqual({ version: 5, account: 'fixture', routes: [] });
    state.navigation.reset();
    expect(storedUser(state)).toEqual({ token: user.token, expires_at: user.expires_at });
  });

  test('merges navigation and sidebar writes with the latest user without creating separate keys', async () => {
    const state = createState({ user: cache([entry('/cached')]) });
    state.session.setPrincipal(principal);
    await state.navigation.load();
    const user = storedUser(state);
    state.saveUser({ sidebar: { account: 'fixture', keys: ['first'] } });
    expect(storedUser(state).navigation).toEqual(user.navigation);
    const sidebar = { account: 'fixture', keys: ['latest'] };
    state.stored.set('user', JSON.stringify({ ...storedUser(state), sidebar }));
    state.respond(async () => reply([entry('/fresh')]));
    await state.navigation.load(true);
    expect(storedUser(state)).toEqual({ token: user.token, expires_at: user.expires_at, sidebar,
      navigation: { version: 5, account: 'fixture', routes: state.navigation.routes } });
    state.saveUser({ sidebar: { account: 'fixture', keys: ['last'] } });
    expect(storedUser(state).navigation.routes).toEqual(state.navigation.routes);
    expect(storedUser(state).sidebar.keys).toEqual(['last']);
    expect([...state.stored.keys()]).toEqual(['user']);
  });

  test('cannot write nested fields or late navigation into a different stored token', async () => {
    const state = createState({ user: logged() });
    state.session.setPrincipal(principal);
    const response = defer();
    state.respond(() => response.promise);
    const user = logged({ token: 'fixture-b', navigation: { version: 5, account: 'fixture', routes: [entry('/other')] },
      sidebar: { account: 'fixture', keys: ['current'] } });
    state.stored.set('user', user);
    const pending = state.navigation.load();
    expect(state.calls).toEqual(['fixture-a']);
    expect(state.navigation.routes).toEqual([]);
    state.saveUser({ sidebar: { account: 'fixture', keys: ['old'] } });
    expect(state.stored.get('user')).toBe(user);
    response.resolve(reply([entry('/late')]));
    await pending;
    state.navigation.reset();
    expect(state.stored.get('user')).toBe(user);
    expect([...state.stored.keys()]).toEqual(['user']);
  });

  test('rejects string, non-positive, fractional and out-of-range menu IDs', async () => {
    for (const id of ['1', 0, -1, 1.5, 2_147_483_648]) {
      const rows = [entry('/invalid', { id: id as number })];
      const state = createState({ user: cache(rows) });
      state.session.setPrincipal(principal);
      state.respond(async () => reply(rows));
      await state.navigation.load();
      expect(state.navigation.routes).toEqual([]);
      expect(storedUser(state)?.navigation).toBeUndefined();
    }
  });

  test('projects cache and API rows recursively and rejects objects inside display fields', async () => {
    const routes = [Object.assign(entry('/group', { view: null, children: [
      Object.assign(entry('/group/page'), { token: 'nested-secret', permissions: ['secret'] }),
    ] }), { token: 'outer-secret', permissions: ['secret'] })];
    const state = createState({ user: cache(routes) });
    state.session.setPrincipal(principal);
    await state.navigation.load();
    expect(JSON.stringify(state.navigation.routes)).not.toContain('secret');
    expect(state.calls).toEqual([]);
    state.respond(async () => reply(routes));
    await state.navigation.load(true);
    expect(state.stored.get('user')).not.toContain('secret');
    expect(state.navigation.firstPath).toBe('/group/page');
    const invalid = [entry('/bad', { title: { id: 'nested-secret' } as unknown as string })];
    const saved = state.stored.get('user');
    state.respond(async () => reply(invalid));
    await state.navigation.load(true);
    expect(state.navigation.firstPath).toBe('/group/page');
    expect(state.stored.get('user')).toBe(saved);
    const cached = createState({ user: cache(invalid) });
    cached.session.setPrincipal(principal);
    const fresh = defer();
    cached.respond(() => fresh.promise);
    const load = cached.navigation.load();
    expect(cached.navigation.routes).toEqual([]);
    expect(storedUser(cached)?.navigation).toBeUndefined();
    fresh.resolve(reply([]));
    await load;
  });

  test('bounds the entire cached and fresh tree to 256 nodes', async () => {
    const routes = [entry('/group', { view: null,
      children: Array.from({ length: 255 }, (_, index) => entry(`/page${index}`)),
    })];
    const state = createState({ user: cache(routes) });
    state.session.setPrincipal(principal);
    state.respond(async () => reply(routes));
    await state.navigation.load();
    expect(state.navigation.routes[0].children).toHaveLength(255);
    const saved = state.stored.get('user');
    routes[0].children.push(entry('/overflow'));
    await state.navigation.load(true);
    expect(state.navigation.routes[0].children).toHaveLength(255);
    expect(state.stored.get('user')).toBe(saved);
    const cached = createState({ user: cache(routes) });
    cached.session.setPrincipal(principal);
    const fresh = defer();
    cached.respond(() => fresh.promise);
    const load = cached.navigation.load();
    expect(cached.navigation.routes).toEqual([]);
    expect(storedUser(cached)?.navigation).toBeUndefined();
    fresh.resolve(reply([]));
    await load;
  });

  test('restores a verified cached tree without requesting routes and persists the normalized refreshed tree', async () => {
    const cached = [entry('/hidden', { hidden: true }), entry('/folder', {
      view: null, group: true, children: [
        Object.assign(entry('person/:id'), { token: 'cached-extra', meta: { title: 'extra' } }), entry('list'),
      ],
    })];
    const state = createState({ user: cache(cached) });
    const reads = state.reads.length;
    await state.navigation.load();
    expect(state.calls).toEqual([]);
    expect(state.navigation.routes).toEqual([]);
    expect(state.reads).toHaveLength(reads);
    state.session.setPrincipal(principal);
    await state.navigation.load();
    expect(state.navigation.loaded).toBe(true);
    expect(state.calls).toEqual([]);
    expect(state.navigation.routes).toHaveLength(2);
    expect(state.navigation.routes[0]?.hidden).toBe(true);
    expect(state.navigation.menu.map(item => item.path)).toEqual(['/folder']);
    expect(state.navigation.firstPath).toBe('/folder/list');
    expect(storedUser(state).navigation.routes).toEqual(state.navigation.routes);
    expect(state.navigation.routes[1].children.map(item => item.path)).toEqual(['/folder/person/:id', '/folder/list']);
    expect(state.stored.get('user')).not.toContain('cached-extra');
    expect(state.stored.get('user')).not.toContain('"meta"');
    const fresh = [Object.assign(entry('/fresh', { view: null, rank: 20, children: [
      entry('/fresh/later', { rank: 20 }), entry('/fresh/list', { rank: 10 }),
      entry('/fresh/empty', { view: null, rank: 30 }),
    ] }), { token: 'fixture-extra', permissions: ['fixture:read'], meta: { title: 'extra' }, lazy: () => {} }),
    entry('/empty', { view: null, rank: 10 })];
    state.respond(async () => reply(fresh));
    await state.navigation.load(true);
    expect(state.calls).toEqual(['fixture-a']);
    expect(state.navigation.loaded).toBe(true);
    expect(state.navigation.firstPath).toBe('/fresh/list');
    const saved = storedUser(state).navigation;
    expect(Object.keys(saved).sort()).toEqual(['account', 'routes', 'version']);
    expect(saved.account).toBe('fixture');
    expect(saved.version).toBe(5);
    expect(saved.routes).toEqual(state.navigation.routes);
    expect(saved.routes.map((item: NavRoute) => item.path)).toEqual(['/empty', '/fresh']);
    expect(saved.routes[1].children.map((item: NavRoute) => item.path))
      .toEqual(['/fresh/list', '/fresh/later', '/fresh/empty']);
    expect(saved.routes).toHaveLength(2);
    expect(state.navigation.routes).toHaveLength(2);
    expect(state.navigation.menu).toHaveLength(1);
    expect(saved.routes[1].token).toBeUndefined();
    expect(saved.routes[1].permissions).toBeUndefined();
    expect(saved.routes[1].meta).toBeUndefined();
    expect(saved.routes[1].lazy).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain('fixture-a');
    expect(storedUser(state).token).toBe('fixture-a');
    expect([...state.stored.keys()]).toEqual(['user']);
  });

  test('treats an empty cached tree as loaded without requesting routes', async () => {
    const state = createState({ user: cache([]) });
    expect(await state.session.restore()).toBe(true);
    await state.navigation.load();
    expect(state.navigation.loaded).toBe(true);
    expect(state.navigation.routes).toEqual([]);
    expect(state.navigation.firstPath).toBe('/denied');
    expect(state.calls).toEqual([]);
    expect(storedUser(state).navigation.routes).toEqual([]);
    const count = state.installs.length;
    await state.navigation.load();
    expect(state.installs).toHaveLength(count);
  });

  test('rejects damaged, old-schema and cross-account cache before the request completes', async () => {
    for (const value of [undefined, logged({ navigation: 'invalid' }), logged({ navigation: [] }), cache([entry('/old')], 'fixture', 4),
      cache([entry('/other')], 'other'), cache([entry('/bad', { id: '9' as unknown as number })])]) {
      const state = createState({ user: value ?? logged() });
      state.session.setPrincipal(principal);
      const response = defer();
      state.respond(() => response.promise);
      const pending = state.navigation.load();
      expect(state.navigation.routes).toEqual([]);
      expect(state.navigation.loaded).toBe(false);
      expect(state.calls).toEqual(['fixture-a']);
      expect(storedUser(state)?.navigation).toBeUndefined();
      response.resolve(reply([]));
      await pending;
      expect(state.navigation.firstPath).toBe('/denied');
    }
  });

  test('preserves cache and installed routes when a forced refresh fails', async () => {
    for (const read of [
      async () => ({ code: 'unavailable', message: '', data: null }),
      async () => ({ code: '', message: '', data: [entry('/bad', { id: '9' as unknown as number })] }),
      async () => { throw new Error('fixture request'); },
    ]) {
      const state = createState({ user: cache([entry('/cached')]) });
      state.session.setPrincipal(principal);
      await state.navigation.load();
      const saved = state.stored.get('user');
      const count = state.installs.length;
      state.respond(read);
      await state.navigation.load(true);
      expect(state.navigation.firstPath).toBe('/cached');
      expect(state.navigation.loaded).toBe(true);
      expect(state.calls).toEqual(['fixture-a']);
      expect(state.installs).toHaveLength(count);
      expect(state.stored.get('user')).toBe(saved);
    }
  });

  test('force starts a new request and late old results cannot overwrite routes or cache', async () => {
    const state = createState({ user: logged() });
    state.session.setPrincipal(principal);
    const first = defer();
    const second = defer();
    const responses = [first, second];
    state.respond(() => responses.shift()!.promise);
    const old = state.navigation.load();
    const fresh = state.navigation.load(true);
    const joined = state.navigation.load();
    expect(state.calls).toHaveLength(2);
    expect(state.navigation.loaded).toBe(false);
    second.resolve(reply([entry('/current')]));
    await Promise.all([fresh, joined]);
    const saved = state.stored.get('user');
    const count = state.installs.length;
    first.resolve(reply([entry('/old')]));
    await old;
    expect(state.navigation.firstPath).toBe('/current');
    expect(state.installs).toHaveLength(count);
    expect(state.stored.get('user')).toBe(saved);
  });

  test('overlapping forced requests preserve the restored tree when the latest refresh fails', async () => {
    const state = createState({ user: cache([entry('/cached')]) });
    state.session.setPrincipal(principal);
    await state.navigation.load();
    const saved = state.stored.get('user');
    const first = defer();
    const second = defer();
    const responses = [first, second];
    state.respond(() => responses.shift()!.promise);
    const old = state.navigation.load(true);
    const current = state.navigation.load(true);
    expect(state.calls).toEqual(['fixture-a', 'fixture-a']);
    second.resolve({ code: 'unavailable', message: '', data: null });
    await current;
    expect(state.navigation.firstPath).toBe('/cached');
    expect(state.navigation.loaded).toBe(true);
    expect(state.stored.get('user')).toBe(saved);
    first.resolve(reply([]));
    await old;
    expect(state.navigation.firstPath).toBe('/cached');
    expect(state.stored.get('user')).toBe(saved);
  });

  test('permission or identity changes clear cache and reject in-flight results for the old principal', async () => {
    for (const next of [
      { ...principal, permissions: [] }, { ...principal, roles: ['admin'] },
      { ...principal, root: true }, { ...principal, account: 'other' },
    ]) {
      const state = createState({ user: cache([entry('/cached')]) });
      state.session.setPrincipal(principal);
      await state.navigation.load();
      const response = defer();
      state.respond(() => response.promise);
      const pending = state.navigation.load(true);
      expect(state.calls).toEqual(['fixture-a']);
      state.session.setPrincipal(next);
      expect(state.navigation.routes).toEqual([]);
      expect(state.navigation.loaded).toBe(false);
      expect(storedUser(state)?.navigation).toBeUndefined();
      const count = state.installs.length;
      response.resolve(reply([entry('/old')]));
      await pending;
      expect(state.installs).toHaveLength(count);
      expect(state.navigation.loaded).toBe(false);
      expect(storedUser(state)?.navigation).toBeUndefined();
    }
  });

  test('display changes and reordered permission sets retain an equivalent principal load', async () => {
    const state = createState({ user: logged() });
    const initial = { ...principal, roles: ['admin', 'viewer'], permissions: ['user:read', 'node:read'] };
    state.session.setPrincipal(initial);
    state.respond(async () => reply([entry('/current')]));
    await state.navigation.load();
    state.session.setPrincipal({ ...initial, username: 'renamed', roles: [...initial.roles].reverse(),
      permissions: [...initial.permissions].reverse() });
    await state.navigation.load();
    expect(state.calls).toHaveLength(1);
    expect(state.navigation.firstPath).toBe('/current');
    expect(storedUser(state)?.navigation).toBeDefined();
  });

  test('logout and unauthorized clearing erase cached routes and ignore late responses', async () => {
    for (const logout of [true, false]) {
      const state = createState({ user: cache([entry('/cached')]) });
      state.saveUser({ sidebar: { account: 'fixture', keys: ['fixture'] } });
      state.session.setPrincipal(principal);
      await state.navigation.load();
      const response = defer();
      state.respond(() => response.promise);
      const pending = state.navigation.load(true);
      expect(state.calls).toEqual(['fixture-a']);
      if (logout) state.session.clear();
      else expect(state.unauthorized('fixture-a')).toBe(true);
      response.resolve(reply([entry('/late')]));
      await pending;
      expect(state.navigation.routes).toEqual([]);
      expect(state.navigation.loaded).toBe(false);
      expect(storedUser(state)?.navigation).toBeUndefined();
      expect(state.stored.has('user')).toBe(false);
      expect([...state.stored.keys()]).toEqual([]);
    }
  });

  test('fresh navigation remains usable when browser storage throws', async () => {
    const state = createState({}, true);
    state.session.start('fixture-a', Date.now() / 1000 + 60);
    state.session.setPrincipal(principal);
    state.respond(async () => reply([entry('/current')]));
    await state.navigation.load();
    expect(state.navigation.loaded).toBe(true);
    expect(state.navigation.firstPath).toBe('/current');
    state.session.clear();
    expect(state.navigation.routes).toEqual([]);
  });

  test('the real guard rebuilds routes from cache and opens a startup deep link without a routes request', async () => {
    const history = createMemoryHistory();
    history.replace('/fresh/list?tab=active#detail');
    let missing = 0;
    const router = createRouter({ history, routes: [
      { path: '/login', name: 'login', meta: { public: true } },
      { path: '/denied', name: 'denied' },
      { path: '/:path(.*)*', name: 'missing', lazy: async () => { missing++; return { default: () => {} }; } },
    ] });
    const cached = [entry('/fresh', { view: null, children: [entry('/fresh/list')] })];
    const state = createState({ user: cache(cached) }, false, router);
    router.beforeEach(createGuard(state.session, state.navigation));
    try {
      await router.start();
      expect(state.navigation.firstPath).toBe('/fresh/list');
      expect(state.navigation.loaded).toBe(true);
      expect(state.calls).toEqual([]);
      expect(state.restores).toEqual(['fixture-a']);
      expect(router.currentRoute.fullPath).toBe('/fresh/list?tab=active#detail');
      expect(router.currentRoute.meta.title).toBe('/fresh/list');
      expect(state.counts.page).toBe(1);
      expect(missing).toBe(0);
    } finally { router.destroy(); }
  });
});

describe('preference state', () => {
  test('publishes application and component translations together through the real language packs', async () => {
    const state = createState();
    const values: string[][] = [];
    const dispose = runtime.effect_root(() => {
      runtime.render_effect(() => {
        const locale = state.preferences.locale;
        values.push([locale.name, locale.app.logout, locale.messages.pagination.next]);
      });
    });
    state.preferences.setLanguage('en-US');
    await Promise.resolve();
    expect(values).toEqual([
      ['zh-CN', '退出登录', '下一页'],
      ['en-US', 'Log out', 'Next page'],
    ]);
    expect(Object.keys(english.app)).toEqual(Object.keys(chinese.app));
    dispose();
  });

  test('publishes native Svelte updates when an action changes state', async () => {
    const state = createState();
    const values: boolean[] = [];
    const dispose = runtime.effect_root(() => {
      runtime.render_effect(() => { values.push(state.preferences.collapsed); });
    });
    state.preferences.toggleMenu();
    await Promise.resolve();
    expect(values).toEqual([false, true]);
    dispose();
  });

  test('restores and persists short-key preferences while rejecting unsupported choices', () => {
    const state = createState({ p: JSON.stringify({ collapsed: true, language: 'en-US' }) });
    expect(state.preferences.collapsed).toBe(true);
    expect(state.preferences.locale).toBe(english);
    expect(state.preferences.locale.messages.pagination.next).toBe('Next page');
    expect(state.preferences.locale.app.logout).toBe('Log out');
    state.preferences.toggleMenu();
    state.preferences.setLanguage('zh-CN');
    state.preferences.setLanguage('unsupported');
    expect(JSON.parse(state.stored.get('p')!)).toEqual({ collapsed: false, language: 'zh-CN' });
    expect(state.preferences.locale.app.logout).toBe('退出登录');
    expect(state.preferences.locale.app.brand).toBe('Luna 管理控制台');
    expect(state.preferences.locale).toBe(chinese);
    expect(state.preferences.locale.messages.pagination.next).toBe('下一页');
    state.preferences.setMode('dark');
    state.preferences.setMode('unsupported');
    expect(state.preferences.mode).toBe('dark');
    expect(state.modes).toEqual(['dark']);
  });

  test('keeps defaults and actions usable when storage is unavailable', () => {
    const state = createState({}, true);
    expect(state.session.authenticated).toBe(false);
    expect(state.preferences.language).toBe('zh-CN');
    state.session.start('fixture-a', Date.now() / 1000 + 60);
    state.preferences.toggleMenu();
    expect(state.preferences.collapsed).toBe(true);
    state.session.clear();
    expect(state.session.authenticated).toBe(false);
  });
});
