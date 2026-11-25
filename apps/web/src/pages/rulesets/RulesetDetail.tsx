import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { RulesetDetail as RulesetDetailT } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useCustomerContext } from '../../lib/customer';
import { Button, Empty, ErrorState, Icon, Loading, PageHeader, Section } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useIdParam, useTitle } from '../../lib/hooks';
import NotFound from '../NotFound';
import { RulesetSheet } from './RulesetSheet';

export default function RulesetDetail() {
  const id = useIdParam();
  if (id === null) return <NotFound />;
  return <RulesetPage id={id} />;
}

function RulesetPage({ id }: { id: number }) {
  const { canEdit } = useAuth();
  const ctx = useCustomerContext();
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ['ruleset', id], queryFn: () => api<RulesetDetailT>(`/rulesets/${id}`) });
  useTitle(query.data?.name);

  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <>
        <PageHeader title="Ruleset" back={ctx.back} />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </>
    );

  const rs = query.data;
  // Ομαδοποίηση βημάτων ανά workflow
  const byWorkflow = new Map<number, { name: string; steps: { id: number; name: string }[] }>();
  for (const s of rs.steps) {
    const g = byWorkflow.get(s.workflow.id) ?? { name: s.workflow.name, steps: [] };
    g.steps.push({ id: s.id, name: s.name });
    byWorkflow.set(s.workflow.id, g);
  }

  return (
    <>
      <PageHeader
        back={ctx.back}
        title={<span className="mono">{rs.name}</span>}
        subtitle={rs.description}
        actions={
          canEdit && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Επεξεργασία
            </Button>
          )
        }
      />

      <Section title="Rules" actions={<span className="section-note">με σειρά εκτέλεσης</span>}>
        {rs.rules.length === 0 ? (
          <Empty title="Κανένα rule" />
        ) : (
          <ol className="list">
            {rs.rules.map((r, i) => (
              <li key={r.id}>
                <Link to={ctx.link(`/rules/${r.id}`)} className="list-row">
                  <span className="order-no">{i + 1}</span>
                  <div className="list-main">
                    <div className="list-title mono">{r.name}</div>
                    {r.description && <div className="list-sub">{r.description}</div>}
                  </div>
                  <Icon name="chevron" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Τρέχει στα βήματα">
        {byWorkflow.size === 0 ? (
          <Empty title="Δεν έχει συνδεθεί με βήμα workflow" />
        ) : (
          <ul className="list">
            {[...byWorkflow.entries()].map(([wid, g]) => (
              <li key={wid}>
                <Link to={ctx.link(`/workflows/${wid}`)} className="list-row">
                  <div className="list-main">
                    <div className="list-title">{g.name}</div>
                    <div className="list-sub">{g.steps.map((s) => s.name).join(' · ')}</div>
                  </div>
                  <Icon name="chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="footnote">Τελευταία αλλαγή {formatDateTime(rs.updatedAt)}</p>

      {editing && <RulesetSheet ruleset={rs} onClose={() => setEditing(false)} />}
    </>
  );
}
