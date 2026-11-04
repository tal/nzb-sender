import { browser } from 'wxt/browser';
import { testConnection } from '../../lib/sabnzbd';
import {
  type CategoryMode,
  type Priority,
  type SendMethod,
  type Settings,
  loadSettings,
  sabOrigin,
  saveSettings,
} from '../../lib/settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');

function read(): Settings {
  return {
    sabUrl: $<HTMLInputElement>('sabUrl').value.trim(),
    apiKey: $<HTMLInputElement>('apiKey').value.trim(),
    sendMethod: $<HTMLSelectElement>('sendMethod').value as SendMethod,
    categoryMode: $<HTMLSelectElement>('categoryMode').value as CategoryMode,
    customCategory: $<HTMLInputElement>('customCategory').value.trim(),
    priority: $<HTMLSelectElement>('priority').value as Priority,
    nzbUrlTemplate: $<HTMLInputElement>('nzbUrlTemplate').value.trim(),
  };
}

function write(s: Settings) {
  $<HTMLInputElement>('sabUrl').value = s.sabUrl;
  $<HTMLInputElement>('apiKey').value = s.apiKey;
  $<HTMLSelectElement>('sendMethod').value = s.sendMethod;
  $<HTMLSelectElement>('categoryMode').value = s.categoryMode;
  $<HTMLInputElement>('customCategory').value = s.customCategory;
  $<HTMLSelectElement>('priority').value = s.priority;
  $<HTMLInputElement>('nzbUrlTemplate').value = s.nzbUrlTemplate;
  refreshVisibility();
}

function refreshVisibility() {
  const s = read();
  $('urlRow').hidden = s.sendMethod !== 'addurl';
  $('customCategory').hidden = s.categoryMode !== 'custom';
}

/** SABnzbd lives on a user-chosen host, so ask for access to just that origin. */
async function ensureHostAccess(sabUrl: string): Promise<void> {
  const origins = [`${sabOrigin(sabUrl)}/*`];
  if (await browser.permissions.contains({ origins })) return;
  if (!(await browser.permissions.request({ origins }))) throw new Error('Host permission denied');
}

async function run(action: (s: Settings) => Promise<string>) {
  status.textContent = '…';
  try {
    const s = read();
    await ensureHostAccess(s.sabUrl);
    status.textContent = await action(s);
  } catch (err) {
    status.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
  }
}

$('save').addEventListener('click', () =>
  run(async (s) => {
    await saveSettings(s);
    return '✓ Saved';
  }),
);
$('test').addEventListener('click', () =>
  run(async (s) => `✓ Connected, SABnzbd ${await testConnection(s)}`),
);
for (const id of ['sendMethod', 'categoryMode']) $(id).addEventListener('change', refreshVisibility);

loadSettings().then(write);
