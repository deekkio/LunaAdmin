import { describe, expect, test } from 'bun:test';
import { listFilter } from '../src/api/index';
import { pageModule } from './view';

const { actionText } = await pageModule(new URL('../src/views/access/Menus.svelte', import.meta.url));

describe('access searches', () => {
  test('normalizes unselected filters and preserves literal search characters', () => {
    expect(listFilter('  搜索 %_  ')).toEqual({ query: '搜索 %_', state: null, kind: null, action: null });
    expect(listFilter('operator', 'disabled', 'admin')).toEqual({
      query: 'operator', state: 'disabled', kind: 'admin', action: null,
    });
    const applied = listFilter('first');
    const pending = { ...applied };
    applied.query = 'second';
    expect(pending.query).toBe('first');
  });
  test('renders cleanup events in Chinese', () => {
    expect(actionText('audit:clear')).toBe('清理日志');
  });
});
