import type { GitHubErrorKind, SkipReason } from '@/core/types'

export interface GitHubErrorOptions {
  detail?: string
  resetAt?: number
  status?: number
  /**
   * Set when a single file was refused for a reason that belongs in `RepoSnapshot.skipped`
   * (e.g. 'binary' for images, compiled files or Git LFS placeholders) rather than counting as a download failure.
   */
  skipReason?: SkipReason
}

/** A GitHub failure with a friendly, non-technical message suitable for showing to the user. */
export class GitHubError extends Error {
  kind: GitHubErrorKind
  /** Optional technical detail (status code, raw message) for a "details" disclosure. */
  detail?: string
  /** For rate limits: when the limit resets (ms since epoch). */
  resetAt?: number
  status?: number
  /** See GitHubErrorOptions.skipReason. */
  skipReason?: SkipReason

  constructor(kind: GitHubErrorKind, message: string, opts: GitHubErrorOptions = {}) {
    super(message)
    this.name = 'GitHubError'
    this.kind = kind
    this.detail = opts.detail
    this.resetAt = opts.resetAt
    this.status = opts.status
    this.skipReason = opts.skipReason
  }
}

export function isGitHubError(err: unknown): err is GitHubError {
  return err instanceof GitHubError
}

/** True for the error thrown by fetch() / our own checks when an AbortSignal fires. */
export function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    ((err as { name: unknown }).name === 'AbortError' || (err as { name: unknown }).name === 'TimeoutError')
  )
}

/** Throw the signal's abort reason (as an AbortError) if it has fired. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const reason: unknown = signal.reason
  if (isAbortError(reason)) throw reason
  throw new DOMException('The operation was aborted.', 'AbortError')
}

/** Resolve after `ms`, or reject with an AbortError as soon as `signal` fires. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      try {
        throwIfAborted(signal)
      } catch (err) {
        reject(err)
      }
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      try {
        throwIfAborted(signal)
      } catch (err) {
        reject(err)
      }
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Best-effort text of an unknown thrown value, for `detail`. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

// ─── Friendly messages shared by api.ts / files.ts ────────────────────────────

export const MESSAGES = {
  notFound:
    "We couldn't find that repository. Double-check the name — and if it's private, add a GitHub token in Settings.",
  unauthorized:
    'Your GitHub token was rejected — it may have expired, been revoked, or been copied only partly. Update it in Settings, or remove it to continue without one.',
  network: "We couldn't reach GitHub. Please check your internet connection and try again.",
  empty: "This repository is empty — there's no code to explore yet.",
  serverError: 'GitHub is having a hiccup right now. Please wait a minute and try again.',
  unavailable: 'GitHub has made this repository unavailable to view (this sometimes happens for legal reasons).',
  unknown: 'Something unexpected happened while talking to GitHub. Please try again in a moment.',
  badResponse: 'GitHub sent back an answer we couldn’t understand. Please try again in a moment.',
} as const

/** Local "h:mm" clock time, e.g. "3:45 PM" (en-US) or "15:45" (en-GB). */
export function formatResetTime(resetAt: number): string {
  return new Date(resetAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function rateLimitMessage(resetAt: number, hasToken: boolean): string {
  const time = formatResetTime(resetAt)
  if (hasToken) {
    return `You've used up GitHub's hourly allowance for your token. It refills at ${time} — please try again then.`
  }
  return (
    `GitHub allows 60 requests an hour for visitors without a token, and that allowance has run out for now. ` +
    `It refills at ${time}. Want to keep going right away? Add a free GitHub token in Settings — it raises the limit to 5,000 an hour.`
  )
}
