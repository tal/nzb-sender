import type { HistoryResult } from './messages';
import type { Settings } from './settings';

const INTERVAL = 5 * 60_000;
const FULL_INTERVAL = 7 * 24 * 60 * 60_000;
const PAGE_SIZE = 500;

interface Stream {
  seeded: boolean;
  start: number;
  newest: number;
  token?: number;
}
interface Snapshot {
  version: 1;
  downloads: [string, number | null][];
  streams: [Stream, Stream];
  nextSync: number;
  lastFull: number;
  failures: number;
  error?: string;
}
export interface HistoryStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: Snapshot): Promise<void>;
}
interface Slot { name?: string; nzb_name?: string; status?: string; completed?: number }
interface State {
  snapshot: Snapshot;
  downloads: Map<string, number | null>;
  syncing?: Promise<void>;
}

function releaseName(name: string) {
  return name.trim().replace(/\.nzb$/i, '').replace(/[._\s]+/g, ' ').trim().toLowerCase();
}

/** Local lookups never wait for SABnzbd. All tabs share a single throttled importer. */
export function createHistoryService(storage: HistoryStorage, options: {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
} = {}) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const request = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const states = new Map<string, Promise<State>>();
  // One request at a time, including across SAB configurations, with at least 1s between requests.
  let network = Promise.resolve();
  let lastRequest = -Infinity;

  async function stateFor(settings: Settings): Promise<{ state: State; key: string }> {
    const source = JSON.stringify([settings.sabUrl.replace(/\/+$/, ''), settings.apiKey]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const key = `download-history-v1:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`;
    if (!states.has(key)) states.set(key, (async () => {
      const stored = await storage.get(key) as Snapshot | undefined;
      const snapshot: Snapshot = stored?.version === 1 ? stored : {
        version: 1, downloads: [], streams: [0, 1].map(() => ({ seeded: false, start: 0, newest: 0 })) as [Stream, Stream],
        nextSync: 0, lastFull: 0, failures: 0,
      };
      return { snapshot, downloads: new Map(snapshot.downloads) };
    })().catch((err) => { states.delete(key); throw err; }));
    return { state: await states.get(key)!, key };
  }

  async function persist(state: State, key: string) {
    state.snapshot.downloads = [...state.downloads];
    await storage.set(key, state.snapshot);
  }

  async function page(settings: Settings, params: URLSearchParams) {
    const result = network.then(async () => {
      const delay = Math.max(0, 1000 - (now() - lastRequest));
      if (delay) await sleep(delay);
      lastRequest = now();
      const res = await request(`${settings.sabUrl.replace(/\/+$/, '')}/api?${params}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`SABnzbd answered HTTP ${res.status}`);
      const body = await res.json() as {
        error?: string;
        history?: false | { slots?: Slot[]; noofslots?: number; last_history_update?: number };
      };
      if (body.error) throw new Error(body.error);
      if (body.history !== false && !Array.isArray(body.history?.slots)) throw new Error('SABnzbd returned an invalid history response');
      return body.history!;
    });
    network = result.then(() => {}, () => {});
    return result;
  }

  async function sync(settings: Settings, state: State, key: string) {
    const snapshot = state.snapshot;
    try {
      // Persist the cooldown before any network call, including across worker restarts.
      snapshot.nextSync = now() + INTERVAL;
      if (snapshot.lastFull && now() - snapshot.lastFull >= FULL_INTERVAL && snapshot.streams.every((s) => s.seeded)) {
        for (const stream of snapshot.streams) { stream.seeded = false; stream.start = 0; }
      }
      await persist(state, key);
      for (const archive of [0, 1] as const) {
        const stream = snapshot.streams[archive];
        let start = stream.seeded ? 0 : stream.start;
        // Revisit a day of overlap; weekly full reconciliation catches edits to old jobs.
        const cutoff = stream.seeded ? stream.newest - 86_400 : 0;
        let newest = stream.newest;
        let token: number | undefined;
        while (true) {
          const params = new URLSearchParams({
            mode: 'history', output: 'json', apikey: settings.apiKey,
            start: String(start), limit: String(PAGE_SIZE), archive: String(archive), status: 'Completed',
          });
          if (start === 0 && stream.seeded && stream.token !== undefined) params.set('last_history_update', String(stream.token));
          const history = await page(settings, params);
          if (history === false) break;
          if (start === 0) token = history.last_history_update;
          const slots = history.slots!;
          for (const slot of slots) {
            if (slot.status !== 'Completed') continue;
            newest = Math.max(newest, slot.completed ?? 0);
            for (const name of [slot.name, slot.nzb_name]) {
              if (!name) continue;
              const normalized = releaseName(name);
              if (normalized && (!state.downloads.has(normalized) || (slot.completed ?? 0) > (state.downloads.get(normalized) ?? 0))) {
                state.downloads.set(normalized, slot.completed ?? null);
              }
            }
          }
          start += slots.length;
          // Save each seed page so an interrupted import can resume instead of starting over.
          if (!stream.seeded) { stream.start = start; stream.newest = newest; }
          await persist(state, key);
          if (!slots.length || (typeof history.noofslots === 'number' ? start >= history.noofslots : slots.length < PAGE_SIZE)
            || (cutoff > 0 && slots.some((slot) => typeof slot.completed === 'number' && slot.completed < cutoff))) break;
        }
        stream.seeded = true;
        stream.start = 0;
        stream.newest = newest;
        if (token !== undefined) stream.token = token;
        await persist(state, key);
      }
      if (!snapshot.lastFull || now() - snapshot.lastFull >= FULL_INTERVAL) snapshot.lastFull = now();
      snapshot.failures = 0;
      delete snapshot.error;
      snapshot.nextSync = now() + INTERVAL;
      await persist(state, key);
    } catch (err) {
      snapshot.error = err instanceof Error ? err.message : String(err);
      snapshot.failures++;
      snapshot.nextSync = now() + Math.min(60 * 60_000, INTERVAL * 2 ** (snapshot.failures - 1));
      // Local matches remain usable even when SABnzbd or persistent storage is unavailable.
      await persist(state, key).catch(() => {});
    }
  }

  async function check(settings: Settings, names: string[]) {
    if (!settings.apiKey) throw new Error('Set your SABnzbd API key in the extension options');
    const { state, key } = await stateFor(settings);
    if (!state.syncing && state.snapshot.nextSync <= now()) {
      state.syncing = sync(settings, state, key).finally(() => { state.syncing = undefined; });
    }
    const history: HistoryResult[] = names.map((name) => {
      const normalized = releaseName(name);
      return { name, downloaded: state.downloads.has(normalized), completed: state.downloads.get(normalized) ?? undefined };
    });
    return {
      history, historySyncing: !!state.syncing,
      historyReady: state.snapshot.streams.every((s) => s.seeded), historyError: state.snapshot.error,
    };
  }

  return { check };
}
