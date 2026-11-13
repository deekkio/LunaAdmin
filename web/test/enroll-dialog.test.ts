import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { pageModule } from './view';

const { command, control, ingress, settings } = await pageModule(new URL('../src/views/nodes/EnrollDialog.svelte', import.meta.url));

const makeDialog = () => {
  const source = readFileSync(new URL('../src/views/nodes/EnrollDialog.svelte', import.meta.url), 'utf8');
  const script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)![1]!
    .replace(/^\s*import[^\n]*;\s*$/gm, '');
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  let effect = () => {};
  let expire = () => {};
  let calls = 0;
  const writes: string[] = [];
  const permit = { token: Buffer.alloc(32, 1).toString('base64url'), expires_at: Math.floor(Date.now() / 1000) + 600 };
  let respond = async () => ({ code: 0, data: permit });
  const create = new Function('api', 'session', 'navigator', 'window', 'control', 'ingress', 'command', 'settings', 'showMessage', 'showToast', 'onDestroy', 'untrack', '$state', '$effect', '$props', 'setTimeout', 'clearTimeout', transpiler.transformSync(script) + `
    return { model, copy, copyPermit, setOpen(value) { open = value; }, get loading() { return loading; } };
  `);
  const dialog = create(
    { enroll: async () => { calls++; return respond(); } },
    { canWrite: true, token: 'fixture-session' },
    { clipboard: { writeText: async (value: string) => { writes.push(value); } } },
    { location: { origin: 'https://example.com' } },
    control, ingress, command, settings, () => {}, () => {}, () => {},
    (callback: () => void) => callback(), (value: unknown) => value,
    (callback: () => void) => { effect = callback; }, () => ({ open: false }),
    (callback: () => void) => { expire = callback; return 1; }, () => {},
  );
  return {
    dialog, writes, permit,
    get calls() { return calls; },
    open(value = true) { dialog.setOpen(value); effect(); },
    expire() { expire(); },
    respond(value: typeof respond) { respond = value; },
  };
};

describe('enrollment dialog', () => {
  test('does not generate authorization on open, field edits or installation copy', async () => {
    const fixture = makeDialog();
    fixture.open();
    fixture.dialog.model.name = 'New node';
    fixture.dialog.model.control = 'https://example.com:19447';
    await fixture.dialog.copy();
    expect(fixture.calls).toBe(0);
    expect(fixture.writes).toEqual(['curl -fsSL https://example.com/downloads/deploy.sh -o deploy.sh && sh deploy.sh']);
  });

  test('generates and copies only on demand, including after expiry', async () => {
    const fixture = makeDialog();
    fixture.open();
    await fixture.dialog.copyPermit();
    expect(fixture.calls).toBe(1);
    expect(fixture.writes).toEqual([fixture.permit.token]);
    fixture.expire();
    await fixture.dialog.copyPermit();
    expect(fixture.calls).toBe(2);
    expect(fixture.writes).toHaveLength(2);
  });

  test('deduplicates pending clicks and rejects a response after closing', async () => {
    const fixture = makeDialog();
    fixture.open();
    let resolve!: (value: { code: number; data: typeof fixture.permit }) => void;
    fixture.respond(() => new Promise((done) => { resolve = done; }));
    const pending = fixture.dialog.copyPermit();
    await fixture.dialog.copyPermit();
    expect(fixture.calls).toBe(1);
    fixture.open(false);
    resolve({ code: 0, data: fixture.permit });
    await pending;
    expect(fixture.writes).toEqual([]);
    expect(fixture.dialog.loading).toBe(false);
  });

  test('allows retry after a request failure and validates before requesting', async () => {
    const fixture = makeDialog();
    fixture.open();
    fixture.dialog.model.name = '';
    await fixture.dialog.copyPermit();
    expect(fixture.calls).toBe(0);
    fixture.dialog.model.name = 'Luna';
    fixture.respond(async () => { throw new Error('fixture failure'); });
    await fixture.dialog.copyPermit();
    expect(fixture.dialog.loading).toBe(false);
    fixture.respond(async () => ({ code: 0, data: fixture.permit }));
    await fixture.dialog.copyPermit();
    expect(fixture.calls).toBe(2);
    expect(fixture.writes).toEqual([fixture.permit.token]);
  });
});
