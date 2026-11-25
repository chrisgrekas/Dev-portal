import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../api/client';
import type { ActionLayout, ActionType, Page, RuleAction, RuleListItem } from '../../api/types';
import { CREATABLE_LAYOUTS, createPlaceholderRule, HTTP_METHODS, LAYOUT_LABEL, newAction } from '../../lib/actions';
import { CodeEditor } from '../Code';
import { Chip, SearchPicker } from '../Pickers';
import { Badge, Icon, IconButton, Segmented } from '../ui';

export const useActionTypes = () =>
  useQuery({ queryKey: ['action-types'], queryFn: () => api<ActionType[]>('/action-types'), staleTime: 60_000 });

const fetchRules = (q: string) =>
  api<Page<RuleListItem>>('/rules', { query: { search: q || undefined, pageSize: 8 } }).then((r) => r.items);

/**
 * «+ Προσθήκη ενέργειας»: ψάχνει στους τύπους ενεργειών. Αν γράψεις κάτι που δεν υπάρχει
 * (π.χ. «Send Email»), δίνει «+ Προσθήκη «…»» με επιλογή layout — ο νέος τύπος αποθηκεύεται για όλους.
 */
function ActionTypeCombobox({ onAdd }: { onAdd: (a: RuleAction) => void }) {
  const qc = useQueryClient();
  const types = useActionTypes();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [layout, setLayout] = useState<ActionLayout>('text');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const term = q.trim().replace(/\s+/g, ' ');
  const lower = term.toLocaleLowerCase('el');

  const all = types.data ?? [];
  const options = all.filter((t) => !lower || t.name.toLocaleLowerCase('el').includes(lower));
  const canCreate = Boolean(term) && types.isSuccess && !all.some((t) => t.name.toLocaleLowerCase('el') === lower);
  const total = options.length + (canCreate ? 1 : 0);

  useEffect(() => {
    setActive(0);
    setError(null);
  }, [lower]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const add = (t: Pick<ActionType, 'name' | 'layout'>) => {
    onAdd(newAction(t));
    setQ('');
    setOpen(false);
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const t = await api<ActionType>('/action-types', { method: 'POST', body: { name: term, layout } });
      qc.setQueryData<ActionType[]>(['action-types'], (old) => [...(old ?? []), t]);
      add(t);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const choose = (i: number) => {
    if (i < options.length) add(options[i]);
    else if (canCreate) void create();
  };

  if (!open)
    return (
      <button type="button" className="add-action" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        Προσθήκη ενέργειας
      </button>
    );

  return (
    <div className="picker action-type-picker">
      <div className="search-field">
        <Icon name="search" />
        <input
          ref={inputRef}
          value={q}
          placeholder="Τύπος ενέργειας — π.χ. Call Up URL ή κάτι νέο"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => !busy && setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, total - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (active < total) choose(active);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {busy && <span className="spinner spinner-muted" aria-hidden="true" />}
      </div>
      {/* mousedown preventDefault: τα κλικ μέσα στο menu (και στο segmented) δεν κλείνουν το combobox */}
      <ul className="picker-menu" id={listId} role="listbox" onMouseDown={(e) => e.preventDefault()}>
        {options.map((t, i) => (
          <li
            key={t.id}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : ''}
            onClick={() => add(t)}
            onMouseEnter={() => setActive(i)}
          >
            <span className="picker-label">{t.name}</span>
            <span className="picker-sub">{LAYOUT_LABEL[t.layout]}</span>
          </li>
        ))}
        {canCreate && (
          <li
            role="option"
            aria-selected={active === options.length}
            className={`picker-create action-type-create${active === options.length ? ' active' : ''}`}
            onMouseEnter={() => setActive(options.length)}
          >
            <button type="button" className="action-type-create-label" onClick={() => void create()}>
              <Icon name="plus" size={13} />
              Προσθήκη «{term}»
            </button>
            <Segmented
              label="Layout νέου τύπου"
              value={layout}
              onChange={setLayout}
              options={CREATABLE_LAYOUTS.map((l) => ({ value: l, label: LAYOUT_LABEL[l] }))}
            />
          </li>
        )}
        {error != null && <li className="picker-empty picker-error">{errorMessage(error)}</li>}
        {total === 0 && <li className="picker-empty">{types.isPending ? 'Φόρτωση…' : 'Γράψε όνομα για νέο τύπο'}</li>}
      </ul>
    </div>
  );
}

type HttpTab = 'headers' | 'request' | 'response';

function ActionEditorCard({
  action,
  index,
  count,
  customerIds,
  onChange,
  onMove,
  onRemove,
}: {
  action: RuleAction;
  index: number;
  count: number;
  customerIds?: number[];
  onChange: (a: RuleAction) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [tab, setTab] = useState<HttpTab>('request');
  const set = (patch: Partial<RuleAction>) => onChange({ ...action, ...patch });
  const fid = (k: string) => `act-${action.id}-${k}`;

  let body = null;
  switch (action.layout) {
    case 'http':
      body = (
        <>
          <div className="action-http-inputs">
            <input
              className="input mono action-method"
              list="http-methods"
              aria-label="Μέθοδος"
              placeholder="POST JSON"
              value={action.method ?? ''}
              onChange={(e) => set({ method: e.target.value })}
            />
            <input
              className="input mono"
              aria-label="URL"
              placeholder="https://…"
              value={action.url ?? ''}
              onChange={(e) => set({ url: e.target.value })}
            />
          </div>
          <Segmented
            label="Περιεχόμενο κλήσης"
            value={tab}
            onChange={setTab}
            options={(['headers', 'request', 'response'] as const).map((k) => ({
              value: k,
              label: (
                <>
                  {k === 'headers' ? 'Headers' : k === 'request' ? 'Request' : 'Response'}
                  {action[k]?.trim() && <span className="filled-dot" aria-label="(συμπληρωμένο)" />}
                </>
              ),
            }))}
          />
          <CodeEditor
            key={tab}
            id={fid(tab)}
            value={action[tab] ?? ''}
            onChange={(v) => set({ [tab]: v })}
            minRows={4}
            placeholder={tab === 'headers' ? 'Content-Type: application/json' : tab === 'request' ? 'Body της κλήσης…' : 'Ενδεικτική απάντηση…'}
          />
        </>
      );
      break;
    case 'code':
      body = <CodeEditor id={fid('content')} value={action.content ?? ''} onChange={(v) => set({ content: v })} minRows={5} />;
      break;
    case 'text':
      body = (
        <textarea
          id={fid('content')}
          className="input"
          rows={4}
          placeholder="Περιγραφή / περιεχόμενο…"
          value={action.content ?? ''}
          onChange={(e) => set({ content: e.target.value })}
        />
      );
      break;
    case 'rule_ref':
      body = action.targetRuleId ? (
        <div className="chips">
          <Chip onRemove={() => set({ targetRuleId: undefined, targetRuleName: undefined })}>
            <Icon name="arrow" size={12} /> <span className="mono">{action.targetRuleName ?? `#${action.targetRuleId}`}</span>
          </Chip>
        </div>
      ) : (
        <SearchPicker
          id={fid('rule')}
          queryKey="rules"
          fetch={fetchRules}
          getLabel={(r) => r.name}
          getSub={(r) => r.description}
          onPick={(r) => set({ targetRuleId: r.id, targetRuleName: r.name })}
          onCreate={(name) => createPlaceholderRule(name, customerIds)}
          createLabel={(q) => (
            <>
              Δημιουργία rule «<span className="mono">{q}</span>»
            </>
          )}
          placeholder="Ποιο rule εφαρμόζεται;"
        />
      );
      break;
    case 'status':
      body = (
        <div className="form-grid">
          <input
            className="input"
            aria-label="Νέο status"
            placeholder="Νέο status — π.χ. Sent to Partner"
            value={action.statusName ?? ''}
            onChange={(e) => set({ statusName: e.target.value })}
          />
          <input
            className="input"
            aria-label="Συνθήκη"
            placeholder="Συνθήκη (προαιρετικό) — π.χ. Αν vehicle_selected = YES"
            value={action.conditionNote ?? ''}
            onChange={(e) => set({ conditionNote: e.target.value })}
          />
        </div>
      );
      break;
  }

  return (
    <li className="action-edit-card">
      <div className="action-edit-head">
        <span className="action-index">{index + 1}</span>
        <Badge>{action.typeName}</Badge>
        <input
          className="action-title-input"
          aria-label="Τίτλος βήματος"
          placeholder="Τίτλος βήματος (προαιρετικό)"
          value={action.title ?? ''}
          onChange={(e) => set({ title: e.target.value })}
        />
        <div className="action-edit-tools">
          <IconButton icon="up" label="Πάνω" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon="down" label="Κάτω" disabled={index === count - 1} onClick={() => onMove(1)} />
          <IconButton icon="trash" label="Διαγραφή ενέργειας" onClick={onRemove} />
        </div>
      </div>
      <div className="action-edit-body">{body}</div>
    </li>
  );
}

/** Λίστα ενεργειών μέσα σε φόρμα: προσθήκη (creatable τύποι), επεξεργασία, μετακίνηση, διαγραφή. */
export function ActionsField({
  value,
  onChange,
  customerIds,
}: {
  value: RuleAction[];
  onChange: (v: RuleAction[]) => void;
  customerIds?: number[];
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="actions-field">
      <datalist id="http-methods">
        {HTTP_METHODS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {value.length > 0 && (
        <ol className="action-edit-list">
          {value.map((a, i) => (
            <ActionEditorCard
              key={a.id}
              action={a}
              index={i}
              count={value.length}
              customerIds={customerIds}
              onChange={(na) => onChange(value.map((x) => (x.id === a.id ? na : x)))}
              onMove={(d) => move(i, d)}
              onRemove={() => onChange(value.filter((x) => x.id !== a.id))}
            />
          ))}
        </ol>
      )}
      <ActionTypeCombobox onAdd={(a) => onChange([...value, a])} />
    </div>
  );
}
