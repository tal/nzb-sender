import type { ConnectionResult, NzbItem, Redirect } from './messages';
import type { Priority, Settings } from './settings';

const PRIORITY: Record<Priority, string> = {
  default: '-100',
  low: '-1',
  normal: '0',
  high: '1',
  force: '2',
};

interface SabReply {
  status?: boolean;
  error?: string;
}

function apiBase(sabUrl: string): string {
  return `${sabUrl.replace(/\/+$/, '')}/api`;
}

/** `fetch` whose network failures say which step broke instead of a bare "Failed to fetch". */
async function reach(step: string, url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`${step}: could not reach ${new URL(url).origin} (${reason})`);
  }
}

/**
 * Works out where SABnzbd really lives after redirects. Only scheme/port/path changes on the same
 * host are accepted (http → https); a redirect to another host is almost always a login portal.
 */
export function resolveBaseUrl(configured: string, finalUrl: string): { baseUrl: string; redirect: Redirect } {
  const from = new URL(configured);
  const to = new URL(finalUrl);
  if (to.hostname !== from.hostname) {
    throw new Error(`SABnzbd redirected to ${to.host}, which looks like a login portal. Bypass auth for /api or use a direct address`);
  }
  if (!/\/api\/?$/.test(to.pathname)) throw new Error(`SABnzbd redirected to ${to.pathname}, not its /api endpoint`);
  const path = (p: string) => p.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  const baseUrl = `${to.origin}${path(to.pathname)}`;
  const before = `${from.origin}${from.pathname.replace(/\/+$/, '')}`;
  return { baseUrl, redirect: baseUrl === before ? 'none' : 'followed' };
}

function category(settings: Settings, item: NzbItem): string | null {
  switch (settings.categoryMode) {
    case 'page':
      return item.category;
    case 'custom':
      return settings.customCategory || null;
    case 'none':
      return null;
  }
}

async function parse(res: Response): Promise<void> {
  if (!res.ok) throw new Error(`SABnzbd answered HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as SabReply | null;
  if (!body || body.status !== true) throw new Error(body?.error ?? 'SABnzbd rejected the request');
}

function baseParams(settings: Settings, item: NzbItem, mode: string): URLSearchParams {
  const params = new URLSearchParams({
    mode,
    apikey: settings.apiKey,
    output: 'json',
    nzbname: item.name,
    priority: PRIORITY[settings.priority],
  });
  const cat = category(settings, item);
  if (cat) params.set('cat', cat);
  return params;
}

export async function addByUrl(settings: Settings, item: NzbItem): Promise<void> {
  const params = baseParams(settings, item, 'addurl');
  params.set('name', settings.nzbUrlTemplate.replace('{id}', encodeURIComponent(item.id)));
  await parse(await reach('Sending URL to SABnzbd', `${apiBase(settings.sabUrl)}?${params}`));
}

/** Downloads the NZB with the user's omgwtfnzbs session cookies, then uploads it to SABnzbd. */
export async function addByFile(settings: Settings, item: NzbItem): Promise<void> {
  const nzbRes = await reach('Downloading NZB from omgwtfnzbs', item.downloadUrl, { credentials: 'include' });
  if (!nzbRes.ok) throw new Error(`omgwtfnzbs answered HTTP ${nzbRes.status}`);
  const blob = await nzbRes.blob();
  const head = await blob.slice(0, 200).text();
  if (!head.includes('<')) throw new Error('omgwtfnzbs did not return an NZB (are you logged in?)');
  if (/<html/i.test(head)) throw new Error('omgwtfnzbs returned a web page, not an NZB (are you logged in?)');

  const form = new FormData();
  for (const [k, v] of baseParams(settings, item, 'addfile')) form.set(k, v);
  form.set('name', blob, `${item.name}.nzb`);
  await parse(await reach('Uploading NZB to SABnzbd', apiBase(settings.sabUrl), { method: 'POST', body: form }));
}

export async function addNzb(settings: Settings, item: NzbItem): Promise<void> {
  if (!settings.apiKey) throw new Error('Set your SABnzbd API key in the extension options');
  switch (settings.sendMethod) {
    case 'addfile':
      return addByFile(settings, item);
    case 'addurl':
      return addByUrl(settings, item);
  }
}

async function jsonBody<T>(res: Response, step: string): Promise<T> {
  if (!res.ok) throw new Error(`${step}: SABnzbd answered HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as T | null;
  if (!body) throw new Error(`${step}: SABnzbd did not return JSON (login page or wrong URL?)`);
  return body;
}

/**
 * Verifies URL + API key the way a send does: it runs in the background worker, follows redirects
 * and ends with a harmless multipart POST (`mode=version`), the same request shape as `addfile`.
 */
export async function testConnection(settings: Settings): Promise<ConnectionResult> {
  const first = await reach('Checking version', `${apiBase(settings.sabUrl)}?mode=version&output=json`);
  const { baseUrl, redirect } = resolveBaseUrl(settings.sabUrl, first.url || apiBase(settings.sabUrl));
  const base = apiBase(baseUrl);
  const ver = await jsonBody<{ version?: string }>(first, 'Checking version');

  const queueUrl = `${base}?mode=queue&limit=1&output=json&apikey=${encodeURIComponent(settings.apiKey)}`;
  const queue = await jsonBody<SabReply>(await reach('Checking API key', queueUrl), 'Checking API key');
  if (queue.error) throw new Error(queue.error);

  const form = new FormData();
  form.set('mode', 'version');
  form.set('output', 'json');
  form.set('apikey', settings.apiKey);
  const post = await jsonBody<SabReply & { version?: string }>(
    await reach('Testing upload (POST)', base, { method: 'POST', body: form }),
    'Testing upload (POST)',
  );
  if (post.error) throw new Error(post.error);

  return { version: ver.version ?? post.version ?? 'unknown', baseUrl, redirect };
}
