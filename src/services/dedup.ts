export interface CompletedKeysOptions {
  ttlMs: number;
  sweepIntervalMs?: number;
  now?: () => number;
}

export class CompletedKeysMap {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly sweepIntervalMs: number;
  private lastSweep: number;

  constructor(options: CompletedKeysOptions) {
    this.ttlMs = options.ttlMs;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 60_000;
    this.now = options.now ?? (() => Date.now());
    this.lastSweep = this.now();
  }

  /**
   * Register a key as completed. Returns true if this is the first time the
   * key is seen within the TTL window; false if it has already been recorded.
   * Callers should only proceed with side-effects on `true`.
   */
  remember(key: string): boolean {
    const now = this.now();
    this.maybeSweep(now);

    const existing = this.entries.get(key);
    if (existing !== undefined && existing > now) {
      return false;
    }

    this.entries.set(key, now + this.ttlMs);
    return true;
  }

  size(): number {
    return this.entries.size;
  }

  private maybeSweep(now: number): void {
    if (now - this.lastSweep < this.sweepIntervalMs) {
      return;
    }
    this.lastSweep = now;
    for (const [key, expiry] of this.entries) {
      if (expiry <= now) {
        this.entries.delete(key);
      }
    }
  }
}
