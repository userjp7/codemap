'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';

export interface ExternalNodeData {
  packageName: string;
  version: string;
  importedBy: number;
}

type ExternalNodeType = Node<ExternalNodeData & Record<string, unknown>, 'external'>;

export default function ExternalNode({ data }: NodeProps<ExternalNodeType>) {
  return (
    <div className="w-[200px] rounded-lg border border-dashed border-border bg-card text-card-foreground shadow-sm">
      {/* No target Handle — external packages are never imported into by your code */}

      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-base leading-none" role="img" aria-label="package">
          📦
        </span>
        <span className="flex-1 truncate text-sm font-medium">{data.packageName}</span>
      </div>

      <div className="flex items-center gap-2 border-t border-dashed border-border px-3 py-2">
        <Badge variant="secondary">{data.version}</Badge>
        <span className="text-xs text-muted-foreground">
          imported by {data.importedBy} {data.importedBy === 1 ? 'file' : 'files'}
        </span>
      </div>

      <Handle type="target" position={Position.Top} />
    </div>
  );
}
