import { createRouter, createWebHashHistory } from 'luna-router';
import type { Component } from 'svelte';
import { session } from '../stores/session';
import { api } from '../api';
import type { NavRoute } from '../api/types';
import { navigation } from '../stores/navigation';
import { createGuard } from './guard';
import { buildRecords, createSync } from './routes';
import { viewKey, viewPaths } from './views';

const views = import.meta.glob<{ default: Component }>('../views/**/*.svelte');
const view = (module: string, name: string) => views[`../views/${module}/${name}.svelte`]!;

// 只预注册认证、错误页面和移动导航外壳；业务路由由服务端菜单安装。
export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: (_to, _from, saved) => saved ?? { left: 0, top: 0 },
  routes: [
    { path: '/login', name: 'login', lazy: view('login', 'Login'), meta: { public: true, title: '登录' } },
    { path: '/menu', name: 'menu', lazy: view('menu', 'Menu'), meta: { title: '服务中心' } },
    { path: '/profile', name: 'profile', lazy: view('profile', 'Profile'), meta: { title: '我的' } },
    { path: '/denied', name: 'denied', lazy: view('error', 'NotFound'), meta: { title: '无权访问' } },
    { path: '/:path(.*)*', name: 'missing', lazy: view('error', 'NotFound'), meta: { title: '页面不存在' } },
  ],
});

const sync = createSync(router);
const resolve = (name: string | null) => {
  const path = name ? viewPaths[viewKey(name)] : undefined;
  return path ? views[path] : undefined;
};

/** 只安装服务端授权且视图受支持的路由。 */
export const applyRoutes = (routes: readonly NavRoute[]): NavRoute[] => {
  const result = buildRecords(routes, resolve);
  sync(result.records);
  return result.menu;
};

router.beforeEach((to, from) => createGuard(session, navigation, api.me)(to, from));
router.afterEach((to) => {
  document.title = `${to.meta.title ?? 'Luna'} · Luna 管理控制台`;
});
