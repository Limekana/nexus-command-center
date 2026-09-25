// v1.16 (NCC#58) — run an async job at most once at a time, and fold every
// request that arrives while it runs into ONE follow-up run.
//
// `syncNow` used to do this by hand, and got it wrong in a way that grew with
// the number of callers:
//
//     if (inflight) await inflight;      // B and C both wait on A…
//     inflight = (async () => …)();       // …then BOTH start a run, each
//     await inflight;                     //    overwriting the other's handle,
//     inflight = null;                    // and whichever finishes first nulls
//                                         // the one still running.
//
// So N callers during a sync produced N concurrent full syncs, each running
// `pushQueue` over the same pending items, and a caller arriving after that
// did not wait for anything. Today's push handlers are idempotent, so the cost
// was duplicate requests — but a non-idempotent handler turns it into
// duplicate rows (LimeLog shipped exactly that: limelog#28).
//
// The guarantee this keeps from the old code: a request resolves only after a
// run that STARTED AFTER the request has finished. That is what makes
// `await syncNow()` mean "what I just changed is pushed", and it is why a
// request during a run gets a follow-up rather than the run already underway.

export function coalesce(job: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let followUp: Promise<void> | null = null;

  const start = (): Promise<void> => {
    const run: Promise<void> = job().finally(() => {
      if (running === run) running = null;
    });
    running = run;
    return run;
  };

  return function request(): Promise<void> {
    if (!running) return start();
    if (!followUp) {
      // One follow-up for everyone who asks while this run is going. It is
      // cleared the moment it starts, so a request arriving DURING the
      // follow-up schedules another rather than riding one that began before
      // it did.
      followUp = running
        .catch(() => undefined)
        .then(() => {
          followUp = null;
          return start();
        });
    }
    return followUp;
  };
}
