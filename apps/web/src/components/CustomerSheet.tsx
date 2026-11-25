import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Customer } from '../api/types';
import { CUSTOMER_NUMBER_RE, pushRecent } from '../lib/customer';
import { Sheet } from './Sheet';
import { Field } from './ui';

const URL_RE = /^https?:\/\/\S+$/i;

/** Ήπιος μετρητής ψηφίων: γκρι όσο γράφεις, πράσινος στο 7 / 7 — χωρίς κόκκινα σφάλματα. */
export function DigitCounter({ value }: { value: string }) {
  return <span className={`digit-counter${value.length === 7 ? ' ok' : ''}`}>{value.length} / 7</span>;
}

/** Δημιουργία πελάτη (χωρίς `customer`) ή επεξεργασία (όνομα, αριθμός, Git URL). */
export function CustomerSheet({
  customer,
  initialNumber = '',
  focusGit,
  onClose,
}: {
  customer?: Pick<Customer, 'customerNumber' | 'name' | 'gitUrl'>;
  initialNumber?: string;
  focusGit?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isNew = !customer;
  const [customerNumber, setNumber] = useState(customer?.customerNumber ?? initialNumber);
  const [name, setName] = useState(customer?.name ?? '');
  const [gitUrl, setGitUrl] = useState(customer?.gitUrl ?? '');
  const [reason, setReason] = useState('');
  const git = gitUrl.trim();
  const gitOk = !git || URL_RE.test(git);

  const m = useMutation({
    mutationFn: () =>
      isNew
        ? api<Customer>('/customers', { method: 'POST', body: { customerNumber, name: name.trim(), gitUrl: git || undefined } })
        : api<Customer>(`/customers/${customer.customerNumber}`, {
            method: 'PATCH',
            body: {
              name: name.trim(),
              ...(customerNumber !== customer.customerNumber ? { customerNumber } : {}),
              gitUrl: git,
              reason: reason.trim(),
            },
          }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      pushRecent({ customerNumber: c.customerNumber, name: c.name });
      if (isNew || c.customerNumber !== customer.customerNumber) navigate(`/customers/${c.customerNumber}`, { replace: !isNew });
      onClose();
    },
  });

  return (
    <Sheet
      title={isNew ? 'Νέος πελάτης' : 'Επεξεργασία πελάτη'}
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel={isNew ? 'Δημιουργία' : 'Αποθήκευση'}
      submitDisabled={!CUSTOMER_NUMBER_RE.test(customerNumber) || !name.trim() || !gitOk || (!isNew && !reason.trim())}
      busy={m.isPending}
      error={m.error}
    >
      <div className="form-grid form-grid-number">
        <Field label="Αριθμός πελάτη" htmlFor="cu-num" hint={<DigitCounter value={customerNumber} />}>
          <input
            id="cu-num"
            className="input mono"
            inputMode="numeric"
            autoComplete="off"
            maxLength={7}
            placeholder="1234567"
            value={customerNumber}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 7))}
            data-autofocus={isNew && !initialNumber}
            required
          />
        </Field>
        <Field label="Όνομα" htmlFor="cu-name">
          <input
            id="cu-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-autofocus={(isNew && !!initialNumber) || (!isNew && !focusGit)}
            required
          />
        </Field>
      </div>
      <Field
        label="Git repository"
        htmlFor="cu-git"
        hint={gitOk ? 'Προαιρετικό — π.χ. https://gitlab.example.com/dat/pelatis' : 'Το URL ξεκινά με https:// ή http://'}
      >
        <input
          id="cu-git"
          className="input mono"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          data-autofocus={!!focusGit}
        />
      </Field>
      {!isNew && (
        <Field label="Γιατί γίνεται η αλλαγή;" htmlFor="cu-reason">
          <input id="cu-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
      )}
    </Sheet>
  );
}
