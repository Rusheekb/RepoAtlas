import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react'
import { cn } from '@/components/ui/cn'
import { edgeLabelVisible, edgeState, useFlowHighlight } from './highlight'

export type PathEdgeData = {
  /** Precomputed SVG path (from the layout). */
  path: string
  labelX: number
  labelY: number
  /** Stroke width in px (1.5–4). */
  width: number
  label?: string
  /** Visually quieter edge (e.g. to a file outside the current part). */
  faint?: boolean
}

export type PathFlowEdge = Edge<PathEdgeData, 'path'>

/**
 * An edge drawn along a path computed by our own layout (dagre routes or clipped straight lines), with an
 * arrowhead, weight-scaled stroke, hover/focus emphasis from context and an optional pill label.
 */
export const PathEdge = memo(function PathEdge({ id, source, target, data }: EdgeProps<PathFlowEdge>) {
  const h = useFlowHighlight()
  if (!data?.path) return null
  const state = edgeState(h, id, source, target)
  const active = state === 'active'
  const showLabel = !!data.label && edgeLabelVisible(h, id, state)
  return (
    <>
      <g className="atlas-edge" data-state={state} style={{ opacity: state === 'dim' ? 0.14 : data.faint && !active ? 0.45 : 1 }}>
        <BaseEdge
          id={id}
          path={data.path}
          markerEnd={`url(#${active ? h.markers.active : h.markers.normal})`}
          interactionWidth={22}
          style={{
            stroke: active ? 'var(--brand)' : 'var(--line-strong)',
            strokeWidth: active ? data.width + 0.5 : data.width,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            fill: 'none',
          }}
        />
      </g>
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'pointer-events-none absolute max-w-[170px] rounded-full border px-2 py-0.5 text-center text-[11px] leading-tight font-medium shadow-sm',
              active ? 'border-brand bg-brand-soft text-brand-text' : 'border-line bg-surface text-ink-2',
            )}
            style={{ transform: `translate(-50%, -50%) translate(${data.labelX}px, ${data.labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

/** Arrowhead definitions referenced by PathEdge (one gray, one brand). Rendered once per graph. */
export function ArrowMarkers({ normal, active }: { normal: string; active: string }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        {[
          [normal, 'var(--line-strong)'],
          [active, 'var(--brand)'],
        ].map(([id, color]) => (
          <marker
            key={id}
            id={id}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="10"
            markerHeight="10"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M0,1 L10,5 L0,9 Z" style={{ fill: color }} />
          </marker>
        ))}
      </defs>
    </svg>
  )
}
