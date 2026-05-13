'use client';

import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

// Keyframe name scoped to avoid collisions with other edge animations.
const ANIM = 'circular-dash';

/**
 * Custom React Flow edge for circular dependency paths.
 * Renders as a red dashed bezier curve with a "marching ants" stroke
 * animation (animating strokeDashoffset) and a warning pill label at the
 * midpoint. The keyframes are injected via a <style> tag because Tailwind
 * has no utility for animating SVG presentation attributes like
 * strokeDashoffset.
 */
export default function CircularEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {/* Injected once per edge instance; browsers deduplicate identical rules. */}
      <style>{`
        @keyframes ${ANIM} {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -18; }
        }
        .${ANIM} {
          animation: ${ANIM} 1s linear infinite;
        }
      `}</style>

      <path
        id={id}
        className={ANIM}
        d={path}
        stroke="#EF4444"
        strokeWidth={2}
        strokeDasharray="6 3"
        fill="none"
      />

      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          className="nodrag nopan absolute rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-950/50 dark:text-red-400"
        >
          ⚠ circular
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
