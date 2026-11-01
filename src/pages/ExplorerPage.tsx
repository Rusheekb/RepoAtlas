import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useIsDesktop, usePrefersReducedMotion, useRepoNav } from '@/components/shell/hooks'
import { EmptyState } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { AboutFilePanel } from '@/components/views/reading/AboutFilePanel'
import { CodePane } from '@/components/views/reading/CodePane'
import { defaultFilePath, formatLineParam, parseLineParam, type LineRange } from '@/components/views/reading/explorer'
import { FilesPane, FilesRail } from '@/components/views/reading/FilesPane'
import { useFileContent } from '@/components/views/reading/useFileContent'
import { ViewHeader } from '@/components/views/visual/ViewHeader'
import { VIEW_INFO } from '@/core/labels'
import { useExplain } from '@/state/explain'
import { useProgress } from '@/state/progress'
import { useAnalysis, useSnapshot } from '@/state/repo'
import '@/components/views/reading/reading.css'

const HINT = 'Pick any file to read it, with plain-English notes alongside. Click a line number to ask what those lines do.'

/**
 * "Read the Code": a file tree, the code itself (syntax-colored, line numbers, line selection) and an "About this file"
 * panel with a plain-English summary, connections, an outline and Claude's explanation.
 *
 * URL: ?file=path (default: the README, else the first starting point), ?line=N or ?line=A-B (highlighted and scrolled
 * into view; selecting lines updates it), ?folder=path (opens that folder in the tree).
 */
export default function ExplorerPage() {
  const analysis = useAnalysis()
  const snapshot = useSnapshot()
  const [params, setParams] = useSearchParams()
  const { href } = useRepoNav()
  const isDesktop = useIsDesktop()
  const reducedMotion = usePrefersReducedMotion()
  const fullName = analysis.meta.fullName
  const markSeen = useProgress((s) => s.markSeen)
  const seenMap = useProgress((s) => s.seen[fullName.toLowerCase()])
  const openExplain = useExplain((s) => s.open)

  const files = useMemo(() => Object.values(analysis.files), [analysis.files])
  const fileParam = params.get('file')
  const path = fileParam ?? defaultFilePath(analysis)
  const file = path ? (analysis.files[path] ?? null) : null
  /** "?file=" naming a folder rather than a file: open that folder in the list instead. */
  const folderAsked = useMemo(() => {
    if (!fileParam || file) return null
    const prefix = `${fileParam.replace(/\/+$/, '')}/`
    return files.some((f) => f.path.startsWith(prefix)) ? prefix.slice(0, -1) : null
  }, [fileParam, file, files])
  const lineParam = params.get('line')
  const highlight = useMemo(() => parseLineParam(lineParam), [lineParam])
  const folderParam = params.get('folder') ?? folderAsked
  const [revealPath, setRevealPath] = useState<string | null>(folderParam)
  useEffect(() => setRevealPath(folderParam), [folderParam])

  const { load, retry } = useFileContent(file)
  const [scrollKey, setScrollKey] = useState(0)
  const [explain, setExplain] = useState<{ path: string; range: LineRange } | null>(null)
  const explainRange = explain && explain.path === file?.path ? explain.range : null
  const [treeOpen, setTreeOpen] = useState(false)
  const [filesHidden, setFilesHidden] = useState(false)
  const railed = isDesktop && filesHidden
  const aboutRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (file) markSeen(fullName, `file:${file.path}`)
  }, [file, fullName, markSeen])

  const isSeen = useCallback((p: string) => Boolean(seenMap?.[`file:${p}`]), [seenMap])

  const update = useCallback(
    (patch: Record<string, string | null>, replace: boolean) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v == null) next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace },
      ),
    [setParams],
  )

  const selectFile = useCallback(
    (p: string) => {
      if (p === file?.path && !highlight) return
      update({ file: p, line: null, folder: null }, false)
      setTreeOpen(false)
    },
    [file, highlight, update],
  )

  const onSelectLines = useCallback((range: LineRange | null) => update({ line: formatLineParam(range) ?? null }, true), [update])

  const jumpToLine = useCallback(
    (line: number) => {
      update({ line: String(line) }, true)
      setScrollKey((k) => k + 1)
    },
    [update],
  )

  const onExplainLines = useCallback(
    (range: LineRange) => {
      if (!file) return
      setExplain({ path: file.path, range })
      requestAnimationFrame(() => {
        const el = aboutRef.current
        if (!el) return
        const behavior = reducedMotion ? 'auto' : 'smooth'
        // Wide screens: the panel scrolls by itself, so go to its top. Narrow screens: bring the panel into view.
        if (el.scrollHeight > el.clientHeight + 1) el.scrollTo?.({ top: 0, behavior })
        else el.scrollIntoView?.({ block: 'start', behavior })
      })
    },
    [file, reducedMotion],
  )

  const onRevealFolder = useCallback((folder: string) => {
    setRevealPath(folder)
    setTreeOpen(true)
    setFilesHidden(false)
  }, [])

  const info = VIEW_INFO.explore
  const gitRef = analysis.commitSha || analysis.ref
  const askHref = file ? href('ask', { q: `In \`${file.path}\`, ` }) : href('ask')

  return (
    <div className="flex shrink-0 flex-col gap-4 p-4 sm:p-6 xl:h-full xl:min-h-[620px]" data-testid="explorer-page">
      <ViewHeader emoji={info.emoji} title={info.label} hint={HINT} />

      <div
        className={cn(
          'grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-rows-[minmax(0,1fr)]',
          railed
            ? 'lg:grid-cols-[3.25rem_minmax(0,1fr)] xl:grid-cols-[3.25rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[3.25rem_minmax(0,1fr)_24rem]'
            : 'lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[17rem_minmax(0,1fr)_24rem]',
        )}
      >
        {railed ? (
          <FilesRail className="lg:h-[calc(100vh-11rem)] lg:max-h-[56rem] xl:h-auto xl:max-h-none" onShow={() => setFilesHidden(false)} />
        ) : (
          <FilesPane
            className="lg:h-[calc(100vh-11rem)] lg:max-h-[56rem] xl:h-auto xl:max-h-none"
            files={files}
            selectedPath={file?.path ?? null}
            onSelect={selectFile}
            revealPath={revealPath}
            isSeen={isSeen}
            collapsible={!isDesktop}
            open={treeOpen}
            onOpenChange={setTreeOpen}
            onHide={isDesktop ? () => setFilesHidden(true) : undefined}
          />
        )}

        {file && load ? (
          <CodePane
            className="h-[70vh] min-h-[22rem] lg:h-[calc(100vh-11rem)] lg:max-h-[56rem] xl:h-auto xl:max-h-none"
            file={file}
            load={load}
            onRetry={retry}
            owner={analysis.meta.owner}
            repo={analysis.meta.repo}
            gitRef={gitRef}
            isPrivate={analysis.meta.isPrivate}
            highlight={highlight}
            onSelectLines={onSelectLines}
            onExplainLines={onExplainLines}
            onRevealFolder={onRevealFolder}
            scrollKey={scrollKey}
          />
        ) : (
          <section className="flex min-h-[22rem] items-center rounded-2xl border border-line bg-surface shadow-sm xl:col-span-2" data-testid="code-pane">
            <EmptyState icon={folderAsked ? '📁' : '🔎'} title={folderAsked ? 'That’s a folder' : fileParam ? 'We couldn’t find that file' : 'Pick a file to start reading'}>
              {folderAsked ? (
                <>
                  <code className="font-mono text-[0.92em] text-ink">{folderAsked}</code> is a folder, so we’ve opened it in the file list. Pick
                  any file inside to read it.
                </>
              ) : fileParam ? (
                <>
                  There’s no file called <code className="font-mono text-[0.92em] text-ink">{fileParam}</code> in this version of the project. It
                  may have been moved or renamed. Pick another one from the list.
                </>
              ) : (
                'Choose any file from the list to see its code with plain-English notes alongside.'
              )}
            </EmptyState>
          </section>
        )}

        {file && (
          <AboutFilePanel
            ref={aboutRef}
            className="scroll-mt-4 lg:col-span-2 xl:col-span-1 xl:-mx-1 xl:min-h-0 xl:overflow-y-auto xl:px-1 xl:pb-1"
            file={file}
            allFiles={analysis.files}
            module={analysis.modules.find((m) => m.id === file.moduleId)}
            explainRange={explainRange}
            onCloseExplain={() => setExplain(null)}
            onOpenFile={selectFile}
            onJumpToLine={jumpToLine}
            onOpenModule={(id) => openExplain({ type: 'module', id })}
            askHref={askHref}
          />
        )}
      </div>
      {snapshot.treeTruncated && (
        <p className="text-xs text-ink-3">This project is so big that GitHub only sent part of its file list, so some files may be missing here.</p>
      )}
    </div>
  )
}
