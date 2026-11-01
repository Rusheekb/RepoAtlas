import { Home, KeyRound, RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui'
import { useUi } from '@/state/ui'
import { LogoMark } from './Logo'

export interface RepoLoadError {
  kind: string
  message: string
  detail?: string
}

const COPY: Record<string, { emoji: string; title: string; hint?: string }> = {
  'not-found': {
    emoji: '🔍',
    title: 'We couldn’t find that project',
    hint: 'Tip: open the project on GitHub and copy the address straight from your browser’s address bar. Private projects only show up with a GitHub token that’s allowed to see them.',
  },
  'rate-limited': {
    emoji: '⏳',
    title: 'GitHub needs a short breather',
    hint: 'GitHub limits how often visitors can ask for files. Setting up a free token takes about a minute, and RepoAtlas will try again as soon as you close Settings.',
  },
  unauthorized: {
    emoji: '🔑',
    title: 'GitHub didn’t accept your token',
    hint: 'Tokens can expire or be copied only partly. Paste a fresh one in Settings, or remove it to continue without one.',
  },
  network: {
    emoji: '📡',
    title: 'We couldn’t reach GitHub',
    hint: 'Check that you’re online, then try again.',
  },
  empty: {
    emoji: '📭',
    title: 'This project is empty',
    hint: 'There’s nothing to explore yet. Try another project, or come back once the authors have added some files.',
  },
  'invalid-input': {
    emoji: '🤔',
    title: 'That doesn’t look like a GitHub project',
    hint: 'Project links look like github.com/owner/name, for example github.com/pallets/flask.',
  },
  unknown: {
    emoji: '🧩',
    title: 'We hit a snag reading this project',
    hint: 'This is usually temporary. Trying again often fixes it.',
  },
}

const TOKEN_KINDS = new Set(['rate-limited', 'unauthorized', 'not-found'])

/** Friendly, per-kind error page for a repository that failed to load. */
export function ErrorScreen({ error, repoLabel, onRetry }: { error: RepoLoadError; repoLabel: string; onRetry: () => void }) {
  const openSettings = useUi((s) => s.openSettings)
  const copy = COPY[error.kind] ?? COPY.unknown
  const offerToken = TOKEN_KINDS.has(error.kind)
  const canRetry = error.kind !== 'invalid-input' && error.kind !== 'empty'

  return (
    <div className="flex min-h-full items-start justify-center overflow-y-auto bg-canvas px-4 py-12 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 text-center shadow-sm sm:p-8" role="alert" aria-live="assertive">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-4xl" aria-hidden>
          {copy.emoji}
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">{copy.title}</h1>
        <p className="mt-1 font-mono text-sm break-all text-ink-3">{repoLabel}</p>
        <p className="mt-4 text-[15px] leading-relaxed text-ink">{error.message}</p>
        {copy.hint && <p className="mt-2 text-sm leading-relaxed text-ink-2">{copy.hint}</p>}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {offerToken && (
            <Button variant="primary" icon={<KeyRound className="size-4" aria-hidden />} onClick={() => openSettings('github')}>
              {error.kind === 'unauthorized' ? 'Update your GitHub token' : 'Add a GitHub token'}
            </Button>
          )}
          {canRetry && (
            <Button variant={offerToken ? 'secondary' : 'primary'} icon={<RotateCcw className="size-4" aria-hidden />} onClick={onRetry}>
              Try again
            </Button>
          )}
          <Link
            to="/"
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Home className="size-4" aria-hidden />
            Go home
          </Link>
        </div>

        {error.detail && (
          <details className="mt-6 rounded-xl border border-line bg-surface-2 px-4 py-3 text-left">
            <summary className="cursor-pointer text-sm font-medium text-ink-2">Technical details</summary>
            <pre className="mt-2 font-mono text-xs break-words whitespace-pre-wrap text-ink-2">{error.detail}</pre>
          </details>
        )}
        <div className="mt-6 flex justify-center opacity-60" aria-hidden>
          <LogoMark className="size-6" />
        </div>
      </div>
    </div>
  )
}
