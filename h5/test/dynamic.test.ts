import { describe, expect, test } from 'bun:test';
import { buildRecords, joinPath } from '../src/router/routes';
import { viewKey } from '../src/router/views';
import type { NavRoute } from '../src/api/types';

const route = (overrides: Partial<NavRoute>): NavRoute => ({
  code: 'x',
  title: 'X',
  path: '/x',
  view: 'Nodes',
  icon: null,
  rank: 0,
  children: [],
  ...overrides,
});

describe('navigation helpers', () => {
  test('normalizes view names', () => {
    expect(viewKey('Node-List')).toBe('nodelist');
    expect(viewKey('node_list')).toBe('nodelist');
  });

  test('joins child paths', () => {
    expect(joinPath('/a', 'one')).toBe('/a/one');
    expect(joinPath('/a/', '/abs')).toBe('/abs');
  });
});

describe('buildRecords', () => {
  const tree: NavRoute[] = [
    route({ code: 'b', title: 'B', path: '/b', rank: 2 }),
    route({
      code: 'a',
      title: 'A',
      path: '/a',
      view: null,
      rank: 1,
      children: [route({ code: 'a1', title: 'A1', path: 'one', rank: 1 })],
    }),
  ];
  const resolve = (view: string | null) => (view ? () => Promise.resolve({}) : undefined);

  test('sorts by rank and joins child paths', () => {
    const { records, allowed } = buildRecords(tree, resolve);
    expect(records.map((entry) => entry.name)).toEqual(['a', 'a1', 'b']);
    expect(allowed.has('/a/one')).toBe(true);
    expect(records.find((entry) => entry.name === 'a1')?.path).toBe('/a/one');
  });

  test('attaches resolved view lazily and marks dynamic meta', () => {
    const { records } = buildRecords([route({ code: 'n', title: '节点', path: '/nodes', view: 'nodes' })], resolve);
    const record = records[0];
    expect(record.meta).toMatchObject({ title: '节点', dynamic: true });
    expect(typeof record.lazy).toBe('function');
  });
});


describe('usable route trees', () => {
  const resolve = (view: string | null) => view === 'Nodes' ? () => Promise.resolve({}) : undefined;

  test('omits unsupported leaves and empty groups rather than installing blank pages', () => {
    const input = [route({ code: 'unknown', view: 'Unknown' }), route({ code: 'empty', path: '/empty', view: null })];
    expect(buildRecords(input, resolve)).toEqual({ records: [], allowed: new Set(), menu: [] });
  });

  test('redirects groups to a usable child and shares absolute paths with the menu', () => {
    const input = [route({ code: 'group', path: '/group', view: null, children: [
      route({ code: 'unknown', path: 'unknown', view: 'Unknown', rank: 0 }),
      route({ code: 'nodes', path: 'list', rank: 1 }),
    ] })];
    const result = buildRecords(input, resolve);
    expect(result.records.map(item => item.path)).toEqual(['/group', '/group/list']);
    expect(result.records[0].redirect).toBe('/group/list');
    expect(result.menu[0].children.map(item => item.path)).toEqual(['/group/list']);
    expect(input[0].children[1].path).toBe('list');
  });
});
