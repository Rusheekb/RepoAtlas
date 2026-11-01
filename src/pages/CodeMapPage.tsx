import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CodeTreemap } from '@/components/graphs'
import { Segmented } from '@/components/ui'
import { CodeMapSidePanel } from '@/components/views/visual/CodeMapSidePanel'
import { biggestFiles, cleanFolder, filesUnder, folderExists, folderStats } from '@/components/views/visual/codemap'
import { useMarkSeen } from '@/components/views/visual/useSeen'
import { ViewHeader } from '@/components/views/visual/ViewHeader'
import { VIEW_INFO } from '@/core/labels'
import { githubTreeUrl } from '@/github'
import { useExplain } from '@/state/explain'
import { useAnalysis } from '@/state/repo'

type ColorBy = 'layer' | 'language'

const HINT = 'Every rectangle is a file. Bigger rectangles hold more code. Click a folder to zoom in.'

/**
 * "Where Code Lives": a zoomable treemap of every file, sized by lines of code and colored by kind of code or
 * language. The zoomed folder lives in ?path= so it survives reloads and the browser's Back button steps back out.
 */
export default function CodeMapPage() {
  const analysis = useAnalysis()
  const [params, setParams] = useSearchParams()
  const [colorBy, setColorBy] = useState<ColorBy>('layer')
  const openExplain = useExplain((s) => s.open)
  const selectedPath = useExplain((s) => (s.target?.type === 'file' ? s.target.path : null))
  const markSeen = useMarkSeen(analysis.meta.fullName)

  const files = useMemo(() => Object.values(analysis.files), [analysis.files])
  const requested = cleanFolder(params.get('path'))
  const rootPath = useMemo(() => (folderExists(files, requested) ? requested : ''), [files, requested])

  const onRootChange = useCallback(
    (path: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        const p = cleanFolder(path)
        if (p) next.set('path', p)
        else next.delete('path')
        return next
      }),
    [setParams],
  )

  const selectFile = useCallback(
    (path: string) => {
      openExplain({ type: 'file', path })
      markSeen(`file:${path}`)
    },
    [openExplain, markSeen],
  )

  const stats = useMemo(() => folderStats(files, rootPath), [files, rootPath])
  const biggest = useMemo(() => biggestFiles(filesUnder(files, rootPath), 15), [files, rootPath])
  const { owner, repo } = analysis.meta
  const githubUrl = githubTreeUrl(owner, repo, analysis.commitSha || analysis.ref, rootPath)
  const info = VIEW_INFO.codemap

  return (
    <div className="flex h-full min-h-[560px] shrink-0 flex-col gap-4 p-4 sm:p-6" data-testid="codemap-page">
      <ViewHeader
        emoji={info.emoji}
        title={info.label}
        hint={HINT}
        actions={
          <Segmented<ColorBy>
            label="Color the tiles by"
            size="sm"
            value={colorBy}
            onChange={setColorBy}
            options={[
              { value: 'layer', label: '🎨 Kind of code', title: 'Color each file by the job its code does' },
              { value: 'language', label: '🔤 Language', title: 'Color each file by its programming language' },
            ]}
          />
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <section
          aria-label="Map of the project’s files"
          className="flex min-h-[440px] min-w-0 flex-1 flex-col rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-4"
        >
          <CodeTreemap
            className="min-h-0 flex-1"
            files={files}
            colorBy={colorBy}
            rootPath={rootPath}
            onRootChange={onRootChange}
            selectedPath={selectedPath}
            onSelectFile={selectFile}
            languages={analysis.languages}
          />
        </section>
        <CodeMapSidePanel
          className="shrink-0 lg:w-80 xl:w-[22rem]"
          folder={rootPath}
          stats={stats}
          biggest={biggest}
          colorBy={colorBy}
          languages={analysis.languages}
          selectedPath={selectedPath}
          onSelectFile={selectFile}
          onExplainFolder={rootPath ? () => openExplain({ type: 'folder', path: rootPath }) : undefined}
          githubUrl={githubUrl}
        />
      </div>
    </div>
  )
}
