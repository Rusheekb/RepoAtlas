import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
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
  useStore,
  type AriaLabelConfig,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import { Maximize2, ZoomIn } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import '../graphs.css'
import { cn } from '@/components/ui/cn'
import { useExplain } from '@/state/explain'
import { GraphTooltip, type GraphTooltipHandle, type TooltipContent } from '../GraphTooltip'
import { useElementSize, usePrefersReducedMotion } from '../hooks'
import { nearestInDirection, type Point } from '../layout'
import { computeHighlight, FlowHighlightContext, type EdgeLabelMode } from './highlight'
import { ArrowMarkers } from './PathEdge'
import {
  addInsets,
  explainPanelInset,
  focusSequence,
  planView,
  revealViewport,
  sameViewport,
  uniformInsets,
  type CornerObstacle,
  type Insets,
  type NodeBox,
  type ViewPlan,
  type Viewport,
} from './viewport'

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
  /** Overlay panel (top-left). Prefer `footer`, which never covers a card. */
  panel?: ReactNode
  /** A strip under the picture for the legend and notes. */
  footer?: ReactNode
  showMiniMap?: boolean
  miniMapColor?: (node: N) => string
  /** Show the zoom buttons (default true). */
  showControls?: boolean
  /** Changes whenever the layout changes (refits the view). */
  layoutKey: string
  edgeLabels?: EdgeLabelMode
  /** Extra breathing room (px) around the fitted picture. */
  fitPadding?: number
  /** Fit the overview to these nodes only (e.g. the busiest part of a big graph). Default: all nodes. */
  fitNodeIds?: readonly string[]
  /**
   * Node ids from most to least important. When the whole picture would be too small to read, the first view is a
   * close-up that starts from the selected node (else the first of these) and takes in its neighbors.
   */
  focusRank?: readonly string[]
  /** Label of the button that zooms out to everything when the first view is a close-up (e.g. "Show all 40 files"). */
  overviewLabel?: string
  /** Space (px) kept free along the canvas edges for things drawn on top of it by the page (e.g. a button row). */
  reserve?: Partial<Insets>
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

/** React Flow's zoom buttons (3 × 32px, 15px margin) and mini map (200 × 150, 15px margin), plus a little air. */
const CONTROLS_CORNER: CornerObstacle = { corner: 'bottom-left', width: 15 + 34 + 10, height: 15 + 98 + 10 }
const MINIMAP_CORNER: CornerObstacle = { corner: 'bottom-right', width: 15 + 200 + 10, height: 15 + 150 + 10 }
/** The mini map only earns its space on canvases at least this wide. */
const MINIMAP_MIN_WIDTH = 560
/** Room kept at the bottom for the "Show all" button (32px tall, 12px from the edge). */
const TOGGLE_RESERVE = 52
const MIN_ZOOM = 0.2

function nodeElementFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('.react-flow__node')
}

/** Keyboard focus (or a browser that can't tell us) — not focus put back on a card after a tap or click. */
function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

/**
 * Applies the planned view: on first show, when the layout or the requested view changes, and when the canvas or the
 * space around it changes — unless the reader has panned or zoomed themselves. Then it only nudges the picture so the
 * selected card isn't hidden (for example under the explain panel).
 */
function ViewController({
  plan,
  layoutKey,
  applyKey,
  box,
  userMoved,
  selectedBox,
}: {
  plan: ViewPlan | null
  layoutKey: string
  /** Changes when the reader asks for a view (overview / close-up / fit). */
  applyKey: string
  box: { width: number; height: number }
  userMoved: { current: boolean }
  selectedBox: NodeBox | null
}) {
  const rf = useReactFlow()
  const reduced = usePrefersReducedMotion()
  const last = useRef<{ layoutKey: string; applyKey: string; boxKey: string } | null>(null)
  const boxKey = `${box.width}x${box.height}`
  useEffect(() => {
    if (!plan) return
    const prev = last.current
    const layoutChanged = !prev || prev.layoutKey !== layoutKey
    const asked = !!prev && prev.applyKey !== applyKey
    const resized = !!prev && prev.boxKey !== boxKey
    last.current = { layoutKey, applyKey, boxKey }
    if (layoutChanged || asked) userMoved.current = false
    const current = rf.getViewport()
    const duration = reduced || !prev || (resized && !layoutChanged && !asked) ? 0 : 260
    if (userMoved.current) {
      if (!selectedBox) return
      const next = revealViewport(current, selectedBox, box, plan.pad)
      if (next) void rf.setViewport(next, { duration })
      return
    }
    if (sameViewport(current, plan.viewport)) return
    void rf.setViewport(plan.viewport, { duration })
  }, [plan, layoutKey, applyKey, box, boxKey, userMoved, selectedBox, rf, reduced])
  return null
}

/** Arrowheads sized for the current zoom, so they stay at least ~9px on screen. */
function ZoomedArrowMarkers({ normal, active }: { normal: string; active: string }) {
  const zoom = useStore((s) => Math.round(s.transform[2] * 20) / 20)
  return <ArrowMarkers normal={normal} active={active} zoom={zoom} />
}

/**
 * Shared React Flow canvas for our node graphs: themed controls & minimap, our own selection model (controlled via
 * selectedId / onSelect), hover + keyboard-focus emphasis shared through context, tooltips, spatial arrow-key
 * navigation, and a first view that is always readable (the whole picture, or a close-up with a "Show all" button)
 * and never hidden under the zoom buttons, the mini map or the explain panel. Nodes are not draggable and React
 * Flow's own selection is off.
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
  footer,
  showMiniMap,
  miniMapColor,
  showControls = true,
  layoutKey,
  edgeLabels = 'hover',
  fitPadding = 28,
  fitNodeIds,
  focusRank,
  overviewLabel = 'Show the whole picture',
  reserve,
  className,
  testId,
}: FlowCanvasProps<N, E>) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const [panelRef, panelSize] = useElementSize<HTMLDivElement>()
  const tooltipRef = useRef<GraphTooltipHandle>(null)
  const userMoved = useRef(false)
  const lastPointer = useRef<string>('mouse')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null)
  const [view, setView] = useState<{ key: string; mode: 'auto' | 'all'; tick: number }>({ key: layoutKey, mode: 'auto', tick: 0 })
  const mode = view.key === layoutKey ? view.mode : 'auto'
  const [mounted, setMounted] = useState(false)
  const [inset, setInset] = useState(0)
  const explainOpen = useExplain((s) => s.target !== null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const markers = useMemo(() => ({ normal: `atlas-arrow-${uid}`, active: `atlas-arrow-on-${uid}` }), [uid])
  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])
  const boxes = useMemo<NodeBox[]>(
    () => nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, width: n.width ?? 0, height: n.height ?? 0 })),
    [nodes],
  )
  const centers = useMemo(() => {
    const m = new Map<string, Point>()
    for (const b of boxes) m.set(b.id, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    return m
  }, [boxes])

  // Mount React Flow once the canvas has been measured, so its very first frame already shows the planned view.
  useLayoutEffect(() => setMounted(true), [])

  // The wide-screen explain drawer slides over the right of the page: keep the picture to its left while it's open.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setInset(explainPanelInset(el.getBoundingClientRect(), window.innerWidth, explainOpen))
    measure()
    if (!explainOpen) return
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [containerRef, explainOpen, size.width, size.height])

  const miniMapShown = !!showMiniMap && size.width >= MINIMAP_MIN_WIDTH
  const corners = useMemo<CornerObstacle[]>(() => {
    const out: CornerObstacle[] = []
    if (showControls) out.push(CONTROLS_CORNER)
    if (miniMapShown) out.push(MINIMAP_CORNER)
    if (panel && panelSize.width > 0) out.push({ corner: 'top-left', width: panelSize.width + 12 + 26 + 10, height: panelSize.height + 12 + 18 + 10 })
    return out
  }, [showControls, miniMapShown, panel, panelSize.width, panelSize.height])
  const base = useMemo(
    () => addInsets(uniformInsets(fitPadding), { ...reserve, right: (reserve?.right ?? 0) + inset }),
    [fitPadding, reserve, inset],
  )
  const sequence = useMemo(() => focusSequence([...nodeIds], neighbors, focusRank, selectedId), [nodeIds, neighbors, focusRank, selectedId])
  const ringSize = useMemo(() => {
    const start = sequence[0]
    if (!start) return 0
    let n = 1
    for (const id of neighbors.get(start) ?? []) if (nodeIds.has(id) && id !== start) n++
    return n
  }, [sequence, neighbors, nodeIds])
  const plan = useMemo(
    () =>
      planView({
        nodes: boxes,
        box: size,
        base,
        corners,
        overviewIds: fitNodeIds?.filter((id) => nodeIds.has(id)),
        sequence,
        ringSize,
        mode,
        toggleReserve: TOGGLE_RESERVE,
      }),
    [boxes, size, base, corners, fitNodeIds, nodeIds, sequence, ringSize, mode],
  )
  const selectedBox = useMemo(() => (selectedId ? (boxes.find((b) => b.id === selectedId) ?? null) : null), [boxes, selectedId])

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

  // Taps fire mouse events too; tooltips are for pointing devices and keyboards only.
  const onPointerCapture = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    lastPointer.current = e.pointerType || 'mouse'
    if (e.pointerType === 'touch') tooltipRef.current?.hide()
  }, [])

  const onNodeMouseEnter = useCallback(
    (e: ReactMouseEvent, node: N) => {
      if (lastPointer.current === 'touch') return
      setHoverId(node.id)
      showTip(node.id, { clientX: e.clientX, clientY: e.clientY })
    },
    [showTip],
  )
  const onNodeMouseMove = useCallback((e: ReactMouseEvent) => {
    if (lastPointer.current === 'touch') return
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
  // A press on a card starts a pan gesture too; only a gesture that actually moved the picture counts as the reader
  // taking over the view.
  const moveFrom = useRef<Viewport | null>(null)
  const onMoveStart = useCallback((event: MouseEvent | TouchEvent | null, vp: Viewport) => {
    if (!event) return
    moveFrom.current = vp
    tooltipRef.current?.hide()
  }, [])
  const onMoveEnd = useCallback((event: MouseEvent | TouchEvent | null, vp: Viewport) => {
    const from = moveFrom.current
    moveFrom.current = null
    if (event && from && !sameViewport(from, vp)) userMoved.current = true
  }, [])

  const askView = useCallback(
    (next: 'auto' | 'all') => setView((v) => ({ key: layoutKey, mode: next, tick: v.tick + 1 })),
    [layoutKey],
  )

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
      // Focus handed back to a card (e.g. when an explanation closes after a tap) isn't the reader moving around.
      if (lastPointer.current === 'touch' || !isFocusVisible(el)) return
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

  const minZoom = Math.max(0.02, Math.min(MIN_ZOOM, (plan?.overviewZoom ?? 1) * 0.9))
  const toggle = plan?.crowded ? (
    <button
      type="button"
      className="absolute bottom-3 z-10 inline-flex h-8 max-w-[calc(100%-140px)] -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink-2 shadow-sm hover:border-line-strong hover:text-ink"
      style={{ left: Math.max(70, (size.width - inset) / 2) }}
      onClick={() => askView(mode === 'all' ? 'auto' : 'all')}
      data-testid="flow-view-toggle"
    >
      {mode === 'all' ? <ZoomIn className="size-3.5 shrink-0" aria-hidden /> : <Maximize2 className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{mode === 'all' ? 'Zoom back in to read' : overviewLabel}</span>
    </button>
  ) : null

  return (
    <div className={cn('atlas-flow-root flex h-full min-h-[320px] w-full flex-col overflow-hidden', className)} data-testid={testId}>
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1"
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onPointerDownCapture={onPointerCapture}
        onPointerOverCapture={onPointerCapture}
      >
        <FlowHighlightContext.Provider value={highlight}>
          {mounted && (
            <ReactFlow<N, E>
              className="atlas-flow"
              aria-label={ariaLabel}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultViewport={plan?.viewport ?? { x: 0, y: 0, zoom: 1 }}
              minZoom={minZoom}
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
              onMoveEnd={onMoveEnd}
            >
              <ZoomedArrowMarkers normal={markers.normal} active={markers.active} />
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--line-strong)" />
              {showControls && <Controls showInteractive={false} position="bottom-left" onFitView={() => askView('all')} />}
              {miniMapShown && (
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
              <ViewController
                plan={plan}
                layoutKey={layoutKey}
                applyKey={`${mode}:${view.tick}`}
                box={size}
                userMoved={userMoved}
                selectedBox={selectedBox}
              />
            </ReactFlow>
          )}
        </FlowHighlightContext.Provider>
        {toggle}
        <GraphTooltip ref={tooltipRef} containerRef={containerRef} />
      </div>
      {footer && <div className="atlas-flow-footer shrink-0 border-t border-line px-4 py-2.5">{footer}</div>}
    </div>
  )
}
