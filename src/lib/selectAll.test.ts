import { describe, it, expect, beforeEach, vi } from 'vitest';
import { selectAll, PAGE_SIZE, resetSelectAllWarnings } from './selectAll';
import { fakeClient, makeUuids } from '../test/fakePostgrest';

// v1.16 (limecore#28). PostgREST truncates past its max-rows cap without an
// error; these pin that `selectAll` returns every row anyway — including when
// the cap is below the page size, which the obvious short-page loop gets wrong.

function rowsOf(n: number, extra: Record<string, unknown> = {}) {
  return makeUuids(n).map((id, i) => ({ id, n: i, ...extra }));
}
const idsOf = (rows: { id: string }[] | null) => (rows ?? []).map((r) => r.id).sort();

beforeEach(() => {
  resetSelectAllWarnings();
  vi.restoreAllMocks();
});

describe('selectAll', () => {
  it('returns a small table in one request', async () => {
    const all = rowsOf(170);
    const client = fakeClient({ habits: all });
    const { data, error } = await selectAll(client, 'habits');
    expect(error).toBeNull();
    expect(idsOf(data)).toEqual(idsOf(all));
    expect(client.requests).toHaveLength(1);
  });

  it('returns every row past the cap — the case a bare select() truncates', async () => {
    const all = rowsOf(2500);
    const client = fakeClient({ workout_sets: all });

    const bare = await client.from('workout_sets').select('*');
    expect(bare.error).toBeNull();
    expect(bare.data).toHaveLength(1000);

    const { data, error } = await selectAll(client, 'workout_sets');
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(new Set(data!.map((r) => r.id)).size).toBe(2500);
  });

  it('pages in id order with a keyset cursor, asking for the count on page one only', async () => {
    const client = fakeClient({ t: rowsOf(2500) });
    await selectAll(client, 't');
    expect(client.requests.map((r) => r.count)).toEqual(['exact', null, null]);
    expect(client.requests.every((r) => r.order?.col === 'id' && r.order.ascending)).toBe(true);
    expect(client.requests[0].gt).toBeNull();
    expect(client.requests[2].gt![1] > client.requests[1].gt![1]).toBe(true);
  });

  it('keeps paging when the server cap is BELOW the page size, and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const all = rowsOf(1700);
    const client = fakeClient({ t: all }, { maxRows: 500 });
    const { data, error } = await selectAll(client, 't');
    expect(error).toBeNull();
    expect(idsOf(data)).toEqual(idsOf(all));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('takes one request for exactly one page', async () => {
    const client = fakeClient({ t: rowsOf(PAGE_SIZE) });
    await selectAll(client, 't');
    expect(client.requests).toHaveLength(1);
  });

  it('applies the filter to every page', async () => {
    const mine = rowsOf(1500, { user_id: 'me', deleted_at: null });
    const theirs = rowsOf(800, { user_id: 'them', deleted_at: null });
    const deleted = rowsOf(50, { user_id: 'me', deleted_at: '2026-01-01' });
    const client = fakeClient({ t: [...mine, ...theirs, ...deleted] });
    const { data } = await selectAll(client, 't', {
      filter: (q) => q.eq('user_id', 'me').is('deleted_at', null),
    });
    expect(idsOf(data)).toEqual(idsOf(mine));
    expect(client.requests.every((r) => r.filters.length === 2)).toBe(true);
  });

  it('returns the error and NO rows when a later page fails', async () => {
    const client = fakeClient({ t: rowsOf(2500) }, {
      failWhen: (_r, n) => (n === 2 ? { code: '57014', message: 'statement timeout' } : null),
    });
    const { data, error } = await selectAll(client, 't');
    expect(data).toBeNull();
    expect(error!.code).toBe('57014');
  });

  it('passes an error through untouched, so a message-sniffing caller still works', async () => {
    // fetchWithSoftDeleteFallback reads `error.message` to detect a missing
    // deleted_at column and retry without the filter.
    const client = fakeClient({}, {
      failWhen: () => ({ code: '42703', message: 'column t.deleted_at does not exist' }),
    });
    const { error } = await selectAll(client, 't');
    expect(error!.message).toBe('column t.deleted_at does not exist');
  });

  it('refuses to loop forever against a server that ignores the cursor', async () => {
    const client = fakeClient({ t: rowsOf(2500) }, { ignoreGt: true });
    const { data, error } = await selectAll(client, 't');
    expect(data).toBeNull();
    expect(error!.message).toMatch(/cursor did not advance/);
  });

  it('falls back to the short-page rule when no count comes back', async () => {
    const all = rowsOf(2500);
    const client = fakeClient({ t: all }, { withCount: false });
    const { data } = await selectAll(client, 't');
    expect(idsOf(data)).toEqual(idsOf(all));
  });
});
