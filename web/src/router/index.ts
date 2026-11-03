// Hash 路由与全局守卫。未登录跳转登录页；权限不足显示拒绝页。
import { createRouter, createWebHashHistory } from 'luna-router';
import { session, navigation } from '../stores/index.svelte';
import type { Component } from 'svelte';
import { api } from '../api';
import { createGuard } from './guard';
import type { NavRoute } from '../api/types';
import { buildRecords, createSync } from './routes';
import { viewKey, viewPaths } from './views';

const views = import.meta.glob<{ default: Component }>('../views/**/*.svelte');
const view = (module: string, name: string) =>
  views[`../views/${module}/${name}.svelte`]!;

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', lazy: view('login', 'Login'), meta: { public: true, title: '登录' } },
    { path: '/denied', name: 'denied', lazy: view('error', 'NotFound'), meta: { title: '无权访问' } },
    {
      path: '/:path(.*)*',
      name: 'missing',
      lazy: view('error', 'NotFound'),
      meta: { title: '页面不存在' },
    },
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

// 导航仓库引用路由入口；守卫运行时再读取导航，避免模块循环初始化。
router.beforeEach((to, from) => createGuard(session, navigation, api.me)(to, from));

router.afterEach((to) => {
  document.title = `${to.meta.title ?? 'Luna'} · Luna 管理控制台`;
});
