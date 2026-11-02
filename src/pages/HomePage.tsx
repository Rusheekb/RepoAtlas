import { useEffect, useId, useState, type FormEvent } from 'react'
import { ArrowRight, Check, KeyRound, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { AtlasPreview } from '@/components/home/AtlasPreview'
import { SettingsDialog } from '@/components/SettingsDialog'
import { GitHubMark } from '@/components/shell/bits'
import { useHasClaudeKey } from '@/components/shell/media'
import { LogoMark } from '@/components/shell/Logo'
import { countsTowardsProgress } from '@/components/shell/progress'
import { checkRepoInput, EXAMPLE_REPOS } from '@/components/shell/repoInput'
import { PROJECT_URL, SiteHeader } from '@/components/shell/SiteHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { Icon, ViewIcon } from '@/components/ui/icons'
import { pluralize, timeAgo } from '@/core/format'
import { VIEW_INFO, VIEW_ORDER } from '@/core/labels'
import { repoPath } from '@/core/routes'
import { useProgress } from '@/state/progress'
import { useUi } from '@/state/ui'

const HEADLINE = 'See how any GitHub project works, in plain English'

/** Page width shared by the header, every section and the footer, so their edges line up. */
const PAGE = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'

const STEPS = [
  {
    title: 'Paste a link',
    text: 'Any public project on GitHub works. Private ones too, once you add a GitHub token.',
  },
  {
    title: 'RepoAtlas reads the code',
    text: 'Right here in your browser, it lists every file, reads the important ones and works out how they connect.',
  },
  {
    title: 'Explore it your way',
    text: 'Maps, guided tours, a glossary and plain-English explanations. Add Claude to ask about anything.',
  },
]

/** Which views need Claude to shine (they still offer a ready-made prompt without a key). */
const AI_VIEWS = new Set(['ask'])

/** One-sentence captions read as labels here, so they drop their closing period. */
const caption = (text: string) => text.replace(/\.$/, '')

function RepoForm() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const preview = value.trim() ? checkRepoInput(value) : null

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
    <form onSubmit={submit} noValidate className="w-full" role="search" aria-label="Open a GitHub project">
      <label htmlFor={inputId} className="sr-only">
        GitHub project link
      </label>
      <div
        className={cn(
          'flex items-center gap-2 rounded-[14px] border bg-surface p-1 shadow-sm transition-colors duration-150 ease-atlas dark:bg-surface-2',
          error ? 'border-bad-text' : 'border-line-strong focus-within:border-ink-3',
        )}
      >
        <GitHubMark className="ml-3 size-5 text-ink-3" />
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
          placeholder="Paste a GitHub link"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hintId}
          className="h-12 min-w-0 flex-1 bg-transparent px-1 text-base text-ink placeholder:text-ink-3 focus-visible:outline-hidden"
        />
        <Button type="submit" variant="primary" size="lg" iconRight={<Icon as={ArrowRight} size={18} />}>
          <span className="max-sm:sr-only">Explore</span>
        </Button>
      </div>
      <div className="mt-3 min-h-5 text-sm leading-5">
        {error ? (
          <p id={errorId} role="alert" className="text-bad-text">
            {error}
          </p>
        ) : preview?.ok ? (
          <p id={hintId} className="flex items-center gap-2 text-ink-2">
            <Icon as={Check} className="text-good-text" />
            <span className="min-w-0 truncate">
              Ready to open <span className="font-mono text-[13px] text-ink">{preview.ref.owner}/{preview.ref.repo}</span>
              {preview.ref.ref && (
                <>
                  {' '}
                  at <span className="font-mono text-[13px] text-ink">{preview.ref.ref}</span>
                </>
              )}
            </span>
            <kbd className="ml-auto shrink-0 rounded-[5px] border border-line-strong bg-surface px-1.5 font-mono text-xs leading-5 text-ink-2 max-sm:hidden">
              Enter
            </kbd>
          </p>
        ) : (
          <p id={hintId} className="text-ink-3">
            Any public project, like github.com/pallets/flask. No sign-up needed.
          </p>
        )}
      </div>
    </form>
  )
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className={cn(PAGE, 'pt-10 pb-16 sm:pt-16 lg:pt-20 lg:pb-24')}>
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-14 xl:gap-16">
        <div className="max-w-xl">
          <h1 id="hero-title" className="text-hero text-balance text-ink">
            {HEADLINE}
          </h1>
          <p className="mt-6 max-w-[36rem] text-lg leading-7 text-pretty text-ink-2">
            Paste a link to a project on GitHub. RepoAtlas shows what it does, how the pieces fit together and where to start reading,
            with no coding knowledge needed.
          </p>
          <div className="mt-10">
            <RepoForm />
          </div>
          <Link
            to={repoPath({ owner: 'pallets', repo: 'flask' })}
            className="group mt-6 inline-flex h-9 items-center gap-2 rounded-lg text-[15px] font-medium text-ink-2 transition-colors duration-150 ease-atlas hover:text-ink"
          >
            Try it on Flask
            <Icon as={ArrowRight} className="text-ink-3 transition-[color,transform] duration-150 ease-atlas group-hover:translate-x-0.5 group-hover:text-ink" />
          </Link>
        </div>
        <AtlasPreview className="min-w-0" />
      </div>
    </section>
  )
}

function Examples() {
  return (
    <section aria-labelledby="examples-title" className={PAGE}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="examples-title" className="text-base font-medium text-ink">
          Try an example
        </h2>
        <p className="text-sm text-ink-3">From small and friendly to big</p>
      </div>
      <ul className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {EXAMPLE_REPOS.map((ex) => (
          <li key={`${ex.owner}/${ex.repo}`} className="bg-surface">
            <Link
              to={repoPath({ owner: ex.owner, repo: ex.repo })}
              className="group flex h-full items-start gap-3 px-5 py-4 transition-colors duration-150 ease-atlas hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-6 font-medium text-ink">{ex.name}</span>
                <span className="block text-sm leading-5 text-ink-2">{ex.blurb}</span>
                <span className="mt-2 block truncate text-meta">
                  {ex.owner}/{ex.repo}
                </span>
              </span>
              <Icon
                as={ArrowRight}
                className="mt-1 text-ink-3 transition-[color,transform] duration-150 ease-atlas group-hover:translate-x-0.5 group-hover:text-ink"
              />
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
    <section aria-labelledby="recent-title" className={cn(PAGE, 'mt-16')}>
      <h2 id="recent-title" className="text-base font-medium text-ink">
        Pick up where you left off
      </h2>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {recent.map((r) => {
          const [owner, repo] = r.fullName.split('/')
          if (!owner || !repo) return null
          const explored = Object.keys(seen[r.fullName.toLowerCase()] ?? {}).filter(countsTowardsProgress).length
          return (
            <li key={r.fullName} className="group flex items-center gap-2 pr-3">
              <Link
                to={repoPath({ owner, repo })}
                className="flex min-w-0 flex-1 items-center gap-3 px-5 py-3 transition-colors duration-150 ease-atlas hover:bg-surface-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-medium text-ink-2 uppercase" aria-hidden>
                  {owner.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm leading-5 font-medium text-ink">{r.fullName}</span>
                  <span className="block truncate text-[13px] leading-5 text-ink-3">{r.description || 'No description'}</span>
                </span>
                <span className="hidden shrink-0 text-right sm:block">
                  {explored > 0 && <span className="block text-meta text-ink-2">{pluralize(explored, 'thing')} explored</span>}
                  <span className="block text-meta">{timeAgo(r.openedAt)}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => removeRecent(r.fullName)}
                aria-label={`Remove ${r.fullName} from recent projects`}
                title="Remove from this list"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors duration-150 ease-atlas hover:bg-surface-2 hover:text-ink"
              >
                <Icon as={X} />
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
    <section aria-labelledby="how-title" className={cn(PAGE, 'mt-24 grid gap-8 sm:mt-32 lg:grid-cols-12 lg:gap-12')}>
      <div className="lg:col-span-4">
        <h2 id="how-title" className="text-page-title text-ink">
          How it works
        </h2>
        <p className="mt-3 text-[15px] leading-6 text-ink-2">Three steps, about ten seconds, no coding knowledge needed</p>
      </div>
      <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6 lg:col-span-8">
        {STEPS.map((s, i) => (
          <li key={s.title} className="border-t border-line-strong pt-4">
            <span className="text-meta" aria-hidden>
              {i + 1}
            </span>
            <h3 className="mt-3 text-base leading-6 font-medium text-ink">
              <span className="sr-only">Step {i + 1}: </span>
              {s.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ViewShowcase() {
  return (
    <section aria-labelledby="views-title" className={cn(PAGE, 'mt-24 sm:mt-32')}>
      <div className="max-w-2xl">
        <h2 id="views-title" className="text-page-title text-ink">
          Nine ways to see a project
        </h2>
        <p className="mt-3 text-[15px] leading-6 text-ink-2">
          Every project gets the same nine views. Pick one to try it on Flask, a small and tidy Python project.
        </p>
      </div>
      <ul className="mt-10 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {VIEW_ORDER.map((view) => {
          const info = VIEW_INFO[view]
          return (
            <li key={view} className="border-t border-line">
              <Link to={repoPath({ owner: 'pallets', repo: 'flask' }, view)} className="group flex h-full items-start gap-3 py-4">
                <ViewIcon view={view} size={18} className="mt-0.5 text-ink-3 transition-colors duration-150 ease-atlas group-hover:text-ink" />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[15px] leading-6 font-medium text-ink decoration-line-strong underline-offset-4 group-hover:underline">
                    {info.label}
                    {AI_VIEWS.has(view) && <Badge>With Claude</Badge>}
                  </span>
                  <span className="mt-0.5 block text-sm leading-5 text-ink-2">{caption(info.description)}</span>
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
  const hasKey = useHasClaudeKey()
  return (
    <section className={cn(PAGE, 'mt-24 sm:mt-32')} aria-label="Privacy and AI">
      <div className="grid overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-12">
        <div className="p-6 sm:p-8 lg:col-span-7">
          <h2 className="text-lg leading-7 font-medium text-ink">Private by design</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2">
            Everything runs in your browser. Project files come straight from GitHub, and if you add keys, they stay on this device and are only
            ever sent to GitHub and Anthropic.
          </p>
          <ul className="mt-5 space-y-2 text-sm leading-5 text-ink">
            {['No RepoAtlas server, no account, no sign-up', 'No tracking and no ads', 'Clear everything it saved with one click in Settings'].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Icon as={Check} className="mt-0.5 text-ink-3" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-line bg-surface-2/60 p-6 sm:p-8 lg:col-span-5 lg:border-t-0 lg:border-l">
          <h2 className="text-lg leading-7 font-medium text-ink">Optional: add your Claude API key</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            RepoAtlas works without AI. With your own key, Claude can read the code and explain any file in depth, answer your questions, draw
            smarter idea maps and quiz you. You pay Anthropic directly: about 40¢ for the first answer about a project, then roughly 5–10¢ for
            each follow-up within the hour.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {hasKey ? (
              <>
                <p className="flex items-center gap-2 text-sm text-ink-2">
                  <Icon as={Check} className="text-good-text" />
                  Claude is ready
                </p>
                <Button variant="secondary" onClick={() => openSettings('ai')}>
                  Change AI settings
                </Button>
              </>
            ) : (
              <Button variant="primary" icon={<Icon as={KeyRound} />} onClick={() => openSettings('ai')}>
                Add your Claude API key
              </Button>
            )}
          </div>
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
      <SiteHeader innerClassName={PAGE} />
      <main className="pb-24">
        <Hero />
        <Examples />
        <RecentRepos />
        <HowItWorks />
        <ViewShowcase />
        <TrustAndAi />
      </main>

      <footer className="border-t border-line py-8">
        <div className={cn(PAGE, 'flex flex-col items-start justify-between gap-3 text-sm text-ink-3 sm:flex-row sm:items-center')}>
          <p className="flex items-center gap-2">
            <LogoMark className="size-5" />
            RepoAtlas is not affiliated with GitHub or Anthropic
          </p>
          <a
            href={PROJECT_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 font-medium text-ink-2 underline-offset-4 transition-colors duration-150 ease-atlas hover:text-ink hover:underline"
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
