export interface NzbItem {
  id: string;
  name: string;
  /** SABnzbd category hint scraped from the page, if any. */
  category: string | null;
  /** Direct download link as shown on the site. */
  downloadUrl: string;
}

export type Request = { type: 'add-nzb'; item: NzbItem };
export type Response = { status: 'ok' } | { status: 'error'; message: string };
