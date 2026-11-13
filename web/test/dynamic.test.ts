import { describe, expect, test } from 'bun:test';
import { buildRecords, joinPath, menuId } from './router';
import { hasView } from './router';
import type { NavRoute } from '../src/api/types';

const route = (overrides: Partial<NavRoute>): NavRoute => ({
  id: overrides.id ?? menuId(overrides.code ?? overrides.path ?? 'x'), group: false, hidden: false,
  code: 'x',
  title: 'X',
  path: '/x',
  view: 'nodes/List',
  icon: null,
  rank: 0,
  children: [],
  ...overrides,
});

describe('navigation helpers', () => {
  test('only accepts discovered component paths', () => {
    expect(hasView('nodes/List')).toBe(true);
    expect(hasView('node-list')).toBe(false);
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
    expect(records.map((entry) => entry.name)).toEqual(['a', 'a1', 'b'].map(name => String(menuId(name))));
    expect(allowed.has('/a/one')).toBe(true);
    expect(records.find((entry) => entry.name === String(menuId('a1')))?.path).toBe('/a/one');
  });

  test('sorts equal ranks by numeric menu ID', () => {
    const result = buildRecords([
      route({ id: 10, code: 'ten', path: '/ten', rank: 1 }),
      route({ id: 2, code: 'two', path: '/two', rank: 1 }),
    ], resolve);
    expect(result.records.map(entry => entry.name)).toEqual(['2', '10']);
    expect(result.menu.map(entry => entry.id)).toEqual([2, 10]);
  });

  test('attaches resolved view lazily and marks dynamic meta', () => {
    const { records } = buildRecords([route({ code: 'n', title: '节点', path: '/nodes', view: 'nodes' })], resolve);
    const record = records[0];
    expect(record.meta).toMatchObject({ title: '节点', dynamic: true, view: 'nodes', parent: '' });
    expect(typeof record.lazy).toBe('function');
  });
});


describe('usable route trees', () => {
  const missing = () => Promise.resolve({ missing: true });
  const page = () => Promise.resolve({});
  const resolve = (view: string | null) => view === 'nodes/List' ? page : view === null ? missing : undefined;

  test('keeps unknown authorized pages on the missing component and removes empty directories', () => {
    const input = [route({ code: 'unknown', view: 'Unknown' }), route({ code: 'empty', path: '/empty', view: null })];
    const result = buildRecords(input, resolve);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.lazy).toBe(missing);
    expect(result.allowed.has('/x')).toBe(true);
    expect(result.menu[0]!.view).toBe('Unknown');
  });

  test('redirects directories to the first child and leaves the source tree intact', () => {
    const input = [route({ code: 'directory', path: '/directory', view: null, children: [
      route({ code: 'unknown', path: 'unknown', view: 'Unknown', rank: 0 }),
      route({ code: 'nodes', path: 'list', rank: 1 }),
    ] })];
    const result = buildRecords(input, resolve);
    expect(result.records.map(item => item.path)).toEqual(['/directory', '/directory/unknown', '/directory/list']);
    expect(result.records[0]!.redirect).toBe('/directory/unknown');
    expect(result.records[2]!.meta).toMatchObject({ view: 'nodes/List', parent: '/directory' });
    expect(result.menu[0]!.children.map(item => item.path)).toEqual(['/directory/unknown', '/directory/list']);
    expect(input[0]!.children[1]!.path).toBe('list');
  });

  test('keeps hidden authorization separate from visible navigation and skips group route records', () => {
    const result = buildRecords([route({ id: menuId('section'), code: 'section', path: '/section', group: true, view: null,
      children: [route({ id: menuId('list'), code: 'list', path: '/items', children: [
        route({ id: menuId('detail'), code: 'detail', path: '/items/:id', hidden: true }),
      ] })] })], resolve);
    expect(result.records.map(item => item.name)).toEqual(['list', 'detail'].map(name => String(menuId(name))));
    expect(result.allowed.has('/items/:id')).toBe(true);
    expect(result.allowed.has('/section')).toBe(false);
    expect(result.routes[0]!.children[0]!.children[0]!.hidden).toBe(true);
    expect(result.menu[0]!.children[0]!.children).toEqual([]);
    expect(result.records[1]!.meta).toMatchObject({ menuId: menuId('detail'), rootId: menuId('section'), hidden: true });
  });

  test('preserves every children level while registering only usable pages and directories', () => {
    const input = [route({ id: menuId('root'), code: 'root', path: '/root', group: true, view: null, children: [
      route({ id: menuId('empty'), code: 'empty', path: 'empty', view: null }),
      route({ id: menuId('folder'), code: 'folder', path: 'folder', view: null, children: [
        route({ id: menuId('blank'), code: 'blank', path: 'blank', view: null }),
        route({ id: menuId('page'), code: 'page', path: 'page' }),
      ] }),
    ] })];
    const before = structuredClone(input);
    const result = buildRecords(input, resolve);
    expect(result.routes[0]!.children.map(item => item.path)).toEqual(['/root/empty', '/root/folder']);
    expect(result.routes[0]!.children[1]!.children.map(item => item.path)).toEqual([
      '/root/folder/blank', '/root/folder/page',
    ]);
    expect(result.records.map(item => item.name)).toEqual(['folder', 'page'].map(name => String(menuId(name))));
    expect(result.records[0]!.redirect).toBe('/root/folder/page');
    expect(result.menu[0]!.children.map(item => item.id)).toEqual([menuId('folder')]);
    expect(result.menu[0]!.children[0]!.children.map(item => item.id)).toEqual([menuId('page')]);
    expect(input).toEqual(before);
  });

  test('retains route identity when its title or editable business code changes', () => {
    const before = buildRecords([route({ id: menuId('stable'), code: 'old', title: 'Before' })], resolve);
    const after = buildRecords([route({ id: menuId('stable'), code: 'new', title: 'After' })], resolve);
    expect(before.records[0]!.name).toBe(String(menuId('stable')));
    expect(after.records[0]!.name).toBe(String(menuId('stable')));
    expect(after.records[0]!.meta!.title).toBe('After');
  });
});
