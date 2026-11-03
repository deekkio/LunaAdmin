import { describe, expect, test } from 'bun:test';
import type { List, Result } from '../src/api/types';
import { compileModule } from 'svelte/compiler';

const source = await Bun.file(new URL('../src/components/list.svelte.ts', import.meta.url)).text();
const script = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
const compiled = compileModule(script, { filename: 'list.svelte.js', generate: 'client' }).js.code
  .replace('svelte/internal/client', import.meta.resolve('svelte/internal/client'));
const { Pager } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`) as typeof import('../src/components/list.svelte');

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
    failed = true;
    await pager.refresh();
    expect(pager.items).toEqual([]);
    expect(pager.total).toBe(0);
    expect(pager.loading).toBe(false);
    expect(pager.loaded).toBe(true);
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

test('resizing resets the page and rejects unsupported page sizes', async () => {
  const limits: number[] = [];
  const pager = new Pager<number>(async (_offset, limit) => {
    limits.push(limit);
    return result([1], 30);
  });
  pager.page = 3;

  pager.resize(20);
  await Promise.resolve();
  expect(pager.page).toBe(1);
  expect(pager.pageSize).toBe(20);
  pager.resize(999);
  await Promise.resolve();
  expect(pager.pageSize).toBe(10);
  expect(limits).toEqual([20, 10]);
});
