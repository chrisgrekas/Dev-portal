import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { WikiArticle } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { CodeView } from '../../components/Code';
import { Markdown } from '../../components/Markdown';
import { Button, Empty, ErrorState, Icon, Loading, Segmented } from '../../components/ui';
import { formatDateTime, timeAgo } from '../../lib/format';
import { useIdParam, useTitle } from '../../lib/hooks';
import NotFound from '../NotFound';
import { FieldRow } from './FieldRow';
import { CATEGORY_LABEL } from './wiki';
import { ArticleSheet, DeleteSheet } from './WikiSheets';

type Section = 'all' | 'guide' | 'fields' | 'rules';
const SECTIONS: Section[] = ['all', 'guide', 'fields', 'rules'];

export default function WikiArticlePage() {
  const id = useIdParam();
  if (id === null) return <NotFound />;
  return <Article id={id} />;
}

function Article({ id }: { id: number }) {
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<null | 'edit' | 'delete'>(null);
  const query = useQuery({ queryKey: ['wiki', 'article', id], queryFn: () => api<WikiArticle>(`/wiki/articles/${id}`) });
  useTitle(query.data?.title);

  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const a = query.data;
  const myclaim = a.myclaimFields?.trim() ? a.myclaimFields : null;
  const wedat = a.wedatFields?.trim() ? a.wedatFields : null;
  const hasFields = Boolean(myclaim || wedat || a.fields.length);
  const hasRules = a.rules.length > 0;
  const hasLinked = hasFields || hasRules;

  // Το φίλτρο ενοτήτων υπάρχει μόνο όταν το άρθρο έχει συνδεδεμένα στοιχεία.
  const requested = params.get('s') as Section | null;
  const section: Section = hasLinked && requested && SECTIONS.includes(requested) ? requested : 'all';
  const show = (s: Section) => section === 'all' || section === s;
  const fieldCount = (myclaim ? 1 : 0) + (wedat ? 1 : 0);

  return (
    <article className="wiki-reading">
      <Link to="/wiki" className="back-link wiki-back">
        <Icon name="back" size={18} />
        Wiki
      </Link>
      <header className="wiki-article-head">
        <div>
          <h1 className="wiki-pane-title">{a.title}</h1>
          <p className="wiki-article-meta" title={formatDateTime(a.updatedAt)}>
            {CATEGORY_LABEL[a.category]} · ενημερώθηκε {timeAgo(a.updatedAt)}
          </p>
        </div>
        {canEdit && (
          <div className="page-actions">
            <Button variant="secondary" size="sm" onClick={() => setSheet('delete')}>
              Διαγραφή
            </Button>
            <Button size="sm" onClick={() => setSheet('edit')}>
              Επεξεργασία
            </Button>
          </div>
        )}
      </header>

      {hasLinked && (
        <div className="wiki-sections-control">
          <Segmented
            label="Ενότητα"
            value={section}
            onChange={(s) => setParams(s === 'all' ? {} : { s }, { replace: true })}
            options={[
              { value: 'all', label: 'Όλα' },
              { value: 'guide', label: 'Οδηγός' },
              ...(hasFields ? [{ value: 'fields' as const, label: <>Πεδία{fieldCount > 0 && <span className="segmented-count">{fieldCount}</span>}</> }] : []),
              ...(hasRules ? [{ value: 'rules' as const, label: <>Rules<span className="segmented-count">{a.rules.length}</span></> }] : []),
            ]}
          />
        </div>
      )}

      {show('guide') && (
        <section className="wiki-section">
          {hasLinked && section === 'all' && <h2 className="wiki-section-title">Οδηγός</h2>}
          <div className="wiki-body">{a.body.trim() ? <Markdown source={a.body} /> : <Empty title="Χωρίς κείμενο ακόμα" />}</div>
        </section>
      )}

      {show('fields') && myclaim && (
        <section className="wiki-section">
          <h2 className="wiki-section-title">Πεδία myClaim</h2>
          <CodeView code={myclaim} label="myClaim" />
        </section>
      )}

      {show('fields') && wedat && (
        <section className="wiki-section">
          <h2 className="wiki-section-title">Πεδία weDAT</h2>
          <CodeView code={wedat} label="weDAT" />
        </section>
      )}

      {/* Παλιότερες συνδέσεις με τον κατάλογο πεδίων, αν υπάρχουν — μόνο για ανάγνωση. */}
      {show('fields') && a.fields.length > 0 && (
        <section className="wiki-section">
          <h2 className="wiki-section-title">Από τον κατάλογο πεδίων</h2>
          <ul className="list">
            {a.fields.map((f) => (
              <FieldRow key={f.id} field={f} showSystem />
            ))}
          </ul>
        </section>
      )}

      {show('rules') && hasRules && (
        <section className="wiki-section">
          <h2 className="wiki-section-title">Απαιτούμενα Rules</h2>
          <ul className="list">
            {a.rules.map((r) => (
              <li key={r.id}>
                <Link to={`/rules/${r.id}`} className="list-row">
                  <div className="list-main">
                    <div className="list-title mono">{r.name}</div>
                    {r.description && <div className="list-sub">{r.description}</div>}
                  </div>
                  <Icon name="chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sheet === 'edit' && <ArticleSheet article={a} onClose={() => setSheet(null)} />}
      {sheet === 'delete' && (
        <DeleteSheet
          title={`Διαγραφή «${a.title}»;`}
          text="Το άρθρο θα αφαιρεθεί από το wiki. Τα rules δεν επηρεάζονται."
          path={`/wiki/articles/${a.id}`}
          onClose={() => setSheet(null)}
          onDeleted={() => navigate('/wiki', { replace: true })}
        />
      )}
    </article>
  );
}
