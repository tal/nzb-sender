import { browser } from 'wxt/browser';
import type { NzbItem, Request, Response } from '../lib/messages';
import { omgwtfnzbs } from '../lib/sites/omgwtfnzbs';
import type { FoundItem } from '../lib/sites/types';

type ButtonState = 'idle' | 'sending' | 'done' | 'error';

const LABEL: Record<ButtonState, string> = {
  idle: '⇩ SAB',
  sending: '… sending',
  done: '✓ queued',
  error: '✗ failed',
};

const MAX_ERROR_LABEL = 48;

/** Errors show their reason on the button itself; the full text stays in the tooltip. */
function label(state: ButtonState, detail: string): string {
  if (state !== 'error' || !detail) return LABEL[state];
  const short = detail.length > MAX_ERROR_LABEL ? `${detail.slice(0, MAX_ERROR_LABEL - 1)}…` : detail;
  return `✗ ${short}`;
}

function setState(btn: HTMLButtonElement, state: ButtonState, title = '') {
  btn.dataset.state = state;
  btn.textContent = label(state, title);
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

interface HistoryBadge {
  item: NzbItem;
  badge: HTMLSpanElement;
}

let historySyncing = false;
let historyUpdating = false;
let lastHistoryCheck = 0;

async function updateHistory(entries: HistoryBadge[]) {
  if (!entries.length) return;
  try {
    const req: Request = { type: 'check-history', names: [...new Set(entries.map(({ item }) => item.name))] };
    const res = (await browser.runtime.sendMessage(req)) as Response;
    if (res.status === 'error') throw new Error(res.message);
    if (!res.history) throw new Error('No history response from SABnzbd');
    historySyncing = !!res.historySyncing;
    const matches = new Map(res.history.map((match) => [match.name, match]));
    for (const { item, badge } of entries) {
      const match = matches.get(item.name);
      badge.textContent = match?.downloaded ? '✓ downloaded'
        : res.historyError ? '⚠ history update unavailable'
        : !res.historyReady ? '… importing history' : '';
      badge.style.color = match?.downloaded ? '#5abf73' : '#d9a441';
      badge.title = match?.downloaded
        ? `Saved locally: completed in SABnzbd${match.completed ? ` on ${new Date(match.completed * 1000).toLocaleString()}` : ''}`
        : res.historyError ?? (!res.historyReady ? 'Importing SABnzbd history into local browser storage'
          : 'No completed download found in local history');
    }
  } catch (err) {
    for (const { badge } of entries) {
      badge.textContent = '⚠ history unavailable';
      badge.style.color = '#d9a441';
      badge.title = err instanceof Error ? err.message : String(err);
    }
  }
}

function inject(entries: Set<HistoryBadge>) {
  const added: HistoryBadge[] = [];
  for (const found of omgwtfnzbs.findItems(document)) {
    if (found.anchor.parentElement?.querySelector('.nzb-sender-btn')) continue;
    const badge = document.createElement('span');
    badge.className = 'nzb-sender-history';
    badge.style.cssText = 'margin-left:6px;font-size:11px;vertical-align:middle;';
    badge.textContent = '… checking history';
    badge.setAttribute('role', 'status');
    found.anchor.after(makeButton(found), badge);
    const entry = { item: found.item, badge };
    entries.add(entry);
    added.push(entry);
  }
  for (const entry of entries) if (!entry.badge.isConnected) entries.delete(entry);
  void updateHistory(added);
}

export default defineContentScript({
  matches: ['*://omgwtfnzbs.org/*', '*://*.omgwtfnzbs.org/*'],
  main(ctx) {
    const entries = new Set<HistoryBadge>();
    inject(entries);
    // The site can re-render rows (sorting, ajax); keep buttons in sync.
    const observer = new MutationObserver(() => inject(entries));
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(() => {
      // During import, poll local memory only. SABnzbd requests are independently rate limited.
      if (!document.hidden && !historyUpdating && (historySyncing || Date.now() - lastHistoryCheck >= 60_000)) {
        historyUpdating = true;
        lastHistoryCheck = Date.now();
        void updateHistory([...entries]).finally(() => { historyUpdating = false; });
      }
    }, 2_000);
    ctx.onInvalidated(() => {
      observer.disconnect();
      window.clearInterval(timer);
    });
  },
});
