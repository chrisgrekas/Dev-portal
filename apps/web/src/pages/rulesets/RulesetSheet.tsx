import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Page, RuleListItem, RulesetDetail, RulesetRuleRef, RulesetStepRef, Workflow, WorkflowDetail } from '../../api/types';
import { Chip, SearchPicker } from '../../components/Pickers';
import { Sheet } from '../../components/Sheet';
import { Field, Icon, IconButton } from '../../components/ui';

type RuleRef = Pick<RulesetRuleRef, 'id' | 'name'>;

const fetchRules = (q: string) =>
  api<Page<RuleListItem>>('/rules', { query: { search: q || undefined, pageSize: 8 } }).then((r) => r.items);
const fetchWorkflows = (q: string) =>
  api<Page<Workflow>>('/workflows', { query: { search: q || undefined, pageSize: 8 } }).then((r) => r.items);

/** Rules με σειρά εκτέλεσης: προσθήκη, μετακίνηση πάνω/κάτω, αφαίρεση. */
function OrderedRulesField({ value, onChange }: { value: RuleRef[]; onChange: (v: RuleRef[]) => void }) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="multi-field">
      {value.length > 0 && (
        <ol className="order-list">
          {value.map((r, i) => (
            <li key={r.id}>
              <span className="order-no">{i + 1}</span>
              <span className="order-name mono">{r.name}</span>
              <IconButton icon="up" label="Πάνω" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon="down" label="Κάτω" disabled={i === value.length - 1} onClick={() => move(i, 1)} />
              <IconButton icon="close" label="Αφαίρεση" onClick={() => onChange(value.filter((x) => x.id !== r.id))} />
            </li>
          ))}
        </ol>
      )}
      <SearchPicker
        queryKey="rules"
        fetch={fetchRules}
        getLabel={(r) => r.name}
        getSub={(r) => r.description}
        excludeIds={value.map((r) => r.id)}
        onPick={(r) => onChange([...value, { id: r.id, name: r.name }])}
        placeholder="Προσθήκη rule…"
      />
    </div>
  );
}

/** Βήματα workflow: επιλογή workflow → toggle στα βήματά του. */
function StepsField({ value, onChange }: { value: RulesetStepRef[]; onChange: (v: RulesetStepRef[]) => void }) {
  const [workflow, setWorkflow] = useState<{ id: number; name: string } | null>(null);
  const wf = useQuery({
    queryKey: ['workflow', workflow?.id],
    queryFn: () => api<WorkflowDetail>(`/workflows/${workflow!.id}`),
    enabled: workflow !== null,
  });
  const selected = new Set(value.map((s) => s.id));

  return (
    <div className="multi-field">
      {value.length > 0 && (
        <div className="chips">
          {value.map((s) => (
            <Chip key={s.id} onRemove={() => onChange(value.filter((x) => x.id !== s.id))}>
              <span className="chip-muted">{s.workflow.name} ›</span> {s.name}
            </Chip>
          ))}
        </div>
      )}
      {workflow ? (
        <div className="step-chooser">
          <div className="step-chooser-head">
            <span>{workflow.name}</span>
            <button type="button" className="link-btn" onClick={() => setWorkflow(null)}>
              Άλλο workflow
            </button>
          </div>
          {wf.isPending ? (
            <div className="field-hint">Φόρτωση…</div>
          ) : wf.isError ? (
            <div className="field-hint">Σφάλμα φόρτωσης βημάτων.</div>
          ) : wf.data.steps.length === 0 ? (
            <div className="field-hint">Το workflow δεν έχει βήματα.</div>
          ) : (
            <div className="toggle-chips">
              {wf.data.steps.map((s) => {
                const on = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="toggle-chip"
                    aria-pressed={on}
                    onClick={() =>
                      onChange(on ? value.filter((x) => x.id !== s.id) : [...value, { id: s.id, name: s.name, workflow }])
                    }
                  >
                    {on && <Icon name="check" size={13} />}
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <SearchPicker
          queryKey="workflows"
          fetch={fetchWorkflows}
          getLabel={(w) => w.name}
          getSub={(w) => w.description}
          onPick={(w) => setWorkflow({ id: w.id, name: w.name })}
          placeholder="Επίλεξε workflow για να διαλέξεις βήματα…"
        />
      )}
    </div>
  );
}

export function RulesetSheet({
  ruleset,
  onClose,
  initialSteps = [],
  customerContext,
}: {
  ruleset?: RulesetDetail;
  onClose: () => void;
  initialSteps?: RulesetStepRef[];
  customerContext?: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isNew = !ruleset;
  const [name, setName] = useState(ruleset?.name ?? '');
  const [description, setDescription] = useState(ruleset?.description ?? '');
  const [rules, setRules] = useState<RuleRef[]>(ruleset?.rules ?? []);
  const [steps, setSteps] = useState<RulesetStepRef[]>(ruleset?.steps ?? initialSteps);
  const [reason, setReason] = useState('');

  const m = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || (isNew ? undefined : ''),
        ruleIds: rules.map((r) => r.id),
        stepIds: steps.map((s) => s.id),
        reason: reason.trim() || undefined,
      };
      return isNew
        ? api<RulesetDetail>('/rulesets', { method: 'POST', body })
        : api<RulesetDetail>(`/rulesets/${ruleset.id}`, { method: 'PATCH', body });
    },
    onSuccess: (rs) => {
      qc.setQueryData(['ruleset', rs.id], rs);
      qc.invalidateQueries({ queryKey: ['rulesets'] });
      qc.invalidateQueries({ queryKey: ['rule'] });
      qc.invalidateQueries({ queryKey: ['workflow'] });
      qc.invalidateQueries({ queryKey: ['changelog'] });
      if (isNew) navigate(`/rulesets/${rs.id}${customerContext ? `?c=${customerContext}` : ''}`);
      else onClose();
    },
  });

  return (
    <Sheet
      title={isNew ? 'Νέο ruleset' : 'Επεξεργασία ruleset'}
      size="lg"
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel={isNew ? 'Δημιουργία' : 'Αποθήκευση'}
      submitDisabled={!name.trim() || (!isNew && !reason.trim())}
      busy={m.isPending}
      error={m.error}
    >
      <Field label="Όνομα" htmlFor="rs-name">
        <input id="rs-name" className="input mono" value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} required />
      </Field>
      <Field label="Περιγραφή" htmlFor="rs-desc">
        <textarea id="rs-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Rules" hint="Εκτελούνται με αυτή τη σειρά.">
        <OrderedRulesField value={rules} onChange={setRules} />
      </Field>
      <Field label="Τρέχει στα βήματα">
        <StepsField value={steps} onChange={setSteps} />
      </Field>
      <Field label={isNew ? 'Αιτιολογία' : 'Γιατί γίνεται η αλλαγή;'} htmlFor="rs-reason">
        <input
          id="rs-reason"
          className="input"
          placeholder={isNew ? 'Προαιρετικό' : undefined}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required={!isNew}
        />
      </Field>
    </Sheet>
  );
}
