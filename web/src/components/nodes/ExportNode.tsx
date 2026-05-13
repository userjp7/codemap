'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';

export interface ExportNodeData {
  name: string;
  exportKind: string;
  consumerCount: number;
}

// Maps export kind to a border accent colour.
const KIND_COLORS: Record<string, string> = {
  fn: '#378ADD',
  named: '#378ADD',
  class: '#BA7517',
  type: '#888780',
  default: '#1D9E75',
};

// Short label shown inside the kind badge.
const KIND_LABEL: Record<string, string> = {
  fn: 'fn',
  named: 'fn',
  class: 'class',
  type: 'type',
  const: 'const',
  default: 'default',
};

type ExportNodeType = Node<ExportNodeData & Record<string, unknown>, 'export'>;

export default function ExportNode({ data }: NodeProps<ExportNodeType>) {
  const borderColor = KIND_COLORS[data.exportKind] ?? '#888780';
  const kindLabel = KIND_LABEL[data.exportKind] ?? data.exportKind;

  return (
    <div
      className="w-[180px] rounded-md border border-l-[3px] border-border bg-card text-card-foreground shadow-sm"
      style={{ borderLeftColor: borderColor }}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 px-2.5 py-2">
        <Badge variant="secondary" className="shrink-0 font-mono">
          {kindLabel}
        </Badge>
        <span className="flex-1 truncate font-mono text-sm font-medium">
          {data.name}
        </span>
      </div>

      <div className="border-t border-border px-2.5 py-1.5">
        <span className="text-xs text-muted-foreground">
          {data.consumerCount} {data.consumerCount === 1 ? 'consumer' : 'consumers'}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
