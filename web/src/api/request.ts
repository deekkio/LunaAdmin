// 同源 /api 请求、响应信封与会话失效通知。
import { showMessage } from '@luna/components/message';
import type { Code, Envelope, RequestOptions, Result, UnauthorizedHandler } from './types';

const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: Code | 'network';
  readonly silent: boolean;

  constructor(status: number, code: Code | 'network', serverMessage = '', silent = false) {
    super(serverMessage || message(code));
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.silent = silent;
  }
}

export const message = (code: Code | 'network'): string => {
  switch (code) {
    case 'unauthenticated':
      return '登录状态已失效，请重新登录';
    case 'forbidden':
      return '没有执行该操作的权限';
    case 'invalid':
      return '请求内容未通过校验';
    case 'missing':
      return '资源不存在';
    case 'conflict':
      return '内容冲突，请刷新后重试';
    case 'quota':
      return '配额不足';
    case 'device_limit':
      return '设备数量超上限';
    case 'rate_limited':
      return '请求过于频繁，请稍后再试';
    case 'unavailable':
      return '服务暂时不可用，请稍后再试';
    default:
      return '网络异常，请检查连接后重试';
  }
};

export const errorText = (error: unknown): string => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return message('network');
};

export const isUnauthorized = (error: unknown): boolean => {
  return error instanceof ApiError && error.code === 'unauthenticated';
};

let onUnauthorized: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (handler: UnauthorizedHandler): void => {
  onUnauthorized = handler;
};

/**
 * 统一响应封装：不抛异常，失败返回错误码与提示并自动弹出 Message。
 * 视图层只需判断 code 是否为空。
 */
export const call = async <T>(method: string, path: string, options: RequestOptions = {}): Promise<Result<T>> => {
  try {
    const data = await request<T>(method, path, options);
    return { code: '', message: '', data };
  } catch (cause) {
    const code = cause instanceof ApiError ? cause.code : 'network';
    const text = errorText(cause);
    if ((!options.quiet || code === 'unauthenticated') && !(cause instanceof ApiError && cause.silent)) {
      showMessage({ message: text, type: 'error' });
    }
    return { code, message: text, data: null };
  }
};

export const request = async <T>(method: string, path: string, options: RequestOptions = {}): Promise<T> => {
  let url = `/api${path}`;
  if (options.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    const signal = options.signal ? AbortSignal.any([control.signal, options.signal]) : control.signal;
    response = await fetch(url, { method, headers, body, signal });
  } catch {
    throw new ApiError(0, 'network');
  } finally {
    clearTimeout(timer);
  }

  let payload: Envelope | undefined;
  try {
    payload = (await response.json()) as Envelope;
  } catch {
    payload = undefined;
  }

  if (response.status === 401 || payload?.code === 'unauthenticated') {
    // 当前会话只处理一次；匿名登录失败仍正常提示，旧会话响应不重复提示。
    const silent = options.token !== undefined && onUnauthorized?.(options.token) === false;
    throw new ApiError(
      response.status,
      'unauthenticated',
      typeof payload?.message === 'string' ? payload.message : '',
      silent,
    );
  }

  // 服务端统一信封：成功 code 为 "ok"（兼容空字符串），成功时取 data。
  if (payload && typeof payload.code === 'string') {
    if (payload.code === 'ok' || payload.code === '') {
      if (!response.ok) {
        throw new ApiError(response.status, response.status === 404 ? 'missing' : 'unavailable');
      }
      return payload.data as T;
    }
    throw new ApiError(
      response.status,
      payload.code as Code,
      typeof payload.message === 'string' ? payload.message : ''
    );
  }

  if (!response.ok) {
    const code: Code = response.status === 404 ? 'missing' : 'unavailable';
    throw new ApiError(response.status, code);
  }
  return payload as T;
};

const HEX = '0123456789abcdef';

/** 无连字符的 32 位十六进制随机请求标识。 */
export const newRequestId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (const byte of bytes) {
    out += HEX[byte >> 4];
    out += HEX[byte & 0x0f];
  }
  return out;
};

/**
 * 幂等表单的请求标识：相同内容失败重试保留标识，成功或修改内容后更换。
 */
export class RequestTracker {
  #key = '';
  #id = newRequestId();

  id = (payload: unknown): string => {
    const key = JSON.stringify(payload ?? null);
    if (key !== this.#key) {
      this.#key = key;
      this.#id = newRequestId();
    }
    return this.#id;
  };

  reset = (): void => {
    this.#key = '';
  };
}
