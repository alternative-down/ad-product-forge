import { describe, expect, it } from 'vitest';
import {
  toUint8Array,
  parseAddressValue,
  parseAddressDisplayName,
  parseFirstRecipient,
} from './email-account-helpers';

describe('toUint8Array', () => {
  it('returns Uint8Array unchanged', () => {
    const input = new Uint8Array([1, 2, 3]);
    expect(toUint8Array(input)).toBe(input);
  });

  it('converts string to Uint8Array', () => {
    const result = toUint8Array('hello');
    expect(result).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
  });

  it('converts ArrayBuffer to Uint8Array', () => {
    const buf = new ArrayBuffer(3);
    new Uint8Array(buf).set([1, 2, 3]);
    const result = toUint8Array(buf);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });
});

describe('parseAddressValue', () => {
  it('returns lowercased address', () => {
    const addr = { address: 'User@Example.COM', name: 'User' };
    expect(parseAddressValue(addr)).toBe('user@example.com');
  });

  it('returns null when no address property', () => {
    expect(parseAddressValue({ name: 'User' } as any)).toBeNull();
  });

  it('returns null when address is undefined', () => {
    expect(parseAddressValue(undefined)).toBeNull();
  });
});

describe('parseAddressDisplayName', () => {
  it('returns name when present', () => {
    const addr = { address: 'a@b.com', name: 'Alice' };
    expect(parseAddressDisplayName(addr)).toBe('Alice');
  });

  it('falls back to address when name is missing', () => {
    const addr = { address: 'a@b.com' };
    expect(parseAddressDisplayName(addr as any)).toBe('a@b.com');
  });

  it('returns null for undefined', () => {
    expect(parseAddressDisplayName(undefined)).toBeNull();
  });
});

describe('parseFirstRecipient', () => {
  it('returns first valid recipient', () => {
    const addrs = [
      { address: 'alice@example.com', name: 'Alice' },
      { address: 'bob@example.com', name: 'Bob' },
    ];
    expect(parseFirstRecipient(addrs as any)).toEqual({
      address: 'alice@example.com',
      displayName: 'Alice',
    });
  });

  it('skips entries without address', () => {
    const addrs = [
      { name: 'No Address' },
      { address: 'bob@example.com', name: 'Bob' },
    ];
    expect(parseFirstRecipient(addrs as any)).toEqual({
      address: 'bob@example.com',
      displayName: 'Bob',
    });
  });

  it('returns null for empty array', () => {
    expect(parseFirstRecipient([])).toBeNull();
    expect(parseFirstRecipient(undefined as any)).toBeNull();
  });
});
