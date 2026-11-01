import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, Eye, EyeOff, KeyRound, Laptop, LoaderCircle, Moon, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Trash2, X } from 'lucide-react'
import { clearAiCache, testConnection } from '@/ai'
import { Button } from '@/components/ui'
import { IconButton } from '@/components/shell/IconButton'
import { cn } from '@/components/ui/cn'
import { Callout, GitHubMark, OutboundLink } from '@/components/shell/bits'
import { READING_LEVEL_ORDER } from '@/components/shell/ReadingLevelPicker'
import { ANALYSIS_DEPTHS, CONTEXT_SIZES, DEFAULT_MODEL, MODELS, READING_LEVELS } from '@/core/labels'
import type { AnalysisDepth, ContextSize, ModelId, ReadingLevel, ThemePref } from '@/core/types'
import { clearSnapshotCache, formatResetTime, getRateLimitInfo, onRateLimitChange, type RateLimitInfo } from '@/github'
import { useProgress } from '@/state/progress'
import { useSettings } from '@/state/settings'
import { useUi, type SettingsSection } from '@/state/ui'

export const ANTHROPIC_KEYS_URL = 'https://console.anthropic.com/settings/keys'
export const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: 'ai', label: 'Claude AI', icon: <Sparkles className="size-4" aria-hidden /> },
  { id: 'github', label: 'GitHub', icon: <GitHubMark className="size-4" /> },
  { id: 'preferences', label: 'Preferences', icon: <SlidersHorizontal className="size-4" aria-hidden /> },
  { id: 'data', label: 'Privacy & data', icon: <ShieldCheck className="size-4" aria-hidden /> },
]

/** "Opus … (Recommended)" → the description without the note; the note becomes a badge instead. */
function splitRecommended(description: string): { text: string; recommended: boolean } {
  const recommended = /\(Recommended\)/i.test(description)
  return { text: description.replace(/\s*\(Recommended\)\s*/i, ' ').trim(), recommended }
}

// ─── Building blocks ────────────────────────────────────────────────────────

interface Choice<T extends string> {
  value: T
  label: string
  description?: string
  badge?: string
  icon?: ReactNode
}

function ChoiceCards<T extends string>({
  legend,
  hint,
  value,
  options,
  onChange,
  columns = 1,
}: {
  legend: string
  hint?: ReactNode
  value: T
  options: Choice<T>[]
  onChange: (v: T) => void
  columns?: 1 | 2 | 3
}) {
  const name = useId()
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      {hint && <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{hint}</p>}
      <div className={cn('mt-3 grid gap-2', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3')}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex min-w-0 cursor-pointer gap-3 rounded-xl border bg-surface px-3.5 py-3 transition-colors',
              o.value === value ? 'border-brand bg-brand-soft/50' : 'border-line hover:border-line-strong',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="mt-0.5 size-4 shrink-0 accent-brand"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                {o.icon}
                <span className="min-w-0">
                  {o.label}
                  {o.badge && (
                    <span className="ml-2 inline-block rounded-full bg-brand px-2 py-0.5 align-[1px] text-[10px] font-semibold tracking-wide text-brand-ink uppercase">
                      {o.badge}
                    </span>
                  )}
                </span>
              </span>
              {o.description && <span className="mt-0.5 block text-xs leading-snug text-ink-2">{o.description}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** A password-style field with show/hide and clear buttons. Enter submits (e.g. to test the key). */
function SecretField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  onSubmit,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  hint?: ReactNode
  onSubmit?: () => void
  children?: ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const [show, setShow] = useState(false)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
    >
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder={placeholder}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            aria-describedby={hint ? hintId : undefined}
            className="h-11 w-full rounded-xl border border-line-strong bg-surface pr-20 pl-3.5 font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink-3"
          />
          <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
            <IconButton
              size="sm"
              aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
              aria-pressed={show}
              title={show ? 'Hide' : 'Show'}
              onClick={() => setShow((s) => !s)}
              icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            />
            {value && (
              <IconButton size="sm" aria-label={`Remove ${label.toLowerCase()}`} title="Remove" onClick={() => onChange('')} icon={<X className="size-4" />} />
            )}
          </div>
        </div>
        {children}
      </div>
      {hint && (
        <div id={hintId} className="mt-2 text-xs leading-relaxed text-ink-3">
          {hint}
        </div>
      )}
    </form>
  )
}

function SectionIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight text-ink">{title}</h3>
      <div className="mt-1 text-sm leading-relaxed text-ink-2">{children}</div>
    </div>
  )
}

// ─── Sections ───────────────────────────────────────────────────────────────

function AiSection() {
  const apiKey = useSettings((s) => s.anthropicApiKey)
  const model = useSettings((s) => s.model)
  const contextSize = useSettings((s) => s.contextSize)
  const set = useSettings((s) => s.set)
  const [test, setTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'fail'; message: string }>({ state: 'idle', message: '' })
  const testRun = useRef(0)

  // A different key or model invalidates the last test result.
  useEffect(() => {
    testRun.current++
    setTest({ state: 'idle', message: '' })
  }, [apiKey, model])

  const runTest = async () => {
    const id = ++testRun.current
    setTest({ state: 'testing', message: '' })
    const result = await testConnection(apiKey, model)
    if (id !== testRun.current) return
    setTest({ state: result.ok ? 'ok' : 'fail', message: result.message })
  }

  const looksOdd = apiKey.length > 0 && !apiKey.startsWith('sk-ant-')

  return (
    <div className="space-y-6">
      <SectionIntro title="Claude AI (optional)">
        <p>
          Everything in RepoAtlas works without AI. Add your own Claude API key and Claude, an AI assistant made by Anthropic, can read the
          actual code to explain any part in depth, answer your questions, draw smarter idea maps and quiz you.
        </p>
      </SectionIntro>

      <div>
        <SecretField
          label="Claude API key"
          value={apiKey}
          onChange={(v) => set({ anthropicApiKey: v })}
          placeholder="Paste your key, it starts with sk-ant-"
          onSubmit={() => void runTest()}
          hint={
            <>
              Don’t have one yet? <OutboundLink href={ANTHROPIC_KEYS_URL}>Create a key at console.anthropic.com</OutboundLink>: sign in, choose
              “Create Key”, then copy it and paste it here.
            </>
          }
        >
          <Button
            type="submit"
            variant="secondary"
            className="h-11"
            disabled={!apiKey || test.state === 'testing'}
            icon={test.state === 'testing' ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
          >
            {test.state === 'testing' ? 'Testing…' : 'Test key'}
          </Button>
        </SecretField>
        <div role="status" aria-live="polite" className="mt-2 text-sm">
          {test.state === 'ok' && (
            <p className="flex items-start gap-1.5 text-good-text">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              {test.message}
            </p>
          )}
          {test.state === 'fail' && <p className="text-bad-text">{test.message}</p>}
          {test.state === 'idle' && looksOdd && <p className="text-warn-text">Claude API keys usually start with “sk-ant-”. Double-check you copied the whole key.</p>}
        </div>
      </div>

      <ChoiceCards<ModelId>
        legend="Which Claude should explain things?"
        value={model}
        onChange={(v) => set({ model: v })}
        options={(Object.keys(MODELS) as ModelId[]).map((id) => {
          const { text } = splitRecommended(MODELS[id].description)
          return { value: id, label: MODELS[id].label, description: text, badge: id === DEFAULT_MODEL ? 'Recommended' : undefined }
        })}
      />

      <ChoiceCards<ContextSize>
        legend="How much code should Claude read for each answer?"
        hint="More code means more thorough answers, but each one costs a little more."
        value={contextSize}
        columns={3}
        onChange={(v) => set({ contextSize: v })}
        options={(Object.keys(CONTEXT_SIZES) as ContextSize[]).map((id) => {
          const { text, recommended } = splitRecommended(CONTEXT_SIZES[id].description)
          return { value: id, label: CONTEXT_SIZES[id].label, description: text, badge: recommended ? 'Recommended' : undefined }
        })}
      />

      <Callout icon={<span aria-hidden>💳</span>} title="What does it cost?">
        You pay Anthropic directly for what you use; RepoAtlas never sees your bill. A typical explanation costs a few cents with Opus, and
        less with Sonnet or Haiku. Answers are saved on this device, so opening one again is free.
      </Callout>
    </div>
  )
}

function useRateLimit(): RateLimitInfo | null {
  const [info, setInfo] = useState<RateLimitInfo | null>(() => getRateLimitInfo())
  useEffect(() => onRateLimitChange(setInfo), [])
  return info
}

function RateLimitMeter({ info, hasToken }: { info: RateLimitInfo | null; hasToken: boolean }) {
  if (!info) {
    return <p className="text-sm text-ink-2">Your remaining allowance will appear here once RepoAtlas has talked to GitHub.</p>
  }
  const percent = info.limit > 0 ? Math.round((info.remaining / info.limit) * 100) : 0
  const low = percent < 15
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="font-medium text-ink">
          <span className="tabular-nums">{info.remaining.toLocaleString('en-US')}</span> of{' '}
          <span className="tabular-nums">{info.limit.toLocaleString('en-US')}</span> requests left this hour
        </p>
        <p className="text-xs text-ink-3">Refills at {formatResetTime(info.resetAt)}</p>
      </div>
      <div
        role="progressbar"
        aria-label="GitHub requests left this hour"
        aria-valuemin={0}
        aria-valuemax={info.limit}
        aria-valuenow={info.remaining}
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500', low ? 'bg-warn' : 'bg-brand')} style={{ width: `${percent}%` }} />
      </div>
      {hasToken && info.limit <= 60 && (
        <p className="mt-2 text-xs text-ink-3">Your token will be used from the next project you open (or when you press “Try again”).</p>
      )}
      {low && <p className="mt-2 text-xs text-warn-text">Running low. {hasToken ? 'It refills on the hour.' : 'A free token raises the limit to 5,000 an hour.'}</p>}
    </div>
  )
}

function GitHubSection() {
  const token = useSettings((s) => s.githubToken)
  const set = useSettings((s) => s.set)
  const info = useRateLimit()
  return (
    <div className="space-y-6">
      <SectionIntro title="GitHub token (optional)">
        <p>
          RepoAtlas reads projects straight from GitHub. Without a token, GitHub allows about <strong className="text-ink">60 requests an hour</strong>,
          enough for a handful of projects. A free token raises that to <strong className="text-ink">5,000 an hour</strong>, and lets you explore your
          own private projects too.
        </p>
      </SectionIntro>

      <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Your GitHub allowance</p>
        <RateLimitMeter info={info} hasToken={Boolean(token)} />
      </div>

      <SecretField
        label="GitHub token"
        value={token}
        onChange={(v) => set({ githubToken: v })}
        placeholder="Paste your token, it starts with github_pat_ or ghp_"
        hint="RepoAtlas only ever reads from GitHub. It never changes anything there."
      />

      <div>
        <h4 className="text-sm font-semibold text-ink">How to get a token (about a minute)</h4>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2 marker:text-ink-3">
          <li>
            Open <OutboundLink href={GITHUB_TOKEN_URL}>GitHub’s “new token” page</OutboundLink> (sign in if asked).
          </li>
          <li>Give it a name you’ll recognize, like “RepoAtlas”, and pick when it should expire.</li>
          <li>
            Under <span className="font-medium text-ink">Repository access</span>, choose “Public repositories”. To explore private projects, pick
            them instead and set <span className="font-medium text-ink">Contents</span> to “Read-only”.
          </li>
          <li>Press “Generate token”, copy it, and paste it above.</li>
        </ol>
      </div>
    </div>
  )
}

function PreferencesSection() {
  const readingLevel = useSettings((s) => s.readingLevel)
  const theme = useSettings((s) => s.theme)
  const depth = useSettings((s) => s.analysisDepth)
  const set = useSettings((s) => s.set)
  return (
    <div className="space-y-6">
      <SectionIntro title="Preferences">
        <p>Make RepoAtlas fit the way you like to learn.</p>
      </SectionIntro>
      <ChoiceCards<ReadingLevel>
        legend="Explain things for…"
        hint="Changes how Claude writes its explanations. Pick whatever feels comfortable; you can switch any time."
        value={readingLevel}
        columns={2}
        onChange={(v) => set({ readingLevel: v })}
        options={READING_LEVEL_ORDER.map((l) => ({ value: l, label: READING_LEVELS[l].label, description: READING_LEVELS[l].description }))}
      />
      <ChoiceCards<ThemePref>
        legend="Appearance"
        value={theme}
        columns={3}
        onChange={(v) => set({ theme: v })}
        options={[
          { value: 'system', label: 'Match my device', icon: <Laptop className="size-4 shrink-0 text-ink-2" aria-hidden /> },
          { value: 'light', label: 'Light', icon: <Sun className="size-4 shrink-0 text-ink-2" aria-hidden /> },
          { value: 'dark', label: 'Dark', icon: <Moon className="size-4 shrink-0 text-ink-2" aria-hidden /> },
        ]}
      />
      <ChoiceCards<AnalysisDepth>
        legend="How much of each project to read"
        hint="Reading more files gives a fuller picture of big projects, but takes longer and uses more of your GitHub allowance. Applies to the next project you open."
        value={depth}
        columns={3}
        onChange={(v) => set({ analysisDepth: v })}
        options={(Object.keys(ANALYSIS_DEPTHS) as AnalysisDepth[]).map((id) => {
          const { text, recommended } = splitRecommended(ANALYSIS_DEPTHS[id].description)
          return { value: id, label: ANALYSIS_DEPTHS[id].label, description: text, badge: recommended ? 'Recommended' : undefined }
        })}
      />
    </div>
  )
}

/** Remove everything RepoAtlas saved in this browser except settings and keys. Exported for tests. */
export async function clearSavedData(): Promise<void> {
  await Promise.allSettled([clearSnapshotCache(), clearAiCache()])
  useProgress.setState({ seen: {}, recent: [] })
}

function DataSection() {
  const rememberKeys = useSettings((s) => s.rememberKeys)
  const hasKeys = useSettings((s) => Boolean(s.anthropicApiKey || s.githubToken))
  const set = useSettings((s) => s.set)
  const [clearState, setClearState] = useState<'idle' | 'confirm' | 'working' | 'done'>('idle')
  const switchId = useId()
  const switchHint = `${switchId}-hint`

  const doClear = async () => {
    setClearState('working')
    await clearSavedData()
    setClearState('done')
  }

  return (
    <div className="space-y-6">
      <SectionIntro title="Privacy & data">
        <ul className="mt-2 space-y-2">
          {[
            'Everything runs in your browser. There is no RepoAtlas server, no account and no tracking.',
            'Project files come straight from GitHub. Questions for Claude go straight from your browser to Anthropic.',
            'Your keys stay on this device and are only ever sent to GitHub and Anthropic.',
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good-text" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </SectionIntro>

      <div className="rounded-2xl border border-line p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor={switchId} className="text-sm font-semibold text-ink">
              Remember my keys on this device
            </label>
            <p id={switchHint} className="mt-1 text-sm leading-relaxed text-ink-2">
              {rememberKeys
                ? 'On: your keys are saved in this browser, so you won’t need to paste them again. Only keep this on for a computer you trust.'
                : 'Off: your keys are kept only while this tab is open and forgotten when you close it. Turn this on to skip pasting them each time.'}
            </p>
          </div>
          <button
            id={switchId}
            type="button"
            role="switch"
            aria-checked={rememberKeys}
            aria-describedby={switchHint}
            onClick={() => set({ rememberKeys: !rememberKeys })}
            className={cn('relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors', rememberKeys ? 'border-transparent bg-brand' : 'border-line-strong bg-surface-3')}
          >
            <span
              className={cn('inline-block size-5 rounded-full shadow-sm transition-transform', rememberKeys ? 'translate-x-[22px] bg-brand-ink' : 'translate-x-[3px] bg-ink-3')}
              aria-hidden
            />
            <span className="sr-only">{rememberKeys ? 'On' : 'Off'}</span>
          </button>
        </div>
        {hasKeys && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-3 -ml-2"
            icon={<X className="size-4" aria-hidden />}
            onClick={() => set({ anthropicApiKey: '', githubToken: '' })}
          >
            Forget my keys now
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-line p-4">
        <h4 className="text-sm font-semibold text-ink">Saved data</h4>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          To make things fast and save money, RepoAtlas keeps copies of projects you’ve opened, Claude’s answers, your progress and your
          recent projects in this browser. Your settings and keys are kept separately.
        </p>
        <div className="mt-3" aria-live="polite">
          {clearState === 'idle' && (
            <Button size="sm" variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setClearState('confirm')}>
              Clear saved data
            </Button>
          )}
          {(clearState === 'confirm' || clearState === 'working') && (
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-sm text-ink">This removes saved projects, Claude’s saved answers and your progress from this device. It can’t be undone.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="danger" loading={clearState === 'working'} onClick={() => void doClear()}>
                  Yes, clear it
                </Button>
                <Button size="sm" variant="ghost" disabled={clearState === 'working'} onClick={() => setClearState('idle')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {clearState === 'done' && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-good-text">
              <Check className="size-4" aria-hidden /> All clear. Saved projects, answers and progress were removed.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const SECTION_BODY: Record<SettingsSection, () => ReactNode> = {
  ai: () => <AiSection />,
  github: () => <GitHubSection />,
  preferences: () => <PreferencesSection />,
  data: () => <DataSection />,
}

function SettingsContent({ initial, onClose }: { initial: SettingsSection; onClose: () => void }) {
  const [section, setSection] = useState<SettingsSection>(initial)
  const baseId = useId()
  const tabRefs = useRef(new Map<SettingsSection, HTMLButtonElement>())

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    let next = -1
    if (delta) next = (index + delta + SECTIONS.length) % SECTIONS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = SECTIONS.length - 1
    if (next < 0) return
    e.preventDefault()
    setSection(SECTIONS[next].id)
    tabRefs.current.get(SECTIONS[next].id)?.focus()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 id={`${baseId}-title`} className="text-lg font-semibold text-ink">
            Settings
          </h2>
          <p className="text-sm text-ink-2">Changes are saved as you go.</p>
        </div>
        <IconButton aria-label="Close settings" size="sm" onClick={onClose} icon={<X className="size-4" />} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div
          role="tablist"
          aria-label="Settings sections"
          className="grid shrink-0 grid-cols-2 gap-1 border-b border-line px-3 py-2 sm:flex sm:w-52 sm:flex-col sm:border-r sm:border-b-0 sm:py-4"
        >
          {SECTIONS.map((s, i) => {
            const active = s.id === section
            return (
              <button
                key={s.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(s.id, el)
                  else tabRefs.current.delete(s.id)
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${s.id}`}
                aria-selected={active}
                aria-controls={`${baseId}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => setSection(s.id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm whitespace-nowrap transition-colors',
                  active ? 'bg-brand-soft font-semibold text-brand-text' : 'font-medium text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                {s.icon}
                {s.label}
              </button>
            )
          })}
        </div>
        <div
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${section}`}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7"
          data-testid={`settings-${section}`}
        >
          {SECTION_BODY[section]()}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 sm:px-6">
        <p className="text-xs text-ink-3">Stored only in this browser.</p>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}

/** Global settings dialog (reads useUi().settingsOpen). */
export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen)
  const section = useUi((s) => s.settingsSection)
  const closeSettings = useUi((s) => s.closeSettings)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    }
    if (!open && d.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label="Settings"
      onClose={closeSettings}
      onCancel={(e) => {
        e.preventDefault()
        closeSettings()
      }}
      onClick={(e) => {
        if (e.target === ref.current) closeSettings()
      }}
      className="m-auto h-[min(720px,calc(100dvh-1rem))] max-h-none w-[min(860px,calc(100vw-1rem))] max-w-none overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] sm:h-[min(720px,calc(100dvh-3rem))] sm:w-[min(860px,calc(100vw-3rem))]"
    >
      {open && <SettingsContent key={section} initial={section} onClose={closeSettings} />}
    </dialog>
  )
}
