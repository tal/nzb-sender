import { browser } from 'wxt/browser';
import type { Request, Response } from '../lib/messages';
import { addNzb, testConnection } from '../lib/sabnzbd';
import { createHistoryService } from '../lib/history';
import { loadSettings } from '../lib/settings';

export default defineBackground(() => {
  const history = createHistoryService({
    get: async (key) => (await browser.storage.local.get(key))[key],
    set: async (key, value) => { await browser.storage.local.set({ [key]: value }); },
  });
  const seedHistory = () => {
    void loadSettings().then((settings) => {
      if (settings.apiKey) return history.check(settings, []);
    }).catch(() => {});
  };
  browser.runtime.onStartup.addListener(seedHistory);
  seedHistory();
  browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    const req = raw as Request;
    if (req?.type !== 'add-nzb' && req?.type !== 'check-history' && req?.type !== 'test-connection') return;
    loadSettings()
      .then(async (settings): Promise<Response> => {
        switch (req.type) {
          case 'check-history':
            return { status: 'ok', ...await history.check(settings, req.names) };
          case 'test-connection':
            // Uses the form's values, not the saved ones, so Test reflects what the user is looking at.
            return { status: 'ok', connection: await testConnection(req.settings) };
          case 'add-nzb':
            await addNzb(settings, req.item);
            return { status: 'ok' };
        }
      })
      .catch((err): Response => ({ status: 'error', message: err instanceof Error ? err.message : String(err) }))
      .then(sendResponse);
    return true; // keep the channel open for the async reply
  });
});
