import { describe, expect, test } from 'bun:test';
import { formatId } from '../src/utils/format';
import { actionText, menuChoices, menuPath, viewLabel } from '../src/views/access/model';
import type { NavMenu } from '../src/api/types';

const menu = (id: string, children: NavMenu[] = []): NavMenu => ({
  id, parent_id: null, code: id, title: id, path: '/'+id, view: null,
  icon: null, rank: 0, enabled: true, perm: null, children,
});

describe('management presentation', () => {
  test('preserves full display identifiers without changing their source', () => {
    const value = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    expect(formatId(value)).toBe(value);
    const long = 'a'.repeat(128);
    expect(formatId(long)).toBe(long);
    expect(value).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(formatId(123)).toBe('123');
    expect(formatId(null)).toBe('-');
    expect(formatId('')).toBe('-');
  });
  test('uses Chinese audit and view labels', () => {
    expect(actionText('user:reset_password')).toBe('重置用户密码');
    expect(actionText('access:change_account')).toBe('更新管理员');
    expect(actionText('unknown:action')).toBe('其他操作');
    expect(viewLabel('Accounts')).toBe('管理列表');
    expect(viewLabel(null)).toBe('目录');
  });
  test('preserves parent paths and excludes self and descendants', () => {
    const items = [menu('root', [menu('branch', [menu('leaf')]), menu('other')])];
    expect(menuPath(items, 'leaf')).toEqual(['root', 'branch', 'leaf']);
    expect(menuPath(items, 'missing')).toEqual([]);
    const options = menuChoices(items, 'branch');
    expect(options[0].children?.map(item => item.value)).toEqual(['other']);
    expect(menuChoices(items, 'root')).toEqual([]);
    expect(items[0].children[0].children[0].id).toBe('leaf');
  });
});
