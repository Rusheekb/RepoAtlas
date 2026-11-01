import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Search, Sparkles, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { ChipButton } from '@/components/shell/bits'
import { GLOSSARY_CATEGORY_INFO, GLOSSARY_CATEGORY_ORDER } from '@/components/shell/labels'
import { EmptyState } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import type { GlossaryCategory, GlossaryTerm } from '@/core/types'
import { GLOSSARY, getTerm } from '@/knowledge'
import { useExplain } from '@/state/explain'
import { useAnalysis } from '@/state/repo'

type CategoryFilter = GlossaryCategory | 'all'

const PROJECT_WORDS_SHOWN = 12
const HIGHLIGHT_MS = 2600

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

function letterOf(term: string): string {
  const c = normalize(term).charAt(0).toUpperCase()
  return c >= 'A' && c <= 'Z' ? c : '#'
}

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

function TermCard({
  term,
  inProject,
  highlighted,
  onJump,
  onExplain,
}: {
  term: GlossaryTerm
  inProject: boolean
  highlighted: boolean
  onJump: (id: string) => void
  onExplain: (id: string) => void
}) {
  const cat = GLOSSARY_CATEGORY_INFO[term.category]
  const related = (term.related ?? []).map((id) => getTerm(id)).filter((t): t is GlossaryTerm => Boolean(t))
  const headingId = `term-${term.id}-title`
  return (
    <article
      id={`term-${term.id}`}
      aria-labelledby={headingId}
      tabIndex={-1}
      data-highlighted={highlighted || undefined}
      className={cn(
        'flex scroll-mt-48 flex-col rounded-2xl border bg-surface p-5 shadow-sm transition-[box-shadow,border-color] duration-500 focus-visible:outline-none',
        highlighted ? 'border-brand ring-4 ring-brand/25' : 'border-line',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="text-lg font-semibold tracking-tight text-ink">
          {term.term}
        </h3>
        <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-ink-3">
          <span aria-hidden>{cat?.emoji}</span>
          {cat?.label ?? term.category}
        </span>
      </div>
      {inProject && <p className="mt-0.5 text-xs font-medium text-brand-text">You’ll meet this word in this project</p>}
      <p className="mt-2 text-[15px] leading-relaxed font-medium text-ink">{term.short}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{term.long}</p>
      {term.analogy && (
        <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed text-ink">
          <span aria-hidden>💡 </span>
          {term.analogy}
        </p>
      )}
      <div className="mt-auto pt-4">
        {related.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-ink-3">Related:</span>
            {related.map((r) => (
              <ChipButton key={r.id} onClick={() => onJump(r.id)} title={r.short} className="px-2.5 py-0.5 text-xs">
                {r.term}
              </ChipButton>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => onExplain(term.id)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-text hover:underline"
        >
          <Sparkles className="size-3.5" aria-hidden />
          How is it used in this project?
        </button>
      </div>
    </article>
  )
}

/** Every glossary word, searchable, with the words this project uses first. ?term=id jumps to (and highlights) one. */
export default function GlossaryPage() {
  const analysis = useAnalysis()
  const openExplain = useExplain((s) => s.open)
  const [searchParams, setSearchParams] = useSearchParams()
  const termParam = searchParams.get('term')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [highlight, setHighlight] = useState<string | null>(null)
  const [showAllProject, setShowAllProject] = useState(false)
  const pendingScroll = useRef<string | null>(null)
  const searchId = useId()

  const sorted = useMemo(() => [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' })), [])
  const haystack = useMemo(
    () => new Map(GLOSSARY.map((t) => [t.id, normalize([t.term, ...t.aliases, t.short, t.long, t.analogy ?? ''].join(' '))])),
    [],
  )
  const projectIds = useMemo(() => new Set(analysis.glossaryTermIds), [analysis.glossaryTermIds])
  const counts = useMemo(() => {
    const out = new Map<GlossaryCategory, number>()
    for (const t of GLOSSARY) out.set(t.category, (out.get(t.category) ?? 0) + 1)
    return out
  }, [])

  const q = normalize(query)
  const matches = useCallback(
    (t: GlossaryTerm) => (category === 'all' || t.category === category) && (!q || (haystack.get(t.id) ?? '').includes(q)),
    [category, q, haystack],
  )
  const filtered = useMemo(() => {
    const list = sorted.filter(matches)
    if (!q) return list
    // Searching: words whose name starts with the query come first.
    const starts = (t: GlossaryTerm) => normalize(t.term).startsWith(q) || t.aliases.some((a) => normalize(a).startsWith(q))
    return [...list.filter(starts), ...list.filter((t) => !starts(t))]
  }, [sorted, matches, q])
  const projectTerms = useMemo(
    () => analysis.glossaryTermIds.map((id) => getTerm(id)).filter((t): t is GlossaryTerm => Boolean(t) && matches(t as GlossaryTerm)),
    [analysis.glossaryTermIds, matches],
  )
  const groups = useMemo(() => {
    if (q) return [{ letter: '', terms: filtered }]
    const map = new Map<string, GlossaryTerm[]>()
    for (const t of filtered) {
      const l = letterOf(t.term)
      map.set(l, [...(map.get(l) ?? []), t])
    }
    return [...map.entries()].map(([letter, terms]) => ({ letter, terms }))
  }, [filtered, q])

  /** Show one term: clear filters that would hide it, highlight it and scroll to it. */
  const reveal = useCallback(
    (id: string) => {
      const t = getTerm(id)
      if (!t) return
      if (!matches(t)) {
        setQuery('')
        setCategory('all')
      }
      setHighlight(id)
      pendingScroll.current = id
    },
    [matches],
  )

  const jumpTo = useCallback(
    (id: string) => {
      reveal(id)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('term', id)
          return next
        },
        { replace: true },
      )
    },
    [reveal, setSearchParams],
  )

  // Arriving with ?term=… (from a "See it in the glossary" link elsewhere).
  useEffect(() => {
    if (termParam) reveal(termParam)
    // Only a new ?term= should trigger this, not filter changes.
  }, [termParam])

  // Scroll once the highlighted card is on the page.
  useLayoutEffect(() => {
    const id = pendingScroll.current
    if (!id) return
    const el = document.getElementById(`term-${id}`)
    if (!el) return
    pendingScroll.current = null
    el.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    el.focus({ preventScroll: true })
  })

  // The highlight fades after a moment.
  useEffect(() => {
    if (!highlight) return
    const t = window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS)
    return () => window.clearTimeout(t)
  }, [highlight])

  const scrollToLetter = (letter: string) => {
    document.getElementById(`letter-${letter}`)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  const shownProject = showAllProject || q ? projectTerms : projectTerms.slice(0, PROJECT_WORDS_SHOWN)

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-ink">
          <span aria-hidden>📘</span> Glossary
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          {GLOSSARY.length} technical words explained simply, each with an everyday comparison. Elsewhere in RepoAtlas, words with a dotted underline
          show their meaning when you point at them.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-4 mt-6 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="relative max-w-xl">
          <label htmlFor={searchId} className="sr-only">
            Search the glossary
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words, like “API”"
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full rounded-xl border border-line-strong bg-surface pr-10 pl-10 text-[15px] text-ink placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <div
          className="mt-3 -mb-1 flex gap-1.5 overflow-x-auto pr-8 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%_-_3rem),transparent)]"
          role="group"
          aria-label="Filter by topic"
        >
          <ChipButton onClick={() => setCategory('all')} active={category === 'all'} className="shrink-0">
            All words
          </ChipButton>
          {GLOSSARY_CATEGORY_ORDER.filter((c) => counts.has(c)).map((c) => (
            <ChipButton key={c} onClick={() => setCategory(c)} active={category === c} className="shrink-0">
              <span aria-hidden>{GLOSSARY_CATEGORY_INFO[c].emoji}</span>
              {GLOSSARY_CATEGORY_INFO[c].label}
              <span className={cn('text-xs tabular-nums', category === c ? 'opacity-80' : 'text-ink-3')}>{counts.get(c)}</span>
            </ChipButton>
          ))}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {q || category !== 'all' ? `${filtered.length} matching words` : ''}
      </p>

      {projectTerms.length > 0 && (
        <section aria-labelledby="project-words-title" className="mt-8">
          <h2 id="project-words-title" className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink">
            <span aria-hidden>🔖</span> Words you’ll meet in this project
          </h2>
          <p className="mt-1 text-[15px] text-ink-2">These come up in {analysis.meta.repo}. Start here.</p>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {shownProject.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(t.id)}
                  className="group flex h-full w-full flex-col rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-sm transition hover:border-line-strong hover:shadow-md"
                >
                  <span className="text-sm font-semibold text-ink group-hover:text-brand-text">{t.term}</span>
                  <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-2">{t.short}</span>
                </button>
              </li>
            ))}
          </ul>
          {!q && projectTerms.length > PROJECT_WORDS_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAllProject((s) => !s)}
              aria-expanded={showAllProject}
              className="mt-3 text-sm font-semibold text-brand-text hover:underline"
            >
              {showAllProject ? 'Show fewer' : `Show all ${projectTerms.length} words from this project`}
            </button>
          )}
        </section>
      )}

      <section aria-labelledby="all-words-title" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="all-words-title" className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink">
              <span aria-hidden>🔤</span> {q ? 'Matching words' : 'All words, A to Z'}
            </h2>
            <p className="mt-1 text-[15px] text-ink-2">
              {filtered.length === GLOSSARY.length ? `${filtered.length} words` : `${filtered.length} of ${GLOSSARY.length} words`}
            </p>
          </div>
        </div>
        {!q && groups.length > 1 && (
          <nav aria-label="Jump to a letter" className="mt-4 flex flex-wrap gap-1">
            {groups.map((g) => (
              <button
                key={g.letter}
                type="button"
                onClick={() => scrollToLetter(g.letter)}
                className="inline-flex size-8 items-center justify-center rounded-lg text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label={g.letter === '#' ? 'Jump to other symbols' : `Jump to ${g.letter}`}
              >
                {g.letter}
              </button>
            ))}
          </nav>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No words match"
            actions={
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setCategory('all')
                }}
                className="text-sm font-semibold text-brand-text hover:underline"
              >
                Show all words
              </button>
            }
          >
            Try a shorter or different word. If a word isn’t here, the “Ask a Question” view can explain it.
          </EmptyState>
        ) : (
          groups.map((g) => (
            <div key={g.letter || 'results'} className="mt-6">
              {g.letter && (
                <h3 id={`letter-${g.letter}`} className="mb-3 scroll-mt-48 text-sm font-semibold text-ink-3">
                  {g.letter}
                </h3>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {g.terms.map((t) => (
                  <TermCard
                    key={t.id}
                    term={t}
                    inProject={projectIds.has(t.id)}
                    highlighted={highlight === t.id}
                    onJump={jumpTo}
                    onExplain={(id) => openExplain({ type: 'term', id })}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
