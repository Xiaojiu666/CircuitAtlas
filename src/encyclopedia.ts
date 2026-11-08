import { DEFINITIONS } from './model';
import type { Kind } from './model';
import { BOARD_ARTICLES } from './boardKnowledge';
import { filterKnowledge, kindFromHash, KNOWLEDGE_KINDS } from './knowledge';

export type EncyclopediaId = Kind | `pcb-${string}`;
export type EncyclopediaDomain = '' | 'industrial' | 'board';
export interface EncyclopediaItem {
  id: EncyclopediaId;
  name: string;
  subtitle: string;
  category: string;
  domain: Exclude<EncyclopediaDomain, ''>;
  kind?: Kind;
}
export const ENCYCLOPEDIA_ITEMS: EncyclopediaItem[] = [
  ...KNOWLEDGE_KINDS.map((kind) => ({
    id: kind, name: DEFINITIONS[kind].name, subtitle: DEFINITIONS[kind].spec,
    category: DEFINITIONS[kind].category, domain: 'industrial' as const, kind,
  })),
  ...BOARD_ARTICLES.map((entry) => ({
    id: entry.id, name: entry.title, subtitle: entry.aliases.slice(0, 3).join(' / '),
    category: entry.category, domain: 'board' as const,
  })),
];
export function encyclopediaIdFromHash(hash: string): EncyclopediaId | null {
  const kind = kindFromHash(hash);
  if (kind) return kind;
  try {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    return BOARD_ARTICLES.find((entry) => entry.id === id)?.id ?? null;
  } catch { return null; }
}
export function filterEncyclopedia(search: string, domain: EncyclopediaDomain = '', category = '', group = '') {
  const kinds = new Set(filterKnowledge(search, category, group));
  const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return ENCYCLOPEDIA_ITEMS.filter((item) => {
    if ((domain && item.domain !== domain) || (category && item.category !== category)) return false;
    if (item.kind) return kinds.has(item.kind);
    if (group) return false;
    const entry = BOARD_ARTICLES.find((article) => article.id === item.id)!;
    const text = [entry.title, ...entry.aliases, entry.category, entry.purpose, entry.principle,
      ...entry.specifications.flat(), entry.source.brand].join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
export function encyclopediaCategories(domain: EncyclopediaDomain) {
  return [...new Set(ENCYCLOPEDIA_ITEMS.filter((item) => !domain || item.domain === domain).map((item) => item.category))];
}
