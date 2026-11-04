import { describe, expect, mock, test } from 'bun:test';
import { createHistoryService, type HistoryStorage } from '../history';
import type { Settings } from '../settings';

const settings: Settings = {
  sabUrl: 'http://sab.test/sabnzbd/', apiKey: 'test-key', sendMethod: 'addfile',
  categoryMode: 'none', customCategory: '', priority: 'default', nzbUrlTemplate: '',
};
function history(slots: object[], noofslots = slots.length, token = 7) {
  return Response.json({ history: { slots, noofslots, last_history_update: token } });
}
function harness(handler: (url: URL) => Promise<Response> | Response) {
  let time = 2_000_000_000_000;
  const saved = new Map<string, unknown>();
  const requests: { url: URL; at: number }[] = [];
  const storage: HistoryStorage = {
    get: async (key) => structuredClone(saved.get(key)),
    set: async (key, value) => { saved.set(key, structuredClone(value)); },
  };
  const options = {
    now: () => time,
    sleep: async (ms: number) => { time += ms; },
    fetch: mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      requests.push({ url, at: time });
      return handler(url);
    }) as unknown as typeof fetch,
  };
  return {
    service: createHistoryService(storage, options),
    restart: () => createHistoryService(storage, options),
    advance: (ms: number) => { time += ms; }, requests, saved,
  };
}
async function idle(service: ReturnType<typeof createHistoryService>, names: string[] = []) {
  for (let i = 0; i < 100; i++) {
    const result = await service.check(settings, names);
    if (!result.historySyncing) return result;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Importer did not finish');
}

describe('local download history', () => {
  test('matches completed job names and filenames, keeping releases distinct', async () => {
    const h = harness(() => history([
      { name: 'Show.S01E02.1080p-GROUP', status: 'Completed', completed: 123 },
      { name: 'Renamed', nzb_name: 'Movie.2026.2160p-GROUP.nzb', status: 'Completed', completed: 456 },
      { name: 'Failed.Release', status: 'Failed' }, { name: 'Unfinished.Release', status: 'Extracting' },
    ]));
    const result = await idle(h.service, [
      'show s01e02 1080p-GROUP', 'Movie_2026_2160p-GROUP', 'Show.S01E03.1080p-GROUP',
      'Show.S01E02.720p-GROUP', 'Show.S01E02.1080p-OTHER', 'Failed.Release', 'Unfinished.Release', '',
    ]);
    expect(result.history.map((r) => r.downloaded)).toEqual([true, true, false, false, false, false, false, false]);
    expect(result.history[0]?.completed).toBe(123);
    expect(result.history[1]?.completed).toBe(456);
  });

  test('seeds once, paginates archives, and spaces requests by at least one second', async () => {
    const h = harness((url) => {
      if (url.searchParams.get('archive') === '1') return history([{ name: 'Archived.Release', status: 'Completed' }]);
      if (url.searchParams.get('start') === '0') return history(Array.from({ length: 500 }, (_, i) => ({ name: `Release.${i}`, status: 'Completed' })), 501);
      return history([{ name: 'Old.Release', status: 'Completed' }], 501);
    });
    await Promise.all(Array.from({ length: 20 }, () => h.service.check(settings, ['Old.Release'])));
    const result = await idle(h.service, ['Old.Release', 'Archived.Release']);
    expect(result.history.every((r) => r.downloaded)).toBe(true);
    expect(h.requests.map(({ url }) => [url.searchParams.get('archive'), url.searchParams.get('start')]))
      .toEqual([['0', '0'], ['0', '500'], ['1', '0']]);
    expect(h.requests[1]!.at - h.requests[0]!.at).toBeGreaterThanOrEqual(1000);
    expect(h.requests[2]!.at - h.requests[1]!.at).toBeGreaterThanOrEqual(1000);
    expect(h.requests.every(({ url }) => url.pathname === '/sabnzbd/api')).toBe(true);
  });

  test('returns persisted matches without waiting for SAB, even after restarting the worker', async () => {
    let hang = false;
    const h = harness(() => hang ? new Promise<Response>(() => {}) : history([{ name: 'Saved.Release', status: 'Completed' }]));
    await idle(h.service);
    hang = true;
    h.advance(5 * 60_000);
    const result = await h.restart().check(settings, ['Saved.Release']);
    expect(result.history[0]?.downloaded).toBe(true);
    expect(result.historySyncing).toBe(true);
    expect([...h.saved.keys()].every((key) => !key.includes(settings.apiKey))).toBe(true);
    expect(JSON.stringify([...h.saved.values()])).not.toContain(settings.apiKey);
  });

  test('page loads and worker restarts respect the persisted five-minute cooldown', async () => {
    const h = harness(() => history([]));
    await idle(h.service);
    for (let i = 0; i < 10; i++) await h.service.check(settings, []);
    await h.restart().check(settings, []);
    h.advance(4 * 60_000);
    await h.restart().check(settings, []);
    expect(h.requests).toHaveLength(2);
  });

  test('unchanged history uses conditional requests instead of downloading every page', async () => {
    const h = harness((url) => url.searchParams.has('last_history_update') ? Response.json({ history: false }) : history([], 0, 99));
    await idle(h.service);
    h.advance(5 * 60_000);
    await idle(h.service);
    expect(h.requests).toHaveLength(4);
    expect(h.requests.slice(2).every(({ url }) => url.searchParams.get('last_history_update') === '99')).toBe(true);
  });

  test('updates scan only recent pages and retain downloads removed from SAB', async () => {
    let updating = false;
    const h = harness((url) => {
      if (url.searchParams.get('archive') === '1') return history([]);
      if (!updating) return history([{ name: 'Keep.Forever', status: 'Completed', completed: 2_000_000 }]);
      // First incremental page already crosses the one-day overlap boundary.
      return history([{ name: 'New.Release', status: 'Completed', completed: 2_000_001 },
        { name: 'Older.Release', status: 'Completed', completed: 1_000_000 }], 100_000, 8);
    });
    await idle(h.service);
    updating = true;
    h.advance(5 * 60_000);
    const result = await idle(h.service, ['Keep.Forever', 'New.Release']);
    expect(result.history.every((r) => r.downloaded)).toBe(true);
    expect(h.requests).toHaveLength(4);
  });

  test('failed refreshes preserve matches and back off across restarts', async () => {
    let failing = false;
    const h = harness(() => failing ? new Response('unavailable', { status: 503 }) : history([{ name: 'Saved', status: 'Completed' }]));
    await idle(h.service);
    failing = true;
    h.advance(5 * 60_000);
    let result = await idle(h.service, ['Saved']);
    expect(result.history[0]?.downloaded).toBe(true);
    expect(result.historyError).toContain('503');
    await h.restart().check(settings, []);
    expect(h.requests).toHaveLength(3);
    h.advance(5 * 60_000);
    result = await idle(h.service, ['Saved']);
    expect(result.historyError).toContain('503');
    h.advance(5 * 60_000);
    await h.restart().check(settings, []);
    expect(h.requests).toHaveLength(4); // second failure has a ten-minute backoff
  });

  test('resumes an interrupted seed from its saved page', async () => {
    let failing = true;
    const h = harness((url) => {
      if (url.searchParams.get('archive') === '1') return history([]);
      if (url.searchParams.get('start') === '0') return history(Array.from({ length: 500 }, (_, i) => ({ name: `Release.${i}`, status: 'Completed' })), 501);
      return failing ? Response.json({ error: 'temporarily unavailable' }) : history([{ name: 'Last.Release', status: 'Completed' }], 501);
    });
    await idle(h.service);
    failing = false;
    h.advance(5 * 60_000);
    const result = await idle(h.restart(), ['Release.0', 'Last.Release']);
    expect(result.history.every((r) => r.downloaded)).toBe(true);
    expect(h.requests.map(({ url }) => url.searchParams.get('start'))).toEqual(['0', '500', '500', '0']);
  });

  test('keeps server and API key caches separate', async () => {
    const h = harness(() => history([{ name: 'Private', status: 'Completed' }]));
    await idle(h.service);
    const result = await h.service.check({ ...settings, apiKey: 'other' }, ['Private']);
    expect(result.history[0]?.downloaded).toBe(false);
  });
});
