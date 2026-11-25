import { KeyboardEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { diffLines } from 'diff';
import { Icon } from './ui';

/** [copied, copy] — το copied γίνεται true για ~1.6s μετά από επιτυχή αντιγραφή. */
export function useCopy(): [boolean, (text: string) => void] {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);
  return [done, (text: string) => void copyText(text).then(() => setDone(true), () => setDone(false))];
}

/** Μικρό κουμπί-εικονίδιο αντιγραφής (π.χ. δίπλα σε όνομα πεδίου). */
export function CopyIcon({ text, label }: { text: string; label: string }) {
  const [done, copy] = useCopy();
  return (
    <button
      type="button"
      className={`copy-icon${done ? ' done' : ''}`}
      aria-label={label}
      title={done ? 'Αντιγράφηκε' : label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        copy(text);
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={13} />
    </button>
  );
}

export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback για http σε εσωτερικό δίκτυο (όχι secure context).
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

export function CopyButton({ text, label = 'Αντιγραφή' }: { text: string; label?: string }) {
  const [done, copy] = useCopy();
  return (
    <button type="button" className="btn btn-plain btn-sm" onClick={() => copy(text)}>
      <Icon name={done ? 'check' : 'copy'} size={14} />
      {done ? 'Αντιγράφηκε' : label}
    </button>
  );
}

const splitLines = (s: string) => s.replace(/\r\n/g, '\n').split('\n');

export function CodeView({ code, label, actions }: { code: string; label?: ReactNode; actions?: ReactNode }) {
  const lines = useMemo(() => splitLines(code), [code]);
  return (
    <div className="code-panel">
      <div className="code-panel-bar">
        <span className="code-panel-label">{label}</span>
        <div className="code-panel-actions">
          {actions}
          <CopyButton text={code} />
        </div>
      </div>
      <pre className="code-view">
        <code>
          {lines.map((l, i) => (
            <div className="code-line" key={i}>
              <span className="ln">{i + 1}</span>
              <span className="lc">{l || ' '}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

export function CodeEditor({
  value,
  onChange,
  minRows = 14,
  id,
  autoFocus,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
  id?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const lineCount = splitLines(value).length;
  const rows = Math.max(minRows, lineCount + 1);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    // execCommand κρατάει το undo stack του textarea.
    if (!document.execCommand('insertText', false, '  ')) {
      const t = e.currentTarget;
      const { selectionStart: s, selectionEnd: end } = t;
      onChange(value.slice(0, s) + '  ' + value.slice(end));
      requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
    }
  };

  return (
    <div className="code-editor">
      <div className="code-gutter" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        id={id}
        value={value}
        rows={rows}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

// ---------- Diff ----------
type Row = { kind: 'add' | 'del' | 'same'; old?: number; new?: number; text: string };
type Item = { type: 'row'; row: Row } | { type: 'fold'; id: number; rows: Row[] };

const CONTEXT = 3;

function buildRows(oldText: string, newText: string): Row[] {
  const norm = (s: string) => {
    const t = s.replace(/\r\n/g, '\n');
    return t === '' || t.endsWith('\n') ? t : t + '\n';
  };
  const rows: Row[] = [];
  let o = 1;
  let n = 1;
  for (const part of diffLines(norm(oldText), norm(newText))) {
    const lines = part.value.split('\n');
    lines.pop(); // πάντα τελειώνει σε \n μετά το norm
    for (const text of lines) {
      if (part.added) rows.push({ kind: 'add', new: n++, text });
      else if (part.removed) rows.push({ kind: 'del', old: o++, text });
      else rows.push({ kind: 'same', old: o++, new: n++, text });
    }
  }
  return rows;
}

/** Μαζεύει μεγάλα αμετάβλητα κομμάτια, κρατώντας CONTEXT γραμμές γύρω από κάθε αλλαγή. */
function fold(rows: Row[]): Item[] {
  const items: Item[] = [];
  let i = 0;
  let foldId = 0;
  while (i < rows.length) {
    if (rows[i].kind !== 'same') {
      items.push({ type: 'row', row: rows[i++] });
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].kind === 'same') j++;
    const run = rows.slice(i, j);
    const keepHead = i === 0 ? 0 : CONTEXT;
    const keepTail = j === rows.length ? 0 : CONTEXT;
    if (run.length - keepHead - keepTail >= 4) {
      run.slice(0, keepHead).forEach((row) => items.push({ type: 'row', row }));
      items.push({ type: 'fold', id: foldId++, rows: run.slice(keepHead, run.length - keepTail) });
      run.slice(run.length - keepTail).forEach((row) => items.push({ type: 'row', row }));
    } else {
      run.forEach((row) => items.push({ type: 'row', row }));
    }
    i = j;
  }
  return items;
}

export function DiffView({ oldText, newText, label }: { oldText: string; newText: string; label?: ReactNode }) {
  const rows = useMemo(() => buildRows(oldText, newText), [oldText, newText]);
  const items = useMemo(() => fold(rows), [rows]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  useEffect(() => {
    setOpen(new Set());
  }, [items]);

  const added = rows.filter((r) => r.kind === 'add').length;
  const removed = rows.filter((r) => r.kind === 'del').length;

  const renderRow = (r: Row, key: string) => (
    <div className={`diff-line diff-${r.kind}`} key={key}>
      <span className="ln">{r.old ?? ''}</span>
      <span className="ln">{r.new ?? ''}</span>
      <span className="diff-sign">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ''}</span>
      <span className="lc">{r.text || ' '}</span>
    </div>
  );

  return (
    <div className="code-panel">
      <div className="code-panel-bar">
        <span className="code-panel-label">{label}</span>
        <span className="diff-stats">
          <span className="diff-stat-add">+{added}</span>
          <span className="diff-stat-del">−{removed}</span>
        </span>
      </div>
      {added + removed === 0 ? (
        <div className="diff-empty">Καμία διαφορά</div>
      ) : (
        <pre className="code-view diff-view">
          <code>
            {items.map((it, idx) =>
              it.type === 'row' ? (
                renderRow(it.row, `r${idx}`)
              ) : open.has(it.id) ? (
                it.rows.map((r, k) => renderRow(r, `f${it.id}-${k}`))
              ) : (
                <button
                  key={`f${it.id}`}
                  type="button"
                  className="diff-fold"
                  onClick={() => setOpen((s) => new Set(s).add(it.id))}
                >
                  ⋯ {it.rows.length} αμετάβλητες γραμμές
                </button>
              ),
            )}
          </code>
        </pre>
      )}
    </div>
  );
}
