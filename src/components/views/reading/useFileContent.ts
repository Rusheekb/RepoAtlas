import { useCallback, useEffect, useState } from 'react'
import type { AnalyzedFile, SkipReason } from '@/core/types'
import { isGitHubError } from '@/github'
import { useRepoStore, useSnapshot } from '@/state/repo'
import { fileAvailability } from './explorer'

export type FileLoad =
  | { status: 'ready'; content: string; reason: SkipReason | null }
  | { status: 'loading'; reason: SkipReason | null }
  | { status: 'error'; message: string; reason: SkipReason | null }
  | { status: 'binary' }
  | { status: 'too-large'; size: number }

const GENERIC_ERROR = 'We couldn’t download this file from GitHub just now. Your connection may have dropped, or GitHub is busy.'

/**
 * A file's text for the code viewer: straight from the snapshot when we already have it, otherwise downloaded on demand
 * (with loading and error states). Images, compiled files and very large files are reported instead of downloaded.
 */
export function useFileContent(file: AnalyzedFile | null): { load: FileLoad | null; retry: () => void } {
  const snapshot = useSnapshot()
  const getFileContent = useRepoStore((s) => s.getFileContent)
  const [attempt, setAttempt] = useState(0)
  const [remote, setRemote] = useState<{ path: string; attempt: number; load: FileLoad } | null>(null)

  const availability = file ? fileAvailability(file, snapshot) : null
  const path = file?.path ?? null
  const needsDownload = availability?.kind === 'download'
  const reason = availability?.kind === 'download' ? availability.reason : null

  useEffect(() => {
    if (!path || !needsDownload) return
    let alive = true
    getFileContent(path).then(
      (content) => {
        if (alive) setRemote({ path, attempt, load: { status: 'ready', content, reason } })
      },
      (err: unknown) => {
        if (!alive) return
        if (isGitHubError(err) && err.skipReason === 'binary') {
          setRemote({ path, attempt, load: { status: 'binary' } })
          return
        }
        const message = isGitHubError(err) ? err.message : GENERIC_ERROR
        setRemote({ path, attempt, load: { status: 'error', message, reason } })
      },
    )
    return () => {
      alive = false
    }
  }, [path, needsDownload, reason, attempt, getFileContent])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (!file || !availability) return { load: null, retry }
  switch (availability.kind) {
    case 'ready':
      return { load: { status: 'ready', content: availability.content, reason: null }, retry }
    case 'binary':
      return { load: { status: 'binary' }, retry }
    case 'too-large':
      return { load: { status: 'too-large', size: availability.size }, retry }
    case 'download':
      return {
        load: remote && remote.path === file.path && remote.attempt === attempt ? remote.load : { status: 'loading', reason: availability.reason },
        retry,
      }
  }
}
