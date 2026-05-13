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
   * Read-only check: is this key currently marked as completed within the TTL?
   * Triggers a sweep but does not register the key.
   */
  isCompleted(key: string): boolean {
    const now = this.now();
    this.maybeSweep(now);
    const existing = this.entries.get(key);
    return existing !== undefined && existing > now;
  }

  /**
   * Mark a key as completed. Idempotent — calling on an already-marked key
   * just refreshes the expiry.
   */
  markCompleted(key: string): void {
    const now = this.now();
    this.maybeSweep(now);
    this.entries.set(key, now + this.ttlMs);
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
