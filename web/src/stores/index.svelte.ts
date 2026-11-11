import { enUS } from '@luna/components/locale/en-US';
import { zhCN } from '@luna/components/locale/zh-CN';
import { readPreference, setTheme, type ThemeMode } from '@luna/components/theme';
import { api } from '../api';
import { setUnauthorizedHandler } from '../api/request';
import type { Language, NavRoute, Prefs, Principal, StoredSession } from '../api/types';
import { applyRoutes } from '../router';

const zh = {
  brand: 'Luna 管理控制台',
  administrator: '管理员',
  navigation: '管理导航',
  breadcrumb: '页面路径',
  collapse: '折叠侧边栏',
  expand: '展开侧边栏',
  enterFull: '进入全屏',
  exitFull: '退出全屏',
  fullError: '无法切换全屏，请重试',
  fullUnavailable: '当前浏览器不支持全屏',
  theme: '主题模式',
  light: '浅色模式',
  dark: '深色模式',
  system: '跟随系统',
  language: '切换语言',
  logout: '退出登录',
  version: '系统版本',
};

const en: typeof zh = {
  brand: 'Luna Admin',
  administrator: 'Administrator',
  navigation: 'Main navigation',
  breadcrumb: 'Page path',
  collapse: 'Collapse sidebar',
  expand: 'Expand sidebar',
  enterFull: 'Enter fullscreen',
  exitFull: 'Exit fullscreen',
  fullError: 'Unable to change fullscreen mode. Please try again.',
  fullUnavailable: 'Fullscreen is unavailable in this browser',
  theme: 'Theme mode',
  light: 'Light mode',
  dark: 'Dark mode',
  system: 'System preference',
  language: 'Change language',
  logout: 'Log out',
  version: 'System version',
};

const messages = { 'zh-CN': zh, 'en-US': en };

const readSession = (): StoredSession | null => {
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

const readPrefs = (): Prefs => {
  try {
    const value = JSON.parse(localStorage.getItem('p') ?? 'null');
    return { collapsed: value?.collapsed === true, language: value?.language === 'en-US' ? 'en-US' : 'zh-CN' };
  } catch {
    return { collapsed: false, language: 'zh-CN' };
  }
};

class Session {
  token = $state<string | null>(readSession()?.token ?? null);
  principal = $state.raw<Principal | null>(null);

  get authenticated(): boolean { return this.token !== null; }
  get restoring(): boolean { return this.authenticated && this.principal === null; }
  get account(): string { return this.principal?.account ?? ''; }
  get root(): boolean { return this.principal?.root ?? false; }
  get canWrite(): boolean { return this.root || Boolean(this.principal?.roles.includes('admin')); }

  canRead = (permission: string): boolean =>
    Boolean(this.principal && (this.root || this.principal.permissions.includes(permission)));

  start = (token: string, expiresAt: number): void => {
    if (this.token !== token) {
      this.principal = null;
      navigation.reset();
    }
    this.token = token;
    try {
      localStorage.setItem('user', JSON.stringify({ token, expires_at: expiresAt }));
    } catch { /* 存储不可用时保留内存会话。 */ }
  };

  setPrincipal = (principal: Principal): void => { this.principal = principal; };

  clear = (): void => {
    this.token = null;
    this.principal = null;
    navigation.reset();
    try { localStorage.removeItem('user'); } catch { /* 忽略存储异常。 */ }
  };
}

class Navigation {
  routes = $state.raw<NavRoute[]>([]);
  loaded = $state(false);
  #pending: Promise<void> | undefined;
  #token: string | null = null;
  #sequence = 0;

  get menu(): NavRoute[] { return this.routes; }
  get firstPath(): string { return this.routes[0]?.path ?? '/denied'; }

  load = async (force = false): Promise<void> => {
    const token = session.token;
    if (!token) return;
    if (this.#token === token && this.#pending) return this.#pending;
    if (!force && this.#token === token && this.loaded) return;
    const sequence = ++this.#sequence;
    this.#token = token;
    const pending = (async () => {
      try {
        const result = await api.routes(token);
        if (sequence !== this.#sequence || session.token !== token) return;
        const routes = !result.code && Array.isArray(result.data) ? result.data : [];
        this.routes = applyRoutes(routes);
      } catch {
        if (sequence !== this.#sequence || session.token !== token) return;
        this.routes = applyRoutes([]);
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
    this.#pending = undefined;
    this.routes = [];
    this.loaded = false;
    applyRoutes([]);
  };
}

class Preferences {
  collapsed = $state(false);
  language = $state<Language>('zh-CN');
  mode = $state<ThemeMode>(readPreference());

  constructor() { Object.assign(this, readPrefs()); }

  get locale() { return this.language === 'en-US' ? enUS : zhCN; }
  get text() { return messages[this.language]; }

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
