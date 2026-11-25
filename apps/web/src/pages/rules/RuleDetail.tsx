import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Rule } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useCustomerContext } from '../../lib/customer';
import { VersionContent } from '../../components/actions/ActionStack';
import { RuleChain } from '../../components/actions/RuleChain';
import { hasActions } from '../../lib/actions';
import { Chip } from '../../components/Pickers';
import { Badge, Button, Empty, ErrorState, Loading, PageHeader, Segmented } from '../../components/ui';
import { formatDateTime, timeAgo } from '../../lib/format';
import { useIdParam, useTitle } from '../../lib/hooks';
import NotFound from '../NotFound';
import { EditRuleSheet, NewVersionSheet } from './RuleSheets';
import { VersionHistory } from './VersionHistory';

type Tab = 'code' | 'history';

export default function RuleDetail() {
  const id = useIdParam();
  if (id === null) return <NotFound />;
  return <RuleDetailPage id={id} />;
}

function RuleDetailPage({ id }: { id: number }) {
  const { canEdit } = useAuth();
  const ctx = useCustomerContext();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'history' ? 'history' : 'code';
  const [sheet, setSheet] = useState<null | 'version' | 'edit'>(null);

  const query = useQuery({ queryKey: ['rule', id], queryFn: () => api<Rule>(`/rules/${id}`) });
  useTitle(query.data?.name);

  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <>
        <PageHeader title="Rule" back={ctx.back} />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </>
    );

  const rule = query.data;
  const cv = rule.currentVersion;

  return (
    <>
      <PageHeader
        back={ctx.back}
        title={<span className="mono">{rule.name}</span>}
        subtitle={rule.description}
        actions={
          canEdit && (
            <>
              <Button variant="secondary" onClick={() => setSheet('edit')}>
                Επεξεργασία
              </Button>
              <Button onClick={() => setSheet('version')}>Νέα έκδοση</Button>
            </>
          )
        }
      />

      <dl className="meta">
        <div>
          <dt>Έκδοση</dt>
          <dd>
            {cv ? (
              <>
                <Badge>v{cv.version}</Badge>
                <span className="meta-muted" title={formatDateTime(cv.createdAt)}>
                  {cv.author} · {timeAgo(cv.createdAt)}
                </span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Πελάτες</dt>
          <dd>{rule.customers.length ? rule.customers.map((c) => <Chip key={c.id}>{c.name}</Chip>) : '—'}</dd>
        </div>
        <div>
          <dt>Περιβάλλοντα</dt>
          <dd>{rule.environments.length ? rule.environments.map((e) => <Chip key={e.id}>{e.name}</Chip>) : '—'}</dd>
        </div>
        <div>
          <dt>Rulesets</dt>
          <dd>
            {rule.rulesets.length
              ? rule.rulesets.map((r) => (
                  <Link key={r.id} to={ctx.link(`/rulesets/${r.id}`)} className="chip chip-link">
                    {r.name}
                  </Link>
                ))
              : '—'}
          </dd>
        </div>
        {(rule.myclaimId || rule.source === 'sync') && (
          <div>
            <dt>myClaim</dt>
            <dd>
              {rule.myclaimId && <span className="mono">{rule.myclaimId}</span>}
              {rule.source === 'sync' && <Badge tone="accent">sync</Badge>}
            </dd>
          </div>
        )}
      </dl>

      <div className="tabs-row">
        <Segmented
          label="Ενότητα"
          value={tab}
          onChange={(t) => setParams((p) => { const n = new URLSearchParams(p); if (t === 'code') n.delete('tab'); else n.set('tab', t); return n; }, { replace: true })}
          options={[
            { value: 'code', label: hasActions(cv) ? 'Ενέργειες' : 'Κώδικας' },
            { value: 'history', label: 'Ιστορικό' },
          ]}
        />
      </div>

      {tab === 'code' && <RuleChain key={rule.id} name={rule.name} calls={rule.calls ?? []} calledBy={rule.calledBy ?? []} />}

      {tab === 'code' ? (
        cv ? (
          <>
            <p className="reason-line">
              <span className="reason-label">Τελευταία αλλαγή</span> {cv.reason}
            </p>
            <VersionContent version={cv} />
          </>
        ) : (
          <Empty title="Δεν υπάρχει έκδοση" />
        )
      ) : (
        <VersionHistory ruleId={rule.id} />
      )}

      {sheet === 'version' && <NewVersionSheet rule={rule} onClose={() => setSheet(null)} />}
      {sheet === 'edit' && <EditRuleSheet rule={rule} onClose={() => setSheet(null)} />}
    </>
  );
}
