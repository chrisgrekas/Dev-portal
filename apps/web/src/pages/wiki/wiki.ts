import type { FieldSystem, WikiCategory } from '../../api/types';

export const CATEGORIES: WikiCategory[] = ['guide', 'general', 'rules'];
export const SYSTEMS: FieldSystem[] = ['myclaim', 'wedat'];

export const CATEGORY_LABEL: Record<WikiCategory, string> = {
  guide: 'Οδηγοί',
  general: 'Γενικά',
  rules: 'Rules',
};

export const SYSTEM_LABEL: Record<FieldSystem, string> = {
  myclaim: 'myClaim',
  wedat: 'weDAT',
};

export const FIELD_TYPES = ['string', 'number', 'boolean', 'date', 'datetime', 'enum', 'object', 'array'];

/** Απλό κείμενο από markdown, για προεπισκόπηση σε λίστες. */
export function plainExcerpt(md: string, max = 180) {
  const text = md
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, ' ') // γραμμή διαχωρισμού πίνακα
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/^ · | · $/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/( ·)+ /g, ' · ')
    .replace(/^· | ·$/g, '')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
