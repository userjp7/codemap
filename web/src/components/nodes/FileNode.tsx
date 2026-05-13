'use client';

import { useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { FileCode2, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { FileCategory, FileNodeData } from '@/types/graph';

const CATEGORY_COLORS: Record<FileCategory, string> = {
  component: '#1D9E75',
  hook: '#7F77DD',
  service: '#378ADD',
  utility: '#BA7517',
  config: '#888780',
};

// FileNodeData is a concrete interface, not an index type, so we intersect
// with Record<string,unknown> to satisfy @xyflow/react's generic constraint.
type FileNodeType = Node<FileNodeData & Record<string, unknown>, 'file'>;

export default function FileNode({ id, data }: NodeProps<FileNodeType>) {
  const [expanded, setExpanded] = useState(false);

  function handleChevronClick() {
    const next = !expanded;
    setExpanded(next);
    if (next) data.onExpand?.(id);
  }

  return (
    <div
      className="w-[220px] rounded-lg border border-l-[3px] border-border bg-card text-card-foreground shadow-sm"
      style={{ borderLeftColor: CATEGORY_COLORS[data.category] }}
    >
      <Handle type="target" position={Position.Top} />

      {/* Header: icon · filename · entry badge · chevron */}
      <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-3">
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium">{data.filename}</span>
        {data.isEntry && (
          <Badge
            variant="secondary"
            className="shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          >
            entry
          </Badge>
        )}
        <button
          type="button"
          onClick={handleChevronClick}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={expanded ? 'Collapse node' : 'Expand node'}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Badge row: extension · category · circular warning */}
      <div className="flex flex-wrap items-center gap-1 px-3 pb-1.5">
        <Badge variant="secondary">.{data.extension}</Badge>
        <Badge variant="secondary">{data.category}</Badge>
        {data.hasCircularDep && (
          <Badge variant="destructive">⚠ circular</Badge>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 px-3 pb-2">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          ↑ {data.importCount} imports
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          ↓ {data.exportCount} exports
        </span>
      </div>

      {/* Footer: full path */}
      <div className="border-t border-border px-3 py-2">
        <p className="truncate font-mono text-xs text-muted-foreground">{data.path}</p>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
