import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { WorkflowDetail as WorkflowDetailT, WorkflowGraph } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useCustomerContext } from '../../lib/customer';
import { Chip } from '../../components/Pickers';
import { Badge, Button, Empty, ErrorState, Icon, IconButton, Loading, PageHeader, Resource, Section, Segmented } from '../../components/ui';
import { WorkflowDiagram } from '../../components/WorkflowDiagram';
import { useIdParam, useTitle } from '../../lib/hooks';
import NotFound from '../NotFound';
import { StepSheet, TransitionSheet, WorkflowSheet } from './WorkflowSheets';
import { RulesetSheet } from '../rulesets/RulesetSheet';

type GraphNode = WorkflowGraph['nodes'][number];
type View = 'diagram' | 'list';

export default function WorkflowDetail() {
  const id = useIdParam();
  if (id === null) return <NotFound />;
  return <WorkflowPage id={id} />;
}

function WorkflowPage({ id }: { id: number }) {
  const { canEdit } = useAuth();
  const ctx = useCustomerContext();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'list' ? 'list' : 'diagram';
  const [sheet, setSheet] = useState<null | 'edit' | 'step' | 'transition'>(null);
  const wfQuery = useQuery({ queryKey: ['workflow', id], queryFn: () => api<WorkflowDetailT>(`/workflows/${id}`) });
  const graphQuery = useQuery({ queryKey: ['workflow', id, 'graph'], queryFn: () => api<WorkflowGraph>(`/workflows/${id}/graph`) });
  useTitle(wfQuery.data?.name);

  if (wfQuery.isPending) return <Loading />;
  if (wfQuery.isError)
    return (
      <>
        <PageHeader title="Workflow" back={ctx.back} />
        <ErrorState error={wfQuery.error} onRetry={() => wfQuery.refetch()} />
      </>
    );

  const wf = wfQuery.data;

  return (
    <>
      <PageHeader
        back={ctx.back}
        title={wf.name}
        subtitle={wf.description}
        actions={
          canEdit && (
            <Button variant="secondary" onClick={() => setSheet('edit')}>
              Επεξεργασία
            </Button>
          )
        }
      />

      <div className={`trigger-card${wf.trigger ? '' : ' missing'}`}>
        <span className="trigger-label">Πότε ενεργοποιείται</span>
        <p className="trigger-text">
          {wf.trigger ?? (canEdit ? 'Δεν έχει οριστεί — πάτα «Επεξεργασία» για να το συμπληρώσεις.' : 'Δεν έχει οριστεί.')}
        </p>
      </div>

      <dl className="meta">
        <div>
          <dt>Περιβάλλον</dt>
          <dd>{wf.environment ? <Chip>{wf.environment.name}</Chip> : '—'}</dd>
        </div>
        <div>
          <dt>Πελάτες</dt>
          <dd>{wf.customers.length ? wf.customers.map((c) => <Chip key={c.id}>{c.name}</Chip>) : '—'}</dd>
        </div>
        <div>
          <dt>Βήματα</dt>
          <dd>{wf.steps.length}</dd>
        </div>
      </dl>

      <Section
        title="Ροή"
        actions={
          <div className="section-actions">
            {canEdit && (
              <>
                <Button variant="plain" size="sm" onClick={() => setSheet('transition')} disabled={wf.steps.length === 0}>
                  <Icon name="arrow" size={14} />
                  Μετάβαση
                </Button>
                <Button variant="plain" size="sm" onClick={() => setSheet('step')}>
                  <Icon name="plus" size={14} />
                  Βήμα
                </Button>
              </>
            )}
            <Segmented
              label="Προβολή"
              value={view}
              onChange={(v) => setParams((p) => { const n = new URLSearchParams(p); if (v === 'diagram') n.delete('view'); else n.set('view', v); return n; }, { replace: true })}
              options={[
                { value: 'diagram', label: 'Διάγραμμα' },
                { value: 'list', label: 'Λίστα' },
              ]}
            />
          </div>
        }
      >
        <Resource query={graphQuery}>
          {(g) =>
            g.nodes.length === 0 ? (
              <Empty title="Δεν υπάρχουν βήματα ακόμα" />
            ) : view === 'diagram' ? (
              <DiagramView graph={g} />
            ) : (
              <Flow graph={g} />
            )
          }
        </Resource>
      </Section>

      {sheet === 'edit' && <WorkflowSheet workflow={wf} onClose={() => setSheet(null)} />}
      {sheet === 'step' && <StepSheet workflowId={wf.id} steps={wf.steps} onClose={() => setSheet(null)} />}
      {sheet === 'transition' && <TransitionSheet workflowId={wf.id} steps={wf.steps} onClose={() => setSheet(null)} />}
    </>
  );
}

// ---------- Διάγραμμα + λεπτομέρειες επιλεγμένου βήματος ----------
function DiagramView({ graph }: { graph: WorkflowGraph }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <>
      <WorkflowDiagram graph={graph} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      <div className="wf-legend">
        <span>
          <i className="wf-key wf-key-terminal" /> Αρχή / τέλος
        </span>
        <span>
          <i className="wf-key wf-key-process" /> Βήμα
        </span>
        <span>
          <i className="wf-key wf-key-decision" /> Απόφαση
        </span>
        <span className="wf-legend-hint">Πάτα ένα βήμα για να δεις τα rules του</span>
      </div>
      {selected && <StepPanel node={selected} graph={graph} onClose={() => setSelectedId(null)} />}
    </>
  );
}

function Transitions({ node, graph }: { node: GraphNode; graph: WorkflowGraph }) {
  const names = new Map(graph.nodes.map((n) => [n.id, n.name]));
  const position = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const here = position.get(node.id) ?? 0;
  const out = graph.edges.filter((e) => e.source === node.id);
  if (!out.length) return null;
  return (
    <div className="flow-transitions">
      {out.map((e) => {
        const back = (position.get(e.target) ?? 0) <= here;
        return (
          <span key={e.id} className={`flow-transition${back ? ' back' : ''}`}>
            <Icon name={back ? 'loop' : 'arrow'} size={13} />
            {names.get(e.target) ?? `#${e.target}`}
            {e.label && <span className="flow-transition-label">{e.label}</span>}
          </span>
        );
      })}
    </div>
  );
}

function StepRulesets({ node }: { node: GraphNode }) {
  const ctx = useCustomerContext();
  if (node.rulesets.length === 0) return <p className="meta-muted flow-empty">Κανένα ruleset σε αυτό το βήμα</p>;
  return (
    <div className="flow-rulesets">
      {node.rulesets.map((rs) => (
        <div key={rs.id} className="flow-ruleset">
          <Link to={ctx.link(`/rulesets/${rs.id}`)} className="flow-ruleset-name mono">
            {rs.name}
          </Link>
          {rs.rules.length > 0 ? (
            <ol className="flow-rules">
              {rs.rules.map((r) => (
                <li key={r.id}>
                  <Link to={ctx.link(`/rules/${r.id}`)} className="mono" title={r.description ?? undefined}>
                    {r.name}
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <span className="meta-muted">χωρίς rules</span>
          )}
        </div>
      ))}
    </div>
  );
}

function StepNotes({ node }: { node: GraphNode }) {
  if (!node.description) return null;
  return <p className="step-notes">{node.description}</p>;
}

function StepPanel({ node, graph, onClose }: { node: GraphNode; graph: WorkflowGraph; onClose: () => void }) {
  const { canEdit } = useAuth();
  const ctx = useCustomerContext();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <div className="flow-card wf-panel" key={node.id}>
      <div className="flow-card-head">
        <h3>{node.name}</h3>
        <div className="wf-panel-actions">
          <Transitions node={node} graph={graph} />
          <IconButton icon="close" label="Κλείσιμο" onClick={onClose} />
        </div>
      </div>
      <StepNotes node={node} />
      <StepRulesets node={node} />
      {canEdit && (
        <div className="wf-panel-footer">
          <Button variant="plain" size="sm" onClick={() => setEditing(true)}>
            <Icon name="edit" size={14} />
            Επεξεργασία βήματος
          </Button>
          <Button variant="plain" size="sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} />
            Νέο ruleset σε αυτό το βήμα
          </Button>
        </div>
      )}
      {editing && <StepSheet workflowId={graph.workflow.id} steps={graph.nodes} step={node} onClose={() => setEditing(false)} />}
      {creating && (
        <RulesetSheet
          initialSteps={[{ id: node.id, name: node.name, workflow: graph.workflow }]}
          customerContext={ctx.customer ?? undefined}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

// ---------- Λίστα (κάθετη ροή) ----------
function Flow({ graph }: { graph: WorkflowGraph }) {
  return (
    <ol className="flow">
      {graph.nodes.map((node, i) => (
        <li key={node.id} className="flow-step">
          <div className="flow-marker" aria-hidden="true">
            <span className="flow-dot">{i + 1}</span>
            {i < graph.nodes.length - 1 && <span className="flow-line" />}
          </div>
          <div className="flow-card">
            <div className="flow-card-head">
              <h3>{node.name}</h3>
              <Transitions node={node} graph={graph} />
            </div>
            <StepNotes node={node} />
            <StepRulesets node={node} />
          </div>
        </li>
      ))}
      {graph.edges.length === 0 && graph.nodes.length > 1 && (
        <li className="flow-note">
          <Badge tone="orange">Δεν έχουν οριστεί μεταβάσεις</Badge>
        </li>
      )}
    </ol>
  );
}
