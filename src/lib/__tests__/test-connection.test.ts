import { afterEach, describe, expect, mock, test } from 'bun:test';
import { resolveBaseUrl, testConnection } from '../sabnzbd';
import type { Settings } from '../settings';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const settings: Settings = {
  sabUrl: 'http://sab.test', apiKey: 'key', sendMethod: 'addfile', categoryMode: 'none',
  customCategory: '', priority: 'default', nzbUrlTemplate: '',
};

/** `Response.url` is read-only and empty for hand-made responses, so redirects have to be faked. */
function answered(body: object, url: string, init?: ResponseInit): Response {
  const res = Response.json(body, init);
  Object.defineProperty(res, 'url', { value: url });
  return res;
}

describe('resolveBaseUrl', () => {
  test('reports an http → https upgrade on the same host', () => {
    expect(resolveBaseUrl('http://sab.test', 'https://sab.test/api?mode=version')).toEqual({
      baseUrl: 'https://sab.test', redirect: 'followed',
    });
  });

  test('leaves a URL alone when nothing redirected, ignoring trailing slashes', () => {
    expect(resolveBaseUrl('http://sab.test/sabnzbd/', 'http://sab.test/sabnzbd/api?mode=version')).toEqual({
      baseUrl: 'http://sab.test/sabnzbd', redirect: 'none',
    });
  });

  test('keeps a sub-path and port that the redirect preserves', () => {
    expect(resolveBaseUrl('http://sab.test:8080/sab', 'https://sab.test:8443/sab/api').baseUrl).toBe(
      'https://sab.test:8443/sab',
    );
  });

  test('refuses a redirect to another host, which is usually a login portal', () => {
    expect(() => resolveBaseUrl('https://sab.test', 'https://auth.test/?rd=https://sab.test/api')).toThrow(
      /auth\.test.*login portal/,
    );
  });

  test('refuses a same-host redirect that does not end at /api', () => {
    expect(() => resolveBaseUrl('https://sab.test', 'https://sab.test/login')).toThrow(/\/login/);
  });
});

describe('testConnection', () => {
  test('follows an http → https redirect and finishes with a multipart POST', async () => {
    const calls: { url: string; method: string; body?: BodyInit | null }[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
      if (url.includes('mode=version')) return answered({ version: '4.5.1' }, 'https://sab.test/api?mode=version&output=json');
      if (url.includes('mode=queue')) return answered({ queue: {} }, url);
      return answered({ version: '4.5.1' }, url);
    }) as unknown as typeof fetch;

    const result = await testConnection(settings);

    expect(result).toEqual({ version: '4.5.1', baseUrl: 'https://sab.test', redirect: 'followed' });
    const post = calls.at(-1);
    expect(post?.method).toBe('POST');
    expect(post?.url).toBe('https://sab.test/api');
    expect(post?.body).toBeInstanceOf(FormData);
    expect((post?.body as FormData).get('apikey')).toBe('key');
  });

  test('reports a wrong API key from SABnzbd', async () => {
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('mode=queue')) return answered({ status: false, error: 'API Key Incorrect' }, url);
      return answered({ version: '4.5.1' }, url);
    }) as unknown as typeof fetch;

    await expect(testConnection(settings)).rejects.toThrow('API Key Incorrect');
  });

  test('fails when the upload step is rejected even though the GETs worked', async () => {
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') return answered({ status: false, error: 'blocked' }, url, { status: 403 });
      if (url.includes('mode=queue')) return answered({ queue: {} }, url);
      return answered({ version: '4.5.1' }, url);
    }) as unknown as typeof fetch;

    await expect(testConnection(settings)).rejects.toThrow('Testing upload (POST): SABnzbd answered HTTP 403');
  });

  test('names the step and host when the network fails', async () => {
    globalThis.fetch = mock(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;

    await expect(testConnection(settings)).rejects.toThrow(
      'Checking version: could not reach http://sab.test (Failed to fetch)',
    );
  });
});
