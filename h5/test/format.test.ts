import { describe, expect, test } from 'bun:test';
import {
  formatBytes,
  formatId,
  formatMoney,
  formatQuota,
  formatTime,
  isEndpoint,
  isId,
  isIpv4,
  isPublicKey,
  orderStateText,
  parseTime,
  stateText,
  timeInput,
} from '../src/utils/format';
import type { Quota } from '../src/api/types';

describe('formatBytes', () => {
  test('renders byte units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.00 KiB');
    expect(formatBytes(1536)).toBe('1.50 KiB');
    expect(formatBytes(1024 * 1024 * 5)).toBe('5.00 MiB');
  });

  test('renders missing values', () => {
    expect(formatBytes(null)).toBe('-');
    expect(formatBytes(undefined)).toBe('-');
    expect(formatBytes(-1)).toBe('-');
  });
});

describe('formatMoney', () => {
  test('formats minor units', () => {
    expect(formatMoney(1280, 'CNY')).toContain('12.80');
    expect(formatMoney(0, 'USD')).toContain('0.00');
  });
});

describe('local time helpers', () => {
  test('roundtrips local time without losing seconds', () => {
    const seconds = new Date(2026, 0, 2, 3, 4, 5).getTime() / 1000;
    expect(parseTime('2026-01-02T03:04:05')).toBe(seconds);
    expect(timeInput(seconds)).toBe('2026-01-02T03:04:05');
    expect(parseTime(timeInput(seconds))).toBe(seconds);
    expect(parseTime('2026-01-02T03:04')).toBe(seconds - 5);
  });

  test('rejects malformed input and impossible dates', () => {
    for (const value of [
      '', 'not-a-date', '2026-02-29T12:00', '2026-04-31T12:00',
      '2026-13-01T12:00', '2026-01-00T12:00', '2026-01-01T24:00',
      '2026-01-01T12:60', '2026-01-01T12:00:60', '2026-01-01T12:00Z',
      '2026-01-01T12:00:00 trailing',
    ]) expect(parseTime(value)).toBeNull();
    expect(parseTime('2028-02-29T12:00:01')).not.toBeNull();
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/New_York') {
      expect(parseTime('2026-03-08T02:30:00')).toBeNull();
    }
  });

  test('formats full local time without a timezone suffix', () => {
    const seconds = new Date(2026, 10, 24, 8, 5, 9).getTime() / 1000;
    expect(formatTime(seconds)).toBe('2026-11-24 08:05:09');
    expect(formatTime(null)).toBe('-');
    expect(timeInput(null)).toBe('');
  });
});

describe('validators', () => {
  test('preserves full IDs for component overflow handling', () => {
    for (const value of ['01ARZ3NDEKTSV4RRFFQ69G5FAV', 'a'.repeat(32)]) {
      expect(formatId(value)).toBe(value);
    }
    expect(formatId(null)).toBe('-');
    expect(formatId('')).toBe('-');
    expect(formatId(0)).toBe('0');
  });
  test('ids are 32 hex chars', () => {
    expect(isId('a'.repeat(32))).toBe(true);
    expect(isId('0'.repeat(32))).toBe(true);
    expect(isId('A'.repeat(32))).toBe(false);
    expect(isId('a'.repeat(31))).toBe(false);
    expect(isId('g'.repeat(32))).toBe(false);
  });

  test('public keys are 44-char padded base64', () => {
    expect(isPublicKey(`${'A'.repeat(43)}=`)).toBe(true);
    expect(isPublicKey('A'.repeat(44))).toBe(false);
    expect(isPublicKey(`${'A'.repeat(42)}==`)).toBe(false);
  });

  test('ipv4 addresses', () => {
    expect(isIpv4('10.8.0.1')).toBe(true);
    expect(isIpv4('255.255.255.255')).toBe(true);
    expect(isIpv4('256.0.0.1')).toBe(false);
    expect(isIpv4('10.8.0')).toBe(false);
    expect(isIpv4('::1')).toBe(false);
  });

  test('endpoints require host and port', () => {
    expect(isEndpoint('10.8.0.1:8443')).toBe(true);
    expect(isEndpoint('[::1]:8443')).toBe(true);
    expect(isEndpoint('10.8.0.1:')).toBe(false);
    expect(isEndpoint('10.8.0.1:0')).toBe(false);
    expect(isEndpoint('10.8.0.1')).toBe(false);
  });
});

describe('state text', () => {
  test('maps states', () => {
    expect(stateText('active')).toBe('已启用');
    expect(stateText('disabled')).toBe('已禁用');
    expect(orderStateText('pending')).toBe('待支付');
    expect(orderStateText('paid')).toBe('已支付');
    expect(orderStateText('cancelled')).toBe('已取消');
  });

  test('quota summary', () => {
    const quota: Quota = {
      limit_bytes: 150_000_000_000,
      used_bytes: 42_231_426_100,
      reserved_bytes: 0,
      remaining_bytes: 107_768_573_900,
    };
    expect(formatQuota(quota)).toBe('42.231 GB / 150 GB');
    expect(formatQuota(null)).toBe('-');
  });
});
