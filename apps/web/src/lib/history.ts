// Κοινά για την προβολή ιστορικού αλλαγών.

export const ENTITY_LABEL: Record<string, string> = {
  Customer: 'Πελάτης',
  Workflow: 'Workflow',
  Rule: 'Rule',
  Ruleset: 'Ruleset',
  WikiArticle: 'Άρθρο wiki',
  WikiField: 'Πεδίο wiki',
};

export const ENTITY_ROUTE: Record<string, string> = {
  Rule: 'rules',
  Ruleset: 'rulesets',
  Workflow: 'workflows',
  WikiArticle: 'wiki',
};

export function describeAction(action: string) {
  if (action === 'create') return 'Δημιουργία';
  if (action === 'update') return 'Αλλαγή στοιχείων';
  if (action.startsWith('delete')) return `Διαγραφή${action.slice(6)}`;
  const v = /^version (\d+)$/.exec(action);
  if (v) return `Νέα έκδοση v${v[1]}`;
  const step = /^(add|update) step "(.*)"$/.exec(action);
  if (step) return `${step[1] === 'add' ? 'Νέο βήμα' : 'Αλλαγή βήματος'} «${step[2]}»`;
  if (action.startsWith('add transition')) return 'Νέα μετάβαση';
  return action;
}
