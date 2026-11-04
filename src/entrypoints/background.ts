import { browser } from 'wxt/browser';
import type { Request, Response } from '../lib/messages';
import { addNzb } from '../lib/sabnzbd';
import { loadSettings } from '../lib/settings';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    const req = raw as Request;
    if (req?.type !== 'add-nzb') return;
    loadSettings()
      .then((settings) => addNzb(settings, req.item))
      .then((): Response => ({ status: 'ok' }))
      .catch((err): Response => ({ status: 'error', message: err instanceof Error ? err.message : String(err) }))
      .then(sendResponse);
    return true; // keep the channel open for the async reply
  });
});
