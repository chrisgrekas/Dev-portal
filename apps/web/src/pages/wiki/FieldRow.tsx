import type { WikiField } from '../../api/types';
import { CopyIcon } from '../../components/Code';
import { Badge, IconButton } from '../../components/ui';
import { SYSTEM_LABEL } from './wiki';

/** Μία γραμμή καταλόγου πεδίων: monospace όνομα (one-click copy), τύπος, περιγραφή, παράδειγμα. */
export function FieldRow({
  field: f,
  showSystem,
  highlight,
  onEdit,
}: {
  field: WikiField;
  showSystem?: boolean;
  highlight?: boolean;
  onEdit?: () => void;
}) {
  return (
    <li className={`field-row${highlight ? ' highlight' : ''}`} id={`field-${f.system}-${f.name}`}>
      <div className="field-main">
        <div className="field-head">
          <span className="field-name-wrap">
            <code className="field-name">{f.name}</code>
            <CopyIcon text={f.name} label={`Αντιγραφή ${f.name}`} />
          </span>
          {f.label && <span className="field-label-text">{f.label}</span>}
        </div>
        {f.description && <p className="field-desc">{f.description}</p>}
        {f.example && (
          <div className="field-example">
            π.χ. <code>{f.example}</code>
          </div>
        )}
      </div>
      <div className="field-side">
        {showSystem && <Badge tone="accent">{SYSTEM_LABEL[f.system]}</Badge>}
        {f.type && <Badge>{f.type}</Badge>}
        {onEdit && <IconButton icon="edit" label={`Επεξεργασία ${f.name}`} onClick={onEdit} />}
      </div>
    </li>
  );
}
