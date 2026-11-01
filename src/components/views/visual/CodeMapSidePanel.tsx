import { useId, useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, Info } from 'lucide-react'
import { LayerBar } from '@/components/graphs'
import { Button } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { formatBytes, formatCompact, formatNumber, pluralize } from '@/core/format'
import { LAYER_INFO } from '@/core/labels'
import type { AnalyzedFile, LanguageStat } from '@/core/types'
import { safeColor } from '@/components/graphs/bars'
import type { FolderStats } from './codemap'

export interface CodeMapSidePanelProps {
  /** Folder being viewed ('' = whole project). */
  folder: string
  stats: FolderStats
  biggest: AnalyzedFile[]
  colorBy: 'layer' | 'language'
  languages: LanguageStat[]
  selectedPath?: string | null
  onSelectFile: (path: string) => void
  /** Explain the folder being viewed (not offered for the whole project). */
  onExplainFolder?: () => void
  /** "Open on GitHub" link for the folder. */
  githubUrl?: string | null
  className?: string
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2">
      <dt className="truncate text-[11px] font-medium text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate text-lg font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * The code map's companion panel: totals for the folder being viewed and its biggest files.
 * On phones it starts collapsed behind a "Folder details" button so the map gets the screen.
 */
export function CodeMapSidePanel({
  folder,
  stats,
  biggest,
  colorBy,
  languages,
  selectedPath,
  onSelectFile,
  onExplainFolder,
  githubUrl,
  className,
}: CodeMapSidePanelProps) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const folderName = folder ? folder.slice(folder.lastIndexOf('/') + 1) : ''
  const colorOfLanguage = useMemo(() => new Map(languages.map((l) => [l.name, l.color])), [languages])
  const unit = biggest.some((f) => f.lines != null) ? 'lines' : 'size'
  const max = biggest.reduce((m, f) => Math.max(m, unit === 'lines' ? (f.lines ?? 0) : f.size), 1)
  const languageColor = (name: string | null) => safeColor(name ? colorOfLanguage.get(name) : null)
  const swatch = (f: AnalyzedFile): { color: string; label: string } => {
    if (colorBy === 'language') return { color: languageColor(f.language), label: f.language ?? 'Not code' }
    const info = LAYER_INFO[f.layer] ?? LAYER_INFO.other
    return { color: info.color, label: info.label }
  }

  return (
    <aside aria-label="Folder details" className={cn('flex min-h-0 flex-col gap-3', className)}>
      <button
        type="button"
        className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm font-semibold text-ink shadow-sm lg:hidden"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
      >
        <span>📊 Folder details &amp; biggest files</span>
        <ChevronDown className={cn('size-4 text-ink-3 motion-safe:transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      <div id={contentId} className={cn('min-h-0 flex-col gap-3 lg:flex lg:overflow-y-auto', open ? 'flex' : 'hidden')}>
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm" aria-labelledby={`${contentId}-folder`}>
          <h2 id={`${contentId}-folder`} className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
            <span aria-hidden>{folder ? '📁' : '🏠'}</span>
            <span className="truncate">{folder ? `${folderName}/` : 'The whole project'}</span>
          </h2>
          {folder.includes('/') && (
            <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3" title={folder}>
              {folder}
            </p>
          )}
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Files" value={formatCompact(stats.files)} />
            <Stat label={stats.lines > 0 ? 'Lines' : 'Size'} value={stats.lines > 0 ? formatCompact(stats.lines) : formatBytes(stats.bytes)} />
            <Stat label="Folders" value={formatCompact(stats.folders)} />
          </dl>
          {stats.readFiles < stats.files && (
            <p className="mt-2 text-[11px] text-ink-3">
              We read {pluralize(stats.readFiles, 'file')} of {formatNumber(stats.files)} here; the rest are sized by how big they are on disk.
            </p>
          )}
          {Object.keys(stats.layerBreakdown).length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-xs font-semibold text-ink-2">What kind of code is here</h3>
              <LayerBar breakdown={stats.layerBreakdown} showLegend={false} />
            </div>
          )}
          {stats.languages.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-xs font-semibold text-ink-2">Languages</h3>
              <ul className="space-y-1 text-xs">
                {stats.languages.slice(0, 4).map((l) => (
                  <li key={l.name} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-ink">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: languageColor(l.name) }} aria-hidden />
                      <span className="truncate">{l.name}</span>
                    </span>
                    <span className="shrink-0 text-ink-3 tabular-nums">{pluralize(l.files, 'file')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(onExplainFolder || githubUrl) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {onExplainFolder && (
                <Button size="sm" variant="subtle" onClick={onExplainFolder} icon={<Info className="size-4" aria-hidden />}>
                  What’s in this folder?
                </Button>
              )}
              {githubUrl && (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  On GitHub <ExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm" aria-labelledby={`${contentId}-big`}>
          <h2 id={`${contentId}-big`} className="text-sm font-semibold text-ink">
            <span aria-hidden>🏋️ </span>Biggest files{folder ? ' here' : ''}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">Big files often hold the most important — or the most tangled — code.</p>
          {biggest.length === 0 ? (
            <p className="mt-3 text-sm text-ink-2">No files with code to measure here.</p>
          ) : (
            <ol className="mt-3 space-y-0.5">
              {biggest.map((f, i) => {
                const value = unit === 'lines' ? (f.lines ?? 0) : f.size
                const s = swatch(f)
                const selected = selectedPath === f.path
                return (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() => onSelectFile(f.path)}
                      aria-current={selected ? 'true' : undefined}
                      className={cn(
                        'group w-full rounded-lg px-2 py-1.5 text-left',
                        selected ? 'bg-brand-soft' : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="w-5 shrink-0 text-right text-[11px] text-ink-3 tabular-nums" aria-hidden>
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink group-hover:text-brand-text" title={f.path}>
                            {f.name}
                          </span>
                          <span className="block truncate text-[11px] text-ink-3">{f.dir || 'top level'}</span>
                        </span>
                        <span className="shrink-0 text-xs text-ink-2 tabular-nums">
                          {unit === 'lines' ? `${formatNumber(value)} lines` : formatBytes(value)}
                        </span>
                      </span>
                      <span className="mt-1 ml-7 flex items-center gap-1.5">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${Math.max(3, Math.round((value / max) * 100))}%`, background: s.color }}
                          />
                        </span>
                        <span className="sr-only">{s.label}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </aside>
  )
}
