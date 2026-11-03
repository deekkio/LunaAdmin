import { describe, expect, test } from 'bun:test';
import type { NavRoute } from '../src/api/types';
import { buildRecords } from '../src/router/routes';
import { viewKey, viewPaths } from '../src/router/views';
import { parse } from 'svelte/compiler';

const source = await Bun.file(new URL('../src/layouts/AdminLayout.svelte', import.meta.url)).text();
const ast = parse(source, { modern: true });
const script = ast.instance!.content.body
  .filter(node => node.type === 'VariableDeclaration' && node.declarations.some(entry => entry.id.type === 'Identifier' && ['menuKeys', 'menuItems'].includes(entry.id.name)))
  .map(node => source.slice(node.start!, node.end!)).join('\n');
const { menuOpen } = await import(new URL('./src/menu.js', import.meta.resolve('@luna/components/menu')).href);
const { menuKeys, menuItems } = new Function('menuOpen', 'menuIcon',
  new Bun.Transpiler({ loader: 'ts' }).transformSync(script) + '\nreturn { menuKeys, menuItems };')(
    menuOpen, (name: string | null, group: boolean) => name ?? (group ? 'folder' : 'file'),
  );

const entry = (path: string, title: string, view: string | null, children: NavRoute[] = [], rank = 0): NavRoute => ({
  path, title, view, children, code: path, icon: null, rank,
});
const resolve = (view: string | null) => view && viewPaths[viewKey(view)] ? () => Promise.resolve({}) : undefined;

const links = (routes: NavRoute[]) => menuItems(buildRecords(routes, resolve).menu);

describe('server menu trees', () => {
  test('preserves server titles, icons, custom paths, rank and arbitrary nesting', () => {
    const routes = [
      entry('/later', '服务端第二项', 'Orders', [], 5),
      entry('/control', '自定义控制中心', null, [
        entry('last', '最后一项', 'admins', [], 9),
        entry('config', '自定义设置', null, [
          entry('security', '安全目录', null, [entry('rights', '自定义权限名称', 'permission-list')]),
        ], 1),
      ], 1),
    ];
    routes[1]!.icon = 'shield';
    const copy = structuredClone(routes);
    const items = links(routes);
    expect(items.map(item => [item.key, item.label])).toEqual([
      ['/control', '自定义控制中心'], ['/later', '服务端第二项'],
    ]);
    expect(items[0]?.iconComponent).toBe('shield');
    expect(items[0]?.children?.map(item => [item.key, item.label])).toEqual([
      ['/control/config', '自定义设置'], ['/control/last', '最后一项'],
    ]);
    expect(items[0]?.children?.[0]?.children?.[0]?.children?.[0]).toEqual({
      key: '/control/config/security/rights', label: '自定义权限名称', iconComponent: 'file', children: undefined,
    });
    expect(routes).toEqual(copy);
  });

  test('omits unusable branches without injecting missing pages or business groups', () => {
    expect(links([
      entry('/users', '自定义用户目录', null, [entry('people', '我的用户', 'Users')]),
      entry('/empty', '空目录', null), entry('/unknown', '未知页面', 'Unknown'),
    ])).toEqual([{
      key: '/users', label: '自定义用户目录', iconComponent: 'folder',
      children: [{ key: '/users/people', label: '我的用户', iconComponent: 'file', children: undefined }],
    }]);
    expect(links([])).toEqual([]);
  });

  test('opens every current ancestor and drops removed stored branches', () => {
    const items = links([
      entry('/control', '控制台', null, [entry('config', '设置', null, [entry('rights', '权限', 'Permissions')])]),
      entry('/people', '用户目录', null, [entry('list', '用户', 'Users')]),
    ]);
    expect(menuKeys(items, '/control/config/rights', ['/removed', '/people'])).toEqual([
      '/control', '/control/config', '/people',
    ]);
    expect(menuKeys(links([entry('/people', '用户目录', null, [entry('list', '用户', 'Users')])]), '/people/list', ['/control'])).toEqual(['/people']);
  });
});

test('preserves server titles even when they match former translation labels', () => {
  expect(links([entry('/people', '用户管理', 'Users')])[0]?.label).toBe('用户管理');
  expect(links([entry('/custom', '业务自定义名称', 'Users')])[0]?.label).toBe('业务自定义名称');
});
