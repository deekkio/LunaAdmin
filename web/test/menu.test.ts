import { describe, expect, test } from 'bun:test';
import { parse } from 'svelte/compiler';

const source = await Bun.file(new URL('../src/layouts/AdminLayout.svelte', import.meta.url)).text();
const ast = parse(source, { modern: true });
const script = ast.instance!.content.body
  .filter(node => node.type === 'VariableDeclaration' && node.declarations.some(entry => entry.id.type === 'Identifier' && ['menuKeys', 'readMenu'].includes(entry.id.name)))
  .map(node => source.slice(node.start!, node.end!)).join('\n');
const { menuOpen } = await import(new URL('./src/menu.js', import.meta.resolve('@luna/components/menu')).href);
const stored = new Map<string, string>();
const { menuKeys, readMenu } = new Function('menuOpen', 'sessionStorage',
  new Bun.Transpiler({ loader: 'ts' }).transformSync(script) + '\nreturn { menuKeys, readMenu };')(
    menuOpen, { getItem: (key: string) => stored.get(key) ?? null },
  );

const items = [
  { key: '/' },
  { key: '/nodes', children: [{ key: '/nodes/list' }] },
  {
    key: '/access',
    children: [
      { key: '/access/accounts' },
      { key: '/access/config', children: [{ key: '/access/config/menus' }] },
    ],
  },
];

describe('menu expansion', () => {
  test('opens every ancestor when a nested page is loaded directly', () => {
    expect(menuKeys(items, '/access/config/menus')).toEqual(['/access', '/access/config']);
    expect(menuKeys(items, '/nodes/list')).toEqual(['/nodes']);
  });

  test('restores other open groups in parent-first order', () => {
    expect(menuKeys(items, '/nodes/list', ['/access/config', '/access'])).toEqual(['/nodes', '/access', '/access/config']);
  });

  test('prunes removed, leaf and inaccessible groups', () => {
    const nodes = [...items, { key: '/hidden', disabled: true, children: [{ key: '/hidden/list' }] }];
    expect(menuKeys(nodes, '/', ['/missing', '/nodes/list', '/hidden', '/access/config'])).toEqual([]);
  });

  test('uses segment boundaries for detail paths and ignores the root prefix', () => {
    expect(menuKeys(items, '/nodes/00000000-0000-4000-8000-000000000001')).toEqual(['/nodes']);
    expect(menuKeys(items, '/nodes-extra/list')).toEqual([]);
    expect(menuKeys(items, '/')).toEqual([]);
  });

  test('preserves input state and respects a manually closed inactive branch', () => {
    const saved = ['/nodes'];
    expect(menuKeys(items, '/', saved)).toEqual(['/nodes']);
    expect(saved).toEqual(['/nodes']);
    expect(menuKeys(items, '/', [])).toEqual([]);
  });
});


test('restores one short storage key only for the same account', () => {
  stored.set('m', JSON.stringify({ account: 'first', keys: ['/nodes', 1] }));
  expect(readMenu('first')).toEqual(['/nodes']);
  expect(readMenu('other')).toEqual([]);
  stored.set('m', JSON.stringify({ account: 'first', keys: '/nodes' }));
  expect(readMenu('first')).toEqual([]);
  stored.set('m', 'invalid');
  expect(readMenu('first')).toEqual([]);
});
