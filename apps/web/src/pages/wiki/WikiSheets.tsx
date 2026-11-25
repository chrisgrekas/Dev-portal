import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { FieldSystem, Page, RuleListItem, WikiArticle, WikiCategory, WikiField } from '../../api/types';
import { CodeEditor } from '../../components/Code';
import { Markdown } from '../../components/Markdown';
import { SearchPicker } from '../../components/Pickers';
import { Sheet } from '../../components/Sheet';
import { Button, Empty, Field, IconButton, Segmented } from '../../components/ui';
import { createPlaceholderRule } from '../../lib/actions';
import { CATEGORIES, CATEGORY_LABEL, FIELD_TYPES, SYSTEMS, SYSTEM_LABEL } from './wiki';

type RuleRef = { id: number; name: string; description: string | null };

const swap = <T,>(list: T[], i: number, d: -1 | 1) => {
  const next = [...list];
  [next[i], next[i + d]] = [next[i + d], next[i]];
  return next;
};

const fetchRules = (q: string) =>
  api<Page<RuleListItem>>('/rules', { query: { search: q || undefined, pageSize: 8 } }).then((r) => r.items);

export function ArticleSheet({
  article,
  initialCategory = 'guide',
  onClose,
}: {
  article?: WikiArticle;
  initialCategory?: WikiCategory;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isNew = !article;
  const [title, setTitle] = useState(article?.title ?? '');
  const [category, setCategory] = useState<WikiCategory>(article?.category ?? initialCategory);
  const [body, setBody] = useState(article?.body ?? '');
  const [reason, setReason] = useState('');
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [myclaimFields, setMyclaimFields] = useState(article?.myclaimFields ?? '');
  const [wedatFields, setWedatFields] = useState(article?.wedatFields ?? '');
  const [rules, setRules] = useState<RuleRef[]>(article?.rules ?? []);

  const m = useMutation({
    mutationFn: () => {
      // Κενό κείμενο → το API το αποθηκεύει ως null (η ενότητα δεν εμφανίζεται).
      const extra = { myclaimFields, wedatFields, ruleIds: rules.map((r) => r.id) };
      return isNew
        ? api<WikiArticle>('/wiki/articles', { method: 'POST', body: { title: title.trim(), category, body, ...extra } })
        : api<WikiArticle>(`/wiki/articles/${article.id}`, {
            method: 'PATCH',
            body: { title: title.trim(), category, body, ...extra, reason: reason.trim() },
          });
    },
    onSuccess: (a) => {
      qc.setQueryData(['wiki', 'article', a.id], a);
      qc.invalidateQueries({ queryKey: ['wiki'] });
      if (isNew) navigate(`/wiki/${a.id}`);
      onClose();
    },
  });

  return (
    <Sheet
      title={isNew ? 'Νέο άρθρο' : 'Επεξεργασία άρθρου'}
      size="lg"
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel={isNew ? 'Δημιουργία' : 'Αποθήκευση'}
      submitDisabled={!title.trim() || (!isNew && !reason.trim())}
      busy={m.isPending}
      error={m.error}
    >
      <Field label="Τίτλος" htmlFor="wa-title">
        <input
          id="wa-title"
          className="input"
          placeholder="π.χ. Πώς βάζεις deeplink"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={isNew}
          required
        />
      </Field>
      <Field label="Κατηγορία">
        <Segmented label="Κατηγορία" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
      </Field>
      <Field label="Περιεχόμενο" htmlFor="wa-body" hint="Markdown: ## τίτλοι, **έντονα**, λίστες, πίνακες, ```κώδικας```.">
        <div className="sheet-toolbar">
          <Segmented
            label="Προβολή"
            value={view}
            onChange={setView}
            options={[
              { value: 'write', label: 'Γράψιμο' },
              { value: 'preview', label: 'Προεπισκόπηση' },
            ]}
          />
        </div>
        {view === 'write' ? (
          <textarea
            id="wa-body"
            className="input mono markdown-input"
            rows={16}
            spellCheck={false}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        ) : (
          <div className="markdown-preview">{body.trim() ? <Markdown source={body} /> : <Empty title="Κενό άρθρο" />}</div>
        )}
      </Field>
      <Field label="Πεδία myClaim" htmlFor="wa-myclaim" hint="Επικόλλησε όπως είναι — εμφανίζεται στο άρθρο με κουμπί αντιγραφής.">
        <CodeEditor
          id="wa-myclaim"
          value={myclaimFields}
          onChange={setMyclaimFields}
          minRows={5}
          placeholder="Επικόλληση πεδίων κατευθείαν από το myClaim…"
        />
      </Field>
      <Field label="Πεδία weDAT" htmlFor="wa-wedat">
        <CodeEditor
          id="wa-wedat"
          value={wedatFields}
          onChange={setWedatFields}
          minRows={5}
          placeholder="Επικόλληση πεδίων κατευθείαν από το weDAT…"
        />
      </Field>
      <Field label="Απαιτούμενα Rules" htmlFor="wa-rules" hint="Με σειρά εκτέλεσης. Αν δεν υπάρχει ακόμα, δημιουργείται ως placeholder.">
        <div className="multi-field">
          {rules.length > 0 && (
            <ol className="order-list">
              {rules.map((r, i) => (
                <li key={r.id}>
                  <span className="order-no">{i + 1}</span>
                  <span className="order-name mono">{r.name}</span>
                  <IconButton icon="up" label="Πάνω" disabled={i === 0} onClick={() => setRules(swap(rules, i, -1))} />
                  <IconButton icon="down" label="Κάτω" disabled={i === rules.length - 1} onClick={() => setRules(swap(rules, i, 1))} />
                  <IconButton icon="close" label="Αφαίρεση" onClick={() => setRules(rules.filter((x) => x.id !== r.id))} />
                </li>
              ))}
            </ol>
          )}
          <SearchPicker
            id="wa-rules"
            queryKey="rules"
            fetch={fetchRules}
            getLabel={(r) => r.name}
            getSub={(r) => r.description}
            excludeIds={rules.map((r) => r.id)}
            onPick={(r) => setRules([...rules, { id: r.id, name: r.name, description: r.description }])}
            onCreate={(name) => createPlaceholderRule(name)}
            createLabel={(q) => (
              <>
                Δημιουργία rule «<span className="mono">{q}</span>»
              </>
            )}
            placeholder="Προσθήκη rule…"
          />
        </div>
      </Field>
      {!isNew && (
        <Field label="Γιατί γίνεται η αλλαγή;" htmlFor="wa-reason">
          <input id="wa-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
      )}
    </Sheet>
  );
}

export function FieldSheet({
  field,
  initialSystem = 'myclaim',
  onClose,
  onDelete,
}: {
  field?: WikiField;
  initialSystem?: FieldSystem;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const qc = useQueryClient();
  const isNew = !field;
  const [system, setSystem] = useState<FieldSystem>(field?.system ?? initialSystem);
  const [name, setName] = useState(field?.name ?? '');
  const [label, setLabel] = useState(field?.label ?? '');
  const [type, setType] = useState(field?.type ?? '');
  const [description, setDescription] = useState(field?.description ?? '');
  const [example, setExample] = useState(field?.example ?? '');
  const [reason, setReason] = useState('');

  const m = useMutation({
    mutationFn: () => {
      const body = {
        system,
        name: name.trim(),
        label: label.trim() || (isNew ? undefined : ''),
        type: type.trim() || (isNew ? undefined : ''),
        description: description.trim() || (isNew ? undefined : ''),
        example: example.trim() || (isNew ? undefined : ''),
      };
      return isNew
        ? api<WikiField>('/wiki/fields', { method: 'POST', body })
        : api<WikiField>(`/wiki/fields/${field.id}`, { method: 'PATCH', body: { ...body, reason: reason.trim() } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki'] });
      qc.invalidateQueries({ queryKey: ['changelog'] });
      onClose();
    },
  });

  return (
    <Sheet
      title={isNew ? 'Νέο πεδίο' : 'Επεξεργασία πεδίου'}
      onClose={onClose}
      onSubmit={() => m.mutate()}
      submitLabel={isNew ? 'Προσθήκη' : 'Αποθήκευση'}
      submitDisabled={!name.trim() || (!isNew && !reason.trim())}
      busy={m.isPending}
      error={m.error}
      footer={
        onDelete && (
          <Button variant="plain" className="btn-destructive sheet-footer-start" onClick={onDelete}>
            Διαγραφή
          </Button>
        )
      }
    >
      <Field label="Σύστημα">
        <Segmented label="Σύστημα" value={system} onChange={setSystem} options={SYSTEMS.map((s) => ({ value: s, label: SYSTEM_LABEL[s] }))} />
      </Field>
      <div className="form-grid">
        <Field label="Τεχνικό όνομα" htmlFor="wf-name">
          <input id="wf-name" className="input mono" placeholder="π.χ. vin" value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} required />
        </Field>
        <Field label="Ετικέτα στην οθόνη" htmlFor="wf-label">
          <input id="wf-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      </div>
      <Field label="Τύπος" htmlFor="wf-type">
        <input id="wf-type" className="input mono input-narrow-md" list="wf-types" value={type} onChange={(e) => setType(e.target.value)} />
        <datalist id="wf-types">
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <Field label="Περιγραφή" htmlFor="wf-desc">
        <textarea id="wf-desc" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Παράδειγμα τιμής" htmlFor="wf-example">
        <input id="wf-example" className="input mono" value={example} onChange={(e) => setExample(e.target.value)} />
      </Field>
      {!isNew && (
        <Field label="Γιατί γίνεται η αλλαγή;" htmlFor="wf-reason">
          <input id="wf-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
      )}
    </Sheet>
  );
}

export function DeleteSheet({
  title,
  text,
  path,
  onClose,
  onDeleted,
}: {
  title: string;
  text: string;
  path: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api(path, { method: 'DELETE' }),
    onSuccess: () => {
      onDeleted();
      // Ανανεώνουμε λίστες/sidebar, όχι τη σελίδα του άρθρου που μόλις σβήστηκε (θα έδινε 404).
      qc.invalidateQueries({ queryKey: ['wiki'], predicate: (q) => q.queryKey[1] !== 'article' });
    },
  });
  return (
    <Sheet title={title} onClose={onClose} onSubmit={() => m.mutate()} submitLabel="Διαγραφή" submitVariant="danger" busy={m.isPending} error={m.error}>
      <p className="sheet-note">{text}</p>
    </Sheet>
  );
}
