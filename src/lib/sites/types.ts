import type { NzbItem } from '../messages';

export interface FoundItem {
  item: NzbItem;
  /** The button is inserted right after this element. */
  anchor: Element;
}

/** One adapter per indexer. Add a new file next to omgwtfnzbs.ts and register it in the content script. */
export interface Site {
  findItems(root: ParentNode): FoundItem[];
}
