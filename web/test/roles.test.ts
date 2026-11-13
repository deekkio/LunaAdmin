import { pagePath, menuId } from './router';
import { pageModule } from './view';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { NavRoute, Permission, Role } from '../src/api/types';
mock.module('@luna/components/message', () => ({ showMessage: () => {} }));
const { newRole, isRoot, isAdmin, canEdit, fetchPerms, permGroups, mergeGrants } =
  await pageModule(new URL('../src/views/access/Role.svelte', import.meta.url));
const rolePath = (routes: readonly NavRoute[]) => pagePath(routes, 'access/Roles');
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const role = (values: Partial<Role> = {}): Role => ({
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  name: '运营',
  code: 'operator',
  enabled: true,
  system: false,
  permissions: [],
  ...values,
});
const entry = (path: string, view: string | null, children: NavRoute[] = []): NavRoute => ({
  id: menuId(path), group: false, hidden: false,
  path,
  view,
  children,
  code: path,
  title: '角色',
  icon: null,
  rank: 0,
});

describe('role editing contracts', () => {
  test('generates distinct canonical nonzero ULIDs with the current timestamp', () => {
    const start = Date.now();
    const ids = Array.from({ length: 32 }, () => newRole());
    const end = Date.now();
    expect(new Set(ids).size).toBe(ids.length);
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (const id of ids) {
      expect(id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
      expect(id).not.toBe('0'.repeat(26));
      const time = [...id.slice(0, 10)].reduce(
        (value, char) => value * 32 + alphabet.indexOf(char),
        0,
      );
      expect(time).toBeGreaterThanOrEqual(start);
      expect(time).toBeLessThanOrEqual(end);
    }
  });
  test('only treats the built-in root role as having automatic full permissions', () => {
    expect(isRoot(role({ code: 'root', system: true }))).toBe(true);
    expect(isRoot(role({ code: 'root', system: false }))).toBe(false);
    expect(isRoot(role({ code: 'admin', system: true }))).toBe(false);
    expect(isRoot(null)).toBe(false);
  });
  test('recognizes system Admin separately from the protected Root identity', () => {
    expect(isAdmin(role({ code: 'admin', system: true }))).toBe(true);
    expect(isAdmin(role({ code: 'admin', system: false }))).toBe(false);
    expect(isAdmin(role({ code: 'root', system: true }))).toBe(false);
    expect(isAdmin(role())).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
  test('only allows Root to edit Admin grants and never edits Root', () => {
    const admin = role({ code: 'admin', system: true, permissions: ['user:read'] });
    const root = role({ code: 'root', system: true });
    expect(canEdit(admin, true)).toBe(true);
    expect(canEdit(admin, false)).toBe(false);
    expect(canEdit(root, true)).toBe(false);
    expect(canEdit(root, false)).toBe(false);
    expect(canEdit(role(), false)).toBe(true);
    expect(canEdit(null, false)).toBe(true);
  });
  test('returns bookmarked detail dialogs to the registered role list', () => {
    expect(rolePath([entry('/system', null, [entry('/system/jobs', 'access/Roles')])])).toBe(
      '/system/jobs',
    );
    expect(rolePath([entry('/roles/:id', 'access/Role')])).toBe('/denied');
  });
});

describe('permission choices', () => {
  test('groups readable names and preserves grants belonging to other groups', () => {
    const permissions: Permission[] = [
      { code: 'user:read', name: '查看用户', enabled: true, system: false },
      { code: 'node:read', name: '查看节点', enabled: true, system: false },
      { code: 'user:write', name: '修改用户', enabled: true, system: false },
    ];
    expect(
      permGroups(permissions).map((group) => [group.label, group.items.map((item) => item.name)]),
    ).toEqual([
      ['用户管理', ['查看用户', '修改用户']],
      ['节点管理', ['查看节点']],
    ]);
    expect(
      mergeGrants(
        ['user:read', 'node:read'],
        ['user:read', 'user:write'],
        ['user:write', 'user:write'],
      ),
    ).toEqual(['node:read', 'user:write']);
    expect(mergeGrants(['user:read', 'node:read'], ['user:read'], [])).toEqual(['node:read']);
  });
  test('loads permission pages after the first hundred and fails closed on errors', async () => {
    const permissions = Array.from({ length: 101 }, (_, index) => ({
      code: `user:read${index}`,
      name: `权限 ${index}`,
      enabled: true,
      system: false,
    }));
    const offsets: number[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://fixture.test');
      expect(url.pathname).toBe('/api/v1/permissions');
      expect(url.searchParams.get('limit')).toBe('100');
      const offset = Number(url.searchParams.get('offset'));
      offsets.push(offset);
      return Response.json({
        code: 'ok',
        data: { items: permissions.slice(offset, offset + 100), total: 101, offset, limit: 100 },
      });
    }) as typeof fetch;
    expect(await fetchPerms('fixture-role')).toHaveLength(101);
    expect(offsets).toEqual([0, 100]);
    globalThis.fetch = (async () =>
      Response.json({ code: 'unavailable', data: null }, { status: 503 })) as typeof fetch;
    expect(await fetchPerms('fixture-role')).toBeNull();
    globalThis.fetch = (async () =>
      Response.json({
        code: 'ok',
        data: { items: [], total: 1, offset: 0, limit: 100 },
      })) as typeof fetch;
    expect(await fetchPerms('fixture-role')).toBeNull();
  });
});
