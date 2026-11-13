import { describe, expect, test } from 'bun:test';
import type { NavRoute } from '../src/api/types';
import { buildRecords, menuId } from './router';
import { hasView } from './router';
import { parse } from 'svelte/compiler';

const source = await Bun.file(new URL('../src/layouts/AdminLayout.svelte', import.meta.url)).text();
const ast = parse(source, { modern: true });
const script = ast.instance!.content.body
  .filter(node => node.type === 'VariableDeclaration' && node.declarations.some(entry => entry.id.type === 'Identifier' && ['menuKeys', 'menuItems'].includes(entry.id.name)))
  .map(node => source.slice(node.start!, node.end!)).join('\n');
const { menuFind, menuOpen } = await import(new URL('./src/menu.js', import.meta.resolve('@luna/components/menu')).href);
const { menuKeys, menuItems } = new Function('menuFind', 'menuOpen', 'menuIcon',
  new Bun.Transpiler({ loader: 'ts' }).transformSync(script) + '\nreturn { menuKeys, menuItems };')(
    menuFind, menuOpen, (name: string | null, group: boolean) => name ?? (group ? 'folder' : 'file'),
  );

const entry = (path: string, title: string, view: string | null, children: NavRoute[] = [], rank = 0): NavRoute => ({
  id: menuId(path), group: false, hidden: false,
  path, title, view, children, code: path, icon: null, rank,
});
const resolve = (view: string | null) => view && hasView(view) ? () => Promise.resolve({}) : undefined;

const links = (routes: NavRoute[]) => menuItems(buildRecords(routes, resolve).menu);

describe('server menu trees', () => {
  test('preserves server titles, icons, custom paths, rank and arbitrary nesting', () => {
    const routes = [
      entry('/later', '服务端第二项', 'orders/List', [], 5),
      entry('/control', '自定义控制中心', null, [
        entry('last', '最后一项', 'access/Accounts', [], 9),
        entry('config', '自定义设置', null, [
          entry('security', '安全目录', null, [entry('rights', '自定义权限名称', 'access/Permissions')]),
        ], 1),
      ], 1),
    ];
    routes[1]!.icon = 'shield';
    routes[1]!.group = true;
    const copy = structuredClone(routes);
    const items = links(routes);
    expect(items.map(item => [item.key, item.label])).toEqual([
      [String(menuId('config')), '自定义设置'], [String(menuId('last')), '最后一项'], [String(menuId('/later')), '服务端第二项'],
    ]);
    expect(items[0]?.group).toBe('自定义控制中心');
    expect(items[0]?.iconComponent).toBe('folder');
    expect(items[1]?.group).toBeUndefined();
    expect(items[0]?.children?.map(item => [item.key, item.label])).toEqual([
      [String(menuId('security')), '安全目录'],
    ]);
    expect(items[0]?.children?.[0]?.children?.[0]).toEqual({
      key: String(menuId('rights')), label: '自定义权限名称', iconComponent: 'file', children: undefined,
    });
    expect(routes).toEqual(copy);
  });

  test('retains ordinary root directories and unknown pages while dropping empty directories', () => {
    const items = links([
      entry('/users', '自定义用户目录', null, [entry('people', '我的用户', 'users/List')]),
      entry('/empty', '空目录', null), entry('/unknown', '未知页面', 'Unknown'),
    ]);
    expect(items.find(item => item.key === String(menuId('/users')))).toMatchObject({
      label: '自定义用户目录', children: [{ key: String(menuId('people')), label: '我的用户' }],
    });
    expect(items.find(item => item.key === String(menuId('/users')))?.group).toBeUndefined();
    expect(items.find(item => item.key === String(menuId('/unknown')))?.label).toBe('未知页面');
    expect(items.find(item => item.key === String(menuId('/empty')))).toBeUndefined();
    expect(links([])).toEqual([]);
  });

  test('opens every current ancestor and drops removed stored branches', () => {
    const input = [
      entry('/control', '控制台', null, [entry('config', '设置', null, [entry('rights', '权限', 'access/Permissions')])]),
      entry('/people', '用户目录', null, [entry('list', '用户', 'users/List')]),
    ];
    input.forEach(item => { item.group = true; });
    const items = links(input);
    expect(menuKeys(items, String(menuId('rights')), ['/removed', String(menuId('/people'))])).toEqual([
      String(menuId('config')),
    ]);
    expect(menuKeys(links([{ ...entry('/people', '用户目录', null, [entry('list', '用户', 'users/List')]), group: true }]), String(menuId('list')), [String(menuId('/control'))])).toEqual([]);
  });
});

test('preserves server titles even when they match former translation labels', () => {
  expect(links([entry('/people', '用户管理', 'users/List')])[0]?.label).toBe('用户管理');
  expect(links([entry('/custom', '业务自定义名称', 'users/List')])[0]?.label).toBe('业务自定义名称');
});
