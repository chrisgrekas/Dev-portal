import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Customer, Page } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CustomerSheet } from '../components/CustomerSheet';
import { Icon } from '../components/ui';
import { CUSTOMER_NUMBER_RE, MOD_KEY, readRecent } from '../lib/customer';
import { useDebounced, useTitle } from '../lib/hooks';

type Option = { key: string; customer?: Pick<Customer, 'customerNumber' | 'name'>; createNumber?: string; missingNumber?: string };

const findCustomers = (q: string) =>
  api<Page<Customer>>('/customers', { query: { search: q, pageSize: 8 } }).then((r) => r.items);

export default function Home() {
  useTitle('Πελάτες');
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [recent] = useState(readRecent);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState<string | null>(null);
  const term = q.trim();
  const dq = useDebounced(term, 120);
  const exact = CUSTOMER_NUMBER_RE.test(term);

  // Από το Spotlight: /?new=1234567 → φόρμα δημιουργίας
  useEffect(() => {
    const n = params.get('new');
    if (n && CUSTOMER_NUMBER_RE.test(n) && canEdit) setCreating(n);
    if (n) setParams({}, { replace: true });
  }, [params, setParams, canEdit]);

  const { data, isFetching } = useQuery({
    queryKey: ['customers', 'search', dq],
    queryFn: () => findCustomers(dq),
    enabled: dq.length > 0,
    staleTime: 15_000,
  });
  const results = dq === term ? (data ?? []) : [];
  const settled = dq === term && !!data && !isFetching;
  const missing = exact && settled && !results.some((c) => c.customerNumber === term);

  const options: Option[] = [
    ...results.map((c) => ({ key: c.customerNumber, customer: c })),
    ...(missing ? [canEdit ? { key: 'new', createNumber: term } : { key: 'missing', missingNumber: term }] : []),
  ];

  useEffect(() => {
    setActive(0);
  }, [dq]);

  const choose = (o: Option | undefined) => {
    if (!o) return;
    if (o.customer) navigate(`/customers/${o.customer.customerNumber}`);
    else if (o.createNumber) setCreating(o.createNumber);
  };

  /** Enter με 7 ψηφία: υπάρχει → μετάβαση· δεν υπάρχει → δημιουργία (editors) ή μήνυμα. */
  const submitExact = async () => {
    const list = settled ? results : await findCustomers(term).catch(() => []);
    if (list.some((c) => c.customerNumber === term)) navigate(`/customers/${term}`);
    else if (canEdit) setCreating(term);
    else setOpen(true);
  };

  const hint = /^\d+$/.test(term) ? (
    <span className={`digit-counter${term.length === 7 ? ' ok' : ''}`}>{term.length} / 7</span>
  ) : null;

  return (
    <div className="home">
      <h1 className="home-title">Βρες πελάτη</h1>
      <p className="home-sub">Workflows, rules και rulesets — όλα ανά πελάτη.</p>

      <div className="hero-search">
        <div className="search-field">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            placeholder="Αριθμός πελάτη (7 ψηφία) ή όνομα"
            aria-label="Αναζήτηση πελάτη"
            role="combobox"
            aria-expanded={open && options.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(e) => {
              const v = e.target.value;
              setQ(/^\s*\d+\s*$/.test(v) ? v.replace(/\s/g, '').slice(0, 7) : v);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, options.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const o = options[active];
                if (exact && (!o || o.customer?.customerNumber !== term) && !o?.createNumber) void submitExact();
                else choose(o);
              } else if (e.key === 'Escape') {
                setQ('');
              }
            }}
          />
          {hint}
        </div>

        {open && term && options.length > 0 && (
          <ul className="picker-menu customer-menu" id={listId} role="listbox">
            {options.map((o, i) => (
              <li
                key={o.key}
                role="option"
                aria-selected={i === active}
                className={`${i === active ? 'active' : ''}${o.createNumber ? ' create' : ''}${o.missingNumber ? ' picker-empty' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {o.customer && (
                  <>
                    <span className="customer-menu-number mono">{o.customer.customerNumber}</span>
                    <span className="customer-menu-name">{o.customer.name}</span>
                  </>
                )}
                {o.createNumber && (
                  <span className="customer-menu-create">
                    <Icon name="plus" size={14} />
                    Δημιουργία πελάτη <span className="mono">{o.createNumber}</span>
                  </span>
                )}
                {o.missingNumber && <span>Δεν υπάρχει πελάτης {o.missingNumber}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="home-shortcut">
        Από οποιαδήποτε σελίδα: <kbd className="kbd">{MOD_KEY} K</kbd>
      </p>

      {recent.length > 0 && (
        <section className="home-recent">
          <h2 className="day-title">Πρόσφατοι</h2>
          <div className="recent-grid">
            {recent.map((c) => (
              <Link key={c.customerNumber} to={`/customers/${c.customerNumber}`} className="recent-card">
                <span className="recent-card-name">{c.name}</span>
                <span className="recent-card-number mono">{c.customerNumber}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {creating && <CustomerSheet initialNumber={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}
