import { describe, expect, it } from 'vitest';

import { CompletedKeysMap } from '../../src/services/dedup.js';

describe('CompletedKeysMap', () => {
  it('isCompleted is false until markCompleted is called', () => {
    const now = 1_000;
    const map = new CompletedKeysMap({ ttlMs: 1_000, sweepIntervalMs: 60_000, now: () => now });
    expect(map.isCompleted('k1')).toBe(false);
    map.markCompleted('k1');
    expect(map.isCompleted('k1')).toBe(true);
    expect(map.isCompleted('k2')).toBe(false);
  });

  it('isCompleted returns false once the entry has expired', () => {
    let now = 0;
    const map = new CompletedKeysMap({ ttlMs: 1_000, sweepIntervalMs: 60_000, now: () => now });
    map.markCompleted('k1');
    expect(map.isCompleted('k1')).toBe(true);
    now = 2_000;
    expect(map.isCompleted('k1')).toBe(false);
  });

  it('sweeps expired entries after the sweep interval', () => {
    let now = 0;
    const map = new CompletedKeysMap({ ttlMs: 1_000, sweepIntervalMs: 500, now: () => now });
    map.markCompleted('k1');
    map.markCompleted('k2');
    expect(map.size()).toBe(2);

    now = 2_000; // past TTL and past sweep interval
    map.markCompleted('k3');
    expect(map.size()).toBe(1);
  });

  it('markCompleted is idempotent (refreshes expiry without throwing)', () => {
    const now = 0;
    const map = new CompletedKeysMap({ ttlMs: 1_000, sweepIntervalMs: 60_000, now: () => now });
    map.markCompleted('k1');
    map.markCompleted('k1');
    expect(map.size()).toBe(1);
    expect(map.isCompleted('k1')).toBe(true);
  });
});
