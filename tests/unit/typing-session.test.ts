import { afterEach, describe, expect, it, vi } from 'vitest';

import { TypingSession } from '../../src/services/typing-session.js';

describe('TypingSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends once immediately and again after each refresh interval', async () => {
    const clock = controlledClock();
    const sends: number[] = [];
    await clock.session.show(
      'turn-1',
      async () => {
        sends.push(clock.now);
        return true;
      },
      clock.schedule
    );

    expect(sends).toEqual([1_000_000]);
    await clock.tick();
    expect(sends).toEqual([1_000_000, 1_004_000]);
    await clock.tick();
    expect(sends).toEqual([1_000_000, 1_004_000, 1_008_000]);
  });

  it('does not send again when status repeats inside the interval', async () => {
    const clock = controlledClock();
    const sends: number[] = [];
    const send = async () => {
      sends.push(clock.now);
      return true;
    };
    await clock.session.show('turn-1', send, clock.schedule);
    await clock.session.show('turn-1', send, clock.schedule);

    expect(sends).toEqual([1_000_000]);
    expect(clock.jobs).toHaveLength(2);
    await clock.tick();
    expect(sends).toEqual([1_000_000]);
  });

  it('stops refreshing after stop, and a later status does not restart', async () => {
    const clock = controlledClock();
    const sends: number[] = [];
    const send = async () => {
      sends.push(clock.now);
      return true;
    };
    await clock.session.show('turn-1', send, clock.schedule);
    clock.session.stop('turn-1');
    await clock.tick();
    await clock.session.show('turn-1', send, clock.schedule);

    expect(sends).toEqual([1_000_000]);
  });

  it('does not send a second immediate indicator when armed after a send', async () => {
    const clock = controlledClock();
    const sends: number[] = [];
    const send = async () => {
      sends.push(clock.now);
      return true;
    };
    clock.session.arm('turn-1', send, clock.schedule);
    await clock.tick();

    expect(sends).toEqual([1_004_000]);
  });

  it('stops at about 2 minutes and ignores a later status', async () => {
    let now = 1_000_000;
    const sends: number[] = [];
    const session = new TypingSession({
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      refreshMs: 4_000,
      maxMs: 120_000,
    });
    const jobs: Promise<void>[] = [];
    await session.show(
      'turn-1',
      async () => {
        sends.push(now);
        return true;
      },
      (work) => {
        jobs.push(work);
      }
    );
    await Promise.all(jobs);

    expect(sends[0]).toBe(1_000_000);
    expect(sends[sends.length - 1]).toBe(1_116_000);
    expect(sends).toHaveLength(30);
    const before = sends.length;
    now = 1_130_000;
    await session.show('turn-1', async () => {
      sends.push(now);
      return true;
    });
    expect(sends).toHaveLength(before);
  });

  it('logs a failed or thrown typing call and still resolves', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const session = new TypingSession({
      now: () => 5_000,
      sleep: async () => {},
      refreshMs: 4_000,
    });

    await expect(session.show('turn-false', async () => false)).resolves.toBeUndefined();
    await expect(
      session.show('turn-throw', async () => {
        throw new Error('telegram down');
      })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      'Typing indicator failed',
      expect.objectContaining({ messageKey: 'turn-false' })
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Typing indicator failed',
      expect.objectContaining({ messageKey: 'turn-throw', error: 'telegram down' })
    );
  });
});

function controlledClock() {
  let now = 1_000_000;
  const jobs: Array<Promise<void>> = [];
  const sleepers: Array<() => void> = [];
  const session = new TypingSession({
    now: () => now,
    refreshMs: 4_000,
    maxMs: 120_000,
    sleep: (ms) =>
      new Promise((resolve) => {
        sleepers.push(() => {
          now += ms;
          resolve();
        });
      }),
  });

  return {
    session,
    jobs,
    get now() {
      return now;
    },
    schedule(work: Promise<void>) {
      jobs.push(work);
    },
    async tick() {
      const wake = sleepers.shift();
      if (!wake) throw new Error('typing refresh was not waiting');
      wake();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}
