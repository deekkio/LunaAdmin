import { expect, test } from 'bun:test';
import { dateRange, moneyValue } from '../src/views/dashboard/model';

test('dates include both selected calendar days and preserve local midnight', () => {
  expect(dateRange('', '')).toEqual({ version: 1, start: null, end: null });
  const range = dateRange('2026-10-01', '2026-10-29');
  expect(range.start).toBe(new Date(2026, 9, 1).getTime() / 1000);
  expect(range.end).toBe(new Date(2026, 9, 30).getTime() / 1000);
  expect(dateRange('2024-02-29', '2024-02-29').end).toBe(new Date(2024, 2, 1).getTime() / 1000);
});

test('date validation rejects partial, reversed and invalid ranges', () => {
  for (const [start, end] of [
    ['2026-10-01', ''], ['', '2026-10-01'], ['2026-10-02', '2026-10-01'],
    ['2026-02-29', '2026-03-01'], ['2026-13-01', '2026-13-02'], ['2026-1-01', '2026-01-02'],
  ]) expect(() => dateRange(start, end)).toThrow();
});

test('a daylight saving day ends at the next local midnight', () => {
  const file = new URL('../src/views/dashboard/model.ts', import.meta.url).pathname;
  const output = Bun.spawnSync(['bun', '-e',
    `import { dateRange } from ${JSON.stringify(file)}; const range=dateRange('2026-03-08','2026-03-08'); process.stdout.write(String(range.end-range.start));`,
  ], { env: { ...process.env, TZ: 'America/New_York' } });
  expect(output.exitCode).toBe(0);
  expect(output.stdout.toString()).toBe('82800');
});

test('money totals preserve minor-unit precision beyond safe integers', () => {
  expect(moneyValue('0')).toBe('0.00');
  expect(moneyValue('199')).toBe('1.99');
  expect(moneyValue('9007199254740993123')).toBe('90071992547409931.23');
  expect(moneyValue('invalid')).toBe('');
});
