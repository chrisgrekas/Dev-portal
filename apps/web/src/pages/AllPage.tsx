import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Page, RuleListItem, Ruleset, Workflow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Empty, Icon, PageHeader, Pagination, Resource, SearchField, Segmented, Toolbar } from '../components/ui';
import { count, timeAgo } from '../lib/format';
import { useEnvironments, useListParams, useTitle } from '../lib/hooks';
import { NewRuleSheet } from './rules/RuleSheets';
import { RulesetSheet } from './rulesets/RulesetSheet';
import { WorkflowSheet } from './workflows/WorkflowSheets';

type Kind = 'rules' | 'rulesets' | 'workflows';
const KINDS: Kind[] = ['rules', 'rulesets', 'workflows'];
const LABEL: Record<Kind, string> = { rules: 'Rules', rulesets: 'Rulesets', workflows: 'Workflows' };
const PAGE_SIZE = 25;

/**
 * Γενικές λίστες — κυρίως για ό,τι δεν ανήκει σε πελάτη (και άρα δεν φαίνεται σε κανένα Customer Hub).
 */
export default function AllPage() {
  useTitle('Όλα');
  const { canEdit } = useAuth();
  const envs = useEnvironments();
  const lp = useListParams();
  const kind = (KINDS.includes(lp.get('kind') as Kind) ? lp.get('kind') : 'rules') as Kind;
  const search = lp.get('q') ?? '';
  const onlyOrphans = lp.get('scope') !== 'all';
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: [kind, 'all-page', { search, page: lp.page, onlyOrphans }],
    queryFn: () =>
      api<Page<RuleListItem | Ruleset | Workflow>>(`/${kind}`, {
        query: { search, page: lp.page, pageSize: PAGE_SIZE, withoutCustomer: onlyOrphans ? 'true' : undefined },
      }),
    placeholderData: keepPreviousData,
  });
  const envName = (id: number | null) => envs.data?.find((e) => e.id === id)?.name;
  const one = { rules: 'rule', rulesets: 'ruleset', workflows: 'workflow' }[kind];

  return (
    <>
      <PageHeader
        title="Όλα"
        subtitle={
          query.data
            ? `${count(query.data.total, one, LABEL[kind].toLowerCase())}${onlyOrphans ? ' χωρίς πελάτη' : ''}`
            : ' '
        }
        actions={
          canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" />
              Νέο {one}
            </Button>
          )
        }
      />
      <Toolbar>
        <Segmented label="Τύπος" value={kind} onChange={(k) => lp.update({ kind: k === 'rules' ? undefined : k })} options={KINDS.map((k) => ({ value: k, label: LABEL[k] }))} />
        <button
          type="button"
          className="toggle-chip"
          aria-pressed={onlyOrphans}
          onClick={() => lp.update({ scope: onlyOrphans ? 'all' : undefined })}
          title="Rules, rulesets και workflows που δεν ανήκουν σε κανέναν πελάτη"
        >
          {onlyOrphans && <Icon name="check" size={13} />}
          Μόνο χωρίς πελάτη
        </button>
        <SearchField value={search} onChange={(q) => lp.update({ q })} placeholder={`Αναζήτηση ${LABEL[kind].toLowerCase()}`} />
      </Toolbar>

      <Resource query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <Empty title={search ? 'Κανένα αποτέλεσμα' : onlyOrphans ? `Όλα τα ${LABEL[kind].toLowerCase()} ανήκουν σε πελάτη` : 'Δεν υπάρχει τίποτα ακόμα'}>
              {onlyOrphans && !search && 'Ωραία — τίποτα δεν έχει μείνει χωρίς πελάτη.'}
            </Empty>
          ) : (
            <>
              <ul className={`list${query.isPlaceholderData ? ' is-stale' : ''}`}>
                {data.items.map((item) => (
                  <li key={item.id}>
                    <Link to={`/${kind}/${item.id}?c=all`} className="list-row">
                      <div className="list-main">
                        <div className={`list-title${kind === 'workflows' ? '' : ' mono'}`}>{item.name}</div>
                        {kind === 'workflows' && 'trigger' in item ? (
                          <div className="list-sub">
                            {item.trigger ? (
                              <span className="trigger-inline">Ενεργοποιείται: {item.trigger}</span>
                            ) : (
                              <span className="trigger-inline missing">Δεν έχει οριστεί πότε ενεργοποιείται</span>
                            )}
                          </div>
                        ) : (
                          item.description && <div className="list-sub">{item.description}</div>
                        )}
                      </div>
                      <div className="list-meta">
                        {'environmentId' in item && envName(item.environmentId) && <Badge>{envName(item.environmentId)}</Badge>}
                        {'currentVersion' in item && item.currentVersion != null && <Badge>v{item.currentVersion}</Badge>}
                        <span className="list-time">{timeAgo(item.updatedAt)}</span>
                      </div>
                      <Icon name="chevron" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination page={lp.page} pageSize={PAGE_SIZE} total={data.total} onPage={(page) => lp.update({ page })} />
            </>
          )
        }
      </Resource>

      {creating && kind === 'rules' && <NewRuleSheet customerContext="all" onClose={() => setCreating(false)} />}
      {creating && kind === 'rulesets' && <RulesetSheet customerContext="all" onClose={() => setCreating(false)} />}
      {creating && kind === 'workflows' && <WorkflowSheet customerContext="all" onClose={() => setCreating(false)} />}
    </>
  );
}
