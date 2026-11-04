import type { Settings } from './settings';

export interface NzbItem {
  id: string;
  name: string;
  /** SABnzbd category hint scraped from the page, if any. */
  category: string | null;
  /** Direct download link as shown on the site. */
  downloadUrl: string;
}

export interface HistoryResult {
  name: string;
  downloaded: boolean;
  /** Unix timestamp, when available. */
  completed?: number;
}

export type Redirect = 'none' | 'followed';

export interface ConnectionResult {
  version: string;
  /** SABnzbd base URL after following redirects (http → https etc.), without a trailing `/api`. */
  baseUrl: string;
  redirect: Redirect;
}

export type Request =
  | { type: 'add-nzb'; item: NzbItem }
  | { type: 'check-history'; names: string[] }
  /** Carries the (possibly unsaved) options form so Test exercises what the user sees. */
  | { type: 'test-connection'; settings: Settings };
export type Response =
  | { status: 'ok'; history?: HistoryResult[]; historySyncing?: boolean; historyReady?: boolean; historyError?: string; connection?: ConnectionResult }
  | { status: 'error'; message: string };
