import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Check, ChevronDown, Clock, ExternalLink as ExternalIcon, Info, Scale, Star, X } from 'lucide-react'
import { Link } from 'react-router'
import { AiAnswer } from '@/components/AiAnswer'
import { GlossaryText } from '@/components/Glossary'
import { LanguageBar, LayerBar, MiniLayerBar, TechStackDiagram } from '@/components/graphs'
import { Callout, GitHubMark, OutboundLink, PageSection, RichText, StatTile } from '@/components/shell/bits'
import { useRepoNav } from '@/components/shell/hooks'
import { markdownPreview } from '@/components/shell/text'
import { makeReadmeResolver, normalizeCodeRef, safeHttpUrl } from '@/components/shell/urls'
import { Button, Card, Markdown } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { formatCompact, formatDate, formatNumber, pluralize } from '@/core/format'
import { LAYER_INFO, PROJECT_KIND_INFO, ROLE_INFO, VIEW_INFO } from '@/core/labels'
import type { Layer, LearningStep, ModuleInfo, RepoAnalysis } from '@/core/types'
import { githubFileUrl } from '@/github'
import { useExplain } from '@/state/explain'
import { useProgress } from '@/state/progress'
import { useAnalysis } from '@/state/repo'
import { useSettings } from '@/state/settings'

const MODULES_SHOWN = 9
const README_PREVIEW_CHARS = 1400

/** Clickable `path` mentions in markdown: known files open in the explain panel. */
function useCodeLinks(analysis: RepoAnalysis) {
  const open = useExplain((s) => s.open)
  const isCodeLink = useCallback((code: string) => normalizeCodeRef(code) in analysis.files, [analysis])
  const onCodeClick = useCallback(
    (code: string) => {
      const path = normalizeCodeRef(code)
      if (!(path in analysis.files)) return false
      open({ type: 'file', path })
      return true
    },
    [analysis, open],
  )
  return { isCodeLink, onCodeClick }
}

/** Sum every module's lines-per-layer. */
function sumLayers(modules: ModuleInfo[]): Partial<Record<Layer, number>> {
  const out: Partial<Record<Layer, number>> = {}
  for (const m of modules) {
    for (const [layer, n] of Object.entries(m.layerBreakdown) as [Layer, number | undefined][]) {
      if (n) out[layer] = (out[layer] ?? 0) + n
    }
  }
  return out
}

function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2" title={title}>
      {children}
    </span>
  )
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function Hero({ analysis }: { analysis: RepoAnalysis }) {
  const { meta, projectKind: kind, stats } = analysis
  const info = PROJECT_KIND_INFO[kind.id] ?? PROJECT_KIND_INFO.unknown
  const language = meta.primaryLanguage ?? analysis.languages[0]?.name ?? null
  const homepage = safeHttpUrl(meta.homepage)
  const githubUrl = safeHttpUrl(meta.htmlUrl) ?? `https://github.com/${encodeURIComponent(meta.owner)}/${encodeURIComponent(meta.repo)}`
  const license = meta.license === 'NOASSERTION' ? 'Custom license' : meta.license ? `${meta.license} license` : null

  return (
    <header className="rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8" data-testid="overview-hero">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-4xl leading-none" aria-hidden>
          {kind.emoji || info.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-text">{kind.label || info.label}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight break-words text-ink">
            <span className="font-normal text-ink-3">{meta.owner} / </span>
            {meta.repo}
          </h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-2">
            <GlossaryText text={kind.description || info.description} />
          </p>
          {meta.description && (
            <blockquote className="mt-4 max-w-3xl border-l-[3px] border-brand pl-4">
              <p className="text-[15px] leading-relaxed text-ink">“{meta.description}”</p>
              <footer className="mt-1 text-xs text-ink-3">How the authors describe it on GitHub</footer>
            </blockquote>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {language && <Chip title="The programming language most of the code is written in">🗣️ Mostly {language}</Chip>}
            {license && (
              <Chip title="The rules for using and sharing this code">
                <Scale className="size-3.5" aria-hidden /> {license}
              </Chip>
            )}
            <Chip title={`${formatNumber(meta.stars)} people starred this project on GitHub`}>
              <Star className="size-3.5 text-warn-text" aria-hidden /> {formatCompact(meta.stars)} stars
            </Chip>
            {meta.pushedAt && (
              <Chip title="When someone last changed the code">
                <Clock className="size-3.5" aria-hidden /> Updated {formatDate(meta.pushedAt)}
              </Chip>
            )}
            {meta.archived && <Chip title="The authors have stopped working on it">📦 Archived</Chip>}
            {meta.isFork && <Chip title="A copy of another project, possibly with changes">🍴 A copy (fork)</Chip>}
            {meta.isPrivate && <Chip>🔒 Private</Chip>}
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-brand-text hover:underline"
            >
              <GitHubMark className="size-3.5" /> View on GitHub
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            {homepage && (
              <OutboundLink href={homepage} className="px-1 text-xs">
                Project website
              </OutboundLink>
            )}
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile value={formatNumber(stats.totalFiles)} label="files" hint="Every document in the project, code or not" />
        <StatTile
          value={formatCompact(stats.totalLines)}
          label="lines of code read"
          hint={`We read ${formatNumber(stats.analyzedFiles)} of ${formatNumber(stats.totalFiles)} files`}
        />
        <StatTile value={formatNumber(analysis.modules.length)} label="main parts" hint="Groups of files that work together" />
        <StatTile value={formatNumber(analysis.techStack.length)} label="tools & toolkits" hint="Languages, frameworks and helpers we recognized" />
        <StatTile
          value={formatNumber(stats.testFiles)}
          label="test files"
          hint="Automatic checks that make sure the code keeps working"
          className="max-lg:col-span-2 max-sm:col-span-2 sm:max-lg:col-span-1"
        />
      </div>
    </header>
  )
}

function WelcomeNote() {
  const seenIntro = useSettings((s) => s.seenIntro)
  const set = useSettings((s) => s.set)
  if (seenIntro) return null
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-transparent bg-brand-soft px-5 py-4" role="note">
      <span className="text-2xl leading-none" aria-hidden>
        👋
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
        <p className="font-semibold">Welcome! This page is the big picture.</p>
        <p className="mt-0.5 text-ink-2">
          Follow <span className="font-medium text-ink">your learning path</span> one step at a time. Words with a{' '}
          <span className="underline decoration-ink-3 decoration-dotted underline-offset-[3px]">dotted underline</span> explain themselves when you point
          at them, and anything you click opens a plain-English explanation.
        </p>
      </div>
      <button
        type="button"
        onClick={() => set({ seenIntro: true })}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-brand-text hover:bg-surface/60"
      >
        <X className="size-4" aria-hidden /> Got it
      </button>
    </div>
  )
}

// ─── Learning path ──────────────────────────────────────────────────────────

function LearningPath({ analysis, onReadme, onBigPicture }: { analysis: RepoAnalysis; onReadme: () => void; onBigPicture: () => void }) {
  const repoKey = analysis.meta.fullName.toLowerCase()
  const seen = useProgress((s) => s.seen[repoKey])
  const markSeen = useProgress((s) => s.markSeen)
  const open = useExplain((s) => s.open)
  const { go } = useRepoNav()
  const steps = analysis.learningPath

  const isDone = useCallback(
    (step: LearningStep) => {
      if (seen?.[`step:${step.id}`]) return true
      if (step.target.type === 'file') return Boolean(seen?.[`file:${step.target.path}`])
      if (step.target.type === 'module') return Boolean(seen?.[`module:${step.target.id}`])
      return false
    },
    [seen],
  )

  // Opening a step's file or part some other way still ticks it off (and counts towards overall progress).
  useEffect(() => {
    for (const step of steps) if (isDone(step) && !seen?.[`step:${step.id}`]) markSeen(analysis.meta.fullName, `step:${step.id}`)
  }, [steps, isDone, seen, markSeen, analysis.meta.fullName])

  const doneCount = steps.filter(isDone).length
  const minutes = steps.reduce((n, s) => n + (isDone(s) ? 0 : s.minutes), 0)

  const follow = (step: LearningStep) => {
    markSeen(analysis.meta.fullName, `step:${step.id}`)
    const t = step.target
    if (t.type === 'readme') onReadme()
    else if (t.type === 'view') {
      if (t.view === 'overview') onBigPicture()
      else go(t.view)
    } else if (t.type === 'file') go('explore', { file: t.path })
    else open({ type: 'module', id: t.id })
  }

  if (!steps.length) return null
  const percent = Math.round((doneCount / steps.length) * 100)

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <p className="font-semibold text-ink">
            {doneCount} of {steps.length} steps done
          </p>
          <p className="text-xs text-ink-3">{minutes > 0 ? `About ${minutes} min to go` : 'All done. Well done!'}</p>
        </div>
        <div
          role="progressbar"
          aria-label="Learning path progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
        >
          <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ol className="p-2" aria-label="Learning path steps">
        {steps.map((step, i) => {
          const done = isDone(step)
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => follow(step)}
                className="group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                    done ? 'border-transparent bg-brand text-brand-ink' : 'border-line-strong bg-surface text-ink-2 group-hover:border-brand',
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-semibold', done ? 'text-ink-2' : 'text-ink group-hover:text-brand-text')}>
                    {step.title}
                    <span className="sr-only">{done ? ' (done)' : ''}</span>
                  </span>
                  <RichText text={step.description} className="mt-0.5 line-clamp-3 block text-[13px] leading-snug text-ink-2" />
                  <span className="mt-1 block text-[11px] font-medium text-ink-3">About {step.minutes} min</span>
                </span>
                <ArrowRight className="mt-1 size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </button>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

// ─── Main parts ─────────────────────────────────────────────────────────────

function ModuleCard({ mod, seen, onOpen }: { mod: ModuleInfo; seen: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col rounded-2xl border border-line bg-surface p-5 text-left shadow-sm transition hover:-translate-y-px hover:border-line-strong hover:shadow-md motion-reduce:hover:translate-y-0"
    >
      <span className="flex w-full items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-2xl leading-none" aria-hidden>
          {mod.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink group-hover:text-brand-text">{mod.name}</span>
          <span className="block truncate text-xs text-ink-3">{mod.role && mod.role !== mod.name ? mod.role : LAYER_INFO[mod.layer].label}</span>
        </span>
        {seen && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-good-text">
            <Check className="size-3" aria-hidden /> Seen
          </span>
        )}
      </span>
      <RichText text={mod.description} className="mt-3 line-clamp-3 block text-sm leading-relaxed text-ink-2" />
      <span className="mt-auto block w-full pt-4">
        <MiniLayerBar breakdown={mod.layerBreakdown} />
        <span className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-3">
          <span>
            {pluralize(mod.fileCount, 'file')} · {formatCompact(mod.lines)} lines
          </span>
          {mod.languages[0] && <span className="truncate">{mod.languages.slice(0, 2).join(', ')}</span>}
        </span>
      </span>
    </button>
  )
}

function MainParts({ analysis }: { analysis: RepoAnalysis }) {
  const [showAll, setShowAll] = useState(false)
  const open = useExplain((s) => s.open)
  const { href } = useRepoNav()
  const seen = useProgress((s) => s.seen[analysis.meta.fullName.toLowerCase()])
  const modules = analysis.modules
  const shown = showAll ? modules : modules.slice(0, MODULES_SHOWN)
  if (!modules.length) return null
  return (
    <PageSection
      id="main-parts"
      emoji="🧩"
      title="The main parts"
      subtitle={`The project is split into ${pluralize(modules.length, 'main part')}. Click one to see what it does and what it works with.`}
      actions={
        <Link to={href('map')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-text hover:underline">
          See how they connect <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((m) => (
          <li key={m.id}>
            <ModuleCard mod={m} seen={Boolean(seen?.[`module:${m.id}`])} onOpen={() => open({ type: 'module', id: m.id })} />
          </li>
        ))}
      </ul>
      {modules.length > MODULES_SHOWN && (
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
            {showAll ? 'Show fewer' : `Show all ${modules.length} parts`}
          </Button>
        </div>
      )}
    </PageSection>
  )
}

// ─── Where it starts ────────────────────────────────────────────────────────

function WhereItStarts({ analysis }: { analysis: RepoAnalysis }) {
  const { href } = useRepoNav()
  const entries = analysis.entryPoints.map((p) => analysis.files[p]).filter(Boolean).slice(0, 5)
  const hubs = analysis.hubs
    .map((p) => analysis.files[p])
    .filter((f) => f && !analysis.entryPoints.slice(0, 5).includes(f.path))
    .slice(0, 5)
  return (
    <PageSection
      id="where-it-starts"
      emoji="🚀"
      title="Where it starts"
      subtitle="A program begins running at one particular file, like the first domino in a row. These are our best guesses, with the reason for each."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-2">
          <h3 className="px-3 pt-3 pb-1 text-sm font-semibold text-ink">Starting points</h3>
          {entries.length ? (
            <ul>
              {entries.map((f) => (
                <li key={f.path}>
                  <Link to={href('explore', { file: f.path })} className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2">
                    <span className="mt-0.5 text-lg leading-none" aria-hidden>
                      {ROLE_INFO.entry.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[13px] font-medium break-all text-ink group-hover:text-brand-text">{f.path}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">
                        <RichText text={f.entryReason || f.summary} />
                      </span>
                    </span>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 pb-3 text-sm text-ink-2">We couldn’t spot a clear starting point. That’s normal for collections of documents or settings.</p>
          )}
        </Card>
        {hubs.length > 0 && (
          <Card className="p-2">
            <h3 className="px-3 pt-3 pb-1 text-sm font-semibold text-ink">Files everything else leans on</h3>
            <ul>
              {hubs.map((f) => (
                <li key={f.path}>
                  <Link to={href('explore', { file: f.path })} className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2">
                    <span className="mt-0.5 text-lg leading-none" aria-hidden>
                      {(ROLE_INFO[f.role] ?? ROLE_INFO.other).emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[13px] font-medium break-all text-ink group-hover:text-brand-text">{f.path}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">Used by {pluralize(f.importedBy.length, 'other file')}</span>
                    </span>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </PageSection>
  )
}

// ─── README ─────────────────────────────────────────────────────────────────

function Readme({ analysis, open, onToggle }: { analysis: RepoAnalysis; open: boolean; onToggle: () => void }) {
  const readme = analysis.readme
  const links = useCodeLinks(analysis)
  const contentId = useId()
  const resolveUrl = useMemo(
    () => (readme ? makeReadmeResolver({ owner: analysis.meta.owner, repo: analysis.meta.repo, sha: analysis.commitSha, readmePath: readme.path }) : undefined),
    [readme, analysis.meta.owner, analysis.meta.repo, analysis.commitSha],
  )
  const preview = useMemo(() => (readme ? markdownPreview(readme.content, README_PREVIEW_CHARS) : null), [readme])
  if (!readme || !preview) return null
  const text = open ? readme.content : preview.text
  const collapsible = preview.truncated

  return (
    <PageSection id="readme" emoji="📖" title="The welcome note" subtitle={<>What the authors wrote to introduce their project, from <code className="font-mono text-[13px]">{readme.path}</code>.</>}>
      <Card className="overflow-hidden">
        <div id={contentId} className="relative px-6 py-6 sm:px-8">
          <Markdown resolveUrl={resolveUrl} isCodeLink={links.isCodeLink} onCodeClick={links.onCodeClick}>
            {text}
          </Markdown>
          {collapsible && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-surface to-transparent" aria-hidden />}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 sm:px-7">
          {collapsible ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls={contentId}
              iconRight={<ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />}
            >
              {open ? 'Show less' : 'Read the whole note'}
            </Button>
          ) : (
            <span />
          )}
          <a
            href={githubFileUrl(analysis.meta.owner, analysis.meta.repo, analysis.commitSha, readme.path)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink hover:underline"
          >
            <ExternalIcon className="size-3.5" aria-hidden /> Open on GitHub
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </Card>
    </PageSection>
  )
}

function NextStep() {
  const { href } = useRepoNav()
  const info = VIEW_INFO.map
  return (
    <Link
      to={href('map')}
      className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:border-line-strong hover:shadow-md"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-2xl leading-none" aria-hidden>
        {info.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold tracking-wide text-ink-3 uppercase">Ready for the next step?</span>
        <span className="block text-base font-semibold text-ink group-hover:text-brand-text">{info.label}</span>
        <span className="block text-sm text-ink-2">{info.description}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-text" aria-hidden />
    </Link>
  )
}

/** "The Big Picture": what the project is, how it's organized, what it's built with and where to start. */
export default function OverviewPage() {
  const analysis = useAnalysis()
  const open = useExplain((s) => s.open)
  const target = useExplain((s) => s.target)
  const markSeen = useProgress((s) => s.markSeen)
  const links = useCodeLinks(analysis)
  const [readmeOpen, setReadmeOpen] = useState(false)
  const layers = useMemo(() => sumLayers(analysis.modules), [analysis.modules])

  const scrollTo = (id: string) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }
  const showReadme = () => {
    setReadmeOpen(true)
    markSeen(analysis.meta.fullName, 'step:readme')
    window.setTimeout(() => scrollTo('readme'), 30)
  }
  const toggleReadme = () => {
    if (!readmeOpen) markSeen(analysis.meta.fullName, 'step:readme')
    setReadmeOpen((o) => !o)
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-12 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-4">
        <Hero analysis={analysis} />
        <WelcomeNote />
      </div>

      <div className="grid items-start gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        <PageSection id="plain-english" emoji="💬" title="In plain English" subtitle="What this project is and how it’s put together, written for humans.">
          <Card className="px-6 py-6 sm:px-8 sm:py-7">
            <Markdown isCodeLink={links.isCodeLink} onCodeClick={links.onCodeClick}>
              {analysis.overview}
            </Markdown>
          </Card>
          <AiAnswer
            className="mt-4"
            task={{ kind: 'overview' }}
            title="Claude’s explanation"
            cta="Explain this project in depth"
            pitch="Want the full story? Claude will read the code and explain what this project does, how it works and why it’s built this way, at your reading level."
          />
        </PageSection>

        <PageSection id="learning-path" emoji="🧭" title="Your learning path" subtitle="A suggested order. Each step ticks off as you go.">
          <LearningPath analysis={analysis} onReadme={showReadme} onBigPicture={() => scrollTo('plain-english')} />
        </PageSection>
      </div>

      <PageSection
        id="built-with"
        emoji="🧰"
        title="What it’s built with"
        subtitle="The languages, toolkits and helpers this project relies on, from what people see down to the tools behind the scenes. Click any of them to learn what it is."
      >
        <TechStackDiagram tech={analysis.techStack} onSelect={(id) => open({ type: 'tech', id })} selectedId={target?.type === 'tech' ? target.id : null} />
      </PageSection>

      <PageSection id="made-of" emoji="🎨" title="What the code is made of" subtitle="The same colors are used on every map in RepoAtlas, so you can always tell what kind of code you’re looking at.">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-ink">By kind of code</h3>
            <p className="mt-0.5 mb-4 text-xs text-ink-3">Measured in lines of code</p>
            <LayerBar breakdown={layers} />
          </Card>
          <Card className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-ink">By programming language</h3>
            <p className="mt-0.5 mb-4 text-xs text-ink-3">Measured by file size</p>
            <LanguageBar languages={analysis.languages} />
          </Card>
        </div>
      </PageSection>

      <MainParts analysis={analysis} />
      <WhereItStarts analysis={analysis} />
      <Readme analysis={analysis} open={readmeOpen} onToggle={toggleReadme} />

      {analysis.warnings.length > 0 && (
        <Callout icon={<Info className="size-4" aria-hidden />} title="Good to know about this summary">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {analysis.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}

      <NextStep />
    </div>
  )
}
