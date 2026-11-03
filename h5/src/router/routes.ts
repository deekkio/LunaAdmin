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
