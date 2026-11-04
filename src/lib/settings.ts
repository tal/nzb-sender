import { browser } from 'wxt/browser';

export type SendMethod = 'addfile' | 'addurl';
export type CategoryMode = 'page' | 'custom' | 'none';
export type Priority = 'default' | 'low' | 'normal' | 'high' | 'force';

export interface Settings {
  sabUrl: string;
  apiKey: string;
  sendMethod: SendMethod;
  categoryMode: CategoryMode;
  customCategory: string;
  priority: Priority;
  /** Only used by `addurl`. `{id}` is replaced with the release id. Put your omgwtfnzbs API key in it. */
  nzbUrlTemplate: string;
}

export const DEFAULT_SETTINGS: Settings = {
  sabUrl: 'http://localhost:8080',
  apiKey: '',
  sendMethod: 'addfile',
  categoryMode: 'page',
  customCategory: '',
  priority: 'default',
  nzbUrlTemplate: 'https://omgwtfnzbs.org/send?id={id}',
};

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settings });
}

export function sabOrigin(sabUrl: string): string {
  return new URL(sabUrl).origin;
}
