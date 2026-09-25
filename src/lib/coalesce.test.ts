import { describe, it, expect } from 'vitest';
import { coalesce } from './coalesce';

// v1.16 (NCC#58). The scheduler behind `syncNow`.

/** A job whose runs finish only when the test says so, and which records how
 *  many started and the most that were ever running at once. */
function gatedJob() {
  const releases: (() => void)[] = [];
  let started = 0;
  let active = 0;
  let maxActive = 0;
  const job = () => {
    started += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    return new Promise<void>((resolve) => {
      releases.push(() => {
        active -= 1;
        resolve();
      });
    });
  };
  return {
    job,
    get started() { return started; },
    get maxActive() { return maxActive; },
    release: async () => {
      releases.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('coalesce', () => {
  it('runs a single request once', async () => {
    const g = gatedJob();
    const request = coalesce(g.job);
    const p = request();
    await g.release();
    await p;
    expect(g.started).toBe(1);
  });

  it('folds any number of requests during a run into ONE follow-up', async () => {
    // The bug: three waiters used to start three more full syncs.
    const g = gatedJob();
    const request = coalesce(g.job);
    request();
    const waiters = [request(), request(), request()];
    await tick();
    expect(g.started).toBe(1);

    await g.release(); // first run ends, the single follow-up starts
    expect(g.started).toBe(2);
    await g.release();
    await Promise.all(waiters);
    expect(g.started).toBe(2);
  });

  it('never runs two jobs at the same time', async () => {
    const g = gatedJob();
    const request = coalesce(g.job);
    request();
    request();
    request();
    await tick();
    await g.release();
    request();
    await g.release();
    await g.release();
    expect(g.maxActive).toBe(1);
  });

  it('resolves a request only after a run that started after it has finished', async () => {
    // What makes `await syncNow()` mean "what I just changed is pushed".
    const g = gatedJob();
    const request = coalesce(g.job);
    request();
    let done = false;
    const p = request().then(() => {
      done = true;
    });
    await g.release(); // the run that was already going when we asked
    expect(done).toBe(false);
    await g.release(); // the follow-up, which started after we asked
    await p;
    expect(done).toBe(true);
  });

  it('gives a request made during the follow-up its own later run', async () => {
    const g = gatedJob();
    const request = coalesce(g.job);
    request();
    request(); // schedules follow-up #1
    await g.release(); // run 1 done, follow-up #1 running
    const late = request(); // must not ride follow-up #1, which began earlier
    await g.release(); // follow-up #1 done, follow-up #2 starts
    expect(g.started).toBe(3);
    await g.release();
    await late;
  });

  it('starts fresh once idle', async () => {
    const g = gatedJob();
    const request = coalesce(g.job);
    const a = request();
    await g.release();
    await a;
    const b = request();
    expect(g.started).toBe(2);
    await g.release();
    await b;
  });

  it('is not wedged by a job that rejects', async () => {
    let calls = 0;
    const request = coalesce(async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
    });
    const first = request();
    const second = request(); // follow-up still runs after the failure
    await expect(first).rejects.toThrow('boom');
    await second;
    expect(calls).toBe(2);
    await request();
    expect(calls).toBe(3);
  });
});
