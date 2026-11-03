import { describe, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import * as runtime from 'svelte/internal/client';
import type { NavRoute, Principal, Result, UnauthorizedHandler } from '../src/api/types';

const source = await Bun.file(new URL('../src/stores/index.svelte.ts', import.meta.url)).text();
const script = new Bun.Transpiler({ loader: 'ts' }).transformSync(source)
  .replace(/^import[\s\S]*?;\s*$/gm, '');
const compiled = compileModule(script, { filename: 'index.svelte.js', generate: 'client' }).js.code
  .replace(/^import[^\n]*;\s*$/gm, '').replace(/\bexport const /g, 'const ');
const create = new Function('$', 'api', 'applyRoutes', 'setUnauthorizedHandler', 'enUS', 'zhCN',
  'readPreference', 'setTheme', 'localStorage', `${compiled}\nreturn { session, navigation, preferences };`);

const principal: Principal = { account: 'fixture', username: 'fixture', root: false, roles: [], permissions: ['user:read'] };
const entry = (path: string): NavRoute => ({ code: path, title: path, path, view: 'Users', icon: null, rank: 0, children: [] });
const reply = (routes: NavRoute[]): Result<NavRoute[]> => ({ code: '', message: '', data: routes });
const defer = () => {
  let resolve!: (value: Result<NavRoute[]>) => void;
  const promise = new Promise<Result<NavRoute[]>>((done) => { resolve = done; });
  return { resolve, promise };
};

const createState = (values: Record<string, string> = {}, broken = false) => {
  const stored = new Map(Object.entries(values));
  const reads: string[] = [];
  const calls: string[] = [];
  const installs: NavRoute[][] = [];
  const modes: string[] = [];
  let handler!: UnauthorizedHandler;
  let read = async (_token: string): Promise<Result<NavRoute[]>> => reply([]);
  const stores = create(runtime,
    { routes: (token: string) => { calls.push(token); return read(token); } },
    (routes: NavRoute[]) => { installs.push(routes); return routes; },
    (value: UnauthorizedHandler) => { handler = value; },
    { code: 'en-US' }, { code: 'zh-CN' }, () => 'system', (mode: string) => { modes.push(mode); },
    {
      getItem: (key: string) => { if (broken) throw new Error('fixture storage'); reads.push(key); return stored.get(key) ?? null; },
      setItem: (key: string, value: string) => { if (broken) throw new Error('fixture storage'); stored.set(key, value); },
      removeItem: (key: string) => { if (broken) throw new Error('fixture storage'); stored.delete(key); },
    },
  ) as typeof import('../src/stores/index.svelte');
  return { ...stores, stored, reads, calls, installs, modes,
    unauthorized: (token: string | null | undefined) => handler(token),
    respond: (value: typeof read) => { read = value; },
  };
};

describe('session state', () => {
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
    const pending = [state.navigation.load(), state.navigation.load()];
    expect(state.calls).toEqual(['fixture-a']);
    state.session.start('fixture-b', Date.now() / 1000 + 60);
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
    state.respond(async () => reply([entry('/custom')]));
    await state.navigation.load();
    await state.navigation.load();
    expect(state.calls).toHaveLength(1);
    state.respond(async () => reply([]));
    await state.navigation.load(true);
    expect(state.calls).toHaveLength(2);
    expect(state.navigation.firstPath).toBe('/denied');
    expect(state.navigation.loaded).toBe(true);
  });

  test('replaces previous navigation with an empty tree on failed or malformed responses', async () => {
    const state = createState();
    state.session.start('fixture-a', Date.now() / 1000 + 60);
    for (const response of [
      async () => ({ code: 'unavailable', message: '', data: null }),
      async () => ({ code: '', message: '', data: {} as NavRoute[] }),
      async () => { throw new Error('fixture request'); },
    ]) {
      state.navigation.routes = [entry('/previous')];
      state.respond(response);
      await state.navigation.load(true);
      expect(state.navigation.menu).toEqual([]);
      expect(state.navigation.firstPath).toBe('/denied');
      expect(state.navigation.loaded).toBe(true);
    }
  });
});

describe('preference state', () => {
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
    expect(state.preferences.locale).toEqual({ code: 'en-US' });
    expect(state.preferences.text.logout).toBe('Log out');
    state.preferences.toggleMenu();
    state.preferences.setLanguage('zh-CN');
    state.preferences.setLanguage('unsupported');
    expect(JSON.parse(state.stored.get('p')!)).toEqual({ collapsed: false, language: 'zh-CN' });
    expect(state.preferences.text.logout).toBe('退出登录');
    expect(state.preferences.text.brand).toBe('Luna 管理控制台');
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
