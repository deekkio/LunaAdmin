import { describe, expect, test } from 'bun:test';
import { command, control, ingress, settings } from '../src/views/nodes/model';

const input = { control: 'https://example.com:19447', origin: 'https://example.com', name: 'Tokyo' };

describe('node enrollment', () => {
  test('copies only the public single-line installation command', () => {
    expect(command(input.origin)).toBe('curl -fsSL https://example.com/downloads/deploy.sh -o deploy.sh && sh deploy.sh');
    expect(command('https://example.com:8443')).toBe('curl -fsSL https://example.com:8443/downloads/deploy.sh -o deploy.sh && sh deploy.sh');
    expect(() => command('https://example.com/path')).toThrow();
    expect(() => command('https://example.com?token=fixture')).toThrow();
  });

  test('rejects credential-bearing or non-origin controller URLs', () => {
    for (const value of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?token=secret', 'https://example.com/#secret', 'https://example.com/\\path']) {
      expect(() => control(value)).toThrow();
    }
    expect(control(input.control + '/')).toBe(input.control);
    expect(ingress(input.origin)).toBe(input.control);
    expect(settings({ ...input, name: ' Tokyo ' })).toEqual(input);
    expect(() => settings({ ...input, name: 'x\nname' })).toThrow();
  });
});
