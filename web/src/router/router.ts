import { createRouter, createWebHashHistory } from 'luna-router/core';
import type { RouteLocation, RouteRecord, Router } from 'luna-router/core';
import type { Component } from 'svelte';
import type { NavRoute } from '../api/types';
import { session, navigation } from '../stores/state.svelte';

export const views = import.meta.glob<{ default: Component }>('../views/**/*.svelte');
export const hasView = (path: string): boolean => Object.hasOwn(views, `../views/${path}.svelte`);

/** 从实际菜单查找页面地址；没有入口时不猜测业务路径。 */
export const pagePath = (routes: readonly NavRoute[], name: string): string => {
  const find = (items: readonly NavRoute[]): string | undefined => {
    for (const item of items) {
      if (item.view === name && !item.path.includes(':'))
        return item.path;
      const path = find(item.children);
      if (path) return path;
    }
    return undefined;
  };
  return find(routes) ?? '/denied';
};

export type ViewResolver = (view: string | null) => unknown;

export const joinPath = (parent: string, child: string): string =>
  child.startsWith('/') ? child : `${parent.replace(/\/$/, '')}/${child.replace(/^\//, '')}`;

/** 完整授权树用于注册；显示状态只控制侧栏，不裁掉可访问的页面。 */
export const visibleMenu = (routes: readonly NavRoute[]): NavRoute[] => routes.flatMap(item => {
  if (item.hidden) return [];
  const children = visibleMenu(item.children);
  return item.view || children.length ? [{ ...item, children }] : [];
});

/** 保留完整菜单树；分组与空目录不注册路由，目录跳转到可用子项。 */
export const buildRecords = (
  routes: readonly NavRoute[],
  resolve: ViewResolver,
): { records: RouteRecord[]; allowed: Set<string>; routes: NavRoute[]; menu: NavRoute[] } => {
  const records: RouteRecord[] = [];
  const allowed = new Set<string>();
  const walk = (items: readonly NavRoute[], trail: NavRoute[], parentHidden: boolean): NavRoute[] =>
    [...items].sort((a, b) => a.rank - b.rank || a.id - b.id).flatMap(item => {
      const parent = trail.at(-1)?.path ?? '';
      const path = joinPath(parent, item.path);
      const node = { ...item, path };
      const branch = [...trail, { ...node, children: [] }];
      const hidden = parentHidden || item.hidden;
      const position = records.length;
      const children = walk(item.children, branch, hidden);
      node.children = children;
      const target = children.find(child => allowed.has(child.path))?.path;
      if (!item.group && (item.view || target)) {
        allowed.add(path);
        const record: RouteRecord = {
          path, name: String(item.id),
          meta: { title: item.title, dynamic: true, view: item.view, code: item.code,
            menuId: item.id, rootId: branch[0]!.id, hidden, parent, trail: branch },
        };
        if (item.view) record.lazy = (resolve(item.view) ?? resolve(null)) as RouteRecord['lazy'];
        else record.redirect = target;
        records.splice(position, 0, record);
      }
      return [node];
    });
  const tree = walk(routes, [], false);
  return { records, allowed, routes: tree, menu: visibleMenu(tree) };
};

/** 菜单祖先来自注册元数据；地址和参数统一交给路由库解析。 */
export const pageTrail = (router: Router, route: RouteLocation): NavRoute[] =>
  ((route.meta.trail as NavRoute[] | undefined) ?? []).map(item => {
    if (item.group) return item;
    try {
      return { ...item, path: router.resolve({ name: `nav:${item.id}`, params: route.params }).path };
    } catch {
      const path = route.path.split('/').slice(0, item.path.split('/').length).join('/');
      return router.resolve(path).meta.menuId === item.id ? { ...item, path } : item;
    }
  });

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
        installed.push(router.addRoute({ path: '/', redirect: records.find(item => item.lazy && !item.meta?.hidden && !item.path.includes(':'))?.path ?? '/denied' }));
      }
    } catch (error) {
      for (const remove of installed) remove();
      installed = [];
      throw error;
    }
  };
};

const resolve = (path: string | null) => views[`../views/${path}.svelte`]
  ?? views['../views/error/NotFound.svelte'];

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', lazy: views['../views/login/Login.svelte'], meta: { public: true, title: '登录' } },
    { path: '/denied', name: 'denied', lazy: resolve(null), meta: { title: '无权访问' } },
    { path: '/:path(.*)*', name: 'missing', lazy: resolve(null), meta: { title: '页面不存在' } },
  ],
});
const sync = createSync(router);
export const applyRoutes = (routes: readonly NavRoute[]): NavRoute[] => {
  const result = buildRecords(routes, resolve);
  sync(result.records);
  return result.routes;
};

router.beforeEach(async (to) => {
  const login = { path: '/login', query: to.fullPath === '/' ? {} : { next: to.fullPath } };
  if (!await session.restore()) {
    if (!session.authenticated) navigation.reset();
    return to.meta.public ? undefined : login;
  }
  if (!navigation.loaded) {
    await navigation.load();
    if (!session.authenticated) return login;
    return to.redirectedFrom?.path === '/'
      ? { path: '/', query: to.query, hash: to.hash }
      : to.fullPath;
  }
  if (to.path === '/login') return navigation.firstPath;
});
