import type { NavRoute } from '../api/types';
import { pagePath, viewKey, viewPaths } from '../router/views';

export interface HomeLink {
  path: string;
  label: string;
  icon: string | null;
  view: string;
  parent: string;
}

export const homePath = (routes: readonly NavRoute[]): string =>
  pagePath(routes, 'Dashboard') ?? routes[0]?.path ?? '/denied';

/** 移动导航入口保留服务端的标题、图标、路径与父级。 */
export const homeLinks = (routes: readonly NavRoute[], parent = ''): HomeLink[] =>
  routes.flatMap((item) => {
    const file = item.view ? viewPaths[viewKey(item.view)] : undefined;
    const visible = file && !item.path.includes(':') && ![viewPaths.dashboard, viewPaths.menu, viewPaths.profile].includes(file);
    return [
      ...(visible ? [{ path: item.path, label: item.title, icon: item.icon, view: item.view!, parent }] : []),
      ...homeLinks(item.children, item.path),
    ];
  });
