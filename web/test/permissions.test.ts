import { describe, expect, test } from 'bun:test';
import { createMemoryHistory, createRouter } from 'luna-router/core';
import { buildRecords, createSync, menuId } from './router';
import { hasView } from './router';
import type { NavRoute } from '../src/api/types';

const entry = (path: string, view: string): NavRoute => ({
  id: menuId(path), group: false, hidden: false,
  code: path, title: '服务端授权标题', path, view, icon: null, rank: 0, children: [],
});
const resolve = (name: string | null) => name && hasView(name) ? () => Promise.resolve({}) : undefined;

describe('server authorized navigation', () => {
  test('server removal revokes an entry without restoring a local permission list', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const sync = createSync(router);
    sync(buildRecords([entry('/custom/staff', 'access/Accounts'), entry('/custom/audit', 'access/Audits')], resolve).records);
    expect(router.resolve('/custom/staff').meta.title).toBe('服务端授权标题');
    expect(router.resolve('/accounts').matched).toEqual([]);
    sync(buildRecords([entry('/custom/audit', 'access/Audits')], resolve).records);
    expect(router.resolve('/custom/staff').matched).toEqual([]);
    expect(router.resolve('/custom/audit').name).toBe(`nav:${menuId('/custom/audit')}`);
    sync([]);
    expect(router.resolve('/custom/audit').matched).toEqual([]);
    expect(router.resolve('/dashboard').matched).toEqual([]);
    router.destroy();
  });

  test('keeps unknown authorized paths for 404 while an empty tree grants nothing', () => {
    expect(buildRecords([], resolve).records).toEqual([]);
    const missing = async () => ({ default: () => {} });
    const result = buildRecords([entry('/unknown', 'Unknown')], name => name === null ? missing : resolve(name));
    expect(result.allowed.has('/unknown')).toBe(true);
    expect(result.records[0]!.lazy).toBe(missing);
  });
});
