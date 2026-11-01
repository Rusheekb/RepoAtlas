import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type AriaLabelConfig,
  type Edge,
  type EdgeTypes,
  type FitViewOptions,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import '../graphs.css'
import { cn } from '@/components/ui/cn'
import { GraphTooltip, type GraphTooltipHandle, type TooltipContent } from '../GraphTooltip'
import { useElementSize, usePrefersReducedMotion } from '../hooks'
import { nearestInDirection, type Point } from '../layout'
import { computeHighlight, FlowHighlightContext, type EdgeLabelMode } from './highlight'
import { ArrowMarkers } from './PathEdge'

export interface FlowCanvasProps<N extends Node, E extends Edge> {
  nodes: N[]
  edges: E[]
  nodeTypes: NodeTypes
  edgeTypes: EdgeTypes
  /** Undirected neighbor lookup (for hover emphasis). */
  neighbors: ReadonlyMap<string, ReadonlySet<string>>
  selectedId?: string | null
  highlightIds?: readonly string[]
  seenIds?: readonly string[]
  onSelect?: (id: string | null) => void
  onOpen?: (id: string) => void
  tooltipFor?: (id: string) => TooltipContent | null
  /** Accessible name of the whole picture. */
  ariaLabel: string
  /** Overlay panel (top-left): legend, notes. */
  panel?: ReactNode
  showMiniMap?: boolean
  miniMapColor?: (node: N) => string
  /** Changes whenever the layout changes (refits the view). */
  layoutKey: string
  edgeLabels?: EdgeLabelMode
  /** Extra breathing room (px) around the fitted picture. */
  fitPadding?: number
  /** Fit the initial view to these nodes only (e.g. the busiest part of a big graph). Default: all nodes. */
  fitNodeIds?: readonly string[]
  className?: string
  testId?: string
}

const ARIA: Partial<AriaLabelConfig> = {
  'node.a11yDescription.default':
    'Press Enter or Space to select. Press Enter again to open. Arrow keys move to nearby items. Escape clears the selection.',
  'node.a11yDescription.keyboardDisabled': 'Press Enter or Space to select. Escape clears the selection.',
  'controls.ariaLabel': 'Map controls',
  'controls.zoomIn.ariaLabel': 'Zoom in',
  'controls.zoomOut.ariaLabel': 'Zoom out',
  'controls.fitView.ariaLabel': 'Fit the whole picture on screen',
  'minimap.ariaLabel': 'Mini map of the whole picture',
}

const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down'> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

function nodeElementFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('.react-flow__node')
}

/**
 * Re-fits the view when the layout changes, and when the canvas is resized — until the reader pans or zooms
 * themselves (then we leave their view alone).
 */
function AutoFit({
  layoutKey,
  size,
  options,
  userMoved,
}: {
  layoutKey: string
  size: string
  options: FitViewOptions
  userMoved: { current: boolean }
}) {
  const rf = useReactFlow()
  const reduced = usePrefersReducedMotion()
  const lastKey = useRef(layoutKey)
  useEffect(() => {
    const changed = lastKey.current !== layoutKey
    lastKey.current = layoutKey
    if (changed) userMoved.current = false
    if (userMoved.current) return
    const frame = requestAnimationFrame(() => {
      void rf.fitView({ ...options, duration: changed && !reduced ? 250 : 0 })
    })
    return () => cancelAnimationFrame(frame)
  }, [layoutKey, size, options, rf, reduced, userMoved])
  return null
}

/**
 * Shared React Flow canvas for our node graphs: themed controls & minimap, our own selection model (controlled via
 * selectedId / onSelect), hover + keyboard-focus emphasis shared through context, tooltips, spatial arrow-key
 * navigation and auto-fit. Nodes are not draggable and React Flow's own selection is off.
 */
export function FlowCanvas<N extends Node, E extends Edge>({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  neighbors,
  selectedId = null,
  highlightIds,
  seenIds,
  onSelect,
  onOpen,
  tooltipFor,
  ariaLabel,
  panel,
  showMiniMap,
  miniMapColor,
  layoutKey,
  edgeLabels = 'hover',
  fitPadding = 28,
  fitNodeIds,
  className,
  testId,
}: FlowCanvasProps<N, E>) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const [panelRef, panelSize] = useElementSize<HTMLDivElement>()
  const tooltipRef = useRef<GraphTooltipHandle>(null)
  const userMoved = useRef(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const markers = useMemo(() => ({ normal: `atlas-arrow-${uid}`, active: `atlas-arrow-on-${uid}` }), [uid])
  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])
  const centers = useMemo(() => {
    const m = new Map<string, Point>()
    for (const n of nodes) m.set(n.id, { x: n.position.x + (n.width ?? 0) / 2, y: n.position.y + (n.height ?? 0) / 2 })
    return m
  }, [nodes])

  // Fit the picture below the overlay panel so the legend never covers a card.
  const padding = useMemo<FitViewOptions['padding']>(() => {
    const p = fitPadding
    const top = panel && panelSize.height > 0 ? Math.min(panelSize.height + 46 + p / 2, Math.max(p, size.height * 0.42)) : p
    return { top: `${Math.round(top)}px`, right: `${p}px`, bottom: `${p}px`, left: `${p}px` }
  }, [fitPadding, panel, panelSize.height, size.height])
  const fitOptions = useMemo<FitViewOptions>(
    () => ({
      padding,
      maxZoom: 1.1,
      ...(fitNodeIds?.length ? { nodes: fitNodeIds.filter((id) => nodeIds.has(id)).map((id) => ({ id })) } : {}),
    }),
    [padding, fitNodeIds, nodeIds],
  )

  const highlight = useMemo(
    () =>
      computeHighlight({
        hoverId,
        focusId,
        selectedId,
        highlightIds,
        seenIds,
        neighbors,
        nodeIds,
        hoverEdgeId,
        markers,
        edgeLabels,
      }),
    [hoverId, focusId, selectedId, highlightIds, seenIds, neighbors, nodeIds, hoverEdgeId, markers, edgeLabels],
  )

  const showTip = useCallback(
    (id: string, at: { clientX: number; clientY: number } | { rect: DOMRect }) => {
      const content = tooltipFor?.(id)
      if (content) tooltipRef.current?.show(content, at)
      else tooltipRef.current?.hide()
    },
    [tooltipFor],
  )

  const onNodeMouseEnter = useCallback(
    (e: ReactMouseEvent, node: N) => {
      setHoverId(node.id)
      showTip(node.id, { clientX: e.clientX, clientY: e.clientY })
    },
    [showTip],
  )
  const onNodeMouseMove = useCallback((e: ReactMouseEvent) => {
    tooltipRef.current?.move({ clientX: e.clientX, clientY: e.clientY })
  }, [])
  const onNodeMouseLeave = useCallback(() => {
    setHoverId(null)
    tooltipRef.current?.hide()
  }, [])
  const onNodeClick = useCallback((_: ReactMouseEvent, node: N) => onSelect?.(node.id), [onSelect])
  const onNodeDoubleClick = useCallback((_: ReactMouseEvent, node: N) => onOpen?.(node.id), [onOpen])
  const onPaneClick = useCallback(() => onSelect?.(null), [onSelect])
  const onEdgeMouseEnter = useCallback((_: ReactMouseEvent, edge: E) => setHoverEdgeId(edge.id), [])
  const onEdgeMouseLeave = useCallback(() => setHoverEdgeId(null), [])
  const onMoveStart = useCallback((event: MouseEvent | TouchEvent | null) => {
    if (event) {
      userMoved.current = true
      tooltipRef.current?.hide()
    }
  }, [])

  const focusNode = useCallback(
    (id: string) => {
      const root = containerRef.current
      if (!root) return
      for (const el of root.querySelectorAll<HTMLElement>('.react-flow__node')) {
        if (el.dataset.id === id) {
          el.focus()
          return
        }
      }
    },
    [containerRef],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        tooltipRef.current?.hide()
        if (selectedId) {
          e.stopPropagation()
          onSelect?.(null)
        }
        return
      }
      const el = nodeElementFrom(e.target)
      const id = el?.dataset.id
      if (!id) return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (id === selectedId && onOpen) onOpen(id)
        else onSelect?.(id)
      } else if (e.key === ' ') {
        e.preventDefault()
        onSelect?.(id)
      } else if (ARROWS[e.key] && !e.altKey && !e.metaKey && !e.ctrlKey) {
        const next = nearestInDirection(id, centers, ARROWS[e.key])
        e.preventDefault()
        if (next) focusNode(next)
      }
    },
    [centers, focusNode, onOpen, onSelect, selectedId],
  )

  const onFocus = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      const el = nodeElementFrom(e.target)
      const id = el?.dataset.id
      if (!el || !id || el !== e.target) return
      setFocusId(id)
      showTip(id, { rect: el.getBoundingClientRect() })
    },
    [showTip],
  )
  const onBlur = useCallback((e: FocusEvent<HTMLDivElement>) => {
    const el = nodeElementFrom(e.target)
    if (!el) return
    setFocusId(null)
    tooltipRef.current?.hide()
  }, [])

  // Selection that disappears from the graph (new data) shouldn't keep stale hover state around.
  useEffect(() => {
    if (hoverId && !nodeIds.has(hoverId)) setHoverId(null)
    if (focusId && !nodeIds.has(focusId)) setFocusId(null)
  }, [nodeIds, hoverId, focusId])

  return (
    <div
      ref={containerRef}
      className={cn('atlas-flow-root relative h-full min-h-[320px] w-full overflow-hidden', className)}
      data-testid={testId}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <ArrowMarkers normal={markers.normal} active={markers.active} />
      <FlowHighlightContext.Provider value={highlight}>
        <ReactFlow<N, E>
          className="atlas-flow"
          aria-label={ariaLabel}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={fitOptions}
          minZoom={0.2}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable
          edgesFocusable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          proOptions={{ hideAttribution: true }}
          ariaLabelConfig={ARIA}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseMove={onNodeMouseMove}
          onNodeMouseLeave={onNodeMouseLeave}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
          onPaneClick={onPaneClick}
          onMoveStart={onMoveStart}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--line-strong)" />
          <Controls showInteractive={false} position="bottom-left" />
          {showMiniMap && (
            <MiniMap<N>
              position="bottom-right"
              pannable
              zoomable
              nodeColor={miniMapColor ?? (() => 'var(--surface-3)')}
              nodeBorderRadius={6}
              bgColor="var(--surface)"
              maskColor="color-mix(in srgb, var(--canvas) 72%, transparent)"
            />
          )}
          {panel && (
            <Panel position="top-left" className="atlas-flow-panel">
              <div ref={panelRef}>{panel}</div>
            </Panel>
          )}
          <AutoFit
            layoutKey={layoutKey}
            size={`${size.width}x${size.height}x${panelSize.height}`}
            options={fitOptions}
            userMoved={userMoved}
          />
        </ReactFlow>
      </FlowHighlightContext.Provider>
      <GraphTooltip ref={tooltipRef} containerRef={containerRef} />
    </div>
  )
}
