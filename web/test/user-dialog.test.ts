import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

type Kind = 'subscription' | 'dedicated';
type Item = { id: string; url: string };
type Effect = () => void | (() => void);
type Reply = { code: number; data: { url: string } };

const defer = <Value>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
};

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

const makeDialog = (modal = true, routeId = '') => {
  const source = readFileSync(new URL('../src/views/users/Detail.svelte', import.meta.url), 'utf8');
  const script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)![1]!
    .replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  const effects: Effect[] = [];
  const cleanups: Array<undefined | (() => void)> = [];
  const writes: string[] = [];
  const routes: string[] = [];
  const reads: Array<{ token: string; account: string; kind: Kind; signal: AbortSignal }> = [];
  const mints: string[] = [];
  const changes: Array<{ token: string; account: string; input: { version: number; group: string } }> = [];
  const session = { token: 'fixture-session-a', authenticated: true, canWrite: true, canRead: () => true };
  const sources: Record<Kind, Item[]> = {
    subscription: [{ id: 'fixture-sub', url: 'subscribe://fixture/subscription' }],
    dedicated: [{ id: 'fixture-first', url: 'luna://fixture/first' }, { id: 'fixture-second', url: 'luna://fixture/second' }],
  };
  let read = async (_token: string, _account: string, kind: Kind, _signal: AbortSignal): Promise<Item[]> => structuredClone(sources[kind]);
  let mint = async (_token: string, id: string): Promise<Reply> => ({ code: 0, data: { url: `luna://fixture/${id}` } });
  const create = new Function('api', 'session', 'navigator', 'RequestTracker', 'readLinks', 'showMessage', 'showToast', 'onDestroy', 'untrack', '$state', '$derived', '$effect', '$props', 'useRoute', 'useRouter', 'pagePath', 'navigation', transpiler.transformSync(script) + `
    return { copyLink, saveGroup, close, setGroup(value) { model.group = value; }, get user() { return user; }, setOpen(value) { open = value; }, setId(value) { id = value; }, get links() { return links; } };
  `);
  const dialog = create(
    {
      user: async (_token: string, id: string) => ({ code: 0, data: { group: { id: '01K00000000000000000000000', name: '默认分组' }, profile: { account: id, email: 'fixture@example.invalid', state: 'active' } } }),
      changeUser: async (token: string, account: string, input: { version: number; group: string }) => {
        changes.push({ token, account, input });
        return { code: 0, data: { group: { id: input.group, name: '分组1' }, profile: { account, email: 'fixture@example.invalid', state: 'active' } } };
      },
      mintLink: async (token: string, id: string) => { mints.push(id); return mint(token, id); },
    },
    session,
    { clipboard: { writeText: async (value: string) => { writes.push(value); } } },
    class { reset() {} },
    (token: string, account: string, kind: Kind, signal: AbortSignal) => {
      reads.push({ token, account, kind, signal });
      return read(token, account, kind, signal);
    },
    () => {}, () => {}, () => {}, (callback: () => void) => callback(),
    (value: unknown) => value, (value: unknown) => value,
    (callback: Effect) => effects.push(callback),
    () => ({ modal, open: false, id: routeId ? undefined : 'fixture-account-a', mode: 'detail' }),
    () => ({ params: { id: routeId } }),
    () => ({ replace: async (path: string) => { routes.push(path); } }),
    () => '/users', { menu: [] },
  );
  const run = (index: number) => {
    cleanups[index]?.();
    const result = effects[index]!();
    cleanups[index] = typeof result === 'function' ? result : undefined;
  };
  return {
    dialog, session, sources, writes, reads, mints, changes, routes,
    async open(value = true) {
      dialog.setOpen(value);
      run(0);
      run(1);
      await flush();
      if (value) run(1);
      await flush();
    },
    async change(value: string) {
      dialog.setId(value);
      run(0);
      run(1);
      await flush();
      run(1);
      await flush();
    },
    async renew() { session.token = 'fixture-session-b'; run(1); await flush(); },
    read(value: typeof read) { read = value; },
    mint(value: typeof mint) { mint = value; },
  };
};

describe('user link dialog', () => {
  test('copies each kind independently and joins every dedicated URL with newlines', async () => {
    const fixture = makeDialog();
    await fixture.open();
    await fixture.dialog.copyLink('subscription');
    await fixture.dialog.copyLink('dedicated');
    expect(fixture.writes).toEqual([
      'subscribe://fixture/subscription',
      'luna://fixture/first\nluna://fixture/second',
    ]);
    expect(fixture.mints).toEqual([]);
    expect(fixture.reads.map((value) => value.kind)).toEqual(['subscription', 'dedicated']);
  });

  test('does not mint for an empty kind and repairs a missing seed only on copy', async () => {
    const fixture = makeDialog();
    fixture.sources.subscription = [{ id: 'fixture-missing', url: '' }];
    fixture.sources.dedicated = [];
    await fixture.open();
    expect(fixture.mints).toEqual([]);
    await fixture.dialog.copyLink('dedicated');
    expect(fixture.mints).toEqual([]);
    expect(fixture.writes).toEqual([]);
    await fixture.dialog.copyLink('subscription');
    await fixture.dialog.copyLink('subscription');
    expect(fixture.mints).toEqual(['fixture-missing']);
    expect(fixture.writes).toEqual(['luna://fixture/fixture-missing', 'luna://fixture/fixture-missing']);
  });

  test('allows one kind to copy while the other kind is waiting for a seed', async () => {
    const fixture = makeDialog();
    fixture.sources.subscription = [{ id: 'fixture-missing', url: '' }];
    const response = defer<Reply>();
    fixture.mint(() => response.promise);
    await fixture.open();
    const pending = fixture.dialog.copyLink('subscription');
    await fixture.dialog.copyLink('subscription');
    await fixture.dialog.copyLink('dedicated');
    expect(fixture.mints).toEqual(['fixture-missing']);
    expect(fixture.writes).toEqual(['luna://fixture/first\nluna://fixture/second']);
    response.resolve({ code: 0, data: { url: 'subscribe://fixture/repaired' } });
    await pending;
    expect(fixture.writes[1]).toBe('subscribe://fixture/repaired');
  });

  for (const action of ['close', 'account', 'session']) {
    test(`rejects a pending mint after ${action} changes`, async () => {
      const fixture = makeDialog();
      fixture.sources.subscription = [{ id: 'fixture-missing', url: '' }];
      const response = defer<Reply>();
      fixture.mint(() => response.promise);
      await fixture.open();
      const pending = fixture.dialog.copyLink('subscription');
      if (action === 'close') await fixture.open(false);
      else if (action === 'account') await fixture.change('fixture-account-b');
      else await fixture.renew();
      response.resolve({ code: 0, data: { url: 'subscribe://fixture/stale' } });
      await pending;
      expect(fixture.mints).toEqual(['fixture-missing']);
      expect(fixture.writes).toEqual([]);
    });

    test(`aborts and ignores pending lists after ${action} changes`, async () => {
      const fixture = makeDialog();
      const responses = [defer<Item[]>(), defer<Item[]>()];
      let index = 0;
      fixture.read((token, account, kind) => token === 'fixture-session-a' && account === 'fixture-account-a'
        ? responses[index++]!.promise
        : Promise.resolve(structuredClone(fixture.sources[kind])));
      await fixture.open();
      const prior = [...fixture.reads];
      if (action === 'close') await fixture.open(false);
      else if (action === 'account') await fixture.change('fixture-account-b');
      else await fixture.renew();
      expect(prior.every((value) => value.signal.aborted)).toBe(true);
      for (const response of responses) response.resolve([{ id: 'fixture-stale', url: 'luna://fixture/stale' }]);
      await flush();
      const items = Object.values(fixture.dialog.links) as Array<{ items: Item[] }>;
      expect(items.flatMap((value) => value.items).some((value) => value.id === 'fixture-stale')).toBe(false);
      expect(fixture.writes).toEqual([]);
    });
  }
});

test('saves only the selected node group without changing account state or passwords', async () => {
  const fixture = makeDialog();
  await fixture.open();
  await fixture.dialog.saveGroup(true);
  expect(fixture.changes).toEqual([]);
  fixture.dialog.setGroup('01K00000000000000000000001');
  await fixture.dialog.saveGroup(true);
  expect(fixture.changes).toEqual([{ token: 'fixture-session-a', account: 'fixture-account-a',
    input: { version: 1, group: '01K00000000000000000000001' } }]);
  expect(fixture.dialog.user.group.name).toBe('分组1');
  expect(fixture.mints).toEqual([]);
});

test('uses the route account and returns after closing only in page mode', async () => {
  const page = makeDialog(false, 'fixture-account-route');
  await page.open();
  expect(page.dialog.user.profile.account).toBe('fixture-account-route');
  page.dialog.close();
  expect(page.routes).toEqual(['/users']);
  const modal = makeDialog();
  modal.dialog.close();
  expect(modal.routes).toEqual([]);
});
