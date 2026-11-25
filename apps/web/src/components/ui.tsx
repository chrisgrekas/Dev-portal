import { ButtonHTMLAttributes, ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import { ApiError, errorMessage } from '../api/client';
import { useDebounced } from '../lib/hooks';

// ---------- Icons (SF Symbols-like, stroke) ----------
const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  chevron: <path d="m9.5 6 6 6-6 6" />,
  back: <path d="m14.5 6-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  git: (
    <>
      <circle cx="6.5" cy="6" r="2.2" />
      <circle cx="6.5" cy="18" r="2.2" />
      <circle cx="17.5" cy="8.5" r="2.2" />
      <path d="M6.5 8.2v7.6M17.5 10.7c0 3.6-4.5 3.2-9.3 5.6" />
    </>
  ),
  external: <path d="M14 5h5v5M19 5l-8 8M18 14v3.5A1.5 1.5 0 0 1 16.5 19h-10A1.5 1.5 0 0 1 5 17.5v-10A1.5 1.5 0 0 1 6.5 6H10" />,
  edit: <path d="M5 19h3.5L18.5 9a2.12 2.12 0 0 0-3-3L5.5 16v3zM14 7.5l3 3" />,
  close: <path d="M7 7l10 10M17 7 7 17" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  up: <path d="m6.5 14.5 5.5-5.5 5.5 5.5" />,
  down: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  loop: <path d="M9 14 4.5 9.5 9 5m-4.5 4.5H15a4.5 4.5 0 0 1 0 9h-2.5" />,
  trash: <path d="M5 7h14M10 4h4M7 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h5a1.5 1.5 0 0 0 1.5-1.5L17 7" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
    >
      {PATHS[name]}
    </svg>
  );
}

// ---------- Buttons ----------
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'plain' | 'danger';
  size?: 'sm' | 'md';
  busy?: boolean;
};

export function Button({ variant = 'primary', size = 'md', busy, className = '', disabled, children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${className}`} disabled={disabled || busy} {...rest}>
      {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

// ---------- Layout pieces ----------
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className="page-header">
      {back && (
        <Link to={back.to} className="back-link">
          <Icon name="back" size={18} />
          {back.label}
        </Link>
      )}
      <div className="page-header-row">
        <div className="page-header-text">
          <h1>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {(title || actions) && (
        <div className="section-head">
          {title && <h2 className="section-title">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'green' | 'orange' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

// ---------- States ----------
export function Loading() {
  return (
    <div className="state state-loading" role="status" aria-label="Φόρτωση">
      <span className="spinner" />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="state">
      <p className="state-title">{notFound ? 'Δεν βρέθηκε' : 'Δεν ήταν δυνατή η φόρτωση'}</p>
      <p className="state-text">{notFound ? 'Ίσως διαγράφηκε ή ο σύνδεσμος είναι λάθος.' : errorMessage(error)}</p>
      {onRetry && !notFound && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Δοκίμασε ξανά
        </Button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <p className="state-title">{title}</p>
      {children && <div className="state-text">{children}</div>}
    </div>
  );
}

/** Δείχνει loading/σφάλμα και αλλιώς αποδίδει τα δεδομένα. */
export function Resource<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <>{children(query.data)}</>;
}

// ---------- Lists ----------
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  if (total <= pageSize) return null;
  const last = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label="Σελίδες">
      <span>
        {from}–{to} από {total.toLocaleString('el-GR')}
      </span>
      <div className="pagination-buttons">
        <IconButton icon="back" label="Προηγούμενη σελίδα" disabled={page <= 1} onClick={() => onPage(page - 1)} />
        <IconButton icon="chevron" label="Επόμενη σελίδα" disabled={page >= last} onClick={() => onPage(page + 1)} />
      </div>
    </nav>
  );
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebounced(draft, 250);
  const committed = useRef(value);

  useEffect(() => {
    if (debounced !== committed.current) {
      committed.current = debounced;
      onChange(debounced);
    }
  }, [debounced, onChange]);

  // Εξωτερική αλλαγή (π.χ. back button) → συγχρονισμός.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  return (
    <div className="search-field">
      <Icon name="search" />
      <input type="search" value={draft} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setDraft(e.target.value)} />
      {draft && (
        <button type="button" className="search-clear" aria-label="Καθαρισμός" onClick={() => setDraft('')}>
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}
