import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Environment } from '../api/types';

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Dev Portal` : 'Dev Portal';
  }, [title]);
}

/** Το :id της διαδρομής ως θετικός ακέραιος, ή null αν είναι άκυρο. */
export function useIdParam(): number | null {
  const { id } = useParams();
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Φίλτρα λίστας στο URL (για bookmark / κοινοποίηση / back button). */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? undefined;
  const num = (k: string) => {
    const n = Number(params.get(k));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const update = (patch: Record<string, string | number | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  return { get, num, update, page: num('page') ?? 1 };
}

export function useEnvironments() {
  return useQuery({
    queryKey: ['environments'],
    queryFn: () => api<Environment[]>('/environments'),
    staleTime: 5 * 60_000,
  });
}
