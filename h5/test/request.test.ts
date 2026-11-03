import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ApiError, RequestTracker, call, newRequestId, request, setUnauthorizedHandler } from '../src/api/request';

const originalFetch = globalThis.fetch;
const notices = mock((_options: unknown) => {});

mock.module('@luna/components/toast', () => ({ showToast: notices }));

beforeEach(() => {
  notices.mockClear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setUnauthorizedHandler(() => true);
});

const mockFetch = (handler: (url: string, init: RequestInit) => Response | Promise<Response>): void => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    return await handler(url, init ?? {});
  }) as typeof fetch;
};

describe('request', () => {
  test('keeps background monitoring failures quiet while returning their error', async () => {
    mockFetch(() => Response.json({ code: 'unavailable', message: '服务暂不可用', data: null }, { status: 503 }));
    const result = await call('GET', '/v1/nodes/fixture', { token: 'fixture', quiet: true });
    expect(result.code).toBe('unavailable');
    expect(notices).not.toHaveBeenCalled();
  });
  test('retains session-expiry handling for quiet monitoring requests', async () => {
    const handle = mock(() => true);
    setUnauthorizedHandler(handle);
    mockFetch(() => Response.json({ code: 'unauthenticated', message: '登录已过期，请重新登录', data: null }, { status: 401 }));
    const result = await call('GET', '/v1/nodes/fixture', { token: 'fixture', quiet: true });
    expect(result.code).toBe('unauthenticated');
    expect(handle).toHaveBeenCalledWith('fixture');
    expect(notices).toHaveBeenCalledTimes(1);
  });
  test('cancels a monitoring fetch when its caller closes and emits no notice', async () => {
    const control = new AbortController();
    let signal: AbortSignal | null = null;
    mockFetch((_url, init) => new Promise((_resolve, reject) => {
      signal = init.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const pending = call('GET', '/v1/nodes/fixture', { token: 'fixture', quiet: true, signal: control.signal });
    control.abort();
    const result = await pending;
    expect(signal!.aborted).toBe(true);
    expect(result.code).toBe('network');
    expect(notices).not.toHaveBeenCalled();
  });
  test('sends bearer and unwraps envelope data', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return Response.json({ code: 'ok', message: '操作成功', data: { ok: true } });
    });
    const result = await request<{ ok: boolean }>('GET', '/v1/me', { token: 'token-abcdef123456' });
    expect(result.ok).toBe(true);
    expect(seenUrl).toBe('/api/v1/me');
    expect((seenInit?.headers as Record<string, string>).Authorization).toBe('Bearer token-abcdef123456');
  });

  test('prefers server envelope message over local mapping', async () => {
    mockFetch(async () => Response.json({ code: 'invalid', message: '服务端提示', data: null }, { status: 400 }));
    const error = await request('POST', '/v1/login', { body: {} }).catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('invalid');
    expect((error as ApiError).message).toBe('服务端提示');
  });

  test('appends list query', async () => {
    let seenUrl = '';
    mockFetch(async (url) => {
      seenUrl = url;
      return Response.json({ items: [], total: 0, offset: 20, limit: 20 });
    });
    await request('GET', '/v1/users', { token: 't', query: { offset: 20, limit: 20 } });
    expect(seenUrl).toBe('/api/v1/users?offset=20&limit=20');
  });

  test('maps failure codes', async () => {
    mockFetch(async () => Response.json({ code: 'forbidden' }, { status: 403 }));
    const error = await request('GET', '/v1/users', { token: 't' }).catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('forbidden');
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).message).toBe('没有执行该操作的权限');
  });

  test('clears session on 401', async () => {
    let cleared = false;
    setUnauthorizedHandler(() => {
      cleared = true;
      return true;
    });
    mockFetch(async () => Response.json({ code: 'unauthenticated' }, { status: 401 }));
    const error = await request('GET', '/v1/me', { token: 't' }).catch((cause) => cause);
    expect((error as ApiError).code).toBe('unauthenticated');
    expect(cleared).toBe(true);
  });

  test('network failure maps to unavailable text', async () => {
    mockFetch(async () => {
      throw new TypeError('offline');
    });
    const error = await request('GET', '/v1/me', { token: 't' }).catch((cause) => cause);
    expect((error as ApiError).code).toBe('network');
    expect((error as ApiError).message).toBe('网络异常，请检查连接后重试');
  });

  test('json body keeps exact content type', async () => {
    let contentType = '';
    let body = '';
    mockFetch(async (_url, init) => {
      contentType = (init.headers as Record<string, string>)['Content-Type'];
      body = String(init.body);
      return Response.json({ account: 'a', token: 't', expires_at: 1 });
    });
    await request('POST', '/v1/login', { body: { version: 1, email: 'a@b.c', password: 'x'.repeat(12) } });
    expect(contentType).toBe('application/json');
    const parsed = JSON.parse(body) as { version: number };
    expect(parsed.version).toBe(1);
  });
});

describe('session expiry', () => {
  test('shows one notice for four failures after the first invalidates the session', async () => {
    const handle = mock(() => false).mockReturnValueOnce(true);
    setUnauthorizedHandler(handle);
    mockFetch(() => Response.json({ code: 'unauthenticated' }, { status: 401 }));

    const results = await Promise.all(
      Array.from({ length: 4 }, () => call('GET', '/v1/me', { token: 'expired' })),
    );

    expect(results.every((result) => result.code === 'unauthenticated' && result.data === null)).toBe(true);
    expect(handle).toHaveBeenCalledTimes(4);
    expect(notices).toHaveBeenCalledTimes(1);
  });

  test('passes the failed credential to the handler and silences stale session responses', async () => {
    const handle = mock((token: string | null) => token === 'current');
    setUnauthorizedHandler(handle);
    mockFetch(() => Response.json({ code: 'unauthenticated' }, { status: 401 }));

    const result = await call('GET', '/v1/users', { token: 'previous' });

    expect(result.code).toBe('unauthenticated');
    expect(handle).toHaveBeenCalledWith('previous');
    expect(notices).not.toHaveBeenCalled();
    await call('GET', '/v1/users', { token: 'current' });
    expect(notices).toHaveBeenCalledTimes(1);
  });

  test('does not add notices for protected requests without a remaining credential', async () => {
    const handle = mock(() => false);
    setUnauthorizedHandler(handle);
    mockFetch(() => Response.json({ code: 'unauthenticated' }, { status: 401 }));

    await call('GET', '/v1/users', { token: '' });
    await call('GET', '/v1/users', { token: null });

    expect(handle).toHaveBeenCalledWith('');
    expect(handle).toHaveBeenCalledWith(null);
    expect(notices).not.toHaveBeenCalled();
  });

  test('can notify for a later session after suppressing duplicate failures', async () => {
    const handle = mock(() => false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    setUnauthorizedHandler(handle);
    mockFetch(() => Response.json({ code: 'unauthenticated' }, { status: 401 }));

    await call('GET', '/v1/me', { token: 'previous' });
    await call('GET', '/v1/users', { token: 'previous' });
    await call('GET', '/v1/me', { token: 'current' });

    expect(notices).toHaveBeenCalledTimes(2);
  });

  test('keeps every anonymous login failure visible without invalidating a session', async () => {
    const handle = mock(() => false);
    setUnauthorizedHandler(handle);
    mockFetch(() => Response.json({ code: 'unauthenticated', message: '账号或密码不正确' }, { status: 401 }));

    await call('POST', '/v1/login', { body: {} });
    await call('POST', '/v1/login', { body: {} });

    expect(handle).not.toHaveBeenCalled();
    expect(notices).toHaveBeenCalledTimes(2);
    expect(notices.mock.calls[0]?.[0]).toMatchObject({ message: '账号或密码不正确' });
  });

  test.each([401, 200])('recognizes expiry with HTTP status %s', async (status) => {
    const handle = mock(() => true);
    setUnauthorizedHandler(handle);
    mockFetch(() => status === 401
      ? new Response('Unauthorized', { status })
      : Response.json({ code: 'unauthenticated' }));

    const result = await call('GET', '/v1/me', { token: 'expired' });

    expect(result.code).toBe('unauthenticated');
    expect(result.message).toBe('登录状态已失效，请重新登录');
    expect(handle).toHaveBeenCalledTimes(1);
    expect(notices).toHaveBeenCalledTimes(1);
  });

  test('keeps forbidden errors independent and does not invalidate the session', async () => {
    const handle = mock(() => true);
    setUnauthorizedHandler(handle);
    mockFetch(() => Response.json({ code: 'forbidden' }, { status: 403 }));

    await call('GET', '/v1/users', { token: 'current' });
    await call('GET', '/v1/nodes', { token: 'current' });

    expect(handle).not.toHaveBeenCalled();
    expect(notices).toHaveBeenCalledTimes(2);
  });
});

describe('request identifiers', () => {
  test('newRequestId is 32 hex chars without separators', () => {
    const id = newRequestId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(newRequestId()).not.toBe(id);
  });

  test('same payload retries reuse the identifier', () => {
    const tracker = new RequestTracker();
    const first = tracker.id({ uses: 3, expires: 100 });
    const second = tracker.id({ uses: 3, expires: 100 });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{32}$/);
  });

  test('changed payload rotates the identifier', () => {
    const tracker = new RequestTracker();
    const first = tracker.id({ uses: 3, expires: 100 });
    const second = tracker.id({ uses: 4, expires: 100 });
    expect(second).not.toBe(first);
  });

  test('reset after success rotates the identifier', () => {
    const tracker = new RequestTracker();
    const first = tracker.id({ uses: 3 });
    tracker.reset();
    expect(tracker.id({ uses: 3 })).not.toBe(first);
  });
});
