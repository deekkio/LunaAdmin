import { describe, expect, test } from 'bun:test';

const defer = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => { resolve = done; });
  return { promise, resolve };
};

for (const [name, path] of [
  ['PC', '../src/views/users/Devices.svelte'],
  ['H5', '../../h5/src/views/users/Devices.svelte'],
] as const) {
  const source = await Bun.file(new URL(path, import.meta.url)).text();
  const script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)![1]!
    .replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  const create = new Function('api', 'session', 'showMessage', 'showToast', 'untrack', '$state', '$props', '$bindable', '$effect', 'RequestTracker',
    new Bun.Transpiler({ loader: 'ts' }).transformSync(script) + `
    return { load, remove, get items() { return items; }, get total() { return total; },
      get loading() { return loading; }, close() { open = false; },
      account(value) { account = value; } };
  `);

  const makeView = () => {
    const calls: Array<{ account: string; offset: number; limit: number; signal: AbortSignal }> = [];
    const pending: ReturnType<typeof defer>[] = [];
    const notices: unknown[] = [];
    const session = { token: 'fixture-session', writable: true, canRead: (value: string) => value !== 'user:write' || session.writable };
    const drops: Array<{ account: string; input: unknown }> = [];
    const mutations: ReturnType<typeof defer>[] = [];
    const effects: Array<() => void | (() => void)> = [];
    const view = create({ devices: (_token: string, account: string, offset: number, limit: number, signal: AbortSignal) => {
      calls.push({ account, offset, limit, signal });
      const request = defer(); pending.push(request); return request.promise;
    }, deleteDevice: (_token: string, account: string, input: unknown) => {
      drops.push({ account, input }); const result = defer(); mutations.push(result); return result.promise;
    } }, session, (value: unknown) => notices.push(value), (value: unknown) => notices.push(value),
    (callback: () => void) => callback(), (value: unknown) => value,
    () => ({ open: true, account: 'fixture-account', username: 'fixture-user' }),
    (value: unknown) => value, (effect: () => void | (() => void)) => effects.push(effect),
    class { id() { return 'fixture-request'; } reset() {} });
    const reply = (index: number, total = 65) => pending[index]!.resolve({
      code: 0, data: { items: [{ id: `fixture-device-${index}` }], total },
    });
    return { view, calls, pending, notices, session, effects, reply, drops, mutations };
  };

  describe(`${name} device dialog`, () => {
    test('uses server totals and requests only the chosen account and page', async () => {
      const fixture = makeView();
      const first = fixture.view.load(1);
      fixture.reply(0); await first;
      expect(fixture.view.total).toBe(65);
      const second = fixture.view.load(2);
      fixture.reply(1); await second;
      expect(fixture.calls.map(({ account, offset, limit }) => ({ account, offset, limit }))).toEqual([
        { account: 'fixture-account', offset: 0, limit: 10 },
        { account: 'fixture-account', offset: 10, limit: 10 },
      ]);
      expect(fixture.view.items).toEqual([{ id: 'fixture-device-1' }]);
      expect(fixture.view.loading).toBe(false);
    });

    test('aborts prior pages and rejects their late results', async () => {
      const fixture = makeView();
      const first = fixture.view.load(1);
      const second = fixture.view.load(2);
      expect(fixture.calls[0]!.signal.aborted).toBe(true);
      fixture.reply(1, 9); await second;
      fixture.reply(0, 99); await first;
      expect(fixture.view.total).toBe(9);
      expect(fixture.view.items).toEqual([{ id: 'fixture-device-1' }]);
    });

    for (const action of ['close', 'account', 'session']) {
      test(`ignores a pending response after ${action} changes`, async () => {
        const fixture = makeView();
        const request = fixture.view.load(1);
        if (action === 'close') fixture.view.close();
        else if (action === 'account') fixture.view.account('fixture-other');
        else fixture.session.token = 'fixture-renewed';
        fixture.reply(0); await request;
        expect(fixture.view.items).toEqual([]);
        expect(fixture.view.total).toBeNull();
        expect(fixture.notices).toEqual([]);
      });
    }

    test('deletes on the server and returns to the previous page after its last device', async () => {
      const fixture = makeView();
      const request = fixture.view.load(2); fixture.reply(0, 11); await request;
      const removed = fixture.view.remove({ id: 'fixture-device' });
      expect(fixture.drops).toEqual([{ account: 'fixture-account', input: {
        version: 1, request: 'fixture-request', device: 'fixture-device',
      } }]);
      expect(fixture.calls).toHaveLength(1);
      fixture.mutations[0]!.resolve({ code: '', data: null });
      await Promise.resolve();
      expect(fixture.calls[1]?.offset).toBe(0);
      fixture.reply(1, 10); await removed;
      expect(fixture.view.total).toBe(10);
    });

    test('keeps rows when the server rejects deletion and prevents duplicate writes', async () => {
      const fixture = makeView();
      const request = fixture.view.load(1); fixture.reply(0); await request;
      const removed = fixture.view.remove({ id: 'fixture-device' });
      await fixture.view.remove({ id: 'fixture-device' });
      expect(fixture.drops).toHaveLength(1);
      fixture.mutations[0]!.resolve({ code: 'forbidden', message: '无权限' }); await removed;
      expect(fixture.view.items).toEqual([{ id: 'fixture-device-0' }]);
      expect(fixture.calls).toHaveLength(1);
      fixture.session.writable = false;
      await fixture.view.remove({ id: 'fixture-device' });
      expect(fixture.drops).toHaveLength(1);
    });
  });
}
