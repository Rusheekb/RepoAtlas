import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, ClipboardCopy, ExternalLink, KeyRound, Trash2 } from 'lucide-react'
import { useChat, useCopyPrompt, useHasAiKey } from '@/ai'
import { useRepoNav } from '@/components/shell/hooks'
import { normalizeCodeRef } from '@/components/shell/urls'
import { Button, Modal } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { ChatBubble } from '@/components/views/reading/ChatBubble'
import { Composer, type ComposerHandle } from '@/components/views/reading/Composer'
import { suggestedQuestions, type SuggestedQuestion } from '@/components/views/reading/suggestions'
import { ViewHeader } from '@/components/views/visual/ViewHeader'
import { VIEW_INFO } from '@/core/labels'
import { useAnalysis } from '@/state/repo'
import { useUi } from '@/state/ui'
import '@/components/views/reading/reading.css'

const CLAUDE_NEW_CHAT_URL = 'https://claude.ai/new'
const KEY_ERRORS = new Set(['invalid-key', 'no-key'])
/** How close to the bottom (px) still counts as "following along" while an answer streams in. */
const STICK_THRESHOLD = 96

function SuggestionList({ items, onPick, label }: { items: SuggestedQuestion[]; onPick: (text: string) => void; label: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{label}</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="suggestions">
        {items.map((s) => (
          <li key={s.text}>
            <button
              type="button"
              onClick={() => onPick(s.text)}
              className="flex h-full w-full items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-sm text-ink shadow-sm hover:border-line-strong hover:bg-surface-2 motion-safe:transition-colors"
            >
              <span className="shrink-0 text-base leading-5" aria-hidden>
                {s.emoji}
              </span>
              <span className="min-w-0">{s.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** "Copy prompt" for readers without a key: builds a ready-made prompt for the typed question. */
function useQuestionPrompt() {
  const buildPrompt = useCopyPrompt()
  const [status, setStatus] = useState<'idle' | 'working' | 'copied' | 'failed'>('idle')
  const [manual, setManual] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const copy = useCallback(
    async (question: string) => {
      setStatus('working')
      let text: string
      try {
        text = await buildPrompt({ kind: 'chat', question })
      } catch {
        setStatus('failed')
        return
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
        await navigator.clipboard.writeText(text)
        setStatus('copied')
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setStatus('idle'), 3000)
      } catch {
        setStatus('idle')
        setManual(text)
      }
    },
    [buildPrompt],
  )
  return { copy, status, manual, closeManual: () => setManual(null) }
}

/**
 * "Ask a Question": chat with Claude about this project. Answers are markdown with clickable file paths (they open in
 * "Read the Code"). Without a key it explains how chatting works and turns a typed question into a ready-made prompt
 * for claude.ai. ?q= pre-fills the question box.
 */
export default function AskPage() {
  const analysis = useAnalysis()
  const hasKey = useHasAiKey()
  const chat = useChat()
  const { go } = useRepoNav()
  const openSettings = useUi((s) => s.openSettings)
  const [params] = useSearchParams()
  const [draft, setDraft] = useState(() => params.get('q') ?? '')
  const [confirmClear, setConfirmClear] = useState(false)
  const composer = useRef<ComposerHandle>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prompt = useQuestionPrompt()
  const info = VIEW_INFO.ask

  const suggestions = useMemo(() => suggestedQuestions(analysis), [analysis])
  const busy = chat.state === 'loading' || chat.state === 'streaming'
  const { messages } = chat
  const lastId = messages[messages.length - 1]?.id

  const isCodeLink = useCallback((code: string) => normalizeCodeRef(code) in analysis.files, [analysis.files])
  const onCodeClick = useCallback(
    (code: string) => {
      const path = normalizeCodeRef(code)
      if (!(path in analysis.files)) return false
      const m = /:(\d+)(?:-(\d+))?$|#L(\d+)/.exec(code.trim())
      const line = m ? (m[1] ?? m[3]) : undefined
      go('explore', { file: path, line })
      return true
    },
    [analysis.files, go],
  )

  // Follow the conversation as it grows, unless the reader scrolled up to re-read something.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current && messages.length > 0) el.scrollTop = el.scrollHeight
  }, [messages])
  const onScroll = () => {
    const el = scroller.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD
  }

  useEffect(() => {
    if (!confirmClear) return
    const t = setTimeout(() => setConfirmClear(false), 4000)
    return () => clearTimeout(t)
  }, [confirmClear])

  // Focus the question box when arriving with a pre-filled question.
  useEffect(() => {
    if (params.get('q')) composer.current?.focus()
  }, [params])

  const send = (text: string) => {
    if (!hasKey) {
      void prompt.copy(text)
      return
    }
    stick.current = true
    chat.send(text)
    setDraft('')
  }

  const pickSuggestion = (text: string) => {
    if (hasKey && !busy) {
      send(text)
    } else {
      setDraft(text)
      composer.current?.focus()
    }
  }

  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const keyProblem = chat.errorKind != null && KEY_ERRORS.has(chat.errorKind)

  const copyAction = (
    <Button
      type="submit"
      variant="primary"
      className="h-10"
      disabled={!draft.trim()}
      loading={prompt.status === 'working'}
      icon={prompt.status === 'copied' ? <Check className="size-4" aria-hidden /> : <ClipboardCopy className="size-4" aria-hidden />}
    >
      {prompt.status === 'copied' ? 'Copied!' : 'Copy prompt'}
    </Button>
  )

  return (
    <div className="flex h-full min-h-[540px] shrink-0 flex-col" data-testid="ask-page">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 sm:pt-6">
        <ViewHeader
          emoji={info.emoji}
          title={info.label}
          hint="Ask about this project in your own words. Claude reads the code and answers in plain English, with links to the files it mentions."
          actions={
            messages.length > 0 && (
              <Button
                size="sm"
                variant={confirmClear ? 'danger' : 'ghost'}
                icon={<Trash2 className="size-4" aria-hidden />}
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true)
                    return
                  }
                  setConfirmClear(false)
                  chat.clear()
                }}
              >
                {confirmClear ? 'Click again to clear' : 'Clear chat'}
              </Button>
            )
          }
        />
      </div>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto" data-testid="chat-scroll">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
          {messages.length === 0 ? (
            hasKey ? (
              <div className="space-y-6 motion-safe:animate-[atlas-pop_200ms_ease-out]">
                <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-xl" aria-hidden>
                    ✨
                  </span>
                  <div className="min-w-0 text-sm leading-relaxed text-ink-2">
                    <p className="text-base font-semibold text-ink">Claude is ready for your questions</p>
                    <p className="mt-1">
                      Ask anything, however simple. There are no silly questions here. Claude reads the relevant code first, then explains it at
                      your reading level. File names in answers are links you can click.
                    </p>
                  </div>
                </div>
                <SuggestionList items={suggestions} onPick={pickSuggestion} label="Try one of these" />
              </div>
            ) : (
              <div className="space-y-6" data-testid="ask-no-key">
                <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-xl" aria-hidden>
                      💬
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-ink">Chat with Claude about this project</h2>
                      <p className="mt-1 text-sm leading-relaxed text-ink-2">
                        Claude is an AI assistant. Here it reads this project’s actual code before answering, so you can ask things like
                        “what happens when someone logs in?” and get a plain-English answer that points to the right files.
                      </p>
                    </div>
                  </div>
                  <ol className="mt-5 grid gap-3 sm:grid-cols-2">
                    <li className="rounded-xl bg-surface-2 p-4">
                      <p className="text-sm font-semibold text-ink">
                        <span aria-hidden>🔑 </span>Chat right here
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-2">
                        Add your own Claude API key. It stays in this browser and is only ever sent to Anthropic, the company that makes Claude.
                      </p>
                      <Button className="mt-3" size="sm" variant="primary" icon={<KeyRound className="size-4" aria-hidden />} onClick={() => openSettings('ai')}>
                        Add your Claude API key
                      </Button>
                    </li>
                    <li className="rounded-xl bg-surface-2 p-4">
                      <p className="text-sm font-semibold text-ink">
                        <span aria-hidden>📋 </span>No key? Use claude.ai
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-2">
                        Type your question below and press <strong className="font-semibold text-ink">Copy prompt</strong>. We’ll bundle it with
                        the project’s key code, ready to paste into a new chat on{' '}
                        <a href={CLAUDE_NEW_CHAT_URL} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-text underline underline-offset-2">
                          claude.ai
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                        .
                      </p>
                    </li>
                  </ol>
                </div>
                <SuggestionList items={suggestions} onPick={pickSuggestion} label="Not sure what to ask? Pick one to start" />
              </div>
            )
          ) : (
            <ol className="space-y-5" aria-label="Conversation" aria-busy={busy || undefined}>
              {messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  message={m}
                  live={busy && m.id === lastId && m.role === 'assistant'}
                  aiStatus={chat.aiStatus}
                  isCodeLink={isCodeLink}
                  onCodeClick={onCodeClick}
                  keyProblem={keyProblem && m.id === lastId}
                  onOpenSettings={() => openSettings('ai')}
                  onRetry={m.id === lastId && lastQuestion && hasKey ? () => send(lastQuestion) : undefined}
                />
              ))}
            </ol>
          )}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {busy ? 'Claude is writing an answer…' : chat.state === 'done' ? 'Claude has answered.' : chat.state === 'error' ? 'Claude couldn’t answer.' : ''}
      </p>
      <div className="border-t border-line bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6 sm:py-4">
          {!hasKey && messages.length > 0 && (
            <p className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
              Claude needs your API key to keep chatting.
              <button type="button" onClick={() => openSettings('ai')} className="font-medium text-brand-text hover:underline">
                Add a key
              </button>
            </p>
          )}
          <Composer
            ref={composer}
            value={draft}
            onChange={setDraft}
            onSubmit={send}
            busy={busy}
            onStop={chat.cancel}
            placeholder={hasKey ? 'Ask anything about this project…' : 'Type your question…'}
            action={hasKey ? undefined : copyAction}
            hint={
              <span className={cn('flex flex-wrap items-center gap-x-1.5', prompt.status === 'failed' && 'text-bad-text')} aria-live="polite">
                {prompt.status === 'copied' ? (
                  <>
                    Copied! Now paste it into a new chat on
                    <a href={CLAUDE_NEW_CHAT_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-medium text-brand-text underline underline-offset-2">
                      claude.ai <ExternalLink className="size-3" aria-hidden />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </>
                ) : prompt.status === 'failed' ? (
                  'Sorry, we couldn’t build the prompt. Please try again.'
                ) : (
                  <span className="max-sm:hidden">Press Enter to {hasKey ? 'send' : 'copy'}, Shift + Enter for a new line.</span>
                )}
              </span>
            }
          />
        </div>
      </div>

      <Modal
        open={prompt.manual != null}
        onClose={prompt.closeManual}
        title="Copy this prompt"
        description="Your browser didn’t let us copy automatically. Select all the text below, copy it, then paste it into a new chat on claude.ai."
        footer={
          <>
            <a
              href={CLAUDE_NEW_CHAT_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-brand-text hover:bg-brand-soft"
            >
              Open claude.ai <ExternalLink className="size-4" aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <Button variant="primary" onClick={prompt.closeManual}>
              Done
            </Button>
          </>
        }
      >
        <label className="sr-only" htmlFor="ask-manual-prompt">
          Prompt for Claude
        </label>
        <textarea
          id="ask-manual-prompt"
          readOnly
          value={prompt.manual ?? ''}
          onFocus={(e) => e.currentTarget.select()}
          className="h-72 w-full resize-none rounded-xl border border-line bg-surface-2 p-3 font-mono text-xs text-ink"
        />
      </Modal>
    </div>
  )
}
