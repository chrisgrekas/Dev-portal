import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RuleRef } from '../../api/types';
import { useCustomerContext } from '../../lib/customer';

const VISIBLE = 3;

function Pills({ rules }: { rules: RuleRef[] }) {
  const ctx = useCustomerContext();
  const [expanded, setExpanded] = useState(false);
  if (!rules.length) return <span className="chain-none">—</span>;
  const shown = expanded ? rules : rules.slice(0, VISIBLE);
  const hidden = rules.length - shown.length;
  return (
    <span className="chain-pills">
      {shown.map((r) => (
        <Link key={r.id} to={ctx.link(`/rules/${r.id}`)} className="chain-pill mono" title={r.name}>
          {r.name}
        </Link>
      ))}
      {hidden > 0 && (
        <button type="button" className="chain-more" onClick={() => setExpanded(true)} aria-label={`Εμφάνιση ακόμα ${hidden}`}>
          +{hidden}
        </button>
      )}
    </span>
  );
}

/**
 * Αλυσίδα εκτέλεσης: ποια rules καλούν αυτό ← [τρέχον] → ποια καλεί.
 * Δεν πιάνει καθόλου χώρο όταν δεν υπάρχουν συνδέσεις.
 */
export function RuleChain({ name, calls, calledBy }: { name: string; calls: RuleRef[]; calledBy: RuleRef[] }) {
  if (!calls.length && !calledBy.length) return null;
  return (
    <nav className="rule-chain" aria-label="Αλυσίδα εκτέλεσης">
      <div className="chain-zone chain-in">
        <span className="chain-label">← Καλείται από</span>
        <Pills rules={calledBy} />
      </div>
      <div className="chain-zone chain-current">
        <span className="chain-pill chain-self mono" aria-current="page">
          {name}
        </span>
      </div>
      <div className="chain-zone chain-out">
        <span className="chain-label">Καλεί →</span>
        <Pills rules={calls} />
      </div>
    </nav>
  );
}
