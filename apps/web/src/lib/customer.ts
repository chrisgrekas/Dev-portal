import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { CustomerOverview } from '../api/types';

export const CUSTOMER_NUMBER_RE = /^\d{7}$/;

/**
 * Όλα ξεκινούν από έναν πελάτη. Οι σελίδες rule/workflow/ruleset κουβαλούν
 * ?c=<αριθμός πελάτη> (ή ?c=all από τη σελίδα «Όλα») ώστε το «πίσω» να γυρίζει στο σωστό σημείο.
 */
export function useCustomerContext() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const raw = params.get('c');
  const customer = raw && CUSTOMER_NUMBER_RE.test(raw) ? raw : null;
  const fromAll = raw === 'all';
  const cachedName = customer ? qc.getQueryData<CustomerOverview>(['customer', customer])?.name : undefined;
  const ctx = customer ?? (fromAll ? 'all' : null);

  return {
    customer,
    back: customer
      ? { to: `/customers/${customer}`, label: cachedName ?? customer }
      : fromAll
        ? { to: '/all', label: 'Όλα' }
        : { to: '/', label: 'Πελάτες' },
    /** Προσθέτει ?c=… σε ένα εσωτερικό link. */
    link: (path: string) => (ctx ? `${path}${path.includes('?') ? '&' : '?'}c=${ctx}` : path),
  };
}

// ---------- Πρόσφατοι πελάτες (ανά browser, μόνο για ευκολία) ----------
const RECENT_KEY = 'devportal.recentCustomers';
export type RecentCustomer = { customerNumber: string; name: string };

export function readRecent(): RecentCustomer[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((r) => r && CUSTOMER_NUMBER_RE.test(r.customerNumber)).slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function pushRecent(r: RecentCustomer) {
  try {
    const next = [r, ...readRecent().filter((x) => x.customerNumber !== r.customerNumber)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage μπλοκαρισμένο — απλώς δεν θυμόμαστε */
  }
}

/** ⌘ σε Mac, Ctrl αλλού — για τις ετικέτες συντομεύσεων. */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
