import { useEffect, useMemo, useRef, useState } from 'react';
import type { ElkExtendedEdge, ElkNode, ElkPort } from 'elkjs/lib/elk-api';
import type { WorkflowGraph } from '../api/types';
import { ErrorState, IconButton, Loading } from './ui';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;

/*
 * Διάγραμμα ροής workflow (Φάση 4).
 * Το σχήμα κάθε κόμβου προκύπτει από τις μεταβάσεις του:
 *   - χωρίς εισόδους (αρχή) ή χωρίς εξόδους (τέλος) → «χάπι»
 *   - 2+ έξοδοι → ρόμβος απόφασης
 *   - αλλιώς → βήμα (ορθογώνιο)
 * Τη διάταξη την κάνει το ELK (layered, ορθογώνια βέλη), φορτωμένο on demand.
 */

type Kind = 'terminal' | 'process' | 'decision';
type Point = { x: number; y: number };

interface LaidNode {
  id: number;
  name: string;
  kind: Kind;
  rulesetCount: number;
  notes: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface LaidEdge {
  id: number;
  source: number;
  target: number;
  points: Point[];
  label?: { text: string; x: number; y: number; w: number; h: number };
}
interface Layout {
  width: number;
  height: number;
  nodes: LaidNode[];
  edges: LaidEdge[];
}

const BASE: Record<Kind, { w: number; h: number }> = {
  terminal: { w: 176, h: 58 },
  process: { w: 176, h: 76 },
  decision: { w: 200, h: 112 },
};
const LINE_H = 18;
const LABEL_FONT = '500 13px "Inter Variable", -apple-system, "Segoe UI", sans-serif';
const NODE_FONT = '500 14.5px "Inter Variable", -apple-system, "Segoe UI", sans-serif';

let canvas: HTMLCanvasElement | null = null;
function textWidth(text: string, font: string) {
  canvas ??= document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Πόσες γραμμές πιάνει το όνομα σε δοσμένο πλάτος (word wrap). */
function lineCount(text: string, maxW: number) {
  let lines = 1;
  let current = '';
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && textWidth(next, NODE_FONT) > maxW) {
      lines++;
      current = word;
    } else current = next;
  }
  return lines;
}

function classify(graph: WorkflowGraph) {
  const inc = new Map<number, number>();
  const out = new Map<number, number>();
  const labeledOut = new Set<number>();
  for (const e of graph.edges) {
    out.set(e.source, (out.get(e.source) ?? 0) + 1);
    inc.set(e.target, (inc.get(e.target) ?? 0) + 1);
    if (e.label?.trim()) labeledOut.add(e.source);
  }
  const kinds = new Map<number, Kind>();
  for (const n of graph.nodes) {
    const i = inc.get(n.id) ?? 0;
    const o = out.get(n.id) ?? 0;
    // Απόφαση = 2+ έξοδοι ΜΕ ετικέτες (Yes/No κ.λπ.). Σε ροές καταστάσεων χωρίς ετικέτες μένει ορθογώνιο.
    kinds.set(n.id, o >= 2 && labeledOut.has(n.id) ? 'decision' : i === 0 || o === 0 ? 'terminal' : 'process');
  }
  return kinds;
}

type Direction = 'RIGHT' | 'DOWN';

async function computeLayout(graph: WorkflowGraph, direction: Direction): Promise<Layout> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  await document.fonts?.ready;
  const elk = new ELK();
  const kinds = classify(graph);
  const order = new Map(graph.nodes.map((n) => [n.id, n.order]));
  const sizes = new Map<number, { w: number; h: number }>();

  // Οι ρόμβοι έχουν σταθερά σημεία σύνδεσης στις 4 κορυφές τους.
  const decisionOut = new Map<number, string[]>();
  const children: ElkNode[] = [...graph.nodes].sort((a, b) => a.order - b.order || a.id - b.id).map((n) => {
    const kind = kinds.get(n.id)!;
    const base = BASE[kind];
    // Πλάτος ώστε η μεγαλύτερη λέξη να χωράει χωρίς να κόβεται.
    const longest = Math.max(...n.name.split(/\s+/).map((word) => textWidth(word, NODE_FONT)));
    const w = Math.ceil(kind === 'decision' ? Math.max(base.w, (longest + 10) / 0.58) : Math.max(base.w, longest + 44));
    const textW = kind === 'decision' ? w * 0.58 - 6 : w - 44;
    const extra = (lineCount(n.name, textW) - 1) * LINE_H + (n.rulesets.length ? LINE_H : 0);
    const h = base.h + extra * (kind === 'decision' ? 1.6 : 1);
    sizes.set(n.id, { w, h });
    const node: ElkNode = { id: `n${n.id}`, width: w, height: h };
    if (kind === 'decision') {
      const port = (side: string, x: number, y: number): ElkPort => ({
        id: `n${n.id}-${side}`,
        x,
        y,
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': side },
      });
      node.ports = [port('WEST', 0, h / 2), port('EAST', w, h / 2), port('SOUTH', w / 2, h), port('NORTH', w / 2, 0)];
      node.layoutOptions = { 'elk.portConstraints': 'FIXED_POS' };
      decisionOut.set(n.id, direction === 'RIGHT' ? ['EAST', 'SOUTH', 'NORTH'] : ['SOUTH', 'EAST', 'WEST']);
    }
    return node;
  });

  // Έξοδοι ρόμβου: πρώτα οι «μπροστά» μεταβάσεις → δεξιά, μετά κάτω, μετά πάνω.
  const outPort = new Map<number, string>();
  for (const [nid, sides] of decisionOut) {
    const outs = graph.edges
      .filter((e) => e.source === nid)
      .sort((a, b) => {
        const fa = (order.get(a.target) ?? 0) > (order.get(nid) ?? 0) ? 0 : 1;
        const fb = (order.get(b.target) ?? 0) > (order.get(nid) ?? 0) ? 0 : 1;
        return fa - fb || (order.get(a.target) ?? 0) - (order.get(b.target) ?? 0);
      });
    outs.forEach((e, i) => outPort.set(e.id, `n${nid}-${sides[Math.min(i, sides.length - 1)]}`));
  }

  const edges: ElkExtendedEdge[] = graph.edges.map((e) => ({
    id: `e${e.id}`,
    sources: [outPort.get(e.id) ?? `n${e.source}`],
    targets: [kinds.get(e.target) === 'decision' ? `n${e.target}-${direction === 'RIGHT' ? 'WEST' : 'NORTH'}` : `n${e.target}`],
    labels: e.label ? [{ id: `l${e.id}`, text: e.label, width: textWidth(e.label, LABEL_FONT) + 14, height: 22 }] : [],
  }));

  const result = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.padding': '[top=32,left=32,bottom=32,right=32]',
      'elk.spacing.nodeNode': '56',
      'elk.spacing.edgeNode': '32',
      'elk.spacing.edgeEdge': '20',
      'elk.spacing.edgeLabel': '6',
      'elk.layered.spacing.nodeNodeBetweenLayers': direction === 'RIGHT' ? '80' : '44',
      'elk.layered.spacing.edgeNodeBetweenLayers': '32',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      // Η σειρά των βημάτων ορίζει ποιες μεταβάσεις είναι «προς τα πίσω».
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.edgeLabels.placement': 'TAIL',
    },
    children,
    edges,
  });

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return {
    width: result.width ?? 0,
    height: result.height ?? 0,
    nodes: (result.children ?? []).map((c) => {
      const id = Number(c.id.slice(1));
      const n = byId.get(id)!;
      return {
        id,
        name: n.name,
        kind: kinds.get(id)!,
        rulesetCount: n.rulesets.length,
        notes: n.description,
        x: c.x ?? 0,
        y: c.y ?? 0,
        w: sizes.get(id)!.w,
        h: sizes.get(id)!.h,
      };
    }),
    edges: (result.edges ?? []).map((e) => {
      const id = Number(e.id.slice(1));
      const src = graph.edges.find((x) => x.id === id)!;
      const s = e.sections?.[0];
      const points = s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] : [];
      const l = e.labels?.[0];
      return {
        id,
        source: src.source,
        target: src.target,
        points,
        label: l?.text ? { text: l.text, x: l.x ?? 0, y: l.y ?? 0, w: l.width ?? 0, h: l.height ?? 0 } : undefined,
      };
    }),
  };
}

/** Polyline με στρογγυλεμένες γωνίες. */
function roundedPath(pts: Point[], r = 12) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p, c, n] = [pts[i - 1], pts[i], pts[i + 1]];
    const d1 = Math.hypot(c.x - p.x, c.y - p.y);
    const d2 = Math.hypot(n.x - c.x, n.y - c.y);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a = { x: c.x + ((p.x - c.x) / d1) * rr, y: c.y + ((p.y - c.y) / d1) * rr };
    const b = { x: c.x + ((n.x - c.x) / d2) * rr, y: c.y + ((n.y - c.y) / d2) * rr };
    d += ` L${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last.x},${last.y}`;
}

export function WorkflowDiagram({
  graph,
  selectedId,
  onSelect,
}: {
  graph: WorkflowGraph;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [layouts, setLayouts] = useState<Record<Direction, Layout> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [zoom, setZoom] = useState<number | null>(null); // null = προσαρμογή στο πλάτος
  const [available, setAvailable] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Υπολογίζουμε και τις δύο κατευθύνσεις· κρατάμε όποια διαβάζεται καλύτερα στο διαθέσιμο πλάτος.
  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([computeLayout(graph, 'RIGHT'), computeLayout(graph, 'DOWN')]).then(
      ([RIGHT, DOWN]) => alive && setLayouts({ RIGHT, DOWN }),
      (e) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [graph]);

  const fitOf = (l: Layout) => (available ? Math.min(1, available / l.width) : 1);
  const layout = layouts
    ? fitOf(layouts.RIGHT) >= 0.6 || fitOf(layouts.RIGHT) >= fitOf(layouts.DOWN)
      ? layouts.RIGHT
      : layouts.DOWN
    : null;

  const connected = useMemo(() => {
    if (selectedId === null || !layout) return null;
    const set = new Set<number>();
    for (const e of layout.edges) if (e.source === selectedId || e.target === selectedId) set.add(e.id);
    return set;
  }, [selectedId, layout]);

  if (error) return <ErrorState error={error} />;
  if (!layout)
    return (
      <div className="wf-diagram" ref={wrapRef}>
        <Loading />
      </div>
    );

  const fit = Math.max(MIN_ZOOM, fitOf(layout));
  const scale = zoom ?? fit;
  const step = (d: 1 | -1) => setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((scale + d * 0.1) * 10) / 10)));

  return (
    <div className="wf-diagram" ref={wrapRef}>
      <div className="wf-canvas" onClick={() => onSelect(null)}>
      <div className="wf-sizer" style={{ width: layout.width * scale, height: layout.height * scale }}>
      <div className="wf-stage" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
        <svg className="wf-edges" width={layout.width} height={layout.height} aria-hidden="true">
          <defs>
            <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M2,1.5 L9,5 L2,8.5" className="wf-arrowhead" />
            </marker>
            <marker id="wf-arrow-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M2,1.5 L9,5 L2,8.5" className="wf-arrowhead dim" />
            </marker>
          </defs>
          {layout.edges.map((e) => {
            const dim = connected !== null && !connected.has(e.id);
            return (
              <path
                key={e.id}
                d={roundedPath(e.points)}
                className={`wf-edge${dim ? ' dim' : ''}`}
                markerEnd={`url(#${dim ? 'wf-arrow-dim' : 'wf-arrow'})`}
              />
            );
          })}
        </svg>

        {layout.edges.map(
          (e) =>
            e.label && (
              <span
                key={e.id}
                className={`wf-edge-label${connected !== null && !connected.has(e.id) ? ' dim' : ''}`}
                style={{ left: e.label.x, top: e.label.y, width: e.label.w, height: e.label.h }}
              >
                {e.label.text}
              </span>
            ),
        )}

        {layout.nodes.map((n) => {
          const selected = n.id === selectedId;
          return (
            <button
              key={n.id}
              type="button"
              className={`wf-node wf-${n.kind}${n.rulesetCount ? ' has-rules' : ''}${selected ? ' selected' : ''}`}
              style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
              title={n.notes ?? undefined}
              aria-pressed={selected}
              onClick={(ev) => {
                ev.stopPropagation();
                onSelect(selected ? null : n.id);
              }}
            >
              {n.kind === 'decision' && (
                <svg className="wf-diamond" width={n.w} height={n.h} aria-hidden="true">
                  <polygon points={`${n.w / 2},2 ${n.w - 2},${n.h / 2} ${n.w / 2},${n.h - 2} 2,${n.h / 2}`} />
                </svg>
              )}
              {n.notes && <span className="wf-node-note" aria-label="Έχει σημειώσεις" />}
              <span className="wf-node-text">
                <span className="wf-node-name">{n.name}</span>
                {n.rulesetCount > 0 && (
                  <span className="wf-node-meta">
                    {n.rulesetCount} {n.rulesetCount === 1 ? 'ruleset' : 'rulesets'}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      </div>
      </div>
      <div className="wf-zoom">
        <IconButton icon="minus" label="Σμίκρυνση" disabled={scale <= MIN_ZOOM} onClick={() => step(-1)} />
        <button type="button" className="wf-zoom-value" title="Προσαρμογή στο πλάτος" onClick={() => setZoom(null)}>
          {Math.round(scale * 100)}%
        </button>
        <IconButton icon="plus" label="Μεγέθυνση" disabled={scale >= MAX_ZOOM} onClick={() => step(1)} />
      </div>
    </div>
  );
}
