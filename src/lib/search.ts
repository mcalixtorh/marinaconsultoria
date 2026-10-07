import type { AppState, Item, Note, Routine } from '../types';

/** minúsculas, sem acento ("Gabriella" = "gabriélla") */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function matches(haystack: string, terms: string[]): boolean {
  const h = normalize(haystack);
  return terms.every((t) => h.includes(t));
}

export interface SearchResult {
  items: Item[];
  routines: Routine[];
  notes: Note[];
}

export function search(state: AppState, query: string): SearchResult {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { items: [], routines: [], notes: [] };
  const catName = (id: string) => state.categories.find((c) => c.id === id)?.name ?? '';
  return {
    items: state.items.filter((i) => matches([i.title, i.desc, i.person ?? '', catName(i.cat)].join(' \n '), terms)),
    routines: state.routines.filter((r) => matches([r.name, ...r.steps.map((s) => s.t)].join(' \n '), terms)),
    notes: state.notes.filter((n) => matches(n.text, terms)),
  };
}
