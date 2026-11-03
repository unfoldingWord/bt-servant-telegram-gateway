/**
 * Keeps Telegram's `typing` action visible for one open turn.
 *
 * The action lasts about 5 seconds, so we send it immediately and again every
 * 4 seconds, and we stop at 2 minutes or when the turn closes. Each scheduled
 * loop is a Workers `waitUntil`, which the runtime cancels about 30 seconds
 * after that response. Every new status therefore starts its own loop; the
 * previous loop exits, and the 2-minute cap still applies from the first send.
 */

const DEFAULT_REFRESH_MS = 4_000;
const DEFAULT_MAX_MS = 120_000;
const DEFAULT_CLOSED_TTL_MS = 3_600_000;
const SWEEP_INTERVAL_MS = 60_000;

export interface TypingSessionOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  refreshMs?: number;
  maxMs?: number;
  closedTtlMs?: number;
}

interface ActiveTurn {
  startedAt: number;
  lastSentAt: number;
  token: number;
  send: () => Promise<boolean>;
}

export class TypingSession {
  private readonly active = new Map<string, ActiveTurn>();
  private readonly closed = new Map<string, number>();
  private readonly now: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly refreshMs: number;
  private readonly maxMs: number;
  private readonly closedTtlMs: number;
  private lastSweep: number;

  constructor(options: TypingSessionOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.sleepFn = options.sleep ?? defaultSleep;
    this.refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS;
    this.maxMs = options.maxMs ?? DEFAULT_MAX_MS;
    this.closedTtlMs = options.closedTtlMs ?? DEFAULT_CLOSED_TTL_MS;
    this.lastSweep = this.now();
  }

  async show(
    messageKey: string,
    send: () => Promise<boolean>,
    schedule?: (work: Promise<void>) => void
  ): Promise<void> {
    if (this.isClosed(messageKey)) return;
    const turn = this.upsert(messageKey, send, false);
    if (!turn) return;
    await this.sendIfDue(messageKey, turn);
    this.ensureLoop(messageKey, turn, schedule);
  }

  arm(
    messageKey: string,
    send: () => Promise<boolean>,
    schedule?: (work: Promise<void>) => void
  ): void {
    if (!schedule || this.isClosed(messageKey)) return;
    const turn = this.upsert(messageKey, send, true);
    if (!turn) return;
    this.ensureLoop(messageKey, turn, schedule);
  }

  stop(messageKey: string): void {
    this.active.delete(messageKey);
    const now = this.now();
    this.closed.set(messageKey, now + this.closedTtlMs);
    this.maybeSweep(now);
  }

  private upsert(
    messageKey: string,
    send: () => Promise<boolean>,
    alreadySent: boolean
  ): ActiveTurn | null {
    const now = this.now();
    const existing = this.active.get(messageKey);
    if (existing && now - existing.startedAt >= this.maxMs) {
      this.stop(messageKey);
      return null;
    }
    if (!existing) {
      const created = this.newTurn(now, send, alreadySent);
      this.active.set(messageKey, created);
      return created;
    }
    existing.send = send;
    if (alreadySent) existing.lastSentAt = now;
    return existing;
  }

  private newTurn(now: number, send: () => Promise<boolean>, alreadySent: boolean): ActiveTurn {
    return {
      startedAt: now,
      lastSentAt: alreadySent ? now : now - this.refreshMs,
      token: 0,
      send,
    };
  }

  private ensureLoop(
    messageKey: string,
    turn: ActiveTurn,
    schedule?: (work: Promise<void>) => void
  ): void {
    if (!schedule) return;
    // Each callback is its own Workers invocation. waitUntil on that invocation
    // dies about 30s after the response, so every status starts a new loop and
    // the previous one exits on its next wake.
    turn.token += 1;
    schedule(this.refresh(messageKey, turn.token));
  }

  private async refresh(messageKey: string, token: number): Promise<void> {
    try {
      for (;;) {
        await this.sleepFn(this.refreshMs);
        const turn = this.liveTurn(messageKey, token);
        if (!turn) return;
        await this.sendIfDue(messageKey, turn);
      }
    } catch (error) {
      console.error('Typing refresh failed', {
        messageKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private liveTurn(messageKey: string, token: number): ActiveTurn | null {
    const turn = this.active.get(messageKey);
    if (!turn || turn.token !== token) return null;
    if (this.now() - turn.startedAt >= this.maxMs) {
      this.stop(messageKey);
      return null;
    }
    return turn;
  }

  private async sendIfDue(messageKey: string, turn: ActiveTurn): Promise<void> {
    const now = this.now();
    if (now - turn.lastSentAt < this.refreshMs) return;
    turn.lastSentAt = now;
    try {
      const sent = await turn.send();
      if (!sent) console.error('Typing indicator failed', { messageKey });
    } catch (error) {
      console.error('Typing indicator failed', {
        messageKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private isClosed(messageKey: string): boolean {
    const now = this.now();
    this.maybeSweep(now);
    const expiry = this.closed.get(messageKey);
    return expiry !== undefined && expiry > now;
  }

  private maybeSweep(now: number): void {
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) return;
    this.lastSweep = now;
    for (const [key, expiry] of this.closed) {
      if (expiry <= now) this.closed.delete(key);
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const typingSessions = new TypingSession();
