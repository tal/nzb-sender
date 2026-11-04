import type { FoundItem, Site } from './types';

/** Reads `<!---<sabcategory>tv</sabcategory>-->` which the site leaves inside every result row. */
function sabCategory(row: Element): string | null {
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_COMMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const m = /<sabcategory>([^<]*)<\/sabcategory>/.exec(n.nodeValue ?? '');
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export const omgwtfnzbs: Site = {
  findItems(root) {
    const found: FoundItem[] = [];
    for (const row of root.querySelectorAll('tr.nzbt_row')) {
      const checkbox = row.querySelector<HTMLInputElement>('input[name="check[]"]');
      const link = row.querySelector<HTMLAnchorElement>('a[href*="/send?id="]');
      if (!checkbox || !link) continue;
      found.push({
        anchor: link,
        item: {
          id: checkbox.value,
          name: checkbox.getAttribute('rlsname') ?? checkbox.value,
          category: sabCategory(row),
          downloadUrl: link.href,
        },
      });
    }
    return found;
  },
};
