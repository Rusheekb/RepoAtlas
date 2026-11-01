import { useEffect, useId, useState, type FormEvent } from 'react'
import { ArrowRight, Check, KeyRound, Lock, Sparkles, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useHasAiKey } from '@/ai'
import { SettingsDialog } from '@/components/SettingsDialog'
import { GitHubMark } from '@/components/shell/bits'
import { useMediaQuery } from '@/components/shell/hooks'
import { LogoMark } from '@/components/shell/Logo'
import { checkRepoInput, EXAMPLE_REPOS } from '@/components/shell/repoInput'
import { PROJECT_URL, SiteHeader } from '@/components/shell/SiteHeader'
import { Button } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { pluralize, timeAgo } from '@/core/format'
import { VIEW_INFO, VIEW_ORDER } from '@/core/labels'
import { repoPath } from '@/core/routes'
import { useProgress } from '@/state/progress'
import { useUi } from '@/state/ui'

const TAGLINE_LEAD = 'See how any GitHub project works'
const TAGLINE_REST = '— explained visually, in plain English.'

const STEPS = [
  {
    emoji: '🔗',
    title: 'Paste a link',
    text: 'Any public project on GitHub works. Private ones too, once you add a GitHub token.',
  },
  {
    emoji: '🔎',
    title: 'RepoAtlas reads the code',
    text: 'Right here in your browser, it lists every file, reads the important ones and works out how they connect.',
  },
  {
    emoji: '🗺️',
    title: 'Explore it your way',
    text: 'Maps, guided tours, a glossary and plain-English explanations. Add Claude to ask about anything.',
  },
]

/** Which views need Claude to shine (they still offer a ready-made prompt without a key). */
const AI_VIEWS = new Set(['ask'])

function RepoForm() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const preview = value.trim() ? checkRepoInput(value) : null
  const narrow = useMediaQuery('(max-width: 480px)', false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const check = checkRepoInput(value)
    if (!check.ok) {
      setError(check.message)
      return
    }
    setError(null)
    navigate(repoPath({ owner: check.ref.owner, repo: check.ref.repo, ref: check.ref.ref }))
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto mt-9 w-full max-w-2xl" role="search" aria-label="Open a GitHub project">
      <label htmlFor={inputId} className="sr-only">
        GitHub project link
      </label>
      <div
        className={cn(
          'flex items-center gap-2 rounded-2xl border bg-surface p-2 shadow-md transition-colors focus-within:border-brand',
          error ? 'border-bad-text' : 'border-line-strong',
        )}
      >
        <GitHubMark className="ml-2.5 size-5 text-ink-3" />
        <input
          id={inputId}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          placeholder={narrow ? 'e.g. github.com/pallets/flask' : 'Paste a GitHub link, like github.com/pallets/flask'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hintId}
          className="h-12 min-w-0 flex-1 bg-transparent px-1 text-base text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none sm:text-[17px]"
        />
        <Button type="submit" variant="primary" size="lg" className="h-12 px-4 sm:px-6" iconRight={<ArrowRight className="size-5" aria-hidden />}>
          <span className="max-sm:sr-only">Explore</span>
        </Button>
      </div>
      <div className="mt-2.5 min-h-6 px-2 text-left text-sm">
        {error ? (
          <p id={errorId} role="alert" className="text-bad-text">
            {error}
          </p>
        ) : preview?.ok ? (
          <p id={hintId} className="flex items-center gap-1.5 text-ink-2">
            <Check className="size-4 text-good-text" aria-hidden />
            Ready to open{' '}
            <span className="font-mono text-[13px] text-ink">
              {preview.ref.owner}/{preview.ref.repo}
            </span>
            {preview.ref.ref && (
              <>
                {' '}
                at <span className="font-mono text-[13px] text-ink">{preview.ref.ref}</span>
              </>
            )}
            . Press Enter.
          </p>
        ) : (
          <p id={hintId} className="text-ink-3">
            Works with any public project. No sign-up, nothing to install.
          </p>
        )}
      </div>
    </form>
  )
}

function Examples() {
  return (
    <section aria-labelledby="examples-title" className="mx-auto mt-6 max-w-4xl">
      <h2 id="examples-title" className="text-center text-sm font-semibold text-ink-2">
        Not sure where to start? Try an example
      </h2>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {EXAMPLE_REPOS.map((ex) => (
          <li key={`${ex.owner}/${ex.repo}`}>
            <Link
              to={repoPath({ owner: ex.owner, repo: ex.repo })}
              className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-sm transition hover:-translate-y-px hover:border-line-strong hover:shadow-md motion-reduce:hover:translate-y-0"
            >
              <span className="mt-0.5 text-xl leading-none" aria-hidden>
                {ex.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink group-hover:text-brand-text">{ex.name}</span>
                <span className="block text-[13px] leading-snug text-ink-2">{ex.blurb}</span>
                <span className="mt-1 block truncate font-mono text-[11px] text-ink-3">
                  {ex.owner}/{ex.repo}
                </span>
              </span>
              <ArrowRight className="mt-1 size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-text" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RecentRepos() {
  const recent = useProgress((s) => s.recent)
  const removeRecent = useProgress((s) => s.removeRecent)
  const seen = useProgress((s) => s.seen)
  if (!recent.length) return null
  return (
    <section aria-labelledby="recent-title" className="mx-auto mt-12 max-w-4xl">
      <h2 id="recent-title" className="text-lg font-semibold text-ink">
        Pick up where you left off
      </h2>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        {recent.map((r) => {
          const [owner, repo] = r.fullName.split('/')
          if (!owner || !repo) return null
          const explored = Object.keys(seen[r.fullName.toLowerCase()] ?? {}).length
          return (
            <li key={r.fullName} className="group flex items-center gap-2 pr-2">
              <Link to={repoPath({ owner, repo })} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-sm font-semibold text-ink-2 uppercase" aria-hidden>
                  {owner.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink group-hover:text-brand-text">{r.fullName}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {r.description || 'No description'}
                  </span>
                </span>
                <span className="hidden shrink-0 text-right text-xs text-ink-3 sm:block">
                  {explored > 0 && <span className="block text-ink-2">{pluralize(explored, 'thing')} explored</span>}
                  <span className="block">{timeAgo(r.openedAt)}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => removeRecent(r.fullName)}
                aria-label={`Remove ${r.fullName} from recent projects`}
                title="Remove from this list"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="mt-20">
      <h2 id="how-title" className="text-center text-2xl font-semibold tracking-tight text-ink">
        How it works
      </h2>
      <p className="mt-2 text-center text-[15px] text-ink-2">Three steps, about ten seconds, no coding knowledge needed.</p>
      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink" aria-hidden>
                {i + 1}
              </span>
              <span className="text-2xl leading-none" aria-hidden>
                {s.emoji}
              </span>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">
              <span className="sr-only">Step {i + 1}: </span>
              {s.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ViewShowcase() {
  return (
    <section aria-labelledby="views-title" className="mt-20">
      <h2 id="views-title" className="text-center text-2xl font-semibold tracking-tight text-ink">
        Nine ways to see a project
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-center text-[15px] text-ink-2">
        Every project gets the same friendly tour guide. Click any of them to try it on Flask, a small and tidy example.
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VIEW_ORDER.map((view) => {
          const info = VIEW_INFO[view]
          return (
            <li key={view}>
              <Link
                to={repoPath({ owner: 'pallets', repo: 'flask' }, view)}
                className="group flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:border-line-strong hover:shadow-md"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-2xl leading-none" aria-hidden>
                  {info.emoji}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink group-hover:text-brand-text">
                    {info.label}
                    {AI_VIEWS.has(view) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-text uppercase">
                        <Sparkles className="size-3" aria-hidden /> With Claude
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm leading-snug text-ink-2">{info.description}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function TrustAndAi() {
  const openSettings = useUi((s) => s.openSettings)
  const hasKey = useHasAiKey()
  return (
    <section className="mt-20 grid gap-4 lg:grid-cols-2" aria-label="Privacy and AI">
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-7">
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-good-text" aria-hidden>
          <Lock className="size-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-ink">Private by design</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Everything runs in your browser. Project files come straight from GitHub, and if you add keys, they stay on this device and are only ever
          sent to GitHub and Anthropic.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-ink">
          {['No RepoAtlas server, no account, no sign-up', 'No tracking and no ads', 'Clear everything it saved with one click in Settings'].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-good-text" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-transparent bg-brand-soft p-6 sm:p-7">
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-brand-text shadow-sm" aria-hidden>
          <Sparkles className="size-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-ink">Optional: add your Claude API key</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          RepoAtlas works without AI. With your own key, Claude can read the code and explain any file in depth, answer your questions, draw
          smarter idea maps and quiz you. You pay Anthropic directly, usually a few cents per answer.
        </p>
        <div className="mt-4">
          {hasKey ? (
            <Button variant="secondary" icon={<Check className="size-4 text-good-text" aria-hidden />} onClick={() => openSettings('ai')}>
              Claude is ready. Change AI settings
            </Button>
          ) : (
            <Button variant="primary" icon={<KeyRound className="size-4" aria-hidden />} onClick={() => openSettings('ai')}>
              Add your Claude API key
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

/** The landing page: paste a GitHub link, try an example, or continue a recent project. */
export default function HomePage() {
  useEffect(() => {
    document.title = 'RepoAtlas · See how any GitHub project works'
  }, [])

  return (
    <div className="min-h-full bg-canvas">
      <SiteHeader />
      <main className="px-4 pb-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <section className="pt-10 text-center sm:pt-16" aria-labelledby="hero-title">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 shadow-sm">
              <LogoMark className="size-4" />
              RepoAtlas · free, private, no sign-up
            </div>
            <h1 id="hero-title" className="mx-auto mt-6 max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance text-ink sm:text-5xl lg:text-6xl">
              {TAGLINE_LEAD} <span className="text-brand-text">{TAGLINE_REST}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-pretty text-ink-2 sm:text-lg">
              Paste a link to any project on GitHub. RepoAtlas shows you what it does, how the pieces fit together and where to start reading,
              with no coding knowledge needed.
            </p>
            <RepoForm />
          </section>

          <Examples />
          <RecentRepos />
          <HowItWorks />
          <ViewShowcase />
          <TrustAndAi />
        </div>
      </main>

      <footer className="border-t border-line px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-ink-3 sm:flex-row">
          <p className="flex items-center gap-2">
            <LogoMark className="size-5" />
            RepoAtlas. Not affiliated with GitHub or Anthropic.
          </p>
          <a
            href={PROJECT_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 font-medium text-ink-2 hover:text-ink hover:underline"
          >
            <GitHubMark className="size-4" />
            Open source on GitHub
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </footer>
      <SettingsDialog />
    </div>
  )
}
