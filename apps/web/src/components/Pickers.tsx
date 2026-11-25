import { ReactNode, useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import type { Customer, CustomerRef, Page } from '../api/types';
import { useDebounced, useEnvironments } from '../lib/hooks';
import { Icon } from './ui';

export function Chip({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <span className="chip">
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Αφαίρεση">
          <Icon name="close" size={11} />
        </button>
      )}
    </span>
  );
}

/** Combobox με αναζήτηση στον server. */
/**
 * Combobox με αναζήτηση στον server.
 * Με `onCreate`: αν δεν υπάρχει ακριβές ταίριασμα, εμφανίζεται «+ Δημιουργία «…»» στο τέλος του menu
 * (π.χ. placeholder rule) — δημιουργείται επιτόπου και επιλέγεται, χωρίς να κλείνει η φόρμα.
 */
export function SearchPicker<T extends { id: number }>({
  queryKey,
  fetch,
  getLabel,
  getSub,
  onPick,
  excludeIds = [],
  placeholder,
  id,
  onCreate,
  createLabel = (q) => <>Δημιουργία «{q}»</>,
}: {
  queryKey: string;
  fetch: (q: string) => Promise<T[]>;
  getLabel: (t: T) => string;
  getSub?: (t: T) => string | null | undefined;
  onPick: (t: T) => void;
  excludeIds?: number[];
  placeholder: string;
  id?: string;
  onCreate?: (q: string) => Promise<T>;
  createLabel?: (q: string) => ReactNode;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);
  const term = q.trim();
  const dq = useDebounced(term, 200);
  const listId = useId();

  const { data, isFetching, isError } = useQuery({
    queryKey: [queryKey, 'picker', dq],
    queryFn: () => fetch(dq),
    enabled: open,
    staleTime: 15_000,
  });
  const options = (data ?? []).filter((o) => !excludeIds.includes(o.id));
  const settled = dq === term && !!data && !isFetching;
  const exactExists = (data ?? []).some((o) => getLabel(o).toLocaleLowerCase('el') === term.toLocaleLowerCase('el'));
  const canCreate = Boolean(onCreate && term && settled && !exactExists);
  const total = options.length + (canCreate ? 1 : 0);

  useEffect(() => {
    setActive(0);
    setCreateError(null);
  }, [dq]);

  const pick = (o: T) => {
    onPick(o);
    setQ('');
    setActive(0);
  };

  const create = async () => {
    if (!onCreate || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await onCreate(term);
      qc.invalidateQueries({ queryKey: [queryKey] });
      pick(created);
    } catch (e) {
      setCreateError(e);
    } finally {
      setCreating(false);
    }
  };

  const choose = (i: number) => {
    if (i < options.length) pick(options[i]);
    else if (canCreate) void create();
  };

  return (
    <div className="picker">
      <div className="search-field">
        <Icon name="search" />
        <input
          id={id}
          value={q}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, total - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (open && active < total) choose(active);
            } else if (e.key === 'Escape' && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {creating && <span className="spinner spinner-muted" aria-hidden="true" />}
      </div>
      {open && (
        <ul className="picker-menu" id={listId} role="listbox">
          {options.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="picker-label">{getLabel(o)}</span>
              {getSub?.(o) && <span className="picker-sub">{getSub(o)}</span>}
            </li>
          ))}
          {canCreate && (
            <li
              role="option"
              aria-selected={active === options.length}
              className={`picker-create${active === options.length ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                void create();
              }}
              onMouseEnter={() => setActive(options.length)}
            >
              <span className="picker-label">
                <Icon name="plus" size={13} />
                {createLabel(term)}
              </span>
              {creating && <span className="picker-sub">Δημιουργία…</span>}
            </li>
          )}
          {createError != null && <li className="picker-empty picker-error">{errorMessage(createError)}</li>}
          {total === 0 && createError == null && (
            <li className="picker-empty">{isFetching || !settled ? 'Αναζήτηση…' : isError ? 'Σφάλμα φόρτωσης' : 'Κανένα αποτέλεσμα'}</li>
          )}
        </ul>
      )}
    </div>
  );
}

export const fetchCustomers = (q: string) =>
  api<Page<Customer>>('/customers', { query: { search: q || undefined, pageSize: 8 } }).then((r) => r.items);

export function CustomersField({ value, onChange, id }: { value: CustomerRef[]; onChange: (v: CustomerRef[]) => void; id?: string }) {
  return (
    <div className="multi-field">
      {value.length > 0 && (
        <div className="chips">
          {value.map((c) => (
            <Chip key={c.id} onRemove={() => onChange(value.filter((x) => x.id !== c.id))}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}
      <SearchPicker
        id={id}
        queryKey="customers"
        fetch={fetchCustomers}
        getLabel={(c) => c.name}
        getSub={(c) => c.customerNumber}
        excludeIds={value.map((c) => c.id)}
        onPick={(c) => onChange([...value, { id: c.id, name: c.name, customerNumber: c.customerNumber }])}
        placeholder="Προσθήκη πελάτη…"
      />
    </div>
  );
}

export function EnvironmentsField({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const envs = useEnvironments();
  if (!envs.data) return <div className="field-hint">{envs.isError ? 'Σφάλμα φόρτωσης περιβαλλόντων' : 'Φόρτωση…'}</div>;
  if (!envs.data.length) return <div className="field-hint">Δεν υπάρχουν περιβάλλοντα.</div>;
  return (
    <div className="toggle-chips" role="group">
      {envs.data.map((e) => {
        const on = value.includes(e.id);
        return (
          <button
            key={e.id}
            type="button"
            className="toggle-chip"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== e.id) : [...value, e.id])}
          >
            {on && <Icon name="check" size={13} />}
            {e.name}
          </button>
        );
      })}
    </div>
  );
}
