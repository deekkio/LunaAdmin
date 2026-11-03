import { afterEach, expect, test } from 'bun:test';
import type { Entry } from '../src/api/information';
import { information } from '../src/api/information';
import { entryModel, entryRules, entryValue } from '../src/views/information/model';
import { viewPaths } from '../src/router/views';
import { homeLinks } from '../src/layouts/home';
import { mobilePage } from '../src/layouts/mobile';
import type { NavRoute } from '../src/api/types';

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

test('keeps audiences and publication state while converting remaining TTL to save seconds', () => {
  const model = entryModel(row, 400);
  expect(model.ttl).toBe('60');
  expect(entryValue(model)).toEqual({
    version: 1, id: row.id, content: row.content,
    users: row.users, published: false, ttl: 60,
  });
  model.ttl = '';
  model.users = '';
  expect(entryValue(model).ttl).toBeNull();
  expect(entryValue(model).users).toEqual([]);
  expect(entryModel({ ...row, expires_at: null }).ttl).toBe('');
  expect(entryModel().id).toMatch(/^[0-9a-f]{32}$/);
});

test('rejects invalid TTL, duplicate audiences, invalid ULIDs and oversized UTF-8 content', () => {
  for (const value of ['0', '-1', '1.2', '1e2', '31536001']) expect(validate('ttl', value)).toBeString();
  for (const value of ['', '1', '31536000']) expect(validate('ttl', value)).toBeUndefined();
  expect(validate('users', '')).toBeUndefined();
  expect(validate('users', row.users[0])).toBeUndefined();
  expect(validate('users', `${row.users[0]}\n${row.users[0]}`)).toBeString();
  expect(validate('users', '00000000000000000000000000')).toBeString();
  expect(validate('users', 'invalid')).toBeString();
  expect(entryValue(entryModel(row))).not.toHaveProperty('title');
  expect(validate('content', '中'.repeat(5500))).toBeString();
  expect(validate('content', '正文\n内容\t结束')).toBeUndefined();
});

test('registers both information views without fallback navigation', () => {
  expect(viewPaths.announcements).toBe('../views/information/Announcements.svelte');
  expect(viewPaths.notices).toBe('../views/information/Notices.svelte');
  expect(homeLinks([])).toEqual([]);
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
  expect((await information.entries('fixture', 'announcements', 20, 10, '升级')).data?.total).toBe(1);
  expect((await information.saveEntry('fixture', 'notices', entryValue(entryModel(row, 400)))).data?.id).toBe(row.id);
  expect((await information.deleteEntry('fixture', 'notices', row.id, { version: 1, request: 'b'.repeat(32) })).code).toBe('');
  expect((await information.saveSettings('fixture', 15)).data?.threshold).toBe(15);
  expect(calls[0]).toEqual({ url: '/api/v1/announcements?offset=20&limit=10&query=%E5%8D%87%E7%BA%A7', method: 'GET', body: null });
  expect(calls[1]?.method).toBe('PUT');
  expect(calls[2]?.url).toBe(`/api/v1/notices/${row.id}`);
  expect(calls[3]?.body).toEqual({ version: 1, threshold: 15 });
});

test('follows server information titles and paths within the dynamic parent', () => {
  const tree: NavRoute[] = [{
    code: 'messages', title: '运营消息', path: '/messages', view: null, icon: null, rank: 0,
    children: [{ code: 'notices', title: '重要提醒', path: '/messages/notices', view: 'Notices', icon: null, rank: 0, children: [] }],
  }];
  const links = homeLinks(tree);
  expect(links[0]?.path).toBe('/messages/notices');
  expect(links[0]?.label).toBe('重要提醒');
  expect(mobilePage(links[0]!.path, '/home', links[0]!.parent, tree).parent).toBe('/menu');
});
