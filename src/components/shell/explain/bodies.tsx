import { useCallback, useMemo, type ReactNode } from 'react'
import { BookOpen, Code, FolderOpen, Map as MapIcon } from 'lucide-react'
import { AiAnswer } from '@/components/AiAnswer'
import { GlossaryText } from '@/components/Glossary'
import { conceptCategoryInfo, LayerBar, NeighborhoodGraph, TECH_ROWS, techRowOf } from '@/components/graphs'
import { Badge, Button, LayerBadge, Markdown } from '@/components/ui'
import { formatBytes, formatCompact, formatNumber, pluralize } from '@/core/format'
import { ROLE_INFO } from '@/core/labels'
import { basename } from '@/core/paths'
import type { AnalyzedFile, Concept, ExplainTarget, Layer, ModuleInfo, RepoAnalysis, ViewId } from '@/core/types'
import { githubFileUrl, githubTreeUrl } from '@/github'
import { describeFolder, getTech, getTerm } from '@/knowledge'
import { useExplain } from '@/state/explain'
import { ChipButton, GitHubMark, RichText } from '../bits'
import { useRepoNav } from '../hooks'
import { GLOSSARY_CATEGORY_INFO, SYMBOL_KIND_LABEL, TECH_CATEGORY_LABEL, TECH_IMPORTANCE_LABEL } from '../labels'
import { normalizeCodeRef, safeHttpUrl } from '../urls'
import { Analogy, Facts, FileRow, MiniStat, Missing, PanelHero, PanelSection, PathText } from './parts'

/** Short label for the panel's top bar ("Part of the project", "File" …). */
export function explainEyebrow(target: ExplainTarget): string {
  switch (target.type) {
    case 'module':
      return 'Part of the project'
    case 'file':
      return 'File'
    case 'folder':
      return 'Folder'
    case 'concept':
      return 'Key idea'
    case 'tech':
      return 'Technology'
    case 'term':
      return 'Word to know'
  }
}

/** Shared navigation helpers for the bodies: open another target in the panel, or leave for a view. */
function useExplainActions() {
  const open = useExplain((s) => s.open)
  const close = useExplain((s) => s.close)
  const { go } = useRepoNav()
  const goTo = useCallback(
    (view: ViewId, params?: Record<string, string | undefined>) => {
      close()
      go(view, params)
    },
    [close, go],
  )
  return {
    open,
    goTo,
    openFile: useCallback((path: string) => open({ type: 'file', path }), [open]),
    openModule: useCallback((id: string) => open({ type: 'module', id }), [open]),
  }
}

function useCodeLinks(analysis: RepoAnalysis, openFile: (path: string) => void) {
  const isCodeLink = useCallback((code: string) => normalizeCodeRef(code) in analysis.files, [analysis])
  const onCodeClick = useCallback(
    (code: string) => {
      const p = normalizeCodeRef(code)
      if (!(p in analysis.files)) return false
      openFile(p)
      return true
    },
    [analysis, openFile],
  )
  return { isCodeLink, onCodeClick }
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap gap-2">{children}</div>
}

/** A button-styled external link (for "Open on GitHub"). */
function GitHubButton({ href, label = 'Open on GitHub' }: { href: string; label?: string }) {
  const url = safeHttpUrl(href)
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-surface-2"
    >
      <GitHubMark className="size-3.5" />
      {label}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

/** Lines of code per layer for a set of files. */
function layerBreakdownOf(files: AnalyzedFile[]): Partial<Record<Layer, number>> {
  const out: Partial<Record<Layer, number>> = {}
  for (const f of files) out[f.layer] = (out[f.layer] ?? 0) + (f.lines ?? 0)
  return out
}

function ModuleChips({ items, onOpen, empty }: { items: { mod: ModuleInfo; weight: number }[]; onOpen: (id: string) => void; empty: string }) {
  if (!items.length) return <p className="text-sm text-ink-3">{empty}</p>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map(({ mod, weight }) => (
        <li key={mod.id} className="max-w-full">
          <ChipButton onClick={() => onOpen(mod.id)} title={`${mod.name}: ${pluralize(weight, 'link')} between files`}>
            <span aria-hidden>{mod.emoji}</span>
            <span className="truncate">{mod.name}</span>
            <span className="text-xs font-normal text-ink-3 tabular-nums">×{weight}</span>
          </ChipButton>
        </li>
      ))}
    </ul>
  )
}

// ─── Module ─────────────────────────────────────────────────────────────────

function ModuleBody({ analysis, id }: { analysis: RepoAnalysis; id: string }) {
  const { openFile, openModule, goTo } = useExplainActions()
  const mod = analysis.modules.find((m) => m.id === id)
  const byId = useMemo(() => new Map(analysis.modules.map((m) => [m.id, m])), [analysis.modules])
  const { uses, usedBy } = useMemo(() => {
    const pick = (ids: { id: string; weight: number }[]) =>
      ids
        .sort((a, b) => b.weight - a.weight)
        .flatMap(({ id: mid, weight }) => {
          const m = byId.get(mid)
          return m ? [{ mod: m, weight }] : []
        })
    return {
      uses: pick(analysis.moduleEdges.filter((e) => e.source === id && e.target !== id).map((e) => ({ id: e.target, weight: e.weight }))),
      usedBy: pick(analysis.moduleEdges.filter((e) => e.target === id && e.source !== id).map((e) => ({ id: e.source, weight: e.weight }))),
    }
  }, [analysis.moduleEdges, byId, id])

  if (!mod) return <Missing what="part of the project" />
  const keyFiles = mod.keyFiles.map((p) => analysis.files[p]).filter((f): f is AnalyzedFile => Boolean(f))
  const firstFile = mod.keyFiles[0] ?? mod.files[0]

  return (
    <>
      <PanelHero emoji={mod.emoji} title={mod.name} subtitle={mod.role}>
        <LayerBadge layer={mod.layer} />
        <PathText path={mod.path} className="ml-1" />
      </PanelHero>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        <GlossaryText text={mod.description} />
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniStat value={formatNumber(mod.fileCount)} label={mod.fileCount === 1 ? 'file' : 'files'} />
        <MiniStat value={formatCompact(mod.lines)} label="lines of code" />
        <MiniStat value={mod.languages[0] ?? '—'} label={mod.languages.length > 1 ? `+${mod.languages.length - 1} more languages` : 'language'} />
      </div>

      <ActionRow>
        <Button size="sm" variant="primary" icon={<MapIcon className="size-4" aria-hidden />} onClick={() => goTo('map', { select: mod.id })}>
          Show on map
        </Button>
        {firstFile && (
          <Button size="sm" icon={<FolderOpen className="size-4" aria-hidden />} onClick={() => goTo('explore', { file: firstFile, folder: mod.path || undefined })}>
            Browse its files
          </Button>
        )}
      </ActionRow>

      <PanelSection title="What kind of code it holds">
        <LayerBar breakdown={mod.layerBreakdown} />
      </PanelSection>

      {keyFiles.length > 0 && (
        <PanelSection title="Key files" count={keyFiles.length}>
          <ul className="-mx-2.5 space-y-0.5">
            {keyFiles.map((f) => (
              <FileRow key={f.path} file={f} onOpen={openFile} />
            ))}
          </ul>
        </PanelSection>
      )}

      <PanelSection title="Uses">
        <ModuleChips items={uses} onOpen={openModule} empty="It doesn’t rely on any other part of the project." />
      </PanelSection>
      <PanelSection title="Used by">
        <ModuleChips items={usedBy} onOpen={openModule} empty="No other part of the project relies on it directly." />
      </PanelSection>

      <AiAnswer className="mt-6" compact task={{ kind: 'module', moduleId: mod.id }} title="Claude’s explanation" cta="Explain this part in depth" />
    </>
  )
}

// ─── File ───────────────────────────────────────────────────────────────────

function FileBody({ analysis, path }: { analysis: RepoAnalysis; path: string }) {
  const { open, openFile, openModule, goTo } = useExplainActions()
  const file = analysis.files[path]
  const symbols = useMemo(
    () => (file ? [...file.symbols].sort((a, b) => Number(b.exported) - Number(a.exported) || a.line - b.line).slice(0, 12) : []),
    [file],
  )
  const techByPackage = useMemo(() => new Map(analysis.externalPackages.map((p) => [p.name, p.techId])), [analysis.externalPackages])
  if (!file) return <Missing what="file" />

  const role = file.isEntry ? ROLE_INFO.entry : (ROLE_INFO[file.role] ?? ROLE_INFO.other)
  const mod = analysis.modules.find((m) => m.id === file.moduleId)
  const { meta, commitSha } = analysis

  return (
    <>
      <PanelHero emoji={role.emoji} title={<span className="font-mono text-lg">{file.name}</span>} subtitle={`${role.label}${file.language ? ` · ${file.language}` : ''}`}>
        <LayerBadge layer={file.layer} />
        {file.isEntry && <Badge tone="brand">🚀 Starting point</Badge>}
      </PanelHero>
      <PathText path={file.path} className="mt-3 block" />
      <p className="mt-3 text-[15px] leading-relaxed text-ink">
        <GlossaryText text={file.summary} />
      </p>
      {file.isEntry && file.entryReason && (
        <p className="mt-3 rounded-xl bg-brand-soft px-4 py-2.5 text-sm text-ink">
          <span className="font-semibold text-brand-text">Why it’s a starting point: </span>
          <RichText text={file.entryReason} />
        </p>
      )}

      <ActionRow>
        <Button size="sm" variant="primary" icon={<Code className="size-4" aria-hidden />} onClick={() => goTo('explore', { file: file.path })}>
          Read the code
        </Button>
        <GitHubButton href={githubFileUrl(meta.owner, meta.repo, commitSha, file.path)} />
      </ActionRow>

      <PanelSection title="At a glance">
        <Facts
          items={[
            { label: 'What it is', value: role.description },
            ...(file.language ? [{ label: 'Language', value: file.language }] : []),
            { label: 'Size', value: file.lines != null ? `${formatNumber(file.lines)} lines` : formatBytes(file.size) },
            {
              label: 'Folder',
              value: file.dir ? (
                <button type="button" className="font-mono text-xs break-all text-brand-text hover:underline" onClick={() => open({ type: 'folder', path: file.dir })}>
                  {file.dir}
                </button>
              ) : (
                'The top level of the project'
              ),
            },
            ...(mod
              ? [
                  {
                    label: 'Part of',
                    value: (
                      <button type="button" className="text-left text-brand-text hover:underline" onClick={() => openModule(mod.id)}>
                        {mod.emoji} {mod.name}
                      </button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </PanelSection>

      {!file.fetched && (
        <p className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">
          To keep things quick, we didn’t download this file when reading the project, so some details are missing. “Read the code” fetches it for you.
        </p>
      )}

      <PanelSection title="How it connects">
        <NeighborhoodGraph file={file} allFiles={analysis.files} onSelect={openFile} maxPerSide={6} />
      </PanelSection>

      {symbols.length > 0 && (
        <PanelSection title="What it defines" count={file.symbols.length}>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {symbols.map((s) => (
              <li key={`${s.name}:${s.line}`}>
                <button
                  type="button"
                  onClick={() => goTo('explore', { file: file.path, line: String(s.line) })}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2"
                  title={s.signature ?? s.name}
                >
                  <span className="w-24 shrink-0 truncate text-[11px] font-medium text-ink-3">{SYMBOL_KIND_LABEL[s.kind] ?? s.kind}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{s.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">line {s.line}</span>
                </button>
              </li>
            ))}
          </ul>
          {file.symbols.length > symbols.length && (
            <p className="mt-2 text-xs text-ink-3">…and {pluralize(file.symbols.length - symbols.length, 'more thing')}. Open “Read the code” to see them all.</p>
          )}
        </PanelSection>
      )}

      {file.routes.length > 0 && (
        <PanelSection title="Web addresses it answers" count={file.routes.length}>
          <ul className="space-y-1">
            {file.routes.slice(0, 12).map((r) => (
              <li key={`${r.method}:${r.path}:${r.line}`} className="flex items-center gap-2 text-sm">
                <span className="w-14 shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold text-ink-2">{r.method}</span>
                <span className="min-w-0 truncate font-mono text-[13px] text-ink">{r.path}</span>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}

      {file.externalImports.length > 0 && (
        <PanelSection title="Outside packages it uses" count={file.externalImports.length}>
          <ul className="flex flex-wrap gap-1.5">
            {file.externalImports.slice(0, 16).map((name) => {
              const techId = techByPackage.get(name)
              return (
                <li key={name}>
                  {techId ? (
                    <ChipButton onClick={() => open({ type: 'tech', id: techId })} title="What is this?">
                      <span className="font-mono text-xs">{name}</span>
                    </ChipButton>
                  ) : (
                    <span className="inline-flex rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-xs text-ink-2">{name}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </PanelSection>
      )}

      <AiAnswer className="mt-6" compact task={{ kind: 'file', path: file.path }} title="Claude’s explanation" cta="Explain this file in depth" />
    </>
  )
}

// ─── Folder ─────────────────────────────────────────────────────────────────

function FolderBody({ analysis, path }: { analysis: RepoAnalysis; path: string }) {
  const { open, openFile, openModule, goTo } = useExplainActions()
  const clean = path.replace(/^\/+|\/+$/g, '')
  const files = useMemo(() => {
    const prefix = clean ? `${clean}/` : ''
    return Object.values(analysis.files).filter((f) => f.path.startsWith(prefix))
  }, [analysis.files, clean])
  const { subfolders, important, lines, breakdown } = useMemo(() => {
    const prefix = clean ? `${clean}/` : ''
    const subs = new Set<string>()
    for (const f of files) {
      const rest = f.path.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash > 0) subs.add(prefix + rest.slice(0, slash))
    }
    const ranked = [...files].sort((a, b) => b.importedBy.length - a.importedBy.length || (b.lines ?? 0) - (a.lines ?? 0)).slice(0, 6)
    return {
      subfolders: [...subs].sort(),
      important: ranked,
      lines: files.reduce((n, f) => n + (f.lines ?? 0), 0),
      breakdown: layerBreakdownOf(files),
    }
  }, [files, clean])

  if (!files.length) return <Missing what="folder" />
  const name = basename(clean) || analysis.meta.repo
  const role = describeFolder(basename(clean))
  const mod = analysis.modules.find((m) => m.path === clean) ?? analysis.modules.find((m) => m.path && clean.startsWith(`${m.path}/`))
  const { meta, commitSha } = analysis
  const first = important[0]?.path ?? files[0].path

  return (
    <>
      <PanelHero emoji={role?.emoji ?? '📁'} title={name} subtitle={role?.role ?? 'A folder of files'}>
        <PathText path={clean} />
      </PanelHero>
      {role && <p className="mt-4 text-[15px] leading-relaxed text-ink">{role.description}</p>}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniStat value={formatNumber(files.length)} label={files.length === 1 ? 'file' : 'files'} />
        <MiniStat value={formatCompact(lines)} label="lines of code" />
        <MiniStat value={formatNumber(subfolders.length)} label={subfolders.length === 1 ? 'folder inside' : 'folders inside'} />
      </div>

      <ActionRow>
        <Button size="sm" variant="primary" icon={<FolderOpen className="size-4" aria-hidden />} onClick={() => goTo('explore', { file: first, folder: clean || undefined })}>
          Browse its files
        </Button>
        <GitHubButton href={githubTreeUrl(meta.owner, meta.repo, commitSha, clean)} />
      </ActionRow>

      {mod && (
        <PanelSection title={mod.path === clean ? 'This folder is one of the main parts' : 'It belongs to'}>
          <ChipButton onClick={() => openModule(mod.id)}>
            <span aria-hidden>{mod.emoji}</span> {mod.name} <span className="text-xs font-normal text-ink-3">· {mod.role}</span>
          </ChipButton>
        </PanelSection>
      )}

      <PanelSection title="What kind of code it holds">
        <LayerBar breakdown={breakdown} />
      </PanelSection>

      {subfolders.length > 0 && (
        <PanelSection title="Folders inside" count={subfolders.length}>
          <ul className="flex flex-wrap gap-1.5">
            {subfolders.slice(0, 16).map((sub) => (
              <li key={sub}>
                <ChipButton onClick={() => open({ type: 'folder', path: sub })}>
                  <span aria-hidden>📁</span>
                  <span className="font-mono text-xs">{basename(sub)}</span>
                </ChipButton>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}

      <PanelSection title="Files to look at first">
        <ul className="-mx-2.5 space-y-0.5">
          {important.map((f) => (
            <FileRow key={f.path} file={f} onOpen={openFile} />
          ))}
        </ul>
      </PanelSection>

      <AiAnswer className="mt-6" compact task={{ kind: 'folder', path: clean }} title="Claude’s explanation" cta="Explain this folder in depth" />
    </>
  )
}

// ─── Concept ────────────────────────────────────────────────────────────────

function ConceptBody({ analysis, concept }: { analysis: RepoAnalysis; concept: Concept }) {
  const { openFile } = useExplainActions()
  const links = useCodeLinks(analysis, openFile)
  const category = conceptCategoryInfo(concept.category)
  const files = concept.files.map((p) => analysis.files[normalizeCodeRef(p)]).filter((f): f is AnalyzedFile => Boolean(f))
  const importance = Math.max(1, Math.min(5, Math.round(concept.importance || 1)))

  return (
    <>
      <PanelHero emoji={concept.emoji || '💡'} title={concept.name} subtitle={category.label}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink-2" title={category.description}>
          <span className="size-2.5 rounded-full" style={{ background: category.color }} aria-hidden />
          {category.label}
        </span>
        <span className="text-xs text-ink-3">
          <span aria-hidden>{'●'.repeat(importance)}</span>
          <span aria-hidden className="opacity-30">
            {'●'.repeat(5 - importance)}
          </span>
          <span className="sr-only">Importance: {importance} out of 5</span>
        </span>
      </PanelHero>
      <p className="mt-4 text-[15px] leading-relaxed font-medium text-ink">
        <GlossaryText text={concept.summary} />
      </p>
      {concept.explanation.trim() && (
        <Markdown className="mt-3" isCodeLink={links.isCodeLink} onCodeClick={links.onCodeClick}>
          {concept.explanation}
        </Markdown>
      )}
      {concept.analogy && <Analogy text={concept.analogy} />}

      {(files.length > 0 || concept.files.length > 0) && (
        <PanelSection title="Where it lives in the code" count={concept.files.length}>
          {files.length > 0 ? (
            <ul className="-mx-2.5 space-y-0.5">
              {files.slice(0, 10).map((f) => (
                <FileRow key={f.path} file={f} onOpen={openFile} />
              ))}
            </ul>
          ) : (
            <ul className="space-y-1">
              {concept.files.slice(0, 10).map((p) => (
                <li key={p}>
                  <PathText path={p} />
                </li>
              ))}
            </ul>
          )}
        </PanelSection>
      )}

      <AiAnswer className="mt-6" compact task={{ kind: 'concept', concept }} title="Claude’s explanation" cta="Go deeper with Claude" />
    </>
  )
}

// ─── Technology ─────────────────────────────────────────────────────────────

function TechBody({ analysis, id }: { analysis: RepoAnalysis; id: string }) {
  const { openFile } = useExplainActions()
  const item = analysis.techStack.find((t) => t.id === id)
  const known = getTech(id)
  const usedIn = useMemo(() => {
    const names = new Set(analysis.externalPackages.filter((p) => p.techId === id).map((p) => p.name))
    if (!names.size) return []
    return Object.values(analysis.files)
      .filter((f) => f.externalImports.some((n) => names.has(n)))
      .sort((a, b) => b.importedBy.length - a.importedBy.length)
  }, [analysis.externalPackages, analysis.files, id])

  const name = item?.name ?? known?.name
  if (!name) return <Missing what="technology" />
  const category = item?.category ?? known?.category ?? 'utility'
  const row = TECH_ROWS.find((r) => r.id === techRowOf(category))
  const description = item?.description || known?.description || ''
  const analogy = item?.analogy ?? known?.analogy
  const url = safeHttpUrl(item?.url ?? known?.url)
  const importance = item?.importance ?? known?.importance

  return (
    <>
      <PanelHero emoji={row?.emoji ?? '🧩'} title={name} subtitle={TECH_CATEGORY_LABEL[category] ?? 'Technology'}>
        {importance && <Badge tone={importance === 'core' ? 'brand' : 'neutral'}>{TECH_IMPORTANCE_LABEL[importance]}</Badge>}
        {row && <Badge>{row.label}</Badge>}
      </PanelHero>
      {description && (
        <p className="mt-4 text-[15px] leading-relaxed text-ink">
          <GlossaryText text={description} />
        </p>
      )}
      {analogy && <Analogy text={analogy} />}

      {item && item.evidence.length > 0 && (
        <PanelSection title="Where we spotted it">
          <ul className="space-y-1.5">
            {item.evidence.map((e) => (
              <li key={e} className="flex items-start gap-2 text-sm text-ink-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
                <span className="min-w-0 break-words">{e}</span>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}
      {!item && <p className="mt-4 text-sm text-ink-3">We didn’t spot this one in this project, but here’s what it is in general.</p>}

      {usedIn.length > 0 && (
        <PanelSection title="Files that use it" count={usedIn.length}>
          <ul className="-mx-2.5 space-y-0.5">
            {usedIn.slice(0, 6).map((f) => (
              <FileRow key={f.path} file={f} onOpen={openFile} />
            ))}
          </ul>
        </PanelSection>
      )}

      {url && (
        <ActionRow>
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-surface-2"
          >
            Visit its website
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </ActionRow>
      )}

      <AiAnswer className="mt-6" compact task={{ kind: 'tech', techId: id }} title="Claude’s explanation" cta="How does this project use it?" />
    </>
  )
}

// ─── Glossary term ──────────────────────────────────────────────────────────

function TermBody({ id }: { id: string }) {
  const { open, goTo } = useExplainActions()
  const term = getTerm(id)
  if (!term) return <Missing what="word" />
  const cat = GLOSSARY_CATEGORY_INFO[term.category]
  const related = (term.related ?? []).map((r) => getTerm(r)).filter((t): t is NonNullable<typeof t> => Boolean(t))

  return (
    <>
      <PanelHero emoji="📘" title={term.term} subtitle={cat ? `${cat.emoji} ${cat.label}` : undefined} />
      <p className="mt-4 text-[15px] leading-relaxed font-medium text-ink">{term.short}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{term.long}</p>
      {term.analogy && <Analogy text={term.analogy} />}
      {term.aliases.length > 0 && (
        <p className="mt-4 text-sm text-ink-3">
          Also written as: <span className="text-ink-2">{term.aliases.slice(0, 6).join(', ')}</span>
        </p>
      )}

      {related.length > 0 && (
        <PanelSection title="Related words">
          <ul className="flex flex-wrap gap-1.5">
            {related.map((r) => (
              <li key={r.id}>
                <ChipButton onClick={() => open({ type: 'term', id: r.id })} title={r.short}>
                  {r.term}
                </ChipButton>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}

      <ActionRow>
        <Button size="sm" icon={<BookOpen className="size-4" aria-hidden />} onClick={() => goTo('glossary', { term: term.id })}>
          See it in the glossary
        </Button>
      </ActionRow>

      <AiAnswer className="mt-6" compact task={{ kind: 'term', termId: term.id }} title="Claude’s explanation" cta="Explain it using this project" />
    </>
  )
}

/** The panel's content for any target. */
export function ExplainBody({ analysis, target }: { analysis: RepoAnalysis; target: ExplainTarget }) {
  switch (target.type) {
    case 'module':
      return <ModuleBody analysis={analysis} id={target.id} />
    case 'file':
      return <FileBody analysis={analysis} path={normalizeCodeRef(target.path)} />
    case 'folder':
      return <FolderBody analysis={analysis} path={target.path} />
    case 'concept':
      return <ConceptBody analysis={analysis} concept={target.concept} />
    case 'tech':
      return <TechBody analysis={analysis} id={target.id} />
    case 'term':
      return <TermBody id={target.id} />
  }
}

/** A stable key per target, so the body (and its AI answer) resets when the target changes. */
export function explainTargetKey(target: ExplainTarget): string {
  switch (target.type) {
    case 'module':
      return `module:${target.id}`
    case 'file':
      return `file:${target.path}`
    case 'folder':
      return `folder:${target.path}`
    case 'concept':
      return `concept:${target.concept.id}:${target.concept.name}`
    case 'tech':
      return `tech:${target.id}`
    case 'term':
      return `term:${target.id}`
  }
}

