import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { CustomerRef, Rule, RuleAction, RuleVersion } from '../../api/types';
import { ActionsField } from '../../components/actions/ActionEditor';
import { VersionDiff } from '../../components/actions/ActionsDiff';
import { CodeEditor } from '../../components/Code';
import { CustomersField, EnvironmentsField } from '../../components/Pickers';
import { Sheet } from '../../components/Sheet';
import { Field, Icon, Segmented } from '../../components/ui';
import { sameContent } from '../../lib/actions';

type Draft = { code: string; triggerCondition: string; actions: RuleAction[] };

const draftFrom = (v?: RuleVersion | null): Draft => ({
  code: v?.code ?? '',
  triggerCondition: v?.triggerCondition ?? '',
  // αντίγραφο: οι αλλαγές στη φόρμα δεν αγγίζουν τα cached δεδομένα της τρέχουσας έκδοσης
  actions: (v?.actions ?? []).map((a) => ({ ...a })),
});

const draftBody = (d: Draft) => ({ code: d.code, triggerCondition: d.triggerCondition, actions: d.actions });

/**
 * Περιεχόμενο έκδοσης: Trigger / Condition, Ενέργειες (Action Cards) και προαιρετικός ελεύθερος κώδικας.
 * Παλιά rules με μόνο κώδικα δείχνουν τον editor κώδικα ανοιχτό, όπως πριν.
 */
function VersionContentFields({ value, onChange, customerIds }: { value: Draft; onChange: (d: Draft) => void; customerIds?: number[] }) {
  const [showCode, setShowCode] = useState(Boolean(value.code) || value.actions.length === 0);
  const set = (patch: Partial<Draft>) => onChange({ ...value, ...patch });
  return (
    <>
      <Field label="Trigger / Condition" htmlFor="rule-trigger" hint="Προαιρετικό — πότε τρέχει, π.χ. Status = Deeplink Completed">
        <input
          id="rule-trigger"
          className="input mono"
          placeholder="Status = Deeplink Completed"
          value={value.triggerCondition}
          onChange={(e) => set({ triggerCondition: e.target.value })}
        />
      </Field>
      <Field label="Ενέργειες" hint="Με σειρά εκτέλεσης. Νέος τύπος; Γράψε το όνομά του στο «Προσθήκη ενέργειας».">
        <ActionsField value={value.actions} onChange={(actions) => set({ actions })} customerIds={customerIds} />
      </Field>
      {showCode ? (
        <Field label={value.actions.length ? 'Κώδικας (προαιρετικό)' : 'Κώδικας'} htmlFor="rule-code">
          <CodeEditor id="rule-code" value={value.code} onChange={(code) => set({ code })} minRows={value.actions.length ? 6 : 12} />
        </Field>
      ) : (
        <button type="button" className="link-btn add-code" onClick={() => setShowCode(true)}>
          <Icon name="plus" size={13} />
          Ελεύθερος κώδικας
        </button>
      )}
    </>
  );
}

export function NewRuleSheet({
  onClose,
  initialCustomers = [],
  customerContext,
}: {
  onClose: () => void;
  initialCustomers?: CustomerRef[];
  customerContext?: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [myclaimId, setMyclaimId] = useState('');
  const [customers, setCustomers] = useState<CustomerRef[]>(initialCustomers);
  const [environmentIds, setEnvironmentIds] = useState<number[]>([]);
  const [draft, setDraft] = useState<Draft>(draftFrom(null));
  const [reason, setReason] = useState('');

  const m = useMutation({
    mutationFn: () =>
      api<Rule>('/rules', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          myclaimId: myclaimId.trim() || undefined,
          ...draftBody(draft),
          reason: reason.trim() || undefined,
          customerIds: customers.map((c) => c.id),
          environmentIds,
        },
      }),
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.invalidateQueries({ queryKey: ['changelog'] });
      navigate(`/rules/${rule.id}${customerContext ? `?c=${customerContext}` : ''}`);
    },
  });

  return (
    <Sheet
      title="Νέο rule"
      size="lg"
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel="Δημιουργία"
      submitDisabled={!name.trim()}
      busy={m.isPending}
      error={m.error}
    >
      <div className="form-grid">
        <Field label="Όνομα" htmlFor="rule-name">
          <input id="rule-name" className="input mono" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <Field label="myClaim ID" htmlFor="rule-myclaim" hint="Προαιρετικό — για τον μελλοντικό συγχρονισμό.">
          <input id="rule-myclaim" className="input mono" value={myclaimId} onChange={(e) => setMyclaimId(e.target.value)} />
        </Field>
      </div>
      <Field label="Περιγραφή" htmlFor="rule-desc">
        <textarea id="rule-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="form-grid">
        <Field label="Πελάτες" htmlFor="rule-customers">
          <CustomersField id="rule-customers" value={customers} onChange={setCustomers} />
        </Field>
        <Field label="Περιβάλλοντα">
          <EnvironmentsField value={environmentIds} onChange={setEnvironmentIds} />
        </Field>
      </div>
      <VersionContentFields value={draft} onChange={setDraft} customerIds={customers.map((c) => c.id)} />
      <Field label="Αιτιολογία" htmlFor="rule-reason">
        <input id="rule-reason" className="input" placeholder="Αρχική καταχώρηση" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function EditRuleSheet({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(rule.name);
  const [description, setDescription] = useState(rule.description ?? '');
  const [myclaimId, setMyclaimId] = useState(rule.myclaimId ?? '');
  const [customers, setCustomers] = useState<CustomerRef[]>(rule.customers);
  const [environmentIds, setEnvironmentIds] = useState<number[]>(rule.environments.map((e) => e.id));
  const [reason, setReason] = useState('');

  const m = useMutation({
    mutationFn: () => {
      const mc = myclaimId.trim();
      return api<Rule>(`/rules/${rule.id}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          description: description.trim(),
          // null καθαρίζει το πεδίο· undefined το αφήνει όπως είναι
          myclaimId: mc ? mc : rule.myclaimId ? null : undefined,
          customerIds: customers.map((c) => c.id),
          environmentIds,
          reason: reason.trim(),
        },
      });
    },
    onSuccess: (updated) => {
      qc.setQueryData(['rule', rule.id], updated);
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.invalidateQueries({ queryKey: ['changelog'] });
      onClose();
    },
  });

  return (
    <Sheet
      title="Επεξεργασία στοιχείων"
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitDisabled={!name.trim() || !reason.trim()}
      busy={m.isPending}
      error={m.error}
    >
      <p className="sheet-note">Ο κώδικας δεν αλλάζει από εδώ — μόνο με νέα έκδοση.</p>
      <Field label="Όνομα" htmlFor="edit-name">
        <input id="edit-name" className="input mono" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Περιγραφή" htmlFor="edit-desc">
        <textarea id="edit-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="myClaim ID" htmlFor="edit-myclaim">
        <input id="edit-myclaim" className="input mono" value={myclaimId} onChange={(e) => setMyclaimId(e.target.value)} />
      </Field>
      <Field label="Πελάτες" htmlFor="edit-customers">
        <CustomersField id="edit-customers" value={customers} onChange={setCustomers} />
      </Field>
      <Field label="Περιβάλλοντα">
        <EnvironmentsField value={environmentIds} onChange={setEnvironmentIds} />
      </Field>
      <Field label="Γιατί γίνεται η αλλαγή;" htmlFor="edit-reason">
        <input id="edit-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required />
      </Field>
    </Sheet>
  );
}

export function NewVersionSheet({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const qc = useQueryClient();
  const current = rule.currentVersion;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(current));
  const [reason, setReason] = useState('');
  const [view, setView] = useState<'edit' | 'diff'>('edit');
  const before = draftFrom(current);
  const unchanged = sameContent(before, draft);
  const nextVersion = (current?.version ?? 0) + 1;

  const m = useMutation({
    mutationFn: () =>
      api<RuleVersion>(`/rules/${rule.id}/versions`, { method: 'POST', body: { ...draftBody(draft), reason: reason.trim() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rule', rule.id] });
      qc.invalidateQueries({ queryKey: ['rules'] });
      onClose();
    },
  });

  return (
    <Sheet
      title={`Νέα έκδοση · v${nextVersion}`}
      size="lg"
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel={`Αποθήκευση v${nextVersion}`}
      submitDisabled={unchanged || !reason.trim()}
      busy={m.isPending}
      error={m.error}
      footer={unchanged && <span className="sheet-footer-note">Καμία αλλαγή ακόμα</span>}
    >
      <div className="sheet-toolbar">
        <Segmented
          label="Προβολή"
          value={view}
          onChange={setView}
          options={[
            { value: 'edit', label: 'Επεξεργασία' },
            { value: 'diff', label: 'Αλλαγές' },
          ]}
        />
      </div>
      {view === 'edit' ? (
        <VersionContentFields value={draft} onChange={setDraft} customerIds={rule.customers.map((c) => c.id)} />
      ) : (
        <VersionDiff before={before} after={draft} label={`v${nextVersion - 1} → v${nextVersion}`} />
      )}
      <Field label="Γιατί αλλάζει;" htmlFor="version-reason" hint="Υποχρεωτικό — μένει μόνιμα στο ιστορικό.">
        <input
          id="version-reason"
          className="input"
          placeholder="π.χ. Νέο response στο Generate Token"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
      </Field>
    </Sheet>
  );
}
