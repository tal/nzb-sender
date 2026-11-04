import { browser } from 'wxt/browser';
import type { Request, Response } from '../lib/messages';
import { omgwtfnzbs } from '../lib/sites/omgwtfnzbs';
import type { FoundItem } from '../lib/sites/types';

type ButtonState = 'idle' | 'sending' | 'done' | 'error';

const LABEL: Record<ButtonState, string> = {
  idle: '⇩ SAB',
  sending: '… sending',
  done: '✓ queued',
  error: '✗ failed',
};

function setState(btn: HTMLButtonElement, state: ButtonState, title = '') {
  btn.dataset.state = state;
  btn.textContent = LABEL[state];
  btn.title = title || 'Send to SABnzbd';
  btn.disabled = state === 'sending';
}

function makeButton({ item }: FoundItem): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nzb-sender-btn';
  btn.style.cssText =
    'margin-left:6px;padding:1px 6px;font-size:11px;cursor:pointer;border:1px solid #888;border-radius:3px;background:#222;color:#eee;vertical-align:middle;';
  setState(btn, 'idle');
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setState(btn, 'sending');
    try {
      const req: Request = { type: 'add-nzb', item };
      const res = (await browser.runtime.sendMessage(req)) as Response;
      if (res.status === 'ok') setState(btn, 'done');
      else setState(btn, 'error', res.message);
    } catch (err) {
      setState(btn, 'error', err instanceof Error ? err.message : String(err));
    }
  });
  return btn;
}

function inject() {
  for (const found of omgwtfnzbs.findItems(document)) {
    if (found.anchor.parentElement?.querySelector('.nzb-sender-btn')) continue;
    found.anchor.after(makeButton(found));
  }
}

export default defineContentScript({
  matches: ['*://omgwtfnzbs.org/*', '*://*.omgwtfnzbs.org/*'],
  main() {
    inject();
    // The site can re-render rows (sorting, ajax); keep buttons in sync.
    new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
  },
});
