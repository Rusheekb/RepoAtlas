import type { LucideIcon } from 'lucide-react'
import { CircleAlert, FolderOpen, Home, Hourglass, KeyRound, Link2Off, RotateCcw, SearchX, WifiOff } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/icons'
import { useUi } from '@/state/ui'

export interface RepoLoadError {
  kind: string
  message: string
  detail?: string
}

const COPY: Record<string, { icon: LucideIcon; title: string; hint?: string }> = {
  'not-found': {
    icon: SearchX,
    title: 'We couldn’t find that project',
    hint: 'Tip: open the project on GitHub and copy the address straight from your browser’s address bar. Private projects only show up with a GitHub token that’s allowed to see them.',
  },
  'rate-limited': {
    icon: Hourglass,
    title: 'GitHub needs a short breather',
    hint: 'GitHub limits how often visitors can ask for files. Setting up a free token takes about a minute, and RepoAtlas will try again as soon as you close Settings.',
  },
  unauthorized: {
    icon: KeyRound,
    title: 'GitHub didn’t accept your token',
    hint: 'Tokens can expire or be copied only partly. Paste a fresh one in Settings, or remove it to continue without one.',
  },
  network: {
    icon: WifiOff,
    title: 'We couldn’t reach GitHub',
    hint: 'Check that you’re online, then try again.',
  },
  empty: {
    icon: FolderOpen,
    title: 'This project is empty',
    hint: 'There’s nothing to explore yet. Try another project, or come back once the authors have added some files.',
  },
  'invalid-input': {
    icon: Link2Off,
    title: 'That doesn’t look like a GitHub project',
    hint: 'Project links look like github.com/owner/name, for example github.com/pallets/flask.',
  },
  unknown: {
    icon: CircleAlert,
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
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 sm:p-8" role="alert" aria-live="assertive">
        <span className="flex size-10 items-center justify-center rounded-[10px] border border-line bg-surface-2 text-ink-2" aria-hidden>
          <Icon as={copy.icon} size={20} />
        </span>
        <h1 className="mt-5 text-page-title text-balance text-ink">{copy.title}</h1>
        <p className="mt-2 font-mono text-[13px] leading-5 break-all text-ink-3">{repoLabel}</p>
        <p className="mt-4 text-[15px] leading-relaxed text-ink">{error.message}</p>
        {copy.hint && <p className="mt-2 text-sm leading-relaxed text-ink-2">{copy.hint}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {offerToken && (
            <Button variant="primary" icon={<Icon as={KeyRound} />} onClick={() => openSettings('github')}>
              {error.kind === 'unauthorized' ? 'Update your GitHub token' : 'Add a GitHub token'}
            </Button>
          )}
          {canRetry && (
            <Button variant={offerToken ? 'secondary' : 'primary'} icon={<Icon as={RotateCcw} />} onClick={onRetry}>
              Try again
            </Button>
          )}
          <Link
            to="/"
            className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-ink-2 transition-colors duration-150 ease-atlas hover:bg-surface-2 hover:text-ink"
          >
            <Icon as={Home} />
            Go home
          </Link>
        </div>

        {error.detail && (
          <details className="mt-6 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-2">Technical details</summary>
            <pre className="mt-2 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-ink-2">{error.detail}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
