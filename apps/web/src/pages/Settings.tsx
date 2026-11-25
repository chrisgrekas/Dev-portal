import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ApiKey, Customer, Environment, Page, Role, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CopyButton } from '../components/Code';
import { Sheet } from '../components/Sheet';
import { Badge, Button, Empty, Field, Icon, IconButton, PageHeader, Pagination, Resource, SearchField, Section, Segmented, Toolbar } from '../components/ui';
import { formatDateTime, ROLE_LABEL, ROLES, timeAgo } from '../lib/format';
import { useEnvironments, useListParams, useTitle } from '../lib/hooks';
import { CustomerSheet } from '../components/CustomerSheet';
import { Link } from 'react-router-dom';

type Tab = 'customers' | 'environments' | 'users' | 'keys';

export default function Settings() {
  useTitle('Ρυθμίσεις');
  const { isAdmin, user } = useAuth();
  const lp = useListParams();
  const requested = (lp.get('tab') ?? 'customers') as Tab;
  const tabs: { value: Tab; label: string }[] = [
    { value: 'customers', label: 'Πελάτες' },
    { value: 'environments', label: 'Περιβάλλοντα' },
    ...(isAdmin
      ? ([
          { value: 'users', label: 'Χρήστες' },
          { value: 'keys', label: 'API keys' },
        ] as const)
      : []),
  ];
  const tab = tabs.some((t) => t.value === requested) ? requested : 'customers';

  return (
    <>
      <PageHeader title="Ρυθμίσεις" subtitle={user && `${user.email} · ${ROLE_LABEL[user.role]}`} />
      <Toolbar>
        <Segmented label="Ενότητα" value={tab} onChange={(t) => lp.update({ tab: t === 'customers' ? undefined : t, q: undefined })} options={tabs} />
      </Toolbar>
      {tab === 'customers' && <Customers />}
      {tab === 'environments' && <Environments />}
      {tab === 'users' && <Users />}
      {tab === 'keys' && <ApiKeys />}
    </>
  );
}

// ---------- Πελάτες ----------
const CUSTOMERS_PAGE = 25;

function Customers() {
  const { canEdit } = useAuth();
  const lp = useListParams();
  const search = lp.get('q') ?? '';
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: ['customers', { search, page: lp.page }],
    queryFn: () => api<Page<Customer>>('/customers', { query: { search, page: lp.page, pageSize: CUSTOMERS_PAGE } }),
    placeholderData: keepPreviousData,
  });

  return (
    <Section
      actions={
        canEdit && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} />
            Νέος πελάτης
          </Button>
        )
      }
    >
      <Toolbar>
        <SearchField value={search} onChange={(q) => lp.update({ q })} placeholder="Αναζήτηση σε όνομα ή αριθμό" />
      </Toolbar>
      <Resource query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <Empty title={search ? 'Κανένα αποτέλεσμα' : 'Δεν υπάρχουν πελάτες'} />
          ) : (
            <>
              <ul className={`list${query.isPlaceholderData ? ' is-stale' : ''}`}>
                {data.items.map((c) => (
                  <li key={c.id}>
                    <Link to={`/customers/${c.customerNumber}`} className="list-row">
                      <span className="mono home-recent-number">{c.customerNumber}</span>
                      <div className="list-main">
                        <div className="list-title">{c.name}</div>
                      </div>
                      <Icon name="chevron" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination page={lp.page} pageSize={CUSTOMERS_PAGE} total={data.total} onPage={(page) => lp.update({ page })} />
            </>
          )
        }
      </Resource>
      {creating && <CustomerSheet onClose={() => setCreating(false)} />}
    </Section>
  );
}

// ---------- Περιβάλλοντα ----------
function Environments() {
  const { isAdmin } = useAuth();
  const query = useEnvironments();
  const [creating, setCreating] = useState(false);
  return (
    <Section
      actions={
        isAdmin && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} />
            Νέο περιβάλλον
          </Button>
        )
      }
    >
      <Resource query={query}>
        {(envs) =>
          envs.length === 0 ? (
            <Empty title="Δεν υπάρχουν περιβάλλοντα" />
          ) : (
            <ul className="list">
              {envs.map((e) => (
                <li key={e.id} className="list-row static">
                  <div className="list-main">
                    <div className="list-title mono">{e.name}</div>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Resource>
      {creating && <EnvironmentSheet onClose={() => setCreating(false)} />}
    </Section>
  );
}

function EnvironmentSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const m = useMutation({
    mutationFn: () => api<Environment>('/environments', { method: 'POST', body: { name: name.trim() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environments'] });
      onClose();
    },
  });
  return (
    <Sheet title="Νέο περιβάλλον" onClose={onClose} onSubmit={() => m.mutate()} submitLabel="Προσθήκη" submitDisabled={!name.trim()} busy={m.isPending} error={m.error}>
      <Field label="Όνομα" htmlFor="env-name">
        <input id="env-name" className="input mono" placeholder="π.χ. staging" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </Field>
    </Sheet>
  );
}

// ---------- Χρήστες ----------
function RoleSelect({ id, value, onChange }: { id: string; value: Role; onChange: (r: Role) => void }) {
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as Role)}>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}

function Users() {
  const query = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users') });
  const [creating, setCreating] = useState(false);
  return (
    <Section
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={14} />
          Νέος χρήστης
        </Button>
      }
    >
      <Resource query={query}>
        {(users) => (
          <ul className="list">
            {[...users]
              .sort((a, b) => a.email.localeCompare(b.email))
              .map((u) => (
                <li key={u.id} className="list-row static">
                  <div className="list-main">
                    <div className="list-title">{u.email}</div>
                    <div className="list-sub">Από {formatDateTime(u.createdAt)}</div>
                  </div>
                  <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge>
                </li>
              ))}
          </ul>
        )}
      </Resource>
      {creating && <UserSheet onClose={() => setCreating(false)} />}
    </Section>
  );
}

function UserSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const m = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: { email: email.trim(), password, role } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });
  return (
    <Sheet
      title="Νέος χρήστης"
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel="Δημιουργία"
      submitDisabled={!email.trim() || password.length < 8}
      busy={m.isPending}
      error={m.error}
    >
      <Field label="Email" htmlFor="u-email">
        <input id="u-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required autoComplete="off" />
      </Field>
      <Field label="Κωδικός" htmlFor="u-pass" hint="Τουλάχιστον 8 χαρακτήρες.">
        <input id="u-pass" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label="Ρόλος" htmlFor="u-role">
        <RoleSelect id="u-role" value={role} onChange={setRole} />
      </Field>
    </Sheet>
  );
}

// ---------- API keys ----------
function ApiKeys() {
  const query = useQuery({ queryKey: ['api-keys'], queryFn: () => api<ApiKey[]>('/api-keys') });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);
  return (
    <Section
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={14} />
          Νέο key
        </Button>
      }
    >
      <p className="section-note section-intro">Για συστήματα (π.χ. συγχρονισμός με το myClaim) μέσω του header X-API-Key.</p>
      <Resource query={query}>
        {(keys) =>
          keys.length === 0 ? (
            <Empty title="Δεν υπάρχουν API keys" />
          ) : (
            <ul className="list">
              {keys.map((k) => (
                <li key={k.id} className="list-row static">
                  <div className="list-main">
                    <div className="list-title mono">{k.name}</div>
                    <div className="list-sub">{k.lastUsedAt ? `Χρησιμοποιήθηκε ${timeAgo(k.lastUsedAt)}` : 'Δεν έχει χρησιμοποιηθεί'}</div>
                  </div>
                  <Badge>{ROLE_LABEL[k.role]}</Badge>
                  <IconButton icon="trash" label={`Διαγραφή ${k.name}`} onClick={() => setDeleting(k)} />
                </li>
              ))}
            </ul>
          )
        }
      </Resource>
      {creating && <ApiKeySheet onClose={() => setCreating(false)} />}
      {deleting && <DeleteKeySheet apiKey={deleting} onClose={() => setDeleting(null)} />}
    </Section>
  );
}

function ApiKeySheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const m = useMutation({
    mutationFn: () => api<{ id: number; name: string; key: string }>('/api-keys', { method: 'POST', body: { name: name.trim(), role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  if (m.data)
    return (
      <Sheet title="Το key δημιουργήθηκε" onClose={onClose} footer={<Button onClick={onClose}>Τέλος</Button>}>
        <p className="sheet-note sheet-note-warn">Αντέγραψέ το τώρα — δεν θα εμφανιστεί ξανά.</p>
        <div className="secret">
          <code className="mono">{m.data.key}</code>
          <CopyButton text={m.data.key} />
        </div>
      </Sheet>
    );

  return (
    <Sheet title="Νέο API key" onClose={onClose} onSubmit={() => m.mutate()} submitLabel="Δημιουργία" submitDisabled={!name.trim()} busy={m.isPending} error={m.error}>
      <Field label="Όνομα" htmlFor="k-name" hint="Εμφανίζεται ως author στο ιστορικό (apikey:όνομα).">
        <input id="k-name" className="input mono" placeholder="π.χ. myclaim-sync" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </Field>
      <Field label="Ρόλος" htmlFor="k-role">
        <RoleSelect id="k-role" value={role} onChange={setRole} />
      </Field>
    </Sheet>
  );
}

function DeleteKeySheet({ apiKey, onClose }: { apiKey: ApiKey; onClose: () => void }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api(`/api-keys/${apiKey.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      onClose();
    },
  });
  return (
    <Sheet
      title={`Διαγραφή «${apiKey.name}»;`}
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel="Διαγραφή"
      submitVariant="danger"
      busy={m.isPending}
      error={m.error}
    >
      <p className="sheet-note">Όσα συστήματα το χρησιμοποιούν θα σταματήσουν να έχουν πρόσβαση αμέσως. Δεν αναιρείται.</p>
    </Sheet>
  );
}
