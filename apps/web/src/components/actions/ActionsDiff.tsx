import type { RuleAction } from '../../api/types';
import { ACTION_FIELDS } from '../../lib/actions';
import { DiffView } from '../Code';
import { Badge, Empty } from '../ui';

const label = (a: RuleAction) => `${a.typeName}${a.title ? ` — ${a.title}` : ''}`;

/** Αναγνώσιμο κείμενο μιας ενέργειας — για όσες προστέθηκαν/αφαιρέθηκαν ολόκληρες. */
function serialize(a: RuleAction) {
  const lines = [label(a)];
  for (const f of ACTION_FIELDS[a.layout]) {
    const v = a[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (f.long) lines.push(`── ${f.label} ──`, String(v));
    else lines.push(`${f.label}: ${v}`);
  }
  return lines.join('\n');
}

type Change =
  | { kind: 'added'; index: number; action: RuleAction }
  | { kind: 'removed'; index: number; action: RuleAction }
  | { kind: 'changed'; index: number; before: RuleAction; after: RuleAction };

/** Τι άλλαξε στην ίδια ενέργεια: πεδία κειμένου με DiffView, μικρά πεδία ως «παλιό → νέο». */
function ChangedFields({ before, after, index }: { before: RuleAction; after: RuleAction; index: number }) {
  const fields = [
    { key: 'typeName' as const, label: 'Τύπος' },
    { key: 'title' as const, label: 'Τίτλος' },
    ...ACTION_FIELDS[after.layout],
  ];
  return (
    <div className="action-diff-fields">
      {fields.map((f) => {
        const a = String(before[f.key] ?? '');
        const b = String(after[f.key] ?? '');
        if (a === b) return null;
        if ('long' in f && f.long) return <DiffView key={f.key} oldText={a} newText={b} label={`#${index + 1} · ${f.label}`} />;
        return (
          <div key={f.key} className="action-diff-inline">
            <span className="action-diff-field">{f.label}</span>
            <span className="diff-old">{a || '—'}</span>
            <span className="action-diff-arrow">→</span>
            <span className="diff-new">{b || '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ConditionDiff({ before, after }: { before?: string | null; after?: string | null }) {
  const a = before?.trim() || '';
  const b = after?.trim() || '';
  if (a === b) return null;
  return (
    <div className="action-diff-inline condition-diff">
      <span className="action-diff-field">Trigger / Condition</span>
      <span className="diff-old">{a || '—'}</span>
      <span className="action-diff-arrow">→</span>
      <span className="diff-new">{b || '—'}</span>
    </div>
  );
}

type VersionLike = { code: string; triggerCondition?: string | null; actions?: RuleAction[] | null };

/**
 * Πλήρες diff δύο εκδόσεων: συνθήκη, ενέργειες (ανά ενέργεια) και ελεύθερος κώδικας.
 * Για παλιά rules χωρίς ενέργειες είναι απλώς το DiffView του κώδικα, όπως πριν.
 */
export function VersionDiff({ before, after, label: codeLabel }: { before: VersionLike; after: VersionLike; label?: string }) {
  const withActions = Boolean(before.actions?.length || after.actions?.length);
  const withCode = Boolean(before.code || after.code) || !withActions;
  return (
    <div className="version-diff">
      <ConditionDiff before={before.triggerCondition} after={after.triggerCondition} />
      {withActions && <ActionsDiff before={before.actions ?? []} after={after.actions ?? []} />}
      {withCode && <DiffView oldText={before.code} newText={after.code} label={withActions ? `Κώδικας · ${codeLabel ?? ''}` : codeLabel} />}
    </div>
  );
}

/** Diff ανά ενέργεια (ταίριασμα με το σταθερό id): μόνο όσες προστέθηκαν, αφαιρέθηκαν ή άλλαξαν. */
export function ActionsDiff({ before, after }: { before: RuleAction[]; after: RuleAction[] }) {
  const oldById = new Map(before.map((a, i) => [a.id, { a, i }]));
  const newIds = new Set(after.map((a) => a.id));
  const changes: Change[] = [];

  after.forEach((a, i) => {
    const prev = oldById.get(a.id);
    if (!prev) changes.push({ kind: 'added', index: i, action: a });
    else if (serialize(prev.a) !== serialize(a)) {
      changes.push({ kind: 'changed', index: i, before: prev.a, after: a });
    }
  });
  before.forEach((a, i) => {
    if (!newIds.has(a.id)) changes.push({ kind: 'removed', index: i, action: a });
  });

  // Άλλαξε μόνο η σειρά των κοινών ενεργειών;
  const common = after.filter((a) => oldById.has(a.id)).map((a) => a.id);
  const commonBefore = before.filter((a) => newIds.has(a.id)).map((a) => a.id);
  const reordered = common.join('|') !== commonBefore.join('|');

  const counts = {
    added: changes.filter((c) => c.kind === 'added').length,
    removed: changes.filter((c) => c.kind === 'removed').length,
    changed: changes.filter((c) => c.kind === 'changed').length,
  };

  if (!changes.length && !reordered) return <Empty title="Καμία αλλαγή στις ενέργειες" />;

  return (
    <div className="actions-diff">
      <div className="actions-diff-summary">
        {counts.added > 0 && <Badge tone="green">+{counts.added} νέες</Badge>}
        {counts.removed > 0 && <Badge tone="orange">−{counts.removed} αφαιρέθηκαν</Badge>}
        {counts.changed > 0 && <Badge tone="accent">{counts.changed} άλλαξαν</Badge>}
        {reordered && <Badge>άλλαξε η σειρά</Badge>}
      </div>
      {changes.map((c) => {
        if (c.kind === 'changed')
          return (
            <section key={`c-${c.after.id}`} className="action-diff-block">
              <h4 className="action-diff-title">
                <span className="action-index">{c.index + 1}</span> {label(c.after)} <span className="action-diff-tag changed">άλλαξε</span>
              </h4>
              <ChangedFields before={c.before} after={c.after} index={c.index} />
            </section>
          );
        const a = c.action;
        return (
          <section key={`${c.kind}-${a.id}`} className="action-diff-block">
            <h4 className="action-diff-title">
              <span className="action-index">{c.index + 1}</span> {label(a)}{' '}
              <span className={`action-diff-tag ${c.kind}`}>{c.kind === 'added' ? 'νέα' : 'αφαιρέθηκε'}</span>
            </h4>
            <DiffView
              oldText={c.kind === 'removed' ? serialize(a) : ''}
              newText={c.kind === 'added' ? serialize(a) : ''}
              label={`#${c.index + 1} · ${a.typeName}`}
            />
          </section>
        );
      })}
    </div>
  );
}
