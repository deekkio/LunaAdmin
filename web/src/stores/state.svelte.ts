import english from '../locale/lang/en';
import chinese from '../locale/lang/zh-cn';
import { readPreference, setTheme, type ThemeMode } from '@luna/components/theme';
import { api } from '../api';
import { setUnauthorizedHandler } from '../api/request';
import type { Language, NavRoute, Prefs, Principal, StoredSession } from '../api/types';
import { applyRoutes, visibleMenu } from '../router/router';

export const readUser = (): StoredSession | null => {
  try {
    const value = JSON.parse(localStorage.getItem('user') ?? 'null') as StoredSession | null;
    if (value && typeof value.token === 'string' && value.token.trim().length > 0 && Number.isFinite(value.expires_at) && value.expires_at * 1000 > Date.now())
      return value;
    localStorage.removeItem('user');
  } catch {
    try { localStorage.removeItem('user'); } catch { /* 存储不可用时保持匿名。 */ }
  }
  return null;
};

export const saveUser = (value: Pick<StoredSession, 'navigation' | 'sidebar'>): void => {
  try {
    const stored = readUser();
    if (!stored || stored.token !== session.token) return;
    localStorage.setItem('user', JSON.stringify({ ...stored, ...value }));
  } catch { /* 存储不可用时保留内存状态。 */ }
};

const clearCache = (): void => { saveUser({ navigation: undefined }); };

const readRoutes = (value: unknown): NavRoute[] | null => {
  let count = 0;
  const read = (value: unknown): NavRoute[] => {
    if (!Array.isArray(value)) throw new Error('invalid navigation');
    return value.map((item: unknown) => {
      if (!item || typeof item !== 'object' || ++count > 256) throw new Error('invalid navigation');
      const { id, code, title, path, view, icon, rank, group, hidden, children } = item as NavRoute;
      if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647 || typeof code !== 'string' || typeof title !== 'string' || typeof path !== 'string'
        || (view !== null && typeof view !== 'string') || (icon !== null && typeof icon !== 'string')
        || typeof rank !== 'number' || !Number.isFinite(rank) || typeof group !== 'boolean' || typeof hidden !== 'boolean')
        throw new Error('invalid navigation');
      return { id, code, title, path, view, icon, rank, group, hidden, children: read(children) };
    });
  };
  try { return read(value); } catch { return null; }
};

const readCache = (account: string): NavRoute[] | null => {
  try {
    const stored = readUser();
    const value: unknown = stored?.token === session.token ? stored.navigation : undefined;
    if (value && typeof value === 'object' && 'version' in value && value.version === 5
      && 'account' in value && value.account === account && 'routes' in value) {
      const routes = readRoutes(value.routes);
      if (routes) return routes;
    }
  } catch { /* 损坏或不可读的缓存不会安装路由。 */ }
  clearCache();
  return null;
};

const saveCache = (account: string, routes: NavRoute[]): void => {
  saveUser({ navigation: { version: 5, account, routes } });
};

const principalKey = (principal: Principal): string => JSON.stringify([
  principal.account, principal.root, [...principal.roles].sort(), [...principal.permissions].sort(),
]);

const readPrefs = (): Prefs => {
  try {
    const value = JSON.parse(localStorage.getItem('p') ?? 'null');
    return { collapsed: value?.collapsed === true, language: value?.language === 'en-US' ? 'en-US' : 'zh-CN' };
  } catch {
    return { collapsed: false, language: 'zh-CN' };
  }
};

class Session {
  token = $state<string | null>(readUser()?.token ?? null);
  principal = $state.raw<Principal | null>(null);
  #owner: string | null = null;

  get authenticated(): boolean { return this.token !== null; }
  get restoring(): boolean { return this.authenticated && this.principal === null; }
  get account(): string { return this.principal?.account ?? ''; }
  get root(): boolean { return this.principal?.root ?? false; }
  get canWrite(): boolean { return this.root || Boolean(this.principal?.roles.includes('admin')); }

  canRead = (permission: string): boolean =>
    Boolean(this.principal && (this.root || this.principal.permissions.includes(permission)));

  start = (token: string, expiresAt: number): void => {
    const same = this.token === token;
    const stored = same ? readUser() : null;
    if (!same) {
      this.principal = null;
      this.#owner = null;
      navigation.reset();
    }
    this.token = token;
    try {
      if (same && stored?.token !== token) return;
      localStorage.setItem('user', JSON.stringify({ ...(stored?.token === token ? stored : {}), token, expires_at: expiresAt }));
    } catch { /* 存储不可用时保留内存会话。 */ }
  };

  setPrincipal = (principal: Principal): void => {
    const owner = principalKey(principal);
    if (this.#owner !== null && this.#owner !== owner) navigation.reset();
    this.#owner = owner;
    this.principal = principal;
  };

  restore = async (): Promise<boolean> => {
    if (this.principal) return true;
    const token = this.token;
    if (!token) return false;
    try {
      const result = await api.me(token);
      if (this.token !== token) return false;
      if (!result.code && result.data) {
        this.setPrincipal(result.data);
        return true;
      }
    } catch { /* 请求异常不注销会话；401 由统一响应处理清理。 */ }
    return false;
  };

  clear = (): void => {
    const token = this.token;
    this.token = null;
    this.principal = null;
    this.#owner = null;
    navigation.reset();
    try {
      const stored = readUser();
      if (!stored || stored.token === token) localStorage.removeItem('user');
    } catch { /* 忽略存储异常。 */ }
  };
}

class Navigation {
  routes = $state.raw<NavRoute[]>([]);
  loaded = $state(false);
  #pending: Promise<void> | undefined;
  #token: string | null = null;
  #owner: string | null = null;
  #sequence = 0;

  get menu(): NavRoute[] { return visibleMenu(this.routes); }
  get firstPath(): string {
    const find = (routes: readonly NavRoute[]): string | undefined => {
      for (const route of routes) {
        if (route.view && !route.path.includes(':')) return route.path;
        const path = find(route.children);
        if (path) return path;
      }
      return undefined;
    };
    return find(this.menu) ?? '/denied';
  }

  load = async (force = false): Promise<void> => {
    const token = session.token;
    const principal = session.principal;
    if (!token || !principal) return;
    const owner = principalKey(principal);
    const same = this.#token === token && this.#owner === owner;
    if (!force && same && this.#pending) return this.#pending;
    if (!force && same && this.loaded) return;
    let cached: NavRoute[] | null = null;
    if (!same) {
      if (this.#token !== null) this.reset();
      cached = readCache(principal.account);
      try { this.routes = applyRoutes(cached ?? []); }
      catch { cached = null; clearCache(); this.routes = applyRoutes([]); }
    }
    const sequence = ++this.#sequence;
    this.#token = token;
    this.#owner = owner;
    if (!force && cached !== null) {
      saveCache(principal.account, this.routes);
      this.loaded = true;
      return;
    }
    this.loaded = false;
    const accepts = (): boolean => sequence === this.#sequence && session.token === token
      && session.principal !== null && principalKey(session.principal) === owner;
    const pending = (async () => {
      try {
        const result = await api.routes(token);
        if (!accepts()) return;
        const routes = result.code ? null : readRoutes(result.data);
        if (!routes) throw new Error('invalid navigation');
        this.routes = applyRoutes(routes);
        saveCache(principal.account, this.routes);
      } catch {
        if (!accepts()) return;
        if (!force) {
          clearCache();
          this.routes = applyRoutes([]);
        }
      }
      this.loaded = true;
    })();
    this.#pending = pending;
    try { await pending; } finally {
      if (this.#pending === pending) this.#pending = undefined;
    }
  };

  reset = (): void => {
    this.#sequence++;
    this.#token = null;
    this.#owner = null;
    this.#pending = undefined;
    this.routes = [];
    this.loaded = false;
    saveUser({ navigation: undefined, sidebar: undefined });
    applyRoutes([]);
  };
}

class Preferences {
  collapsed = $state(false);
  language = $state<Language>('zh-CN');
  mode = $state<ThemeMode>(readPreference());

  constructor() { Object.assign(this, readPrefs()); }

  get locale() { return this.language === 'en-US' ? english : chinese; }

  #persist = (): void => {
    try {
      localStorage.setItem('p', JSON.stringify({ collapsed: this.collapsed, language: this.language }));
    } catch { /* 存储不可用时仍允许切换。 */ }
  };

  toggleMenu = (): void => { this.collapsed = !this.collapsed; this.#persist(); };
  setLanguage = (value: string): void => {
    if (value !== 'zh-CN' && value !== 'en-US') return;
    this.language = value;
    this.#persist();
  };
  setMode = (value: string): void => {
    if (value !== 'light' && value !== 'dark' && value !== 'system') return;
    this.mode = value;
    setTheme(value);
  };
}

export const session = new Session();
export const navigation = new Navigation();
export const preferences = new Preferences();

setUnauthorizedHandler((token) => {
  if (!token || token !== session.token) return false;
  session.clear();
  return true;
});
