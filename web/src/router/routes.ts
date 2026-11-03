// 动态路由纯逻辑：不依赖 Vite 的 import.meta.glob，便于单元测试。
import type { RouteRecord, Router } from 'luna-router';
import type { NavRoute } from '../api/types';

export type ViewResolver = (view: string | null) => unknown;

export const joinPath = (parent: string, child: string): string =>
  child.startsWith('/') ? child : `${parent.replace(/\/$/, '')}/${child.replace(/^\//, '')}`;

/** 由服务端路由树生成扁平路由记录与允许路径集合。 */
export const buildRecords = (
  routes: readonly NavRoute[],
  resolve: ViewResolver
): {
  records: RouteRecord[];
  allowed: Set<string>;
  menu: NavRoute[];
} => {
  const records: RouteRecord[] = [];
  const allowed = new Set<string>();

  const walk = (items: readonly NavRoute[], parentPath: string): NavRoute[] => {
    return [...items].sort((a, b) => a.rank - b.rank).flatMap((item) => {
      const path = joinPath(parentPath, item.path);
      const position = records.length;
      const children = walk(item.children, path);
      const view = resolve(item.view);
      if (!view && children.length === 0) return [];
      allowed.add(path);
      const record: RouteRecord = {
        path,
        name: item.code,
        meta: { title: item.title, dynamic: true, view: item.view, parent: parentPath },
      };
      if (view) record.lazy = view as RouteRecord['lazy'];
      else record.redirect = children[0].path;
      records.splice(position, 0, record);
      return [{ ...item, path, children }];
    });
  };

  const menu = walk(routes, '');
  return { records, allowed, menu };
};

const pathParts = (path: string): string[] | null => {
  if (!path.startsWith('/') || /[?#\\\s]/.test(path) || path.includes('//')) return null;
  if (path === '/') return [];
  const parts = path.slice(1).split('/');
  return parts.some(part => !part || part === '.' || part === '..') ? null : parts;
};

/** 仅为菜单内的实际页面生成祖先链，并将参数路径替换为当前地址。 */
export const pageTrail = (menu: readonly NavRoute[], path: string): NavRoute[] => {
  const parts = pathParts(path);
  if (!parts || parts.some(part => part.startsWith(':'))) return [];
  let found: NavRoute[] = [];
  let score = '';
  let values = new Map<string, string>();

  const walk = (items: readonly NavRoute[], trail: NavRoute[]): void => {
    for (const item of items) {
      const branch = [...trail, item];
      const tokens = pathParts(item.path);
      if (tokens && tokens.length === parts.length) {
        const params = new Map<string, string>();
        let weight = '';
        const matches = tokens.every((token, index) => {
          if (/^:[A-Za-z0-9_]+$/.test(token)) {
            params.set(token, parts[index]!);
            weight += '0';
            return true;
          }
          weight += '1';
          return token === parts[index];
        });
        if (matches && (!found.length || weight > score)) {
          found = branch;
          score = weight;
          values = params;
        }
      }
      walk(item.children, branch);
    }
  };

  walk(menu, []);
  if (!found.at(-1)?.view) return [];
  const trail: NavRoute[] = [];
  for (const item of found) {
    const tokens = pathParts(item.path);
    if (!tokens) return [];
    const prefix = tokens.length <= parts.length && tokens.every((token, index) =>
      /^:[A-Za-z0-9_]+$/.test(token) || token === parts[index]);
    const segments = tokens.map((token, index) => token.startsWith(':')
      ? prefix ? parts[index] : values.get(token)
      : token);
    if (segments.some(segment => segment === undefined)) return [];
    trail.push({ ...item, path: `/${segments.join('/')}` });
  }
  return trail;
};

/** 每次仅替换本安装器注册的路由；空树不会恢复业务入口。 */
export const createSync = (router: Router) => {
  let installed: (() => void)[] = [];

  return (records: readonly RouteRecord[]): void => {
    for (const remove of installed) remove();
    installed = [];
    try {
      for (const record of records) {
        installed.push(router.addRoute({ ...record, name: `nav:${String(record.name)}` }));
      }
      if (!records.some((record) => record.path === '/')) {
        installed.push(router.addRoute({ path: '/', redirect: records[0]?.path ?? '/denied' }));
      }
    } catch (error) {
      for (const remove of installed) remove();
      installed = [];
      throw error;
    }
  };
};
