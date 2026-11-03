// 动态导航与路由保持同一份经过视图注册表筛选的菜单。
import { fromStore, writable } from 'svelte/store';
import { api } from '../api';
import type { NavRoute } from '../api/types';
import { session } from './session';
import { applyRoutes } from '../router';

class NavigationStore {
  #routes = fromStore(writable<NavRoute[]>([]));
  #loaded = fromStore(writable<boolean>(false));
  #pending: Promise<void> | undefined;
  #token: string | null = null;
  #sequence = 0;

  get routes(): NavRoute[] {
    return this.#routes.current;
  }

  set routes(value: NavRoute[]) {
    this.#routes.current = value;
  }

  get loaded(): boolean {
    return this.#loaded.current;
  }

  set loaded(value: boolean) {
    this.#loaded.current = value;
  }

  get menu(): NavRoute[] {
    return this.routes;
  }

  get firstPath(): string {
    return this.menu[0]?.path ?? '/denied';
  }

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
    try {
      await pending;
    } finally {
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

export const navigation = new NavigationStore();
