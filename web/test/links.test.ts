import { afterEach, describe, expect, mock, test } from 'bun:test';
import { pageModule } from './view';
import type { LinkKind, LinkRef } from '../src/api/types';

const { readLinks } = await pageModule(new URL('../src/views/users/Detail.svelte', import.meta.url));

mock.module('@luna/components/message', () => ({ showMessage: () => {} }));

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const mockFetch = (handler: (url: string, init: RequestInit) => Response | Promise<Response>): void => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch;
};
const reply = (data: unknown): Response => Response.json({ code: 'ok', data });
const record = (id: string, kind: LinkKind = 'dedicated'): LinkRef => ({ id, kind });
const link = (id: string): { url: string; expires_at: number } => ({
  url: `subscribe://fixture.invalid/${id}`, expires_at: Math.floor(Date.now() / 1000) + 3600,
});

describe('readLinks', () => {
  test('loads each kind from the account link references with GET only', async () => {
    const paths: string[] = [];
    mockFetch((url, init) => {
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      paths.push(url);
      if (url.endsWith('/links')) {
        expect(url).toBe('/api/v1/users/fixture-account/links');
        expect(init.signal).toBeDefined();
        return reply([record('subscription', 'subscription'), record('dedicated')]);
      }
      return reply(link(url.includes('/dedicated/') ? 'dedicated' : 'subscription'));
    });
    const [subscription, dedicated] = await Promise.all([
      readLinks('fixture-token', 'fixture-account', 'subscription', new AbortController().signal),
      readLinks('fixture-token', 'fixture-account', 'dedicated', new AbortController().signal),
    ]);
    expect(subscription).toEqual([{ id: 'subscription', url: link('subscription').url }]);
    expect(dedicated).toEqual([{ id: 'dedicated', url: link('dedicated').url }]);
    expect(paths.filter((path) => path.endsWith('/links'))).toHaveLength(2);
    expect(paths.filter((path) => path.endsWith('/link')).sort()).toEqual([
      '/api/v1/subscriptions/dedicated/link', '/api/v1/subscriptions/subscription/link',
    ]);
  });

  test('uses minimal references without subscription state, quota or pagination', async () => {
    const paths: string[] = [];
    mockFetch((url, init) => {
      expect(init.method).toBe('GET');
      paths.push(url);
      return url.endsWith('/links')
        ? reply([record('active'), record('other', 'subscription')]) : reply(link('active'));
    });
    expect(await readLinks('fixture-token', 'fixture-account', 'dedicated', new AbortController().signal))
      .toEqual([{ id: 'active', url: link('active').url }]);
    expect(paths).toEqual(['/api/v1/users/fixture-account/links', '/api/v1/subscriptions/active/link']);
  });

  test('leaves a missing kind empty without requesting or minting a link', async () => {
    let calls = 0;
    mockFetch((url, init) => {
      calls++;
      expect(url).toBe('/api/v1/users/fixture-account/links');
      expect(init.method).toBe('GET');
      return reply([record('other', 'subscription')]);
    });
    expect(await readLinks('fixture-token', 'fixture-account', 'dedicated', new AbortController().signal)).toEqual([]);
    expect(calls).toBe(1);
  });

  test('preserves a null seed for explicit generation without automatically posting', async () => {
    const methods: string[] = [];
    mockFetch((url, init) => {
      if (url.endsWith('/links')) return reply([record('legacy')]);
      methods.push(String(init.method));
      return reply(null);
    });
    expect(await readLinks('fixture-token', 'fixture-account', 'dedicated', new AbortController().signal))
      .toEqual([{ id: 'legacy', url: '' }]);
    expect(methods).toEqual(['GET']);
  });

  test('returns every dedicated link rather than only the first reference', async () => {
    mockFetch((url, init) => {
      if (url.endsWith('/links')) return reply([record('one'), record('two')]);
      expect(init.method).toBe('GET');
      return reply(link(url.includes('/one/') ? 'one' : 'two'));
    });
    expect(await readLinks('fixture-token', 'fixture-account', 'dedicated', new AbortController().signal))
      .toEqual([{ id: 'one', url: link('one').url }, { id: 'two', url: link('two').url }]);
  });

  test('does not request data after cancellation', async () => {
    const control = new AbortController();
    control.abort();
    let calls = 0;
    mockFetch(() => { calls++; return reply([]); });
    expect(await readLinks('fixture-token', 'fixture-account', 'dedicated', control.signal)).toEqual([]);
    expect(calls).toBe(0);
  });

  test('discards an account reference response completed after cancellation', async () => {
    const control = new AbortController();
    let calls = 0;
    mockFetch((url) => {
      calls++;
      expect(url).toBe('/api/v1/users/fixture-account/links');
      control.abort();
      return reply([record('old')]);
    });
    expect(await readLinks('fixture-token', 'fixture-account', 'dedicated', control.signal)).toEqual([]);
    expect(calls).toBe(1);
  });

  test('discards partial links when a later GET completes after cancellation', async () => {
    const control = new AbortController();
    mockFetch((url, init) => {
      if (url.endsWith('/links')) return reply([record('one'), record('two')]);
      expect(init.signal).toBeDefined();
      if (url.includes('/two/')) control.abort();
      return reply(link(url.includes('/one/') ? 'one' : 'two'));
    });
    expect(await readLinks('fixture-token', 'fixture-account', 'dedicated', control.signal)).toEqual([]);
  });

  test('does not retain partial links or seed placeholders after a GET error', async () => {
    for (const first of [link('one'), null]) {
      mockFetch((url, init) => {
        if (url.endsWith('/links')) return reply([record('one'), record('two')]);
        expect(init.method).toBe('GET');
        return url.includes('/one/') ? reply(first)
          : Response.json({ code: 'unavailable', data: null }, { status: 503 });
      });
      expect(await readLinks('fixture-token', 'fixture-account', 'dedicated', new AbortController().signal)).toEqual([]);
    }
  });

  test('rejects failed or malformed account reference responses without requesting links', async () => {
    for (const response of [Response.json({ code: 'forbidden', data: null }, { status: 403 }), reply(null), reply({ items: [] }), reply([{ id: '', kind: 'dedicated' }])]) {
      let calls = 0;
      mockFetch((url, init) => {
        calls++;
        expect(url).toBe('/api/v1/users/fixture-account/links');
        expect(init.method).toBe('GET');
        return response;
      });
      expect(await readLinks('fixture-token', 'fixture-account', 'dedicated', new AbortController().signal)).toEqual([]);
      expect(calls).toBe(1);
    }
  });

  test('rejects malformed successful link data without minting', async () => {
    mockFetch((url, init) => {
      expect(init.method).toBe('GET');
      return url.endsWith('/links') ? reply([record('one')]) : reply({});
    });
    expect(await readLinks('fixture-token', 'fixture-account', 'dedicated', new AbortController().signal)).toEqual([]);
  });
});
