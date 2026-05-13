import { describe, expect, it } from 'vitest';

import { CompletedKeysMap } from '../../src/services/dedup.js';

describe('CompletedKeysMap', () => {
  it('remember returns true on first occurrence and false on duplicates within TTL', () => {
    const now = 1_000;
    const map = new CompletedKeysMap({ ttlMs: 1_000, sweepIntervalMs: 60_000, now: () => now });
    expect(map.remember('k1')).toBe(true);
    expect(map.remember('k1')).toBe(false);
    expect(map.remember('k2')).toBe(true);
  });

  it('remember returns true again once an entry has expired', () => {
    let now = 0;
    const map = new CompletedKeysMap({ ttlMs: 1_000, sweepIntervalMs: 60_000, now: () => now });
    expect(map.remember('k1')).toBe(true);
    now = 2_000;
    expect(map.remember('k1')).toBe(true);
  });

  it('sweeps expired entries after the sweep interval', () => {
    let now = 0;
    const map = new CompletedKeysMap({ ttlMs: 1_000, sweepIntervalMs: 500, now: () => now });
    map.remember('k1');
    map.remember('k2');
    expect(map.size()).toBe(2);

    now = 2_000; // past TTL and past sweep interval
    // any new remember call triggers a sweep
    map.remember('k3');
    expect(map.size()).toBe(1);
  });
});
