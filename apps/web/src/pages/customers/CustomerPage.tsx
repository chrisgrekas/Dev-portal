import { ReactNode, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { CustomerHistoryEntry, CustomerOverview, CustomerRef, Page } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { CopyIcon, useCopy } from '../../components/Code';
import { CustomerSheet } from '../../components/CustomerSheet';
import { Badge, Button, Empty, ErrorState, Icon, Loading, Pagination, Resource, SearchField, Segmented } from '../../components/ui';
import { count, dayKey, formatDateTime, formatDay, formatTime, timeAgo } from '../../lib/format';
import { describeAction, ENTITY_LABEL, ENTITY_ROUTE } from '../../lib/history';
import { CUSTOMER_NUMBER_RE, pushRecent } from '../../lib/customer';
import { useEnvironments, useTitle } from '../../lib/hooks';
import { NewRuleSheet } from '../rules/RuleSheets';
import { WorkflowSheet } from '../workflows/WorkflowSheets';

type Tab = 'workflows' | 'rules' | 'rulesets' | 'history';
const TABS: Tab[] = ['workflows', 'rules', 'rulesets', 'history'];
const TAB_LABEL: Record<Tab, string> = { workflows: 'Workflows', rules: 'Rules', rulesets: 'Rulesets', history: 'Ιστορικό' };
const HISTORY_PAGE = 50;

export default function CustomerPage() {
  const { number = '' } = useParams();
  if (!CUSTOMER_NUMBER_RE.test(number))
    return (
      <div className="hub">
        <Link to="/" className="back-link">
          <Icon name="back" size={18} />
          Πελάτες
        </Link>
        <Empty title="Ο αριθμός πελάτη έχει ακριβώς 7 ψηφία" />
      </div>
    );
  return <Hub number={number} />;
}

const match = (q: string, ...values: (string | null | undefined)[]) =>
  !q || values.some((v) => v?.toLocaleLowerCase('el').includes(q.toLocaleLowerCase('el')));

function NumberBadge({ value }: { value: string }) {
  const [done, copy] = useCopy();
  return (
    <button type="button" className={`number-badge mono${done ? ' done' : ''}`} onClick={() => copy(value)} title="Αντιγραφή αριθμού">
      {value}
      <Icon name={done ? 'check' : 'copy'} size={12} />
    </button>
  );
}

function GitPill({ url }: { url: string }) {
  const display = url.replace(/^https?:\/\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  return (
    <span className="git-pill">
      <a href={url} target="_blank" rel="noopener noreferrer" title={url}>
        <Icon name="git" size={14} />
        <span className="git-pill-text">{display}</span>
        <Icon name="external" size={12} />
      </a>
      <CopyIcon text={url} label="Αντιγραφή Git URL" />
    </span>
  );
}

function Hub({ number }: { number: string }) {
  const { canEdit } = useAuth();
  const envs = useEnvironments();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'workflows') as Tab;
  const envParam = Number(params.get('env'));
  const env = Number.isInteger(envParam) && envParam > 0 ? envParam : null;
  const [filter, setFilter] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [sheet, setSheet] = useState<null | 'create' | 'edit' | 'git'>(null);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (value === null) n.delete(key);
        else n.set(key, value);
        return n;
      },
      { replace: true },
    );

  const query = useQuery({ queryKey: ['customer', number], queryFn: () => api<CustomerOverview>(`/customers/${number}`) });
  const history = useQuery({
    queryKey: ['customer', number, 'history', { env, page: historyPage }],
    queryFn: () =>
      api<Page<CustomerHistoryEntry>>(`/customers/${number}/history`, {
        query: { environmentId: env, page: historyPage, pageSize: HISTORY_PAGE },
      }),
    enabled: query.isSuccess,
    placeholderData: keepPreviousData,
  });
  const c = query.data;
  useTitle(c ? `${c.name} · ${c.customerNumber}` : number);

  useEffect(() => {
    if (c) pushRecent({ customerNumber: c.customerNumber, name: c.name });
  }, [c]);
  useEffect(() => {
    setFilter('');
  }, [tab, number]);
  useEffect(() => {
    setHistoryPage(1);
  }, [env, number]);

  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <div className="hub">
        <Link to="/" className="back-link">
          <Icon name="back" size={18} />
          Πελάτες
        </Link>
        <h1 className="hub-title mono">{number}</h1>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  if (!c) return null;

  // ---------- Φίλτρο περιβάλλοντος: εφαρμόζεται σε όλα τα παιδιά ----------
  const workflows = c.workflows.filter((w) => !env || w.environmentId === env);
  const wfIds = new Set(workflows.map((w) => w.id));
  const rules = c.rules.filter((r) => !env || r.environmentIds.includes(env));
  const rulesets = c.rulesets
    .map((r) => ({ ...r, usedIn: r.usedIn.filter((u) => wfIds.has(u.workflow.id)) }))
    .filter((r) => r.usedIn.length > 0);

  const counts: Record<Tab, number | undefined> = {
    workflows: workflows.length,
    rules: rules.length,
    rulesets: rulesets.length,
    history: history.data?.total,
  };
  const withC = (path: string) => `${path}?c=${c.customerNumber}`;
  const ref: CustomerRef = { id: c.id, name: c.name, customerNumber: c.customerNumber };
  const envName = (id: number | null) => envs.data?.find((e) => e.id === id)?.name;
  const createFor: Partial<Record<Tab, string>> = { workflows: 'Νέο workflow', rules: 'Νέο rule' };

  const list = (items: ReactNode[]) => (items.length ? <ul className="list">{items}</ul> : null);
  const empty = (what: string) => <Empty title={filter ? 'Κανένα αποτέλεσμα' : `${what}${env ? ` στο ${envName(env) ?? 'περιβάλλον'}` : ''}`} />;

  let body: ReactNode;
  if (tab === 'workflows') {
    body =
      list(
        workflows
          .filter((w) => match(filter, w.name, w.description, w.trigger))
          .map((w) => (
            <li key={w.id}>
              <Link to={withC(`/workflows/${w.id}`)} className="list-row">
                <div className="list-main">
                  <div className="list-title">{w.name}</div>
                  <div className="list-sub">
                    {w.trigger ? (
                      <span className="trigger-inline">Ενεργοποιείται: {w.trigger}</span>
                    ) : (
                      <span className="trigger-inline missing">Δεν έχει οριστεί πότε ενεργοποιείται</span>
                    )}
                  </div>
                </div>
                <div className="list-meta">{envName(w.environmentId) && <Badge>{envName(w.environmentId)}</Badge>}</div>
                <Icon name="chevron" />
              </Link>
            </li>
          )),
      ) ?? empty('Κανένα workflow');
  } else if (tab === 'rules') {
    body =
      list(
        rules
          .filter((r) => match(filter, r.name, r.description, r.myclaimId))
          .map((r) => (
            <li key={r.id}>
              <Link to={withC(`/rules/${r.id}`)} className="list-row">
                <div className="list-main">
                  <div className="list-title mono">{r.name}</div>
                  {r.description && <div className="list-sub">{r.description}</div>}
                </div>
                <div className="list-meta">
                  {!env && r.environmentIds.map((id) => envName(id) && <Badge key={id}>{envName(id)}</Badge>)}
                  {r.source === 'sync' && <Badge tone="accent">sync</Badge>}
                  {r.currentVersion != null && <Badge>v{r.currentVersion}</Badge>}
                  <span className="list-time">{timeAgo(r.updatedAt)}</span>
                </div>
                <Icon name="chevron" />
              </Link>
            </li>
          )),
      ) ?? empty('Κανένα rule');
  } else if (tab === 'rulesets') {
    body =
      list(
        rulesets
          .filter((r) => match(filter, r.name, r.description))
          .map((r) => (
            <li key={r.id}>
              <Link to={withC(`/rulesets/${r.id}`)} className="list-row">
                <div className="list-main">
                  <div className="list-title mono">{r.name}</div>
                  <div className="list-sub">{r.usedIn.map((u) => `${u.workflow.name} › ${u.step.name}`).join(' · ')}</div>
                </div>
                <Icon name="chevron" />
              </Link>
            </li>
          )),
      ) ??
      (filter ? (
        empty('')
      ) : (
        <Empty title="Κανένα ruleset">Τα rulesets εμφανίζονται εδώ όταν τρέχουν σε βήμα κάποιου workflow του πελάτη.</Empty>
      ));
  } else {
    body = <HistoryList query={history} onPage={setHistoryPage} page={historyPage} withC={withC} />;
  }

  return (
    <div className="hub">
      <Link to="/" className="back-link">
        <Icon name="back" size={18} />
        Πελάτες
      </Link>

      <header className="hub-header">
        <div className="hub-identity">
          <h1 className="hub-title">{c.name}</h1>
          <div className="hub-badges">
            <NumberBadge value={c.customerNumber} />
            {c.gitUrl ? (
              <GitPill url={c.gitUrl} />
            ) : (
              canEdit && (
                <button type="button" className="link-btn add-git" onClick={() => setSheet('git')}>
                  <Icon name="plus" size={13} />
                  Προσθήκη Git URL
                </button>
              )
            )}
          </div>
        </div>
        <div className="hub-controls">
          {envs.data && envs.data.length > 0 && (
            <Segmented
              label="Περιβάλλον"
              value={env ? String(env) : 'all'}
              onChange={(v) => setParam('env', v === 'all' ? null : v)}
              options={[{ value: 'all', label: 'Όλα' }, ...envs.data.map((e) => ({ value: String(e.id), label: e.name }))]}
            />
          )}
          {canEdit && (
            <div className="hub-actions">
              <Button variant="secondary" onClick={() => setSheet('edit')}>
                Επεξεργασία
              </Button>
              {createFor[tab] && (
                <Button onClick={() => setSheet('create')}>
                  <Icon name="plus" />
                  {createFor[tab]}
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="hub-tabs">
        <Segmented
          label="Ενότητα"
          value={tab}
          onChange={(t) => setParam('tab', t === 'workflows' ? null : t)}
          options={TABS.map((t) => ({
            value: t,
            label: (
              <>
                {TAB_LABEL[t]} {counts[t] !== undefined && <span className="segmented-count">{counts[t]}</span>}
              </>
            ),
          }))}
        />
        {tab !== 'history' && (counts[tab] ?? 0) > 5 && (
          <SearchField value={filter} onChange={setFilter} placeholder={`Φιλτράρισμα ${TAB_LABEL[tab].toLowerCase()}`} />
        )}
      </div>

      {body}

      {sheet === 'edit' && <CustomerSheet customer={c} onClose={() => setSheet(null)} />}
      {sheet === 'git' && <CustomerSheet customer={c} focusGit onClose={() => setSheet(null)} />}
      {sheet === 'create' && tab === 'rules' && (
        <NewRuleSheet initialCustomers={[ref]} customerContext={c.customerNumber} onClose={() => setSheet(null)} />
      )}
      {sheet === 'create' && tab === 'workflows' && (
        <WorkflowSheet initialCustomers={[ref]} customerContext={c.customerNumber} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

function HistoryList({
  query,
  page,
  onPage,
  withC,
}: {
  query: UseQueryResult<Page<CustomerHistoryEntry>>;
  page: number;
  onPage: (p: number) => void;
  withC: (path: string) => string;
}) {
  return (
    <Resource query={query}>
      {(data) => {
        if (data.items.length === 0) return <Empty title="Καμία αλλαγή ακόμα" />;
        const groups: { key: string; label: string; items: CustomerHistoryEntry[] }[] = [];
        for (const e of data.items) {
          const key = dayKey(e.createdAt);
          const last = groups[groups.length - 1];
          if (last?.key === key) last.items.push(e);
          else groups.push({ key, label: formatDay(e.createdAt), items: [e] });
        }
        return (
          <div className={query.isPlaceholderData ? 'is-stale' : undefined}>
            <p className="section-note section-intro">{count(data.total, 'αλλαγή', 'αλλαγές')} για αυτόν τον πελάτη</p>
            {groups.map((g) => (
              <section key={g.key} className="section">
                <h2 className="day-title">{g.label}</h2>
                <ul className="list">
                  {g.items.map((e) => {
                    const route = ENTITY_ROUTE[e.entityType];
                    const name = e.entityName ?? `#${e.entityId}`;
                    return (
                      <li key={e.id} className="log-row">
                        <time className="log-time" dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>
                          {formatTime(e.createdAt)}
                        </time>
                        <div className="list-main">
                          <div className="list-title">
                            {describeAction(e.action)} · <span className="meta-muted">{ENTITY_LABEL[e.entityType] ?? e.entityType}</span>{' '}
                            {route && !e.action.startsWith('delete') ? (
                              <Link to={withC(`/${route}/${e.entityId}`)} className="log-entity">
                                {name}
                              </Link>
                            ) : (
                              <span className="log-entity">{name}</span>
                            )}
                          </div>
                          {e.reason && <div className="list-sub log-reason">{e.reason}</div>}
                        </div>
                        <span className="log-author">{e.author}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <Pagination page={page} pageSize={HISTORY_PAGE} total={data.total} onPage={onPage} />
          </div>
        );
      }}
    </Resource>
  );
}
