import { describe, expect, test } from 'bun:test';
import { createMemoryHistory, createRouter } from 'luna-router/core';
import { buildRecords, createSync } from '../src/router/routes';
import { viewKey, viewPaths } from '../src/router/views';
import type { NavRoute } from '../src/api/types';

const entry = (path: string, view: string): NavRoute => ({
  code: path, title: '服务端授权标题', path, view, icon: null, rank: 0, children: [],
});
const resolve = (name: string | null) => name && viewPaths[viewKey(name)] ? () => Promise.resolve({}) : undefined;

describe('server authorized navigation', () => {
  test('server removal revokes an entry without restoring a local permission list', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const sync = createSync(router);
    sync(buildRecords([entry('/custom/staff', 'Accounts'), entry('/custom/audit', 'Audits')], resolve).records);
    expect(router.resolve('/custom/staff').meta.title).toBe('服务端授权标题');
    expect(router.resolve('/accounts').matched).toEqual([]);
    sync(buildRecords([entry('/custom/audit', 'Audits')], resolve).records);
    expect(router.resolve('/custom/staff').matched).toEqual([]);
    expect(router.resolve('/custom/audit').name).toBe('nav:/custom/audit');
    sync([]);
    expect(router.resolve('/custom/audit').matched).toEqual([]);
    expect(router.resolve('/dashboard').matched).toEqual([]);
    router.destroy();
  });

  test('empty and unsupported trees produce no business routes', () => {
    for (const tree of [[], [entry('/unknown', 'Unknown')]]) {
      expect(buildRecords(tree, resolve).records).toEqual([]);
      expect(buildRecords(tree, resolve).menu).toEqual([]);
    }
  });
});
