import { describe, expect, test } from 'bun:test';
import { createMemoryHistory, createRouter } from 'luna-router/core';
import type { NavRoute } from '../src/api/types';
import { buildRecords, createSync, menuId, pageTrail } from './router';

const entry = (path: string, view: string | null = 'nodes/List', children: NavRoute[] = []): NavRoute => ({
  id: menuId(path), group: false, hidden: false,
  code: path, title: `标题 ${path}`, path, view, children, icon: 'folder', rank: 0,
});
const create = (routes: NavRoute[]) => {
  const result = buildRecords(routes, () => async () => ({}));
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  createSync(router)(result.records);
  return { router, trail: (path: string) => pageTrail(router, router.resolve(path)) };
};

describe('matched menu metadata', () => {
  test('retains server ancestry, titles and icons without changing the menu tree', () => {
    const routes = [entry('/custom', null, [entry('settings', null, [entry('rights')])])];
    const before = structuredClone(routes);
    const { router, trail } = create(routes);
    try {
      expect(trail('/custom/settings/rights').map(item => [item.path, item.title, item.icon])).toEqual([
        ['/custom', '标题 /custom', 'folder'],
        ['/custom/settings', '标题 settings', 'folder'],
        ['/custom/settings/rights', '标题 rights', 'folder'],
      ]);
      expect(routes).toEqual(before);
      expect(trail('/unregistered')).toEqual([]);
      expect(trail('/custom/settings/rights').every(item => item.children.length === 0)).toBe(true);
    } finally { router.destroy(); }
  });

  test('uses the router matcher for static precedence and dynamic parameters', () => {
    const { router, trail } = create([
      entry('/people/:id'), entry('/people/new'),
      entry('/teams', null, [entry(':team', null, [entry('members/:member')])]),
    ]);
    try {
      expect(trail('/people/new').at(-1)?.code).toBe('/people/new');
      expect(trail('/people/other').at(-1)?.code).toBe('/people/:id');
      expect(trail('/teams/north/members/42').map(item => item.path)).toEqual([
        '/teams', '/teams/north', '/teams/north/members/42',
      ]);
    } finally { router.destroy(); }
  });

  test('resolves absolute children and ancestor parameters through registered route identities', () => {
    for (const [routes, path, expected] of [
      [[entry('/teams/:team', null, [entry('/members/:team/:member')])], '/members/north/42', ['/teams/north', '/members/north/42']],
      [[entry('/control', null, [entry('/audit')])], '/audit', ['/control', '/audit']],
      [[entry('/teams/:team', null, [entry('/teams/:id/profile')])], '/teams/north/profile', ['/teams/north', '/teams/north/profile']],
    ] as [NavRoute[], string, string[]][]) {
      const { router, trail } = create(routes);
      try { expect(trail(path).map(item => item.path)).toEqual(expected); }
      finally { router.destroy(); }
    }
  });

  test('keeps titles when a non-prefix ancestor has no available parameter', () => {
    const { router, trail } = create([entry('/teams/:team', null, [entry('/overview')])]);
    try {
      expect(trail('/overview').map(item => item.path)).toEqual(['/teams/:team', '/overview']);
    } finally { router.destroy(); }
  });

  test('retains groups and hidden ancestry without registering group routes', () => {
    const routes = [{ ...entry('/section', null, [entry('/items', null, [
      { ...entry('/items/:id', 'FuturePage'), hidden: true },
    ])]), group: true }];
    const { router, trail } = create(routes);
    try {
      expect(router.hasRoute(`nav:${menuId('/section')}`)).toBe(false);
      expect(trail('/items/42').map(item => item.id)).toEqual(['/section', '/items', '/items/:id'].map(menuId));
      expect(trail('/items/42')[0]?.group).toBe(true);
      expect(trail('/items/42').at(-1)?.hidden).toBe(true);
      expect(trail('/items/42').at(-1)?.view).toBe('FuturePage');
    } finally { router.destroy(); }
  });

  test('supports a registered root page', () => {
    const { router, trail } = create([entry('/')]);
    try { expect(trail('/').map(item => item.path)).toEqual(['/']); }
    finally { router.destroy(); }
  });
});
