// 会话状态：token 持久化到 localStorage，刷新后恢复并重新读取 /me；
// 过期或 401 时清除；403 保留登录状态。
import { fromStore, writable } from 'svelte/store';
import { setUnauthorizedHandler } from '../api/request';
import type { Principal } from '../api/types';

const STORAGE_KEY = 'user';
const legacy = 'luna-admin-session';

interface StoredSession {
  token: string;
  expires_at: number;
}

const readStored = (): StoredSession | null => {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const raw = current ?? localStorage.getItem(legacy);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (
      !parsed ||
      typeof parsed.token !== 'string' ||
      !Number.isFinite(parsed.expires_at) ||
      parsed.expires_at * 1000 <= Date.now()
    ) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(legacy);
      return null;
    }
    try {
      if (current === null) localStorage.setItem(STORAGE_KEY, raw);
      localStorage.removeItem(legacy);
    } catch {
      // 无法写入时仍恢复内存会话，保留旧键以便下次迁移。
    }
    return parsed;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(legacy);
    } catch {
      // 存储不可用时不恢复会话。
    }
    return null;
  }
};

class SessionStore {
  #token = fromStore(writable<string | null>(null));
  #principal = fromStore(writable<Principal | null>(null));
  #expiresAt = 0;

  constructor() {
    const stored = readStored();
    if (stored) {
      this.token = stored.token;
      this.#expiresAt = stored.expires_at;
    }
  }

  get token(): string | null {
    return this.#token.current;
  }

  set token(value: string | null) {
    this.#token.current = value;
  }

  get principal(): Principal | null {
    return this.#principal.current;
  }

  set principal(value: Principal | null) {
    this.#principal.current = value;
  }

  get authenticated(): boolean {
    return this.token !== null;
  }

  /** 会话已恢复但身份尚未读取完成（用于刷新后的加载态）。 */
  get restoring(): boolean {
    return this.token !== null && this.principal === null;
  }

  get account(): string {
    return this.principal?.account ?? '';
  }

  get root(): boolean {
    return this.principal?.root ?? false;
  }

  /** 读操作：Root 或持有对应权限。 */
  canRead = (permission: string): boolean => {
    if (!this.principal) return false;
    return this.principal.root || this.principal.permissions.includes(permission);
  };

  /** Root 与系统 Admin 可执行管理写操作。 */
  get canWrite(): boolean {
    return this.root || Boolean(this.principal?.roles.includes('admin'));
  }

  start = (token: string, expiresAt: number): void => {
    this.token = token;
    this.#expiresAt = expiresAt;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expires_at: expiresAt }));
      localStorage.removeItem(legacy);
    } catch {
      // 存储不可用时退化为仅内存会话
    }
  };

  setPrincipal = (principal: Principal): void => {
    this.principal = principal;
  };

  clear = (): void => {
    this.token = null;
    this.principal = null;
    this.#expiresAt = 0;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(legacy);
    } catch {
      // 忽略存储异常
    }
  };
}

export const session = new SessionStore();

setUnauthorizedHandler((token) => {
  if (!token || token !== session.token) return false;
  session.clear();
  return true;
});
