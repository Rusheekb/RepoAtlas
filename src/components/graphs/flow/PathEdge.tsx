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
  /** Only show the label while this edge is highlighted (its spot would cover a card). */
  labelOnlyWhenActive?: boolean
}

export type PathFlowEdge = Edge<PathEdgeData, 'path'>

/**
 * An edge drawn along a path computed by our own layout (dagre routes or clipped straight lines), with an
 * arrowhead, weight-scaled stroke, hover/focus emphasis in ink from context and an optional small label tag.
 */
export const PathEdge = memo(function PathEdge({ id, source, target, data }: EdgeProps<PathFlowEdge>) {
  const h = useFlowHighlight()
  if (!data?.path) return null
  const state = edgeState(h, id, source, target)
  const active = state === 'active'
  const showLabel = !!data.label && (data.labelOnlyWhenActive ? active : edgeLabelVisible(h, id, state))
  return (
    <>
      <g className="atlas-edge" data-state={state} style={{ opacity: state === 'dim' ? 0.14 : data.faint && !active ? 0.45 : 1 }}>
        <BaseEdge
          id={id}
          path={data.path}
          markerEnd={`url(#${active ? h.markers.active : h.markers.normal})`}
          interactionWidth={22}
          style={{
            stroke: active ? 'var(--ink)' : 'var(--edge)',
            strokeWidth: active ? data.width + 0.5 : data.width,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            fill: 'none',
            // Lines keep their on-screen width at any zoom, so arrows stay visible on zoomed-out maps.
            vectorEffect: 'non-scaling-stroke',
          }}
        />
      </g>
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'pointer-events-none absolute max-w-[170px] rounded-md border bg-surface px-1.5 py-px text-center text-xs leading-4',
              active ? 'border-line-strong text-ink' : 'border-line text-ink-2',
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

/** On-screen size (px) we aim for: arrowheads never shrink below ~9px, and don't balloon when zoomed in. */
const ARROW_SCREEN_PX = 9

/**
 * Arrowhead size in flow units for a zoom level, and where its tip sits. Edge paths stop 5 units short of the
 * card (room for the head), so the tip is placed 5 units past the path's end whatever the head's size.
 */
export function arrowGeometry(zoom: number): { size: number; refX: number } {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const size = Math.min(36, Math.max(10, ARROW_SCREEN_PX / z))
  return { size: Math.round(size * 100) / 100, refX: Math.round((10 - (5 * 10) / size) * 100) / 100 }
}

/** Arrowhead definitions referenced by PathEdge (one in the edge colour, one in ink for emphasis). Rendered once per graph. */
export function ArrowMarkers({ normal, active, zoom = 1 }: { normal: string; active: string; zoom?: number }) {
  const { size, refX } = arrowGeometry(zoom)
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        {[
          [normal, 'var(--edge)'],
          [active, 'var(--ink)'],
        ].map(([id, color]) => (
          <marker
            key={id}
            id={id}
            viewBox="0 0 10 10"
            refX={refX}
            refY="5"
            markerWidth={size}
            markerHeight={size}
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
