import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface ElementSize {
  width: number
  height: number
}

/** Track an element's content-box size with ResizeObserver (rounded to whole pixels). */
export function useElementSize<T extends Element>(): [RefObject<T | null>, ElementSize] {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (w: number, h: number) => {
      const width = Math.max(0, Math.round(w))
      const height = Math.max(0, Math.round(h))
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }
    const rect = el.getBoundingClientRect()
    update(rect.width, rect.height)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      const box = entry.contentRect
      update(box.width, box.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

/**
 * Like useElementSize, for an element that may come and go (e.g. only rendered in one view mode): pass the returned
 * callback as the element's `ref`. The size is 0 × 0 while the element isn't mounted.
 */
export function useMeasuredElement<T extends Element>(): [(el: T | null) => void, ElementSize] {
  const [el, setEl] = useState<T | null>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })
  const ref = useCallback((node: T | null) => setEl(node), [])
  useLayoutEffect(() => {
    const update = (w: number, h: number) => {
      const width = Math.max(0, Math.round(w))
      const height = Math.max(0, Math.round(h))
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }
    if (!el) {
      update(0, 0)
      return
    }
    const rect = el.getBoundingClientRect()
    update(rect.width, rect.height)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) update(entry.contentRect.width, entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [ref, size]
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** True when the reader asked the OS for less motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION).matches : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(REDUCED_MOTION)
    const onChange = () => setReduced(mq.matches)
    onChange()
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}
