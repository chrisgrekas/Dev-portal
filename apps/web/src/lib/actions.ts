import { api } from '../api/client';
import type { ActionLayout, ActionType, Rule, RuleAction, RuleListItem, RuleVersion } from '../api/types';

export const LAYOUT_LABEL: Record<ActionLayout, string> = {
  http: 'HTTP Call',
  code: 'Κώδικας',
  rule_ref: 'Rule',
  status: 'Status',
  text: 'Κείμενο',
};

/** Layouts που μπορεί να διαλέξει κάποιος για νέο τύπο (τα rule_ref/status είναι ειδικά). */
export const CREATABLE_LAYOUTS: ActionLayout[] = ['text', 'code', 'http'];

export const HTTP_METHODS = ['GET', 'POST JSON', 'POST XML', 'PUT JSON', 'PATCH JSON', 'DELETE'];

/** Χρώμα badge μεθόδου: JSON μπλε, XML πορτοκαλί, GET πράσινο. */
export function methodTone(method?: string): 'accent' | 'orange' | 'green' | 'neutral' {
  const m = (method ?? '').toUpperCase();
  if (m.includes('XML')) return 'orange';
  if (m.includes('JSON') || m.startsWith('POST') || m.startsWith('PUT') || m.startsWith('PATCH')) return 'accent';
  if (m.startsWith('GET')) return 'green';
  return 'neutral';
}

/** Σύντομο, σταθερό id (λειτουργεί και εκτός secure context, όπου δεν υπάρχει crypto.randomUUID). */
export function newActionId() {
  const rnd =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('')
      : Math.random().toString(36).slice(2, 14);
  return `a_${Date.now().toString(36)}${rnd}`.slice(0, 32);
}

export function newAction(type: Pick<ActionType, 'name' | 'layout'>): RuleAction {
  const a: RuleAction = { id: newActionId(), typeName: type.name, layout: type.layout };
  if (type.layout === 'http') a.method = 'POST JSON';
  return a;
}

const ACTION_KEYS: (keyof RuleAction)[] = [
  'id', 'typeName', 'layout', 'title', 'method', 'url', 'headers', 'request', 'response',
  'content', 'targetRuleId', 'targetRuleName', 'statusName', 'conditionNote',
];

/** Ίδια κανονικοποίηση με τον server: σταθερή σειρά, χωρίς κενά πεδία. */
export function canonicalActions(actions: RuleAction[] | null | undefined): RuleAction[] | null {
  if (!actions?.length) return null;
  return actions.map((a) => {
    const out: Record<string, unknown> = {};
    for (const k of ACTION_KEYS) {
      const v = a[k];
      if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) continue;
      out[k] = v;
    }
    return out as unknown as RuleAction;
  });
}

/** JSON με ταξινομημένα κλειδιά (το jsonb δεν κρατά τη σειρά). */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

type Content = Pick<RuleVersion, 'code' | 'triggerCondition' | 'actions'>;

/** Χωρίς targetRuleName: το ορίζει ο server από τη βάση, δεν είναι «αλλαγή» του χρήστη. */
const comparable = (actions: RuleAction[] | null | undefined) =>
  canonicalActions(actions)?.map(({ targetRuleName: _ignored, ...rest }) => rest) ?? null;

export function sameContent(a: Content, b: Content) {
  return (
    (a.code ?? '') === (b.code ?? '') &&
    (a.triggerCondition?.trim() || null) === (b.triggerCondition?.trim() || null) &&
    stable(comparable(a.actions)) === stable(comparable(b.actions))
  );
}

export const hasActions = (v: Pick<RuleVersion, 'actions'> | null | undefined) => Boolean(v?.actions && v.actions.length > 0);

/** Placeholder rule (μόνο όνομα) — για «+ Δημιουργία rule» μέσα σε φόρμες χωρίς να κλείνουν. */
export async function createPlaceholderRule(name: string, customerIds?: number[]): Promise<RuleListItem> {
  const r = await api<Rule>('/rules', {
    method: 'POST',
    body: { name: name.trim(), customerIds, reason: 'Placeholder — δημιουργήθηκε από φόρμα' },
  });
  // στο σχήμα των λιστών, ώστε να μπαίνει κατευθείαν στους pickers
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    myclaimId: r.myclaimId,
    source: r.source,
    updatedAt: r.updatedAt,
    currentVersion: r.currentVersion?.version ?? null,
  };
}

/** Τα πεδία κειμένου κάθε layout, με ετικέτα — για diff και προβολή. */
export const ACTION_FIELDS: Record<ActionLayout, { key: keyof RuleAction; label: string; long?: boolean }[]> = {
  http: [
    { key: 'method', label: 'Μέθοδος' },
    { key: 'url', label: 'URL' },
    { key: 'headers', label: 'Headers', long: true },
    { key: 'request', label: 'Request', long: true },
    { key: 'response', label: 'Response', long: true },
  ],
  code: [{ key: 'content', label: 'Κώδικας', long: true }],
  text: [{ key: 'content', label: 'Κείμενο', long: true }],
  rule_ref: [{ key: 'targetRuleName', label: 'Rule' }],
  status: [
    { key: 'statusName', label: 'Status' },
    { key: 'conditionNote', label: 'Συνθήκη' },
  ],
};
