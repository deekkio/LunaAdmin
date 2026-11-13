import { describe, expect, test } from 'bun:test';

for (const [name, path] of [
  ['PC', '../src/views/users/Detail.svelte'],
  ['H5', '../../h5/src/views/users/Detail.svelte'],
] as const) {
  const source = await Bun.file(new URL(path, import.meta.url)).text();
  const script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)![1]!
    .replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  const create = new Function('api', 'session', 'RequestTracker', 'onDestroy', 'untrack', 'showMessage', 'showToast', '$state', '$derived', '$effect', '$props', 'useRoute', 'useRouter',
    new Bun.Transpiler({ loader: 'ts' }).transformSync(script) + '\nreturn { load, save };');
  const makeView = (mode: 'create' | 'edit') => {
    const writes: Array<{ action: string; input: Record<string, unknown> }> = [];
    const user = { device_limit: 4, group: { id: 'fixture-group', name: '默认分组' },
      profile: { account: 'fixture-account', email: 'fixture@example.test', state: 'active' } };
    const record = (action: string, input: Record<string, unknown>) => {
      writes.push({ action, input }); return { code: 0, data: user };
    };
    const view = create({
      user: async () => ({ code: 0, data: user }),
      createUser: async (_token: string, input: Record<string, unknown>) => record('create', input),
      changeUser: async (_token: string, _id: string, input: Record<string, unknown>) => record('edit', input),
    }, { token: 'fixture-session', canWrite: true, canRead: () => true },
    class { id() { return 'fixture-request'; } reset() {} },
    () => {}, (callback: () => void) => callback(), () => {}, () => {},
    (value: unknown) => value, (value: unknown) => value, () => {},
    () => ({ modal: true, open: true, id: 'fixture-account', mode }),
    () => ({ params: {} }), () => ({ replace: async () => {} }));
    return { view, writes };
  };

  describe(`${name} device limits`, () => {
    test('new users submit the default limit of five', async () => {
      const fixture = makeView('create');
      await fixture.view.save(true);
      expect(fixture.writes).toHaveLength(1);
      expect(fixture.writes[0]!.action).toBe('create');
      expect(fixture.writes[0]!.input.device_limit).toBe(5);
    });
    test('editing preserves an existing limit of four', async () => {
      const fixture = makeView('edit');
      await fixture.view.load('fixture-account');
      await fixture.view.save(true);
      expect(fixture.writes).toHaveLength(1);
      expect(fixture.writes[0]!.action).toBe('edit');
      expect(fixture.writes[0]!.input.device_limit).toBe(4);
    });
  });
}
