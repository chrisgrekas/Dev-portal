import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RuleAction } from '../../api/types';
import { methodTone } from '../../lib/actions';
import { useCustomerContext } from '../../lib/customer';
import { CodeView, CopyIcon } from '../Code';
import { Badge, Icon, Segmented } from '../ui';

/** Λεπτή μπάρα «Trigger / Condition» στην κορυφή του Action Stack. */
export function ConditionBar({ condition }: { condition: string }) {
  return (
    <div className="condition-bar">
      <span className="condition-label">Trigger / Condition</span>
      <code className="condition-text">{condition}</code>
      <CopyIcon text={condition} label="Αντιγραφή συνθήκης" />
    </div>
  );
}

type HttpTab = 'headers' | 'request' | 'response';
const HTTP_TABS: { key: HttpTab; label: string }[] = [
  { key: 'headers', label: 'Headers' },
  { key: 'request', label: 'Request' },
  { key: 'response', label: 'Response' },
];

function HttpBody({ action }: { action: RuleAction }) {
  // Μόνο τα tabs που έχουν περιεχόμενο· προεπιλογή το Request αν υπάρχει.
  const available = HTTP_TABS.filter((t) => action[t.key]?.trim());
  const [tab, setTab] = useState<HttpTab>(available.find((t) => t.key === 'request')?.key ?? available[0]?.key ?? 'request');
  if (!available.length) return <p className="action-muted">Χωρίς headers / request / response.</p>;
  const current = available.some((t) => t.key === tab) ? tab : available[0].key;
  return (
    <div className="action-http-body">
      <Segmented label="Περιεχόμενο κλήσης" value={current} onChange={setTab} options={available.map((t) => ({ value: t.key, label: t.label }))} />
      <CodeView code={action[current] ?? ''} label={HTTP_TABS.find((t) => t.key === current)?.label} />
    </div>
  );
}

function ActionCard({ action, index }: { action: RuleAction; index: number }) {
  const ctx = useCustomerContext();
  const head = (
    <div className="action-head">
      <Badge tone="neutral">{action.typeName}</Badge>
      {action.title && <span className="action-title">{action.title}</span>}
    </div>
  );

  let body = null;
  switch (action.layout) {
    case 'http':
      body = (
        <>
          <div className="action-http-line">
            {action.method && <Badge tone={methodTone(action.method)}>{action.method}</Badge>}
            {action.url ? (
              <>
                <code className="action-url" title={action.url}>
                  {action.url}
                </code>
                <CopyIcon text={action.url} label="Αντιγραφή URL" />
              </>
            ) : (
              <span className="action-muted">Χωρίς URL</span>
            )}
          </div>
          <HttpBody action={action} />
        </>
      );
      break;
    case 'code':
    case 'text':
      body = action.content?.trim() ? (
        <CodeView code={action.content} label={action.layout === 'code' ? 'Κώδικας' : action.typeName} />
      ) : (
        <p className="action-muted">Κενό.</p>
      );
      break;
    case 'rule_ref':
      body = action.targetRuleId ? (
        <Link to={ctx.link(`/rules/${action.targetRuleId}`)} className="action-rule-link">
          <Icon name="arrow" size={14} />
          <span>
            Apply Rule: <span className="mono">{action.targetRuleName ?? `#${action.targetRuleId}`}</span>
          </span>
          <Icon name="chevron" size={14} />
        </Link>
      ) : (
        <p className="action-muted">Δεν έχει επιλεγεί rule.</p>
      );
      break;
    case 'status':
      body = (
        <div className="action-status-line">
          <span className="status-pill">{action.statusName || '—'}</span>
          {action.conditionNote && <span className="action-muted">{action.conditionNote}</span>}
        </div>
      );
      break;
  }

  return (
    <li className={`action-card action-${action.layout}`}>
      <span className="action-index" aria-label={`Ενέργεια ${index + 1}`}>
        {index + 1}
      </span>
      <div className="action-main">
        {head}
        {body}
      </div>
    </li>
  );
}

/**
 * Το περιεχόμενο μιας έκδοσης: Action Stack αν έχει ενέργειες, αλλιώς ο κώδικας όπως πριν.
 * Αν μια έκδοση έχει και ενέργειες και ελεύθερο κώδικα, ο κώδικας εμφανίζεται από κάτω.
 */
export function VersionContent({
  version,
}: {
  version: { version: number; code: string; triggerCondition: string | null; actions: RuleAction[] | null };
}) {
  const actions = version.actions ?? [];
  if (actions.length)
    return (
      <>
        <ActionStack actions={actions} triggerCondition={version.triggerCondition} />
        {version.code && (
          <div className="action-extra-code">
            <CodeView code={version.code} label={`Κώδικας · v${version.version}`} />
          </div>
        )}
      </>
    );
  return (
    <div className="action-stack">
      {version.triggerCondition && <ConditionBar condition={version.triggerCondition} />}
      {version.code ? (
        <CodeView code={version.code} label={`v${version.version}`} />
      ) : (
        <div className="state">
          <p className="state-title">Χωρίς περιεχόμενο ακόμα</p>
          <p className="state-text">Placeholder rule — πρόσθεσε ενέργειες ή κώδικα με «Νέα έκδοση».</p>
        </div>
      )}
    </div>
  );
}

/** Οι ενέργειες μιας έκδοσης, με σειρά εκτέλεσης. */
export function ActionStack({ actions, triggerCondition }: { actions: RuleAction[]; triggerCondition?: string | null }) {
  return (
    <div className="action-stack">
      {triggerCondition && <ConditionBar condition={triggerCondition} />}
      <ol className="action-list">
        {actions.map((a, i) => (
          <ActionCard key={a.id} action={a} index={i} />
        ))}
      </ol>
    </div>
  );
}
