import { pagePath } from '../src/router/views';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { NavRoute, Role } from '../src/api/types';

mock.module('@luna/components/message', () => ({ showMessage: () => {} }));
const { fetchRoles, roleNames } = await import('../src/views/access/accounts');
const accountPath = (routes: readonly NavRoute[]) => pagePath(routes, 'Accounts');
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const entry = (path: string, view: string | null, children: NavRoute[] = []): NavRoute => ({
  path,
  view,
  children,
  code: path,
  title: '管理员',
  icon: null,
  rank: 0,
});
const role = (id: string, name = id): Role => ({
  id,
  name,
  code: id,
  enabled: true,
  system: false,
  permissions: [],
});

describe('administrator presentation', () => {
  test('shows role names and meaningful fallbacks without displaying role identifiers', () => {
    expect(roleNames(['one', 'two'], [role('one', '运营管理员'), role('two', '审计员')])).toBe(
      '运营管理员、审计员',
    );
    expect(roleNames(['unknown-id'], [])).toBe('不可用角色');
    expect(roleNames(['one'], null)).toBe('-');
    expect(roleNames([], [])).toBe('未分配角色');
  });

  test('returns legacy dialogs to the registered account list, preserving the first match', () => {
    expect(accountPath([entry('/system', null, [entry('/system/staff', 'admins')])])).toBe(
      '/system/staff',
    );
    expect(accountPath([entry('/accounts/:id', 'AccountDetail')])).toBe('/denied');
    expect(
      accountPath([
        entry('/root', null, [entry('/accounts', 'Accounts')]),
        entry('/later', 'Accounts'),
      ]),
    ).toBe('/accounts');
  });
});

describe('complete role directory', () => {
  test('loads roles beyond the first hundred for names and assignment choices', async () => {
    const roles = Array.from({ length: 101 }, (_, index) => role(String(index), `角色 ${index}`));
    const offsets: number[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://fixture.test');
      expect(url.pathname).toBe('/api/v1/roles');
      expect(url.searchParams.get('limit')).toBe('100');
      const offset = Number(url.searchParams.get('offset'));
      offsets.push(offset);
      return Response.json({
        code: 'ok',
        data: { items: roles.slice(offset, offset + 100), total: 101, offset, limit: 100 },
      });
    }) as typeof fetch;
    const result = await fetchRoles('fixture-admin');
    expect(offsets).toEqual([0, 100]);
    expect(result).toHaveLength(101);
    expect(roleNames(['100'], result)).toBe('角色 100');
  });

  test('discards partial catalogs after an error and stops on inconsistent empty pages', async () => {
    let count = 0;
    globalThis.fetch = (async () => {
      if (++count === 1)
        return Response.json({
          code: 'ok',
          data: { items: [role('one')], total: 2, offset: 0, limit: 100 },
        });
      return Response.json(
        { code: 'unavailable', message: 'fixture', data: null },
        { status: 503 },
      );
    }) as typeof fetch;
    expect(await fetchRoles('fixture-admin')).toBeNull();
    expect(count).toBe(2);
    globalThis.fetch = (async () =>
      Response.json({
        code: 'ok',
        data: { items: [], total: 1, offset: 0, limit: 100 },
      })) as typeof fetch;
    expect(await fetchRoles('fixture-admin')).toBeNull();
  });
});
