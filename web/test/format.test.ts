import { describe, expect, test } from 'bun:test';
import {
  formatBytes,
  formatId,
  formatMoney,
  formatTime,
  parseTime,
  stateText,
  timeInput,
} from '../src/utils/format';

describe('formatBytes', () => {
  test('renders byte units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.00 KiB');
    expect(formatBytes(1536)).toBe('1.50 KiB');
    expect(formatBytes(1024 * 1024 * 5)).toBe('5.00 MiB');
    expect(formatBytes(10 * 1024)).toBe('10.0 KiB');
    expect(formatBytes(100 * 1024)).toBe('100 KiB');
    expect(formatBytes(1024 ** 2 - 1)).toBe('1024 KiB');
    expect(formatBytes(1024 ** 6)).toBe('1024 PiB');
  });

  test('renders missing values', () => {
    expect(formatBytes(null)).toBe('-');
    expect(formatBytes(undefined)).toBe('-');
    expect(formatBytes(-1)).toBe('-');
    expect(formatBytes(NaN)).toBe('-');
    expect(formatBytes(Infinity)).toBe('-');
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

describe('identifiers', () => {
  test('preserves full IDs for component overflow handling', () => {
    for (const value of ['01ARZ3NDEKTSV4RRFFQ69G5FAV', 'a'.repeat(32)]) {
      expect(formatId(value)).toBe(value);
    }
    expect(formatId(null)).toBe('-');
    expect(formatId('')).toBe('-');
    expect(formatId(0)).toBe('0');
  });
});

describe('state text', () => {
  test('maps states', () => {
    expect(stateText('active')).toBe('已启用');
    expect(stateText('disabled')).toBe('已禁用');
  });
});
