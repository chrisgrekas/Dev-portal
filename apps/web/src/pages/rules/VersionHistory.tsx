import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { RuleVersion } from '../../api/types';
import { VersionContent } from '../../components/actions/ActionStack';
import { VersionDiff } from '../../components/actions/ActionsDiff';
import { Badge, Resource, Segmented } from '../../components/ui';
import { formatDateTime, timeAgo } from '../../lib/format';

export function VersionHistory({ ruleId }: { ruleId: number }) {
  const query = useQuery({
    queryKey: ['rule', ruleId, 'versions'],
    queryFn: () => api<RuleVersion[]>(`/rules/${ruleId}/versions`),
  });
  return <Resource query={query}>{(versions) => <History versions={versions} />}</Resource>;
}

function History({ versions }: { versions: RuleVersion[] }) {
  // versions: φθίνουσα σειρά (νεότερη πρώτη)
  // null = πάντα η νεότερη (ακολουθεί και τις νέες εκδόσεις)
  const [selectedNo, setSelectedNo] = useState<number | null>(null);
  const [baseNo, setBaseNo] = useState<number | 'prev'>('prev');
  const [view, setView] = useState<'diff' | 'code'>('diff');

  const selected = versions.find((v) => v.version === selectedNo) ?? versions[0];
  if (!selected) return null;
  const base =
    baseNo === 'prev' ? versions.find((v) => v.version === selected.version - 1) : versions.find((v) => v.version === baseNo);

  return (
    <div className="history">
      <ol className="history-list">
        {versions.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              className={`history-item${v.version === selected.version ? ' active' : ''}`}
              onClick={() => {
                setSelectedNo(v.version);
                setBaseNo('prev');
              }}
            >
              <span className="history-item-head">
                <Badge tone={v.version === selected.version ? 'accent' : 'neutral'}>v{v.version}</Badge>
                {v.source === 'sync' && <Badge tone="accent">sync</Badge>}
                <span className="history-item-time" title={formatDateTime(v.createdAt)}>
                  {timeAgo(v.createdAt)}
                </span>
              </span>
              <span className="history-item-reason">{v.reason}</span>
              <span className="history-item-author">{v.author}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="history-detail">
        <div className="history-detail-head">
          <div>
            <h3>
              v{selected.version} · {selected.reason}
            </h3>
            <p className="meta-muted">
              {selected.author} · {formatDateTime(selected.createdAt)}
            </p>
          </div>
          <div className="history-controls">
            {view === 'diff' && versions.length > 1 && (
              <select
                className="select select-pill"
                aria-label="Σύγκριση με"
                value={baseNo}
                onChange={(e) => setBaseNo(e.target.value === 'prev' ? 'prev' : Number(e.target.value))}
              >
                <option value="prev">σε σχέση με την προηγούμενη</option>
                {versions
                  .filter((v) => v.version !== selected.version)
                  .map((v) => (
                    <option key={v.id} value={v.version}>
                      σε σχέση με v{v.version}
                    </option>
                  ))}
              </select>
            )}
            <Segmented
              label="Προβολή"
              value={view}
              onChange={setView}
              options={[
                { value: 'diff', label: 'Αλλαγές' },
                { value: 'code', label: 'Περιεχόμενο' },
              ]}
            />
          </div>
        </div>

        {view === 'code' ? (
          <VersionContent version={selected} />
        ) : (
          <VersionDiff
            before={base ?? { code: '', triggerCondition: null, actions: null }}
            after={selected}
            label={base ? `v${base.version} → v${selected.version}` : `Πρώτη έκδοση · v${selected.version}`}
          />
        )}
      </div>
    </div>
  );
}
