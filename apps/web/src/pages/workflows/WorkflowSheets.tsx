import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { CustomerRef, WorkflowDetail, WorkflowStep } from '../../api/types';
import { CustomersField } from '../../components/Pickers';
import { Sheet } from '../../components/Sheet';
import { Field } from '../../components/ui';
import { useEnvironments } from '../../lib/hooks';

function useInvalidateWorkflow() {
  const qc = useQueryClient();
  return (id?: number) => {
    if (id) qc.invalidateQueries({ queryKey: ['workflow', id] });
    qc.invalidateQueries({ queryKey: ['workflows'] });
    qc.invalidateQueries({ queryKey: ['changelog'] });
  };
}

export function WorkflowSheet({
  workflow,
  onClose,
  initialCustomers = [],
  customerContext,
}: {
  workflow?: WorkflowDetail;
  onClose: () => void;
  initialCustomers?: CustomerRef[];
  customerContext?: string;
}) {
  const isNew = !workflow;
  const navigate = useNavigate();
  const invalidate = useInvalidateWorkflow();
  const envs = useEnvironments();
  const [name, setName] = useState(workflow?.name ?? '');
  const [trigger, setTrigger] = useState(workflow?.trigger ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [environmentId, setEnvironmentId] = useState<number | null>(workflow?.environmentId ?? null);
  const [customers, setCustomers] = useState<CustomerRef[]>(workflow?.customers ?? initialCustomers);
  const [reason, setReason] = useState('');

  const m = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        trigger: trigger.trim(),
        description: description.trim() || (isNew ? undefined : ''),
        environmentId: isNew ? (environmentId ?? undefined) : environmentId,
        customerIds: customers.map((c) => c.id),
        reason: reason.trim() || undefined,
      };
      return isNew
        ? api<WorkflowDetail>('/workflows', { method: 'POST', body })
        : api<WorkflowDetail>(`/workflows/${workflow.id}`, { method: 'PATCH', body });
    },
    onSuccess: (wf) => {
      invalidate(wf.id);
      if (isNew) navigate(`/workflows/${wf.id}${customerContext ? `?c=${customerContext}` : ''}`);
      else onClose();
    },
  });

  return (
    <Sheet
      title={isNew ? 'Νέο workflow' : 'Επεξεργασία workflow'}
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel={isNew ? 'Δημιουργία' : 'Αποθήκευση'}
      submitDisabled={!name.trim() || !trigger.trim() || (!isNew && !reason.trim())}
      busy={m.isPending}
      error={m.error}
    >
      <Field label="Όνομα" htmlFor="wf-name">
        <input
          id="wf-name"
          className="input"
          placeholder="π.χ. Ροή φακέλου χωρίς deeplink"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={isNew}
          required
        />
      </Field>
      <Field
        label="Πότε ενεργοποιείται"
        htmlFor="wf-trigger"
        hint="Υποχρεωτικό. Ένας πελάτης μπορεί να έχει πολλά workflows — εδώ φαίνεται πότε τρέχει αυτό."
      >
        <textarea
          id="wf-trigger"
          className="input"
          rows={2}
          placeholder="π.χ. Όταν ο φάκελος ανοίγει χωρίς deeplink"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          required
        />
      </Field>
      <Field label="Περιγραφή" htmlFor="wf-desc">
        <textarea id="wf-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Περιβάλλον" htmlFor="wf-env">
        <select
          id="wf-env"
          className="select"
          value={environmentId ?? ''}
          onChange={(e) => setEnvironmentId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">—</option>
          {envs.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Πελάτες" htmlFor="wf-customers">
        <CustomersField id="wf-customers" value={customers} onChange={setCustomers} />
      </Field>
      <Field label={isNew ? 'Αιτιολογία' : 'Γιατί γίνεται η αλλαγή;'} htmlFor="wf-reason">
        <input
          id="wf-reason"
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

/** Νέο βήμα, ή επεξεργασία υπάρχοντος (όνομα, σειρά, σημειώσεις) όταν δίνεται `step`. */
export function StepSheet({
  workflowId,
  steps,
  step,
  onClose,
}: {
  workflowId: number;
  steps: Pick<WorkflowStep, 'order'>[];
  step?: Pick<WorkflowStep, 'id' | 'name' | 'order' | 'description'>;
  onClose: () => void;
}) {
  const invalidate = useInvalidateWorkflow();
  const isNew = !step;
  const nextOrder = steps.length ? Math.max(...steps.map((s) => s.order)) + 1 : 0;
  const [name, setName] = useState(step?.name ?? '');
  const [order, setOrder] = useState(String(step?.order ?? nextOrder));
  const [description, setDescription] = useState(step?.description ?? '');
  const [reason, setReason] = useState('');
  const orderNum = Number(order);
  const orderValid = order.trim() !== '' && Number.isInteger(orderNum);

  const m = useMutation({
    mutationFn: () =>
      isNew
        ? api<WorkflowStep>(`/workflows/${workflowId}/steps`, {
            method: 'POST',
            body: { name: name.trim(), order: orderNum, description: description.trim() || undefined },
          })
        : api<WorkflowStep>(`/workflows/${workflowId}/steps/${step.id}`, {
            method: 'PATCH',
            body: { name: name.trim(), order: orderNum, description: description.trim(), reason: reason.trim() },
          }),
    onSuccess: () => {
      invalidate(workflowId);
      onClose();
    },
  });

  return (
    <Sheet
      title={isNew ? 'Νέο βήμα' : 'Επεξεργασία βήματος'}
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel={isNew ? 'Προσθήκη' : 'Αποθήκευση'}
      submitDisabled={!name.trim() || !orderValid || (!isNew && !reason.trim())}
      busy={m.isPending}
      error={m.error}
    >
      <div className="form-grid form-grid-wide-first">
        <Field label="Όνομα" htmlFor="step-name">
          <input id="step-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} required />
        </Field>
        <Field label="Σειρά" htmlFor="step-order" hint="Μικρότερο = νωρίτερα.">
          <input id="step-order" className="input" type="number" step={1} value={order} onChange={(e) => setOrder(e.target.value)} />
        </Field>
      </div>
      <Field
        label="Σημειώσεις"
        htmlFor="step-notes"
        hint="Πώς αλλάζει η κατάσταση (manual, Rule myClaim, web service), τι endpoint καλείται κ.λπ."
      >
        <textarea id="step-notes" className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {!isNew && (
        <Field label="Γιατί γίνεται η αλλαγή;" htmlFor="step-reason">
          <input id="step-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
      )}
    </Sheet>
  );
}

export function TransitionSheet({ workflowId, steps, onClose }: { workflowId: number; steps: WorkflowStep[]; onClose: () => void }) {
  const invalidate = useInvalidateWorkflow();
  const [from, setFrom] = useState(steps[0]?.id ?? 0);
  const [to, setTo] = useState(steps[1]?.id ?? steps[0]?.id ?? 0);
  const [label, setLabel] = useState('');

  const m = useMutation({
    mutationFn: () =>
      api(`/workflows/${workflowId}/transitions`, {
        method: 'POST',
        body: { fromStepId: from, toStepId: to, label: label.trim() || undefined },
      }),
    onSuccess: () => {
      invalidate(workflowId);
      onClose();
    },
  });

  const stepSelect = (id: string, value: number, set: (v: number) => void) => (
    <select id={id} className="select" value={value} onChange={(e) => set(Number(e.target.value))}>
      {steps.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );

  return (
    <Sheet
      title="Νέα μετάβαση"
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel="Προσθήκη"
      submitDisabled={!from || !to}
      busy={m.isPending}
      error={m.error}
    >
      <div className="form-grid">
        <Field label="Από" htmlFor="tr-from">
          {stepSelect('tr-from', from, setFrom)}
        </Field>
        <Field label="Προς" htmlFor="tr-to">
          {stepSelect('tr-to', to, setTo)}
        </Field>
      </div>
      <Field label="Ετικέτα" htmlFor="tr-label" hint="Προαιρετικό, π.χ. «απόρριψη».">
        <input id="tr-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
    </Sheet>
  );
}
