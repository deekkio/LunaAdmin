import { describe, expect, test } from 'bun:test';
import type { Result } from '../src/api/request';
import type { List } from '../src/api/types';
import { Pager } from '../src/stores/pager';

const result = (items: number[], total = items.length): Result<List<number>> => ({
  code: '',
  message: '',
  data: { items, total, offset: 0, limit: 10 },
});

describe('pager state', () => {
  test('loads ten records per page and updates the visible page after navigation', async () => {
    const offsets: number[] = [];
    const pager = new Pager<number>(async (offset, limit) => {
      offsets.push(offset);
      return result(
        Array.from({ length: limit }, (_, index) => offset + index + 1),
        30,
      );
    });

    await pager.refresh();
    expect(pager.pageSize).toBe(10);
    expect(pager.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pager.total).toBe(30);
    expect(pager.loaded).toBe(true);
    expect(pager.loading).toBe(false);
    pager.goto(2);
    await Promise.resolve();
    expect(offsets).toEqual([0, 10]);
    expect(pager.page).toBe(2);
    expect(pager.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  test.each([0, 1])(
    'keeps the latest request authoritative regardless of response order %s',
    async (index) => {
      const pending: ((value: Result<List<number>>) => void)[] = [];
      const pager = new Pager<number>(() => new Promise((resolve) => pending.push(resolve)));
      const tasks = [pager.refresh(), pager.refresh()];

      expect(pager.loading).toBe(true);
      pending[index]!(result([index + 1]));
      await tasks[index];
      expect(pager.items).toEqual(index === 1 ? [2] : []);
      expect(pager.loading).toBe(index === 0);
      pending[1 - index]!(result([2 - index]));
      await tasks[1 - index];
      expect(pager.items).toEqual([2]);
      expect(pager.loading).toBe(false);
    },
  );

  test('clears previous records on failure and ends the loading state', async () => {
    let failed = false;
    const pager = new Pager<number>(async () =>
      failed ? { code: 'unavailable', message: '不可用', data: null } : result([1, 2]),
    );

    await pager.refresh();
    expect(pager.items).toEqual([1, 2]);
    expect(pager.failed).toBe(false);
    failed = true;
    await pager.refresh();
    expect(pager.items).toEqual([]);
    expect(pager.total).toBe(0);
    expect(pager.loading).toBe(false);
    expect(pager.loaded).toBe(true);
    expect(pager.failed).toBe(true);
    failed = false;
    await pager.refresh();
    expect(pager.failed).toBe(false);
    expect(pager.items).toEqual([1, 2]);
  });

  test('returns to a valid page when the total shrinks', async () => {
    const offsets: number[] = [];
    const pager = new Pager<number>(async (offset) => {
      offsets.push(offset);
      return result(offset === 10 ? [11, 12] : [], 12);
    });
    pager.page = 4;

    await pager.refresh();

    expect(offsets).toEqual([30, 10]);
    expect(pager.page).toBe(2);
    expect(pager.items).toEqual([11, 12]);
    expect(pager.loading).toBe(false);
  });
});
