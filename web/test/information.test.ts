import { afterEach, expect, test } from 'bun:test';
import type { Entry } from '../src/api/types';
import { api } from '../src/api';
import { entryModel, entryRules, entryValue } from '../src/views/information/model';
import { buildRecords } from '../src/router/routes';
import { viewKey, viewPaths } from '../src/router/views';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const row: Entry = {
  id: 'a'.repeat(32), title: '升级公告', content: '第一行\n第二行', kind: 'notice',
  users: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'], published: false,
  created_at: 100, updated_at: 120, expires_at: 460, read: false,
};
const validate = (key: string, value: unknown): unknown => {
  const rules = entryRules[key];
  const list = Array.isArray(rules) ? rules : [rules];
  for (const rule of list) {
    const result = rule?.validator?.(value, {}, { field: key, trigger: 'submit' });
    if (result !== undefined) return result;
  }
};

test('uses minute TTL, category and an all-user audience for writes', () => {
  const model = entryModel(row, 400);
  expect(model.ttl).toBe(1);
  expect(model.kind).toBe('notices');
  expect(entryValue(model)).toEqual({
    version: 1, id: row.id, content: row.content,
    users: [], published: false, ttl: 60,
  });
  model.ttl = undefined;
  expect(entryValue(model).ttl).toBeNull();
  expect(entryModel({ ...row, expires_at: null }).ttl).toBeUndefined();
  expect(entryModel({ ...row, expires_at: 461 }, 400).ttl).toBe(2);
  expect(entryModel().kind).toBe('announcements');
  expect(entryValue(entryModel())).not.toHaveProperty('title');
  expect(entryModel().id).toMatch(/^[0-9a-f]{32}$/);
  model.ttl = 525600;
  expect(entryValue(model).ttl).toBe(31536000);
});

test('rejects invalid minutes, categories and oversized UTF-8 content', () => {
  for (const value of [0, -1, 1.2, 525601, NaN, Infinity, '1']) expect(validate('ttl', value)).toBeString();
  for (const value of [undefined, 1, 525600]) expect(validate('ttl', value)).toBeUndefined();
  for (const value of ['announcements', 'notices']) expect(validate('kind', value)).toBeUndefined();
  expect(validate('kind', 'quota')).toBeString();
  expect(validate('content', '中'.repeat(5500))).toBeString();
  expect(validate('content', '正文\n内容\t结束')).toBeUndefined();
});

test('registers both information views without adding fallback navigation', () => {
  expect(viewPaths.announcements).toBe('../views/information/Announcements.svelte');
  expect(viewPaths.notices).toBe('../views/information/Notices.svelte');
  expect(buildRecords([], () => undefined).menu).toEqual([]);
});

test('uses server pagination and shared response envelopes for search, writes and settings', async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    const data = url.includes('/information') ? { threshold: 15 }
      : init?.method === 'DELETE' ? null
      : init?.method === 'PUT' ? row : { items: [row], total: 1, offset: 20, limit: 10 };
    return Response.json({ code: '', message: '', data });
  }) as typeof fetch;
  expect((await api.entries('fixture', 'announcements', 20, 10, '升级')).data?.total).toBe(1);
  expect((await api.saveEntry('fixture', 'notices', entryValue(entryModel(row, 400)))).data?.id).toBe(row.id);
  expect((await api.deleteEntry('fixture', 'notices', row.id, { version: 1, request: 'b'.repeat(32) })).code).toBe('');
  expect((await api.saveSettings('fixture', 15)).data?.threshold).toBe(15);
  expect(calls[0]).toEqual({ url: '/api/v1/announcements?offset=20&limit=10&query=%E5%8D%87%E7%BA%A7', method: 'GET', body: null });
  expect(calls[1]?.method).toBe('PUT');
  expect(calls[1]?.body).not.toHaveProperty('title');
  expect(calls[2]?.url).toBe(`/api/v1/notices/${row.id}`);
  expect(calls[3]?.body).toEqual({ version: 1, threshold: 15 });
});

test('keeps both information pages under the server directory with their actual titles', () => {
  const routes = buildRecords([{
    code: 'information', title: '自定义信息中心', path: '/information', view: null, icon: null, rank: 0,
    children: ['Announcements', 'Notices'].map((view, index) => ({
      code: view, title: `服务端标题${index}`, path: `/custom/${index}`, view, icon: null, rank: index, children: [],
    })),
  }], view => view && viewPaths[viewKey(view)] ? () => Promise.resolve({}) : undefined);
  const links = routes.menu;
  expect(links.map(item => [item.title, item.children.map(child => [child.path, child.title])])).toEqual([
    ['自定义信息中心', [['/custom/0', '服务端标题0'], ['/custom/1', '服务端标题1']]],
  ]);
});
