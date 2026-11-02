import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowRight, FolderOpen, MapPinOff } from 'lucide-react'
import { ArchitectureGraph, buildArchitectureLayout } from '@/components/graphs'
import { useMeasuredElement } from '@/components/graphs/hooks'
import { useIsDesktop, useRepoNav } from '@/components/shell/hooks'
import { Button, EmptyState, Icon, LayerLegend, Segmented } from '@/components/ui'
import { bestFitDirection, moduleRows, presentLayers } from '@/components/views/visual/architecture'
import { ModuleDrillDown } from '@/components/views/visual/ModuleDrillDown'
import { ModuleTable } from '@/components/views/visual/ModuleTable'
import { useMarkSeen, useSeenIds } from '@/components/views/visual/useSeen'
import { ViewHeader } from '@/components/views/visual/ViewHeader'
import { pluralize } from '@/core/format'
import { VIEW_INFO } from '@/core/labels'
import { useExplain } from '@/state/explain'
import { useAnalysis } from '@/state/repo'

type Direction = 'LR' | 'TB'
type Mode = 'map' | 'list'

const HINT = 'Each box is one part of the project. An arrow from A to B means A uses something from B. Click a box to learn what it does.'

/** The "See the files in …" button sits over the top of the map: keep that strip free of cards while it shows. */
const SEE_FILES_RESERVE = { top: 26 }

/** Copy the current search params, apply a patch (null / '' deletes a key). */
function patchParams(prev: URLSearchParams, patch: Record<string, string | null>): URLSearchParams {
  const next = new URLSearchParams(prev)
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') next.delete(k)
    else next.set(k, v)
  }
  return next
}

/**
 * "How It Connects": the architecture map. Boxes are modules, arrows are "uses". Click to learn about a part
 * (explain panel), double-click / "See the files" to drill into a file-level map of that part (?module=id),
 * or switch to an accessible table (?as=list). ?select=id preselects a part.
 */
export default function ArchitecturePage() {
  const analysis = useAnalysis()
  const fullName = analysis.meta.fullName
  const [params, setParams] = useSearchParams()
  const isDesktop = useIsDesktop()
  const nav = useRepoNav()
  const openExplain = useExplain((s) => s.open)
  const explainTarget = useExplain((s) => s.target)
  const markSeen = useMarkSeen(fullName)
  const seenModuleIds = useSeenIds(fullName, 'module:')
  const seenPaths = useSeenIds(fullName, 'file:')
  const seenModuleSet = useMemo(() => new Set(seenModuleIds), [seenModuleIds])

  const [dirChoice, setDirChoice] = useState<Direction | null>(null)
  // Until the reader picks one, arrows flow whichever way lets the map be drawn biggest in the space it has.
  const [mapBoxRef, mapBox] = useMeasuredElement<HTMLDivElement>()
  const boxW = Math.round(mapBox.width / 40) * 40
  const boxH = Math.round(mapBox.height / 40) * 40
  const autoDirection = useMemo<Direction>(() => {
    if (boxW <= 0 || boxH <= 0) return isDesktop ? 'LR' : 'TB'
    return bestFitDirection(analysis.modules, analysis.moduleEdges, { width: boxW, height: boxH }, buildArchitectureLayout)
  }, [boxW, boxH, isDesktop, analysis.modules, analysis.moduleEdges])
  const direction: Direction = dirChoice ?? autoDirection

  const moduleById = useMemo(() => new Map(analysis.modules.map((m) => [m.id, m])), [analysis.modules])
  const rows = useMemo(() => moduleRows(analysis.modules, analysis.moduleEdges), [analysis.modules, analysis.moduleEdges])
  const layers = useMemo(() => presentLayers(analysis.modules), [analysis.modules])
  const connectionCount = useMemo(() => rows.reduce((n, r) => n + r.uses.length, 0), [rows])

  const selectParam = params.get('select')
  const selectedId = selectParam && moduleById.has(selectParam) ? selectParam : null
  const drillId = params.get('module')
  const drill = drillId != null ? (moduleById.get(drillId) ?? null) : null
  const mode: Mode = params.get('as') === 'list' ? 'list' : 'map'
  const selectedFile = explainTarget?.type === 'file' ? explainTarget.path : null

  const update = useCallback(
    (patch: Record<string, string | null>, replace = true) => setParams((prev) => patchParams(prev, patch), { replace }),
    [setParams],
  )

  // Remember which part we last opened in the panel, so a URL change we caused doesn't open it twice.
  const lastOpened = useRef<string | null>(null)

  const explainModule = useCallback(
    (id: string) => {
      lastOpened.current = id
      openExplain({ type: 'module', id })
      markSeen(`module:${id}`)
    },
    [openExplain, markSeen],
  )

  const selectModule = useCallback(
    (id: string | null) => {
      if (!id) {
        update({ select: null })
        return
      }
      explainModule(id)
      update({ select: id })
    },
    [explainModule, update],
  )

  const drillInto = useCallback(
    (id: string) => {
      markSeen(`module:${id}`)
      // Coming back out keeps this part selected on the map without re-opening its explanation.
      lastOpened.current = id
      update({ module: id, select: id }, false)
    },
    [markSeen, update],
  )

  const backToParts = useCallback(() => update({ module: null }, false), [update])

  // ?select=id arriving from elsewhere (e.g. "Show on map"): explain it on wide screens. On phones the explanation is a
  // full-screen sheet, so we only highlight the box and let the reader tap it.
  useEffect(() => {
    if (!selectedId || drill || lastOpened.current === selectedId) return
    lastOpened.current = selectedId
    if (!isDesktop) return
    const t = useExplain.getState().target
    if (t?.type === 'module' && t.id === selectedId) return
    explainModule(selectedId)
  }, [selectedId, drill, isDesktop, explainModule])

  // The panel moved on to another part (its "Uses …" links): follow it on the map. Only *changes* count, and a
  // ?select= in the address wins over whatever the panel showed when the page opened.
  const explainedModuleId = explainTarget?.type === 'module' ? explainTarget.id : null
  const prevExplained = useRef<string | null>(selectParam ? explainedModuleId : null)
  useEffect(() => {
    if (explainedModuleId === prevExplained.current) return
    prevExplained.current = explainedModuleId
    if (!explainedModuleId || drill || explainedModuleId === selectParam || !moduleById.has(explainedModuleId)) return
    lastOpened.current = explainedModuleId
    update({ select: explainedModuleId })
  }, [explainedModuleId, drill, selectParam, moduleById, update])

  const selectFile = useCallback(
    (path: string | null) => {
      if (!path) return
      openExplain({ type: 'file', path })
      markSeen(`file:${path}`)
    },
    [openExplain, markSeen],
  )
  const openFile = useCallback((path: string) => nav.go('explore', { file: path }), [nav])

  const selected = selectedId ? moduleById.get(selectedId) : undefined
  const info = VIEW_INFO.map

  const directionToggle = (
    <Segmented<Direction>
      label="Which way the arrows flow"
      size="sm"
      value={direction}
      onChange={setDirChoice}
      options={[
        { value: 'LR', label: 'Sideways', title: 'Arrows flow from left to right' },
        { value: 'TB', label: 'Top-down', title: 'Arrows flow from top to bottom' },
      ]}
    />
  )

  return (
    <div className="flex h-full min-h-140 shrink-0 flex-col gap-4 p-4 sm:p-6" data-testid="architecture-page">
      <ViewHeader
        view="map"
        title={info.label}
        hint={HINT}
        actions={
          drillId == null ? (
            <>
              <Segmented<Mode>
                label="How to show the parts"
                size="sm"
                value={mode}
                onChange={(m) => update({ as: m === 'list' ? 'list' : null })}
                options={[
                  { value: 'map', label: 'Map view' },
                  { value: 'list', label: 'List view' },
                ]}
              />
              {mode === 'map' && directionToggle}
            </>
          ) : drill ? undefined : (
            directionToggle
          )
        }
      />

      {drillId != null ? (
        drill ? (
          <ModuleDrillDown
            className="flex-1"
            module={drill}
            files={analysis.files}
            fileEdges={analysis.fileEdges}
            direction={dirChoice}
            onDirectionChange={setDirChoice}
            selectedPath={selectedFile}
            seenPaths={seenPaths}
            onBack={backToParts}
            onExplainModule={() => explainModule(drill.id)}
            onSelectFile={selectFile}
            onOpenFile={openFile}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-line-strong">
            <EmptyState
              icon={<Icon as={MapPinOff} size={18} />}
              title="We couldn’t find that part"
              actions={
                <Button variant="primary" onClick={backToParts}>
                  Back to all parts
                </Button>
              }
            >
              It may have been renamed, or the link points to a different version of the project.
            </EmptyState>
          </div>
        )
      ) : mode === 'list' ? (
        <div className="min-h-0 flex-1">
          <ModuleTable rows={rows} selectedId={selectedId} seenIds={seenModuleSet} onExplain={selectModule} onOpen={drillInto} />
          <p className="mt-3 text-xs leading-relaxed text-ink-3 tabular-nums">
            {pluralize(analysis.modules.length, 'part')} and {pluralize(connectionCount, 'connection')}. “Uses” counts the other parts a part relies on;
            “Used by” counts the parts that rely on it.
          </p>
        </div>
      ) : (
        <section aria-label="Map of the project’s parts" className="flex min-h-95 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <div ref={mapBoxRef} className="relative min-h-80 flex-1">
            <ArchitectureGraph
              modules={analysis.modules}
              edges={analysis.moduleEdges}
              selectedId={selectedId}
              seenIds={seenModuleIds}
              onSelect={selectModule}
              onOpen={drillInto}
              direction={direction}
              showLegend={false}
              reserve={selected ? SEE_FILES_RESERVE : undefined}
            />
            {selected && (
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-start">
                <Button
                  size="sm"
                  variant="primary"
                  className="pointer-events-auto max-w-full shadow-md"
                  onClick={() => drillInto(selected.id)}
                  icon={<FolderOpen className="size-4" strokeWidth={1.5} aria-hidden />}
                  iconRight={<ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />}
                >
                  <span className="truncate">See the files in {selected.name}</span>
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-4 py-3">
            {layers.length > 0 ? <LayerLegend layers={layers} /> : <span />}
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-3">
              <span className="text-meta">
                {pluralize(analysis.modules.length, 'part')} · {pluralize(connectionCount, 'connection')}
              </span>
              <span className="max-sm:hidden">Double-click a box to see the files inside</span>
              <span className="sm:hidden">Tap a box to learn about it</span>
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
