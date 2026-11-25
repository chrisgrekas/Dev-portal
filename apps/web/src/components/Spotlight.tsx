import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { SearchResults } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CUSTOMER_NUMBER_RE, readRecent } from '../lib/customer';
import { useDebounced } from '../lib/hooks';
import { CATEGORY_LABEL, SYSTEM_LABEL } from '../pages/wiki/wiki';
import { Badge, Icon } from './ui';

type Item = { key: string; group: string; label: ReactNode; sub?: ReactNode; go: () => void };

/**
 * Global Spotlight (⌘K / Ctrl+K): πελάτες (7ψήφιο ή όνομα), άρθρα wiki, πεδία myClaim/weDAT.
 * ↑ ↓ για επιλογή, Enter για άνοιγμα, Esc για κλείσιμο.
 */
export function Spotlight({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const term = q.trim();
  const dq = useDebounced(term, 120);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['search', dq],
    queryFn: () => api<SearchResults>('/search', { query: { q: dq } }),
    enabled: dq.length > 0,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const items = useMemo<Item[]>(() => {
    if (!term) {
      return readRecent().map((c) => ({
        key: `r${c.customerNumber}`,
        group: 'Πρόσφατοι πελάτες',
        label: c.name,
        sub: <span className="mono">{c.customerNumber}</span>,
        go: () => go(`/customers/${c.customerNumber}`),
      }));
    }
    const res = dq === term ? data : undefined;
    const out: Item[] = [];
    const exact = CUSTOMER_NUMBER_RE.test(term);
    (res?.customers ?? []).forEach((c) =>
      out.push({
        key: `c${c.id}`,
        group: 'Πελάτες',
        label: c.name,
        sub: <span className="mono">{c.customerNumber}</span>,
        go: () => go(`/customers/${c.customerNumber}`),
      }),
    );
    if (exact && res && !res.customers.some((c) => c.customerNumber === term)) {
      out.push(
        canEdit
          ? { key: 'new', group: 'Πελάτες', label: `Δημιουργία πελάτη ${term}`, sub: 'Νέος', go: () => go(`/?new=${term}`) }
          : { key: 'none', group: 'Πελάτες', label: `Δεν υπάρχει πελάτης ${term}`, go: () => undefined },
      );
    }
    (res?.articles ?? []).forEach((a) =>
      out.push({ key: `a${a.id}`, group: 'Wiki', label: a.title, sub: CATEGORY_LABEL[a.category], go: () => go(`/wiki/${a.id}`) }),
    );
    (res?.fields ?? []).forEach((f) =>
      out.push({
        key: `f${f.id}`,
        group: 'Πεδία',
        label: (
          <>
            <span className="mono">{f.name}</span>
            {f.label && <span className="spotlight-muted"> · {f.label}</span>}
          </>
        ),
        sub: (
          <>
            <Badge tone="accent">{SYSTEM_LABEL[f.system]}</Badge>
            {f.type && <Badge>{f.type}</Badge>}
          </>
        ),
        go: () => go(`/wiki/fields/${f.system}?q=${encodeURIComponent(f.name)}`),
      }),
    );
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, dq, data, canEdit]);

  useEffect(() => {
    setActive(0);
  }, [dq]);

  // Το ενεργό αποτέλεσμα πάντα ορατό.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';
  const pending = term.length > 0 && (dq !== term || (isFetching && !data));

  return (
    <dialog
      ref={dialogRef}
      className="spotlight"
      aria-label="Αναζήτηση"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="spotlight-input">
        <Icon name="search" size={20} />
        <input
          autoFocus
          value={q}
          placeholder="Πελάτης (7 ψηφία ή όνομα), άρθρο ή πεδίο"
          aria-label="Αναζήτηση"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            setQ(/^\s*\d+\s*$/.test(v) ? v.replace(/\s/g, '').slice(0, 7) : v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (items[active]) items[active].go();
              else if (CUSTOMER_NUMBER_RE.test(term)) go(`/customers/${term}`);
            }
          }}
        />
        {pending && <span className="spinner spinner-muted" aria-hidden="true" />}
      </div>

      <div className="spotlight-results" ref={listRef} role="listbox">
        {items.map((it, i) => {
          const header = it.group !== lastGroup ? it.group : null;
          lastGroup = it.group;
          return (
            <div key={it.key}>
              {header && <div className="spotlight-group">{header}</div>}
              <button
                type="button"
                role="option"
                data-index={i}
                aria-selected={i === active}
                className={`spotlight-item${i === active ? ' active' : ''}${it.key === 'new' ? ' create' : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => it.go()}
              >
                <span className="spotlight-label">
                  {it.key === 'new' && <Icon name="plus" size={14} />}
                  {it.label}
                </span>
                {it.sub && <span className="spotlight-sub">{it.sub}</span>}
              </button>
            </div>
          );
        })}
        {term && !pending && items.length === 0 && <div className="spotlight-empty">Κανένα αποτέλεσμα για «{term}»</div>}
        {!term && items.length === 0 && <div className="spotlight-empty">Γράψε αριθμό πελάτη, όνομα, άρθρο ή πεδίο.</div>}
      </div>

      <div className="spotlight-footer">
        <span>
          <kbd className="kbd">↑</kbd>
          <kbd className="kbd">↓</kbd> επιλογή
        </span>
        <span>
          <kbd className="kbd">↵</kbd> άνοιγμα
        </span>
        <span>
          <kbd className="kbd">esc</kbd> κλείσιμο
        </span>
      </div>
    </dialog>
  );
}
