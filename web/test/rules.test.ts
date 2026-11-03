import { describe, expect, test } from 'bun:test';
import { formRules, validateRules } from '@luna/components/contracts';
import { hex32Rules, intIn, ipv4Rule } from '../src/utils/rules';
import { nodeModel, nodeRules } from '../src/views/nodes/model';

describe('form validation', () => {
  test('validates lowercase unprefixed hex IDs with the form rules', async () => {
    const rules = hex32Rules('ID');
    for (const value of ['a'.repeat(32), '0'.repeat(32)]) {
      expect(await validateRules(value, rules, {}, 'id')).toBeUndefined();
    }
    for (const value of ['', 'A'.repeat(32), 'a'.repeat(31), 'g'.repeat(32), '0x' + 'a'.repeat(30), '0h' + 'a'.repeat(30)]) {
      expect(await validateRules(value, rules, {}, 'id')).toBeDefined();
    }
  });

  test('keeps the public key length and padding contract', async () => {
    const rules = formRules(nodeRules(nodeModel()).publicKey);
    expect(await validateRules('A'.repeat(43) + '=', rules, {}, 'publicKey')).toBeUndefined();
    for (const value of ['A'.repeat(44), 'A'.repeat(42) + '==', '_'.repeat(43) + '=', 'A'.repeat(39) + '=']) {
      expect(await validateRules(value, rules, {}, 'publicKey')).toBeDefined();
    }
  });

  test('rejects out of range and malformed IPv4 addresses', async () => {
    const rules = ipv4Rule('地址');
    for (const value of ['10.8.0.1', '255.255.255.255']) {
      expect(await validateRules(value, rules, {}, 'address')).toBeUndefined();
    }
    for (const value of ['', '256.0.0.1', '999.1.2.3', '10.8.0', '1.2.3.4.5', '01.2.3.4', '::1']) {
      expect(await validateRules(value, rules, {}, 'address')).toBeDefined();
    }
  });

  test('validates IPv6 hosts instead of accepting arbitrary brackets', async () => {
    const rules = formRules(nodeRules(nodeModel()).endpoints);
    for (const value of ['10.8.0.1:8443', '[::1]:8443', '[2001:db8::1]:65535', '10.8.0.1:1，[::1]:443']) {
      expect(await validateRules(value, rules, {}, 'endpoints')).toBeUndefined();
    }
    for (const value of [
      '', '[not-an-ip]:443', '[1.2.3.4]:443', '[2001:db8:::1]:443', '[12345::1]:443',
      '::1:443', '256.0.0.1:443', '10.8.0.1:', '10.8.0.1:0', '10.8.0.1:-1',
      '10.8.0.1:65536', '10.8.0.1:1e3', '10.8.0.1', '[::1]:443, [bad]:443',
    ]) {
      expect(await validateRules(value, rules, {}, 'endpoints')).toBeDefined();
    }
  });

  test('treats integer text as decimal integers within the configured range', async () => {
    const rules = [intIn(1, 30, '范围不正确')];
    expect(await validateRules(' 12 ', rules, {}, 'days')).toBeUndefined();
    for (const value of ['', ' ', '0', '31', '-1', '1.5', '1e1', '0x10']) {
      expect(await validateRules(value, rules, {}, 'days')).toBeDefined();
    }
  });
});
