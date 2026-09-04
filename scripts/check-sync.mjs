#!/usr/bin/env node
// Guard the one rule the sync queue must never break:
//
//   **A queued write is marked `syncedAt` only when the row actually landed.**
//
// Run manually:  node scripts/check-sync.mjs
// Run in CI:     npm run check:sync   (also part of `npm run lint`)
//
// ── Why this exists (v1.13.1) ───────────────────────────────────────────────
//
// `42501` — insufficient_privilege, i.e. an RLS denial — sat in
// PERMANENT_PG_CODES next to the integrity-constraint codes, with the comment
// "the policy isn't going to change on the next retry". pushQueue's handling
// of a permanent error was to stamp the item `syncedAt` with a `[dropped]`
// note, which removes it from the pending set forever.
//
// For a real policy denial the comment holds. For the case that actually
// occurs it does not: the `feedback` insert policy is
// `with check (user_id = auth.uid())` and `authenticated` holds INSERT on the
// table, so a 42501 there can only mean the request carried a JWT that did
// not resolve to the user — expired, missing, or not yet refreshed. The very
// next attempt after a token refresh succeeds.
//
// The user had already been told their feedback was sent. So the queue
// silently discarded something a person wrote, and reported success.
//
// Deleting 42501 from the set is not the fix either — that trades silent loss
// for an item that retries forever, the unbounded-queue failure StudyDesk had
// to fix in this same milestone. The fix is bounded retry plus quarantine, and
// this check is here so that neither half can be undone by accident: not the
// classification (checks 1-3, which execute the real decision function), and
// not pushQueue's use of it (check 4, which reads the call site).
//
// The gate is structural on purpose. This bug survived a review that
// established the form was reachable and the write path sound end to end,
// because every one of those things was true — the loss happened after the
// insert failed, in code nobody was looking at.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const RETRY_SRC = join(ROOT, 'src/lib/syncRetry.ts');
const CLOUDSYNC_SRC = join(ROOT, 'src/lib/cloudSync.ts');

const failures = [];
const checks = [];

function assert(label, condition, detail) {
  checks.push(label);
  if (!condition) failures.push(`${label}\n    ${detail}`);
}

// ── Load the real decision module ──────────────────────────────────────────
//
// syncRetry.ts is dependency-free precisely so it can be executed here. CI
// runs Node 20, which has no TypeScript support, so transpile with the
// project's own tsc and import the result from a data: URL. If someone gives
// the module a runtime import, that import would resolve against the data URL
// and fail — so check it explicitly and say why.
const retrySource = readFileSync(RETRY_SRC, 'utf8');

const runtimeImport = retrySource
  .split('\n')
  .findIndex((l) => /^\s*import\s+(?!type\b)/.test(l));
if (runtimeImport !== -1) {
  console.error(
    `\nsrc/lib/syncRetry.ts:${runtimeImport + 1}: runtime import added to a module that must stay dependency-free.\n` +
      '    This check executes it directly to assert the never-mark-unwritten-content-synced\n' +
      '    rule. Keep the decision logic free of Supabase/Dexie imports and move any I/O to\n' +
      '    the caller in cloudSync.ts.\n',
  );
  process.exit(1);
}

const transpiled = ts.transpileModule(retrySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { planSyncFailure, MAX_AUTH_ATTEMPTS, PAYLOAD_FAULT_PG_CODES, AUTH_DENIAL_PG_CODES } =
  await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

const NOW = '2026-09-04T12:00:00.000Z';
const rls = () => Object.assign(new Error('new row violates row-level security policy for table "feedback"'), { code: '42501' });

// ── Check 1: a 42501 leaves the item pending, never synced ─────────────────
//
// The regression itself. A feedback row denied by RLS on its first attempt
// must still be owed to the server afterwards.
{
  const plan = planSyncFailure(rls(), {}, 'denied', NOW);
  assert(
    '42501 on a fresh item retries',
    plan.action === 'retry',
    `expected action "retry", got "${plan.action}". An RLS denial is an auth condition, not a verdict on the row.`,
  );
  assert(
    '42501 never marks the item synced',
    !('syncedAt' in plan.patch) && plan.patch.syncedAt === undefined,
    `patch contained syncedAt: ${JSON.stringify(plan.patch)}. A write that did not land must never be recorded as landed.`,
  );
  assert(
    '42501 is not quarantined immediately',
    plan.patch.quarantinedAt === undefined,
    'the first denial must be retried against a fresh token, not held.',
  );
  assert(
    '42501 asks for a session refresh before the retry',
    plan.refreshSession === true,
    'the retry has to run against a new JWT — retrying with the token Postgres just rejected achieves nothing.',
  );
  assert(
    '42501 counts an attempt',
    plan.patch.authAttempts === 1,
    `expected authAttempts 1, got ${plan.patch.authAttempts}. Unbounded retry is the other failure mode.`,
  );
}

// ── Check 2: the retry ceiling quarantines, and quarantine is not "synced" ──
{
  const plan = planSyncFailure(rls(), { authAttempts: MAX_AUTH_ATTEMPTS - 1 }, 'denied', NOW);
  assert(
    'a 42501 at the ceiling is quarantined',
    plan.action === 'quarantine' && plan.patch.quarantinedAt === NOW,
    `expected quarantine at attempt ${MAX_AUTH_ATTEMPTS}, got "${plan.action}". Retrying forever is the failure StudyDesk had to fix.`,
  );
  assert(
    'a quarantined item is still NOT marked synced',
    plan.patch.syncedAt === undefined,
    `patch contained syncedAt: ${JSON.stringify(plan.patch)}. Quarantine holds the item in the queue; it does not claim it was written.`,
  );
  assert(
    'quarantine records why',
    plan.patch.quarantineReason === 'auth',
    'the reason drives whether a new token releases the item — see releaseQuarantined().',
  );
}

// ── Check 3: no failure path anywhere produces a syncedAt ───────────────────
//
// Checks 1-2 cover the codes we reason about. This one covers the ones we
// don't: every payload fault, every unknown code, at every attempt count.
{
  const codes = [
    ...PAYLOAD_FAULT_PG_CODES,
    ...AUTH_DENIAL_PG_CODES,
    'PGRST301',
    '08006',
    '57014',
    undefined,
  ];
  const offenders = [];
  for (const code of codes) {
    for (let attempts = 0; attempts <= MAX_AUTH_ATTEMPTS + 1; attempts++) {
      const err = code === undefined ? new Error('network') : Object.assign(new Error('x'), { code });
      for (const refreshed of [false, true]) {
        const plan = planSyncFailure(err, { authAttempts: attempts }, 'x', NOW, refreshed);
        if (plan.patch.syncedAt !== undefined) offenders.push(`${code ?? 'no-code'} @${attempts}`);
      }
    }
  }
  assert(
    'no failure path marks an item synced',
    offenders.length === 0,
    `these did: ${offenders.join(', ')}`,
  );

  // Transient failures must not burn attempts, or a week offline would
  // quarantine a user's whole queue.
  const offline = planSyncFailure(new Error('Failed to fetch'), { authAttempts: 2 }, 'x', NOW);
  assert(
    'a transient failure does not consume an auth attempt',
    offline.action === 'retry' && offline.patch.authAttempts === undefined,
    `got action "${offline.action}", authAttempts ${offline.patch.authAttempts}. Only 42501 responses may count toward the ceiling.`,
  );

  // A payload fault is unretryable, but it is still the user's content.
  const payload = planSyncFailure(Object.assign(new Error('null value'), { code: '23502' }), {}, 'x', NOW);
  assert(
    'a payload fault is held, not dropped',
    payload.action === 'quarantine' && payload.patch.syncedAt === undefined,
    'these used to be marked synced. "Mark it synced" was always a lie about content the user authored.',
  );
}

// ── Check 4: pushQueue's failure path applies the plan verbatim ─────────────
//
// The module above can be perfect and the bug still return if the call site
// stamps its own syncedAt on a failure. Read the catch block and check.
{
  const src = readFileSync(CLOUDSYNC_SRC, 'utf8');

  assert(
    'cloudSync has no local permanent-error set',
    !/PERMANENT_PG_CODES|isPermanentSyncError/.test(src),
    'the classification must live in syncRetry.ts, where this check can execute it. A second copy in cloudSync.ts is a second place for 42501 to be mishandled.',
  );
  assert(
    'cloudSync routes failures through planSyncFailure',
    /planSyncFailure\(/.test(src),
    'pushQueue must classify failures via syncRetry.planSyncFailure.',
  );

  // Slice out pushQueue and look at every syncedAt write in it.
  //
  // The rule is deliberately blunt rather than clever: a `syncedAt` stamp must
  // sit on the line immediately after the awaited handler call that earned it.
  // Tracking catch-block depth by counting braces was the first attempt here
  // and it was too loose — it let a stamp on the failure path through, which
  // is precisely the bug this file exists to prevent. "The line above proves
  // the write succeeded" is checkable without parsing.
  const start = src.indexOf('export async function pushQueue');
  const end = src.indexOf('\nfunction describeFailure', start);
  const body = src.slice(start, end === -1 ? src.length : end);
  const lines = body.split('\n');

  const badWrites = [];
  lines.forEach((line, i) => {
    if (!/\bsyncedAt:/.test(line)) return;
    // Walk back past comments and blank lines to the last real statement.
    let j = i - 1;
    while (j >= 0 && (/^\s*(\/\/|\*|\/\*)/.test(lines[j]) || /^\s*$/.test(lines[j]))) j--;
    if (j < 0 || !/await handler\(/.test(lines[j])) {
      badWrites.push(`line ${i + 1}: ${line.trim()}\n        preceded by: ${(lines[j] ?? '<start>').trim()}`);
    }
  });

  assert(
    'every syncedAt stamp in pushQueue directly follows a successful handler call',
    badWrites.length === 0,
    `found:\n      ${badWrites.join('\n      ')}\n` +
      '    A failed push must leave the item pending or quarantined — never synced.\n' +
      '    If this is a legitimate refactor, keep the stamp adjacent to the awaited\n' +
      '    handler call that proves the row landed, rather than relaxing the check.',
  );

  assert(
    'pushQueue refreshes the session before retrying an auth denial',
    /plan\.refreshSession/.test(body) && /refreshAuthSession\(\)/.test(body),
    'a retry against the token Postgres just rejected fails for the same reason.',
  );
}

// ── Check 5: quarantined items stay in the queue but stop being drained ─────
{
  const queueSrc = readFileSync(join(ROOT, 'src/db/syncQueue.ts'), 'utf8');
  assert(
    'listPending excludes quarantined items',
    /listPending[\s\S]{0,400}!q\.quarantinedAt/.test(queueSrc),
    'quarantined items must not be re-pushed every drain, or the 30s background flusher never sleeps.',
  );
  assert(
    'quarantined items remain retrievable',
    /export async function listQuarantined/.test(queueSrc) &&
      /export async function releaseQuarantined/.test(queueSrc),
    'held content has to be visible and recoverable, otherwise quarantine is just a slower way of losing it.',
  );
  assert(
    'listQuarantined only returns unsynced items',
    /listQuarantined[\s\S]{0,300}!q\.syncedAt/.test(queueSrc),
    'a written row is not held content.',
  );
}

// ── Report ─────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\nSync-queue check failed (${failures.length} of ${checks.length}):\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error(
    'The invariant: a queued write is marked synced only when the row landed.\n' +
      'See src/lib/syncRetry.ts for why 42501 is not a permanent failure.\n',
  );
  process.exitCode = 1;
} else {
  console.log(
    `Sync-queue check passed (${checks.length} assertions): a 42501 leaves the item pending, ` +
      'the retry ceiling quarantines rather than marks synced, and no failure path claims a write landed.',
  );
}
