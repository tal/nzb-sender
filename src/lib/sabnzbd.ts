import type { NzbItem } from './messages';
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
  await parse(await fetch(`${apiBase(settings.sabUrl)}?${params}`));
}

/** Downloads the NZB with the user's omgwtfnzbs session cookies, then uploads it to SABnzbd. */
export async function addByFile(settings: Settings, item: NzbItem): Promise<void> {
  const nzbRes = await fetch(item.downloadUrl, { credentials: 'include' });
  if (!nzbRes.ok) throw new Error(`omgwtfnzbs answered HTTP ${nzbRes.status}`);
  const blob = await nzbRes.blob();
  const head = await blob.slice(0, 200).text();
  if (!head.includes('<')) throw new Error('omgwtfnzbs did not return an NZB (are you logged in?)');
  if (/<html/i.test(head)) throw new Error('omgwtfnzbs returned a web page, not an NZB (are you logged in?)');

  const form = new FormData();
  for (const [k, v] of baseParams(settings, item, 'addfile')) form.set(k, v);
  form.set('name', blob, `${item.name}.nzb`);
  await parse(await fetch(apiBase(settings.sabUrl), { method: 'POST', body: form }));
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

/** Verifies URL + API key (the `version` mode needs no key, `queue` does). */
export async function testConnection(settings: Settings): Promise<string> {
  const base = apiBase(settings.sabUrl);
  const ver = (await (await fetch(`${base}?mode=version&output=json`)).json()) as { version?: string };
  const queue = (await (
    await fetch(`${base}?mode=queue&limit=1&output=json&apikey=${encodeURIComponent(settings.apiKey)}`)
  ).json()) as SabReply;
  if (queue.error) throw new Error(queue.error);
  return ver.version ?? 'unknown';
}
