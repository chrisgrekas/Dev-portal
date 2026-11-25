import { MouseEvent, useMemo } from 'react';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { copyText } from './Code';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Κάθε code block αποκτά κουμπί «Αντιγραφή».
const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }) {
      const language = (lang ?? '').match(/^\S*/)?.[0] ?? '';
      return (
        `<div class="code-block">` +
        (language ? `<span class="code-lang">${escapeHtml(language)}</span>` : '') +
        `<button type="button" class="code-copy">Αντιγραφή</button>` +
        `<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(text)}</code></pre></div>`
      );
    },
  },
});

/** Markdown → ασφαλές HTML (sanitized), με αντιγραφή σε code blocks. */
export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => DOMPurify.sanitize(md.parse(source, { async: false }) as string), [source]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.code-copy');
    const code = btn?.parentElement?.querySelector('code')?.textContent;
    if (!btn || code == null) return;
    void copyText(code).then(() => {
      btn.textContent = 'Αντιγράφηκε';
      btn.classList.add('done');
      setTimeout(() => {
        btn.textContent = 'Αντιγραφή';
        btn.classList.remove('done');
      }, 1600);
    });
  };

  return <div className="prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
