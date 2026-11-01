import type { BetaMessageParam, BetaTextBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { extname } from '@/core/paths'
import type { ChatMessage, ConceptMap, ContextSize, Quiz, Tour } from '@/core/types'
import type { ClaudeRequest } from './client'
import { getRepoContext } from './context'
import {
  SYSTEM_INSTRUCTIONS,
  buildChatPrompt,
  buildConceptPrompt,
  buildConceptsPrompt,
  buildFilePrompt,
  buildFolderPrompt,
  buildModulePrompt,
  buildOverviewPrompt,
  buildQuizPrompt,
  buildSelectionPrompt,
  buildTechPrompt,
  buildTermPrompt,
  buildToursPrompt,
  type PromptData,
  type PromptFile,
} from './prompts'
import { pickRelevantFiles } from './relevance'
import { AiError, type AiContext, type ExplainTask, type PromptTask, type StreamCallbacks } from './types'
import { makePathResolver, validateConceptMap, validateQuiz, validateTours } from './validate'

/**
 * The Anthropic SDK and zod are only downloaded when Claude is actually called (they are large, and most readers
 * never add a key), so the client and the schemas are imported lazily here instead of at the top.
 */
const loadClient = () => import('./client')
const loadSchemas = () => import('./schemas')

/** Everything a prompt needs, without the API key / model (so copy-paste prompts work without a key). */
export type PromptInput = Omit<AiContext, 'apiKey' | 'model'>

/** Max chat turns (user + assistant messages) sent back to Claude as history. */
export const CHAT_HISTORY_LIMIT = 12
/** Max files pulled into a chat turn. */
export const CHAT_MAX_FILES = 6

/**
 * The two system blocks shared by EVERY task and chat turn for a repo: the fixed instructions, then the repository
 * context with a cache breakpoint. Both are byte-stable, so the prompt cache is reused across tasks.
 *
 * The breakpoint uses the 1-hour cache: people read an overview, a tour or a concept map for several minutes before
 * their next question, so a 5-minute entry would usually have expired and every action would pay to write the whole
 * context again. A 1-hour write costs 2× the input price once; each later read costs a small fraction of it.
 */
export function systemBlocks(input: Pick<PromptInput, 'analysis' | 'snapshot' | 'contextSize'>): BetaTextBlockParam[] {
  const repo = getRepoContext(input.analysis, input.snapshot, input.contextSize)
  return [
    { type: 'text', text: SYSTEM_INSTRUCTIONS },
    { type: 'text', text: repo.text, cache_control: { type: 'ephemeral', ttl: '1h' } },
  ]
}

function promptData(input: PromptInput): PromptData {
  return { analysis: input.analysis, snapshot: input.snapshot, level: input.level }
}

const BINARY_EXT = new Set(
  'png jpg jpeg gif webp avif ico bmp tif tiff psd pdf zip gz tgz tar rar 7z woff woff2 ttf otf eot mp3 mp4 m4a wav ogg flac mov avi mkv webm exe dll so dylib jar class wasm bin dat db sqlite pyc o a lib'.split(' '),
)

/** Images, fonts, archives …: never worth sending to Claude as text. */
export function isProbablyBinary(path: string, content?: string): boolean {
  if (BINARY_EXT.has(extname(path))) return true
  return content !== undefined && content.slice(0, 8000).includes('\u0000')
}

/** A file's text: from the snapshot, or downloaded on demand. null when it can't be fetched or isn't text. */
async function readFile(input: PromptInput, path: string): Promise<string | null> {
  const local = input.snapshot.files[path]
  if (typeof local === 'string') return isProbablyBinary(path, local) ? null : local
  if (isProbablyBinary(path)) return null
  try {
    const text = await input.getFileContent(path)
    return isProbablyBinary(path, text) ? null : text
  } catch {
    return null
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AiError('aborted', 'Stopped.')
}

/** The user message for an explanation task (markdown answer). */
export async function buildExplainMessage(input: PromptInput, task: ExplainTask): Promise<string> {
  const d = promptData(input)
  switch (task.kind) {
    case 'overview':
      return buildOverviewPrompt(d)
    case 'module':
      return buildModulePrompt(d, task.moduleId)
    case 'file':
      return buildFilePrompt(d, task.path, await readFile(input, task.path))
    case 'folder':
      return buildFolderPrompt(d, task.path)
    case 'selection':
      return buildSelectionPrompt(d, task.path, await readFile(input, task.path), task.startLine, task.endLine)
    case 'concept': {
      // Pull in up to 3 of the concept's files that the shared context doesn't already contain.
      const inContext = new Set(getRepoContext(input.analysis, input.snapshot, input.contextSize).includedFiles)
      const extra = task.concept.files.filter((p) => input.analysis.files[p] && !inContext.has(p)).slice(0, 3)
      const files: PromptFile[] = await Promise.all(extra.map(async (path) => ({ path, content: await readFile(input, path) })))
      return buildConceptPrompt(d, task.concept, files)
    }
    case 'tech':
      return buildTechPrompt(d, task.techId)
    case 'term':
      return buildTermPrompt(d, task.termId)
  }
}

/** 'high' for the big-picture overview, 'medium' for focused explanations. */
export function explainEffort(task: ExplainTask): ClaudeRequest['effort'] {
  return task.kind === 'overview' ? 'high' : 'medium'
}

function request(ctx: AiContext, messages: BetaMessageParam[], effort: ClaudeRequest['effort']): ClaudeRequest {
  return { apiKey: ctx.apiKey, model: ctx.model, system: systemBlocks(ctx), messages, effort }
}

/** Stream a markdown explanation for a module / file / folder / selection / concept / tech / term / the whole project. */
export async function runExplainTask(ctx: AiContext, task: ExplainTask, cb?: StreamCallbacks): Promise<string> {
  if (!ctx.apiKey.trim()) throw new AiError('no-key', 'Add your Claude API key in Settings to get in-depth explanations.')
  cb?.onStatus?.('connecting')
  const [content, { streamText }] = await Promise.all([buildExplainMessage(ctx, task), loadClient()])
  throwIfAborted(cb?.signal)
  const { text } = await streamText(request(ctx, [{ role: 'user', content }], explainEffort(task)), cb)
  return text
}

const NOTHING_USABLE = 'Claude’s answer didn’t contain anything RepoAtlas could use. Please try again.'

/** Generate the AI concept map (8–18 concepts, relations reference concept ids, files are real repo paths). source: 'ai'. */
export async function generateConceptMap(ctx: AiContext, cb?: StreamCallbacks): Promise<ConceptMap> {
  const content = buildConceptsPrompt(promptData(ctx), 'json')
  const [{ generateStructured }, { ConceptMapSchema }] = await Promise.all([loadClient(), loadSchemas()])
  const { data } = await generateStructured(request(ctx, [{ role: 'user', content }], 'high'), ConceptMapSchema, cb)
  const map = validateConceptMap(data, ctx.analysis, ctx.snapshot)
  if (!map.concepts.length) throw new AiError('bad-output', NOTHING_USABLE)
  return map
}

/**
 * Generate guided tours (3–5 tours of 4–9 steps), or a single tour answering `question` ("How does login work?").
 * Steps reference real files, verbatim snippets and module ids from the analysis. source: 'ai'.
 */
export async function generateTours(ctx: AiContext, opts?: { question?: string; takenIds?: Set<string> }, cb?: StreamCallbacks): Promise<Tour[]> {
  const question = opts?.question?.trim() || undefined
  const content = buildToursPrompt(promptData(ctx), 'json', question)
  const [{ generateStructured }, { ToursSchema }] = await Promise.all([loadClient(), loadSchemas()])
  const { data } = await generateStructured(request(ctx, [{ role: 'user', content }], 'high'), ToursSchema, cb)

  // Load the files the steps point at, so snippets can be checked against the real text.
  const resolve = makePathResolver(ctx.analysis, ctx.snapshot)
  const contents = new Map<string, string | null>()
  const wanted = new Set<string>()
  for (const t of data.tours ?? []) {
    for (const s of t.steps ?? []) {
      const path = s.snippet ? resolve(s.file) : null
      if (path) wanted.add(path)
    }
  }
  await Promise.all([...wanted].slice(0, 40).map(async (p) => contents.set(p, await readFile(ctx, p))))

  const tours = validateTours(data, ctx.analysis, {
    snapshot: ctx.snapshot,
    contentOf: (p) => (contents.has(p) ? contents.get(p) : ctx.snapshot.files[p]),
    takenIds: opts?.takenIds,
    single: question ? { question } : undefined,
  })
  if (!tours.length) throw new AiError('bad-output', NOTHING_USABLE)
  return tours
}

/** Generate a 6–8 question multiple-choice quiz about how this project works. */
export async function generateQuiz(ctx: AiContext, cb?: StreamCallbacks): Promise<Quiz> {
  const content = buildQuizPrompt(promptData(ctx), 'json')
  const [{ generateStructured }, { QuizSchema }] = await Promise.all([loadClient(), loadSchemas()])
  const { data } = await generateStructured(request(ctx, [{ role: 'user', content }], 'high'), QuizSchema, cb)
  const quiz = validateQuiz(data)
  if (!quiz.questions.length) throw new AiError('bad-output', NOTHING_USABLE)
  return quiz
}

/**
 * Prior chat messages → alternating user/assistant API messages (last CHAT_HISTORY_LIMIT).
 * Questions that never got a good answer (error / empty reply) are dropped together with the failed reply.
 */
export function historyToMessages(history: ChatMessage[], limit = CHAT_HISTORY_LIMIT): BetaMessageParam[] {
  const pairs: BetaMessageParam[] = []
  for (let i = 0; i < history.length; i++) {
    const m = history[i]
    if (m.role !== 'user' || !m.content.trim()) continue
    const reply = history[i + 1]
    if (reply && reply.role === 'assistant' && !reply.error && reply.content.trim()) {
      pairs.push({ role: 'user', content: m.content.trim() }, { role: 'assistant', content: reply.content.trim() })
      i++
    }
  }
  const max = Math.max(0, limit - (limit % 2))
  return max === 0 ? [] : pairs.slice(-max)
}

function chatFileBudget(size: ContextSize): number {
  return size === 'small' ? 6000 : size === 'large' ? 20_000 : 12_000
}

/** Which files to attach to a chat question, given the repository context Claude already has. */
export interface ChatFilePlan {
  /** Files to send with the question (`fromLine` set when the context already shows the lines before it). */
  files: PromptFile[]
  /** Relevant files the context already contains in full: named, not sent again. */
  alreadyShown: string[]
}

/**
 * Pick the files to send with a chat question. Files the shared context already shows in full are not sent again
 * (Claude has them, cached); for files it shows only the start of, just the rest is sent. The room this saves goes to
 * the next most relevant files.
 */
export async function planChatFiles(
  input: PromptInput,
  question: string,
  opts: { contextSize: ContextSize; maxFiles: number },
): Promise<ChatFilePlan> {
  const { coverage } = getRepoContext(input.analysis, input.snapshot, opts.contextSize)
  const candidates = pickRelevantFiles(input.analysis, question, opts.maxFiles * 3)
  const picked: { path: string; fromLine?: number }[] = []
  const alreadyShown: string[] = []
  for (const path of candidates) {
    if (picked.length >= opts.maxFiles) break
    const cov = Object.hasOwn(coverage, path) ? coverage[path] : undefined
    if (cov && cov.shownLines >= cov.totalLines) {
      alreadyShown.push(path)
      continue
    }
    picked.push(cov ? { path, fromLine: cov.shownLines + 1 } : { path })
  }
  const files = await Promise.all(picked.map(async (f): Promise<PromptFile> => ({ ...f, content: await readFile(input, f.path) })))
  return { files, alreadyShown }
}

async function chatTurn(input: PromptInput, question: string): Promise<string> {
  const plan = await planChatFiles(input, question, { contextSize: input.contextSize, maxFiles: CHAT_MAX_FILES })
  return buildChatPrompt(promptData(input), question, plan.files, chatFileBudget(input.contextSize), plan.alreadyShown)
}

/** Answer a question about the repo, given prior chat history. Pulls in files mentioned/relevant to the question. */
export async function askQuestion(ctx: AiContext, history: ChatMessage[], question: string, cb?: StreamCallbacks): Promise<string> {
  if (!ctx.apiKey.trim()) throw new AiError('no-key', 'Add your Claude API key in Settings to chat about this project.')
  if (!question.trim()) throw new AiError('unknown', 'Type a question first.')
  cb?.onStatus?.('connecting')
  const [content, { streamText }] = await Promise.all([chatTurn(ctx, question), loadClient()])
  throwIfAborted(cb?.signal)
  const messages: BetaMessageParam[] = [...historyToMessages(history), { role: 'user', content }]
  const { text } = await streamText(request(ctx, messages, 'medium'), cb)
  return text
}

/** The context size used for copy-paste prompts (small enough to paste into a chat message). */
export const COPY_PROMPT_CONTEXT: ContextSize = 'small'

/**
 * Build a complete, self-contained prompt (instructions + repo context + task) that a user without an API key can
 * paste into claude.ai. Uses a smaller context so it fits in a chat message — and every "is this already in the
 * context?" decision is made against that smaller context, not the one in Settings.
 */
export async function buildCopyPrompt(input: Omit<AiContext, 'apiKey' | 'model'>, task: PromptTask): Promise<string> {
  const ctx: PromptInput = { ...input, contextSize: COPY_PROMPT_CONTEXT }
  const d = promptData(ctx)
  let body: string
  switch (task.kind) {
    case 'concepts':
      body = buildConceptsPrompt(d, 'markdown')
      break
    case 'tours':
      body = buildToursPrompt(d, 'markdown', task.question)
      break
    case 'quiz':
      body = buildQuizPrompt(d, 'markdown')
      break
    case 'chat': {
      const plan = await planChatFiles(ctx, task.question, { contextSize: COPY_PROMPT_CONTEXT, maxFiles: 3 })
      body = buildChatPrompt(d, task.question, plan.files, chatFileBudget(COPY_PROMPT_CONTEXT), plan.alreadyShown)
      break
    }
    default:
      body = await buildExplainMessage(ctx, task)
  }
  const repo = getRepoContext(ctx.analysis, ctx.snapshot, COPY_PROMPT_CONTEXT)
  return [
    `# Help me understand the GitHub project ${ctx.analysis.meta.fullName}`,
    'I’m using RepoAtlas, a tool that explains code to people without a programming background. Please follow the guide instructions below, read the project material, then answer my request at the end.',
    '## Instructions for you',
    SYSTEM_INSTRUCTIONS,
    '## The project',
    repo.text,
    '## My request',
    body,
  ].join('\n\n')
}

function shortHash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** A stable string identifying an explanation task (used in cache keys). */
export function explainTaskKey(task: ExplainTask): string {
  switch (task.kind) {
    case 'overview':
      return 'overview'
    case 'module':
      return `module:${task.moduleId}`
    case 'file':
      return `file:${task.path}`
    case 'folder':
      return `folder:${task.path}`
    case 'selection':
      return `selection:${task.path}:${task.startLine}-${task.endLine}`
    case 'concept':
      return `concept:${task.concept.id}:${shortHash(`${task.concept.name}\n${task.concept.summary}`)}`
    case 'tech':
      return `tech:${task.techId}`
    case 'term':
      return `term:${task.termId}`
  }
}
