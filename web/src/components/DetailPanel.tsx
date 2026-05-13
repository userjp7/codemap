'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { ExportEntry, FileCategory, FileNodeData, GraphNode } from '@/types/graph';
import type { ExternalNodeData } from '@/components/nodes/ExternalNode';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Props for {@link DetailPanel}. */
export interface DetailPanelProps {
  /**
   * The graph node to display details for.  When `null` the panel slides
   * off-screen.  Pass a {@link FileNodeData} (which extends `FileGraphNode`)
   * or a runtime-enriched `ExternalGraphNode` (which carries `importedBy`).
   */
  node: GraphNode | null;
  /** Called when the user closes the panel with the × button. */
  onClose: () => void;
  /**
   * Called when the user clicks a path link inside the panel.
   * Receives the target node's id so the canvas can center on it.
   */
  onNavigateTo: (nodeId: string) => void;
}

/** Category → label color token pairs, matching FileNode border colors. */
const CATEGORY_COLORS: Record<FileCategory, string> = {
  component: '#1D9E75',
  hook:      '#7F77DD',
  service:   '#378ADD',
  utility:   '#BA7517',
  config:    '#888780',
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * A slide-in detail panel fixed to the right edge of the viewport.
 *
 * - Slides in (`translate-x-0`) when `node` is non-null, slides out
 *   (`translate-x-full`) when `node` is null.
 * - For local file nodes it renders metrics, optional exports table, and a
 *   circular-dependency warning.
 * - For external package nodes it renders the package name, version, and
 *   import count.
 */
export default function DetailPanel({ node, onClose, onNavigateTo }: DetailPanelProps) {
  return (
    <aside
      aria-label="Node details"
      className={[
        'fixed right-0 top-0 z-50 flex h-full w-80 flex-col',
        'border-l border-border bg-background shadow-xl',
        'transition-transform duration-300 ease-in-out',
        node ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
    >
      {node?.type === 'local' && (
        <FileDetail
          node={node as FileNodeData}
          onClose={onClose}
          onNavigateTo={onNavigateTo}
        />
      )}
      {node?.type === 'external' && (
        <ExternalDetail
          node={node as GraphNode & ExternalNodeData}
          onClose={onClose}
        />
      )}
    </aside>
  );
}

// ── File detail ───────────────────────────────────────────────────────────────

interface FileDetailProps {
  node: FileNodeData;
  onClose: () => void;
  onNavigateTo: (nodeId: string) => void;
}

function FileDetail({ node, onClose, onNavigateTo }: FileDetailProps) {
  const dotColor = CATEGORY_COLORS[node.category];

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="flex flex-1 flex-wrap items-center gap-1.5 min-w-0">
          <span className="truncate font-semibold text-sm">{node.filename}</span>
          <Badge
            variant="secondary"
            style={{ borderLeftColor: dotColor, borderLeftWidth: 3 }}
          >
            {node.category}
          </Badge>
        </div>
        <CloseButton onClose={onClose} />
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="space-y-5 px-4 py-4">

          {/* Path */}
          <section>
            <SectionLabel>Path</SectionLabel>
            <button
              type="button"
              onClick={() => onNavigateTo(node.id)}
              title="Center on this node"
              className="w-full text-left font-mono text-xs text-muted-foreground break-all hover:text-foreground hover:underline transition-colors"
            >
              {node.path ?? node.id}
            </button>
          </section>

          <Separator />

          {/* Metrics */}
          <section>
            <SectionLabel>Metrics</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              <MetricCell label="Centrality" value={node.centrality.toFixed(4)} />
              <MetricCell label="In-degree"  value={node.inDegree} />
              <MetricCell label="Out-degree" value={node.outDegree} />
            </div>
            {(node.isEntry || node.isBarrel) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {node.isEntry  && <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">entry</Badge>}
                {node.isBarrel && <Badge variant="secondary">barrel</Badge>}
              </div>
            )}
          </section>

          <Separator />

          {/* Exports */}
          <section>
            <SectionLabel>
              Exports{' '}
              <span className="font-normal text-muted-foreground">
                ({node.exports?.length ?? node.exportCount})
              </span>
            </SectionLabel>
            <ExportsTable exports={node.exports} />
          </section>

          {/* Circular dependency warning */}
          {node.hasCircularDep && (
            <>
              <Separator />
              <section>
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5">
                  <p className="text-xs font-semibold text-destructive">
                    ⚠ Circular dependency detected
                  </p>
                  <p className="mt-0.5 text-xs text-destructive/80">
                    This file participates in at least one import cycle.
                    Cycles can cause initialization order issues and hinder
                    tree-shaking.
                  </p>
                </div>
              </section>
            </>
          )}

        </div>
      </ScrollArea>
    </>
  );
}

// ── External detail ───────────────────────────────────────────────────────────

interface ExternalDetailProps {
  node: GraphNode & Partial<ExternalNodeData>;
  onClose: () => void;
}

function ExternalDetail({ node, onClose }: ExternalDetailProps) {
  const packageName = (node as Partial<ExternalNodeData>).packageName ?? node.id;
  const version     = (node as Partial<ExternalNodeData>).version ?? (node.type === 'external' ? node.version : '');
  const importedBy  = (node as Partial<ExternalNodeData>).importedBy ?? 0;

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="flex flex-1 flex-wrap items-center gap-1.5 min-w-0">
          <span className="truncate font-semibold text-sm">{packageName}</span>
          {version && <Badge variant="outline">{version}</Badge>}
        </div>
        <CloseButton onClose={onClose} />
      </div>

      <Separator />

      <div className="px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Imported by{' '}
          <span className="font-semibold text-foreground">{importedBy}</span>{' '}
          {importedBy === 1 ? 'file' : 'files'}
        </p>
      </div>
    </>
  );
}

// ── Exports table ─────────────────────────────────────────────────────────────

function ExportsTable({ exports }: { exports?: ExportEntry[] }) {
  if (!exports || exports.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {exports ? 'No exports.' : 'Export details not available in this graph version.'}
      </p>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="pb-1.5 pr-2 font-medium">Name</th>
          <th className="pb-1.5 pr-2 font-medium">Kind</th>
          <th className="pb-1.5 font-medium text-right">Consumers</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {exports.map((exp) => (
          <ExportRow key={`${exp.name}-${exp.kind}`} entry={exp} />
        ))}
      </tbody>
    </table>
  );
}

function ExportRow({ entry }: { entry: ExportEntry }) {
  const clickable = entry.consumers > 0;
  return (
    <tr
      className={[
        'group py-1 transition-colors',
        clickable ? 'cursor-default hover:bg-muted/50' : '',
      ].join(' ')}
    >
      <td className="py-1 pr-2 font-mono">{entry.name}</td>
      <td className="py-1 pr-2 text-muted-foreground">{entry.kind}</td>
      <td className="py-1 text-right tabular-nums">{entry.consumers}</td>
    </tr>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function MetricCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted px-2 py-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close detail panel"
      className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
