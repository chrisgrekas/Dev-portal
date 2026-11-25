import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../lib/format';
import { MOD_KEY } from '../lib/customer';
import { Spotlight } from './Spotlight';
import { Icon } from './ui';

// Δύο κύρια σημεία: Πελάτες (αρχική) και Wiki. Το «Όλα» είναι διακριτικό, για ό,τι δεν έχει πελάτη.
const CUSTOMER_AREA = /^\/($|customers|rules|rulesets|workflows)/;
const LINKS = [
  { to: '/', label: 'Πελάτες', match: (p: string, c: string | null) => CUSTOMER_AREA.test(p) && c !== 'all' },
  { to: '/wiki', label: 'Wiki', match: (p: string) => p.startsWith('/wiki') },
];
const isAll = (p: string, c: string | null) => p.startsWith('/all') || (c === 'all' && CUSTOMER_AREA.test(p));

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <rect width="64" height="64" rx="15" fill="currentColor" />
      <path
        d="M24 22 14 32l10 10M40 22l10 10-10 10"
        fill="none"
        stroke="var(--logo-glyph)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div className="account" ref={ref}>
      <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open} aria-label="Λογαριασμός" onClick={() => setOpen((o) => !o)}>
        {user.email.charAt(0).toUpperCase()}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-header">
            <div className="menu-email">{user.email}</div>
            <div className="menu-role">{ROLE_LABEL[user.role]}</div>
          </div>
          <Link to="/settings" role="menuitem" className="menu-item">
            Ρυθμίσεις
          </Link>
          <button type="button" role="menuitem" className="menu-item" onClick={logout}>
            Αποσύνδεση
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const c = params.get('c');
  const [spotlight, setSpotlight] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // ⌘K / Ctrl+K από οπουδήποτε· «/» όταν δεν γράφεις σε πεδίο.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotlight((o) => !o);
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setSpotlight(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link to="/" className="nav-brand">
            <Logo />
            <span>Dev Portal</span>
          </Link>
          <div className="nav-search">
            <button type="button" className="spotlight-trigger" onClick={() => setSpotlight(true)} aria-label="Αναζήτηση">
              <Icon name="search" size={15} />
              <span className="spotlight-trigger-text">Αναζήτηση</span>
              <kbd className="kbd">{MOD_KEY} K</kbd>
            </button>
          </div>
          <nav className="nav-links" aria-label="Κύρια πλοήγηση">
            {LINKS.map((l) => {
              const active = l.match(pathname, c);
              return (
                <Link key={l.to} to={l.to} className={`nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                  {l.label}
                </Link>
              );
            })}
            <Link
              to="/all"
              className={`nav-link nav-link-subtle${isAll(pathname, c) ? ' active' : ''}`}
              title="Rules, rulesets και workflows χωρίς πελάτη"
            >
              Όλα
            </Link>
          </nav>
          <AccountMenu />
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      {spotlight && <Spotlight onClose={() => setSpotlight(false)} />}
    </>
  );
}
