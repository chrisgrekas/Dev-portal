import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { FieldSystem, Page, WikiField } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button, Empty, Icon, Pagination, Resource, SearchField } from '../../components/ui';
import { count } from '../../lib/format';
import { useListParams, useTitle } from '../../lib/hooks';
import NotFound from '../NotFound';
import { FieldRow } from './FieldRow';
import { SYSTEMS, SYSTEM_LABEL } from './wiki';
import { DeleteSheet, FieldSheet } from './WikiSheets';

const PAGE_SIZE = 100;

export default function FieldCatalog() {
  const { system } = useParams();
  if (!SYSTEMS.includes(system as FieldSystem)) return <NotFound />;
  return <Catalog system={system as FieldSystem} />;
}

function Catalog({ system }: { system: FieldSystem }) {
  const { canEdit } = useAuth();
  useTitle(`Πεδία ${SYSTEM_LABEL[system]}`);
  const lp = useListParams();
  const q = lp.get('q') ?? '';
  const [sheet, setSheet] = useState<null | 'new' | WikiField>(null);
  const [deleting, setDeleting] = useState<WikiField | null>(null);

  const query = useQuery({
    queryKey: ['wiki', 'fields', { system, q, page: lp.page }],
    queryFn: () => api<Page<WikiField>>('/wiki/fields', { query: { system, search: q, page: lp.page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  // Από το Spotlight: ?q=vin → το πεδίο σε θέα.
  useEffect(() => {
    if (!q || !query.data) return;
    document.getElementById(`field-${system}-${q}`)?.scrollIntoView({ block: 'center' });
  }, [q, system, query.data]);

  return (
    <div className="wiki-reading">
      <Link to="/wiki" className="back-link wiki-back">
        <Icon name="back" size={18} />
        Wiki
      </Link>
      <header className="wiki-article-head">
        <div>
          <h1 className="wiki-pane-title">Πεδία {SYSTEM_LABEL[system]}</h1>
          <p className="wiki-article-meta">{query.data ? count(query.data.total, 'πεδίο', 'πεδία') : ' '}</p>
        </div>
        {canEdit && (
          <div className="page-actions">
            <Button size="sm" onClick={() => setSheet('new')}>
              <Icon name="plus" size={14} />
              Νέο πεδίο
            </Button>
          </div>
        )}
      </header>

      <div className="wiki-catalog-search">
        <SearchField value={q} onChange={(v) => lp.update({ q: v })} placeholder={`Αναζήτηση σε πεδία ${SYSTEM_LABEL[system]}`} />
      </div>

      <Resource query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <Empty title={q ? 'Κανένα πεδίο δεν ταιριάζει' : 'Δεν υπάρχουν πεδία ακόμα'} />
          ) : (
            <>
              <ul className={`list${query.isPlaceholderData ? ' is-stale' : ''}`}>
                {data.items.map((f) => (
                  <FieldRow key={f.id} field={f} highlight={q === f.name} onEdit={canEdit ? () => setSheet(f) : undefined} />
                ))}
              </ul>
              <Pagination page={lp.page} pageSize={PAGE_SIZE} total={data.total} onPage={(page) => lp.update({ page })} />
            </>
          )
        }
      </Resource>

      {sheet === 'new' && <FieldSheet initialSystem={system} onClose={() => setSheet(null)} />}
      {sheet && sheet !== 'new' && (
        <FieldSheet
          field={sheet}
          onClose={() => setSheet(null)}
          onDelete={() => {
            setDeleting(sheet);
            setSheet(null);
          }}
        />
      )}
      {deleting && (
        <DeleteSheet
          title={`Διαγραφή «${deleting.name}»;`}
          text={`Το πεδίο ${SYSTEM_LABEL[deleting.system]}.${deleting.name} θα αφαιρεθεί από τον κατάλογο και από όσα άρθρα το αναφέρουν.`}
          path={`/wiki/fields/${deleting.id}`}
          onClose={() => setDeleting(null)}
          onDeleted={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
