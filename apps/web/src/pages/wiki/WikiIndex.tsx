import { Link } from 'react-router-dom';
import { Empty, Icon, Loading } from '../../components/ui';
import { timeAgo } from '../../lib/format';
import { CATEGORY_LABEL, SYSTEMS, SYSTEM_LABEL } from './wiki';
import { useWikiSummary } from './WikiLayout';

/** Δεξί pane όταν δεν έχει επιλεγεί τίποτα: σύντομη επισκόπηση. */
export default function WikiIndex() {
  const summary = useWikiSummary();
  if (summary.isPending) return <Loading />;
  const s = summary.data;

  return (
    <div className="wiki-reading">
      <h1 className="wiki-pane-title">Wiki</h1>
      <p className="page-subtitle">Οδηγοί, γενικές πληροφορίες, rules και κατάλογοι πεδίων myClaim / weDAT.</p>

      <div className="wiki-catalog-cards">
        {SYSTEMS.map((sys) => (
          <Link key={sys} to={`/wiki/fields/${sys}`} className="recent-card">
            <span className="recent-card-name">Πεδία {SYSTEM_LABEL[sys]}</span>
            <span className="recent-card-number">{s?.fieldCounts[sys] ?? 0} πεδία</span>
          </Link>
        ))}
      </div>

      <h2 className="day-title wiki-index-heading">Πρόσφατες αλλαγές</h2>
      {s && s.recent.length ? (
        <ul className="list">
          {s.recent.map((a) => (
            <li key={a.id}>
              <Link to={`/wiki/${a.id}`} className="list-row">
                <div className="list-main">
                  <div className="list-title">{a.title}</div>
                  <div className="list-sub">{CATEGORY_LABEL[a.category]}</div>
                </div>
                <span className="list-time">{timeAgo(a.updatedAt)}</span>
                <Icon name="chevron" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Δεν υπάρχουν άρθρα ακόμα" />
      )}
    </div>
  );
}
