import { describe, expect, test } from 'bun:test';
import type { NavRoute } from '../src/api/types';
import { buildRecords, pageTrail } from '../src/router/routes';

const entry = (path: string, view: string | null = 'Nodes', children: NavRoute[] = []): NavRoute => ({
  code: path, title: `标题 ${path}`, path, view, children, icon: 'folder', rank: 0,
});
const clean = (routes: NavRoute[]) => buildRecords(routes, view => view ? () => Promise.resolve({}) : undefined).menu;

describe('pageTrail', () => {
  test('returns the authorized menu chain with server metadata and leaves input intact', () => {
    const menu = clean([entry('/custom', null, [entry('settings', null, [entry('rights')])])]);
    const before = structuredClone(menu);
    const trail = pageTrail(menu, '/custom/settings/rights');
    expect(trail.map(item => [item.path, item.title, item.icon])).toEqual([
      ['/custom', '标题 /custom', 'folder'],
      ['/custom/settings', '标题 settings', 'folder'],
      ['/custom/settings/rights', '标题 rights', 'folder'],
    ]);
    expect(menu).toEqual(before);
    expect(pageTrail(menu, '/custom')).toEqual([]);
    expect(pageTrail(menu, '/custom/settings/rights/extra')).toEqual([]);
    expect(pageTrail(menu, '/custom/settings/other')).toEqual([]);
    expect(pageTrail([], '/custom/settings/rights')).toEqual([]);
  });

  test('materializes each dynamic ancestor with actual parameter values', () => {
    const menu = clean([entry('/teams', null, [entry(':team', null, [entry('members/:member')])])]);
    const before = structuredClone(menu);
    expect(pageTrail(menu, '/teams/north/members/42').map(item => item.path)).toEqual([
      '/teams', '/teams/north', '/teams/north/members/42',
    ]);
    expect(menu).toEqual(before);
    expect(pageTrail(menu, '/teams/:team/members/:member')).toEqual([]);
    expect(pageTrail(menu, '/teams/north/members')).toEqual([]);
  });

  test('prefers static paths independent of menu order and honors static container redirects', () => {
    const menu = clean([
      entry('/people/:id'), entry('/people/new'),
      entry('/people/group', null, [entry('list')]),
    ]);
    expect(pageTrail(menu, '/people/new').at(-1)?.code).toBe('/people/new');
    expect(pageTrail(menu, '/people/other').at(-1)?.code).toBe('/people/:id');
    expect(pageTrail(menu, '/people/group')).toEqual([]);
  });

  test('preserves menu ancestry for absolute children and concretizes shared parameters', () => {
    const menu = clean([entry('/teams/:team', null, [entry('/members/:team/:member')])]);
    expect(pageTrail(menu, '/members/north/42').map(item => item.path)).toEqual([
      '/teams/north', '/members/north/42',
    ]);
    expect(pageTrail(clean([entry('/control', null, [entry('/audit')])]), '/audit')
      .map(item => item.path)).toEqual(['/control', '/audit']);
    expect(pageTrail(clean([entry('/teams/:team', null, [entry('/teams/:id/profile')])]), '/teams/north/profile')
      .map(item => item.path)).toEqual(['/teams/north', '/teams/north/profile']);
  });

  test('rejects malformed addresses and unresolved ancestor parameters', () => {
    const menu = clean([entry('/a', null, [entry(':id')])]);
    for (const path of ['', 'a/one', '//a/one', '/a//one', '/a/one/', '/a/one?q=1', '/a/one#part', '/a/..', '/a/one two', '/a/one\\two']) {
      expect(pageTrail(menu, path)).toEqual([]);
    }
    expect(pageTrail(clean([entry('/teams/:team', null, [entry('/overview')])]), '/overview')).toEqual([]);
    expect(pageTrail([entry('/')], '/').map(item => item.path)).toEqual(['/']);
  });
});

