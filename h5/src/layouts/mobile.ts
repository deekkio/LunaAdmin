import type { NavRoute } from '../api/types';
import { viewKey, viewPaths } from '../router/views';

export interface MobilePage {
  root: boolean;
  tab: string;
  parent: string;
}

/** 固定底栏只属于移动外壳，业务返回路径由动态路由父级提供。 */
export const mobilePage = (path: string, home: string, parent: unknown, routes: readonly NavRoute[]): MobilePage => {
  if (path === home) return { root: true, tab: home, parent: home };
  if (path === '/profile' || path === '/menu') return { root: true, tab: path, parent: home };
  const find = (items: readonly NavRoute[]): boolean => items.some((item) =>
    (item.path === parent && Boolean(item.view && viewPaths[viewKey(item.view)])) || find(item.children),
  );
  return {
    root: false,
    tab: '',
    parent: typeof parent === 'string' && parent && parent !== path && !parent.includes(':') && find(routes) ? parent : '/menu',
  };
};
