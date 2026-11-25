import { useState } from 'react';
import { NavLink, Outlet, useMatch } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { WikiCategory, WikiSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/ui';
import { MOD_KEY } from '../../lib/customer';
import { useTitle } from '../../lib/hooks';
import { SYSTEMS, SYSTEM_LABEL } from './wiki';
import { ArticleSheet, FieldSheet } from './WikiSheets';

export const useWikiSummary = () =>
  useQuery({ queryKey: ['wiki', 'summary'], queryFn: () => api<WikiSummary>('/wiki/summary'), staleTime: 30_000 });

const SECTIONS: { title: string; categories: WikiCategory[] }[] = [
  { title: 'Οδηγοί', categories: ['guide'] },
  { title: 'Γενικά & Rules', categories: ['general', 'rules'] },
];

const norm = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/\p{Diacritic}/gu, '');

/**
 * Apple-style split view: μόνιμο sidebar αριστερά (φίλτρο + ενότητες), περιεχόμενο δεξιά.
 * Σε στενές οθόνες το sidebar φαίνεται μόνο στην αρχική του wiki.
 */
export default function WikiLayout() {
  useTitle('Wiki');
  const { canEdit } = useAuth();
  const isIndex = useMatch({ path: '/wiki', end: true }) !== null;
  const summary = useWikiSummary();
  const [filter, setFilter] = useState('');
  const [sheet, setSheet] = useState<null | 'article' | 'field'>(null);
  const f = norm(filter.trim());

  const articles = (summary.data?.articles ?? []).filter((a) => !f || norm(a.title).includes(f));
  const catalogs = SYSTEMS.filter((s) => !f || norm(`πεδια ${SYSTEM_LABEL[s]}`).includes(f));
  const nothing = f && articles.length === 0 && catalogs.length === 0;

  return (
    <div className={`wiki-split${isIndex ? ' at-index' : ''}`}>
      <aside className="wiki-sidebar" aria-label="Wiki">
        <div className="wiki-sidebar-head">
          <h1 className="wiki-sidebar-title">Wiki</h1>
          <div className="search-field wiki-filter">
            <Icon name="search" size={14} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Φίλτρο" aria-label="Φίλτρο wiki" />
            {filter && (
              <button type="button" className="search-clear" aria-label="Καθαρισμός" onClick={() => setFilter('')}>
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        </div>

        <nav className="wiki-nav">
          {SECTIONS.map((s, i) => {
            const items = articles.filter((a) => s.categories.includes(a.category));
            const section = (
              <div className="wiki-nav-section" key={s.title}>
                <div className="wiki-nav-heading">{s.title}</div>
                {items.length ? (
                  items.map((a) => (
                    <NavLink key={a.id} to={`/wiki/${a.id}`} className={({ isActive }) => `wiki-nav-item${isActive ? ' active' : ''}`}>
                      {a.title}
                    </NavLink>
                  ))
                ) : (
                  <span className="wiki-nav-empty">{summary.isPending ? '…' : f ? '—' : 'Κανένα άρθρο'}</span>
                )}
              </div>
            );
            // Οι κατάλογοι πεδίων μπαίνουν ανάμεσα σε Οδηγούς και Γενικά & Rules.
            return i === 0
              ? [
                  section,
                  <div className="wiki-nav-section" key="catalogs">
                    <div className="wiki-nav-heading">Κατάλογοι Πεδίων</div>
                    {catalogs.map((sys) => (
                      <NavLink
                        key={sys}
                        to={`/wiki/fields/${sys}`}
                        className={({ isActive }) => `wiki-nav-item wiki-nav-catalog${isActive ? ' active' : ''}`}
                      >
                        <span>Πεδία {SYSTEM_LABEL[sys]}</span>
                        <span className="wiki-nav-count">{summary.data?.fieldCounts[sys] ?? ''}</span>
                      </NavLink>
                    ))}
                    {catalogs.length === 0 && <span className="wiki-nav-empty">—</span>}
                  </div>,
                ]
              : section;
          })}
          {nothing && (
            <p className="wiki-nav-hint">
              Για αναζήτηση μέσα στο περιεχόμενο: <kbd className="kbd">{MOD_KEY} K</kbd>
            </p>
          )}
        </nav>

        {canEdit && (
          <div className="wiki-sidebar-foot">
            <button type="button" className="link-btn" onClick={() => setSheet('article')}>
              <Icon name="plus" size={13} />
              Άρθρο
            </button>
            <button type="button" className="link-btn" onClick={() => setSheet('field')}>
              <Icon name="plus" size={13} />
              Πεδίο
            </button>
          </div>
        )}
      </aside>

      <section className="wiki-pane">
        <Outlet />
      </section>

      {sheet === 'article' && <ArticleSheet onClose={() => setSheet(null)} />}
      {sheet === 'field' && <FieldSheet onClose={() => setSheet(null)} />}
    </div>
  );
}
