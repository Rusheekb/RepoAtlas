/** Pure data helpers for the stacked bars (language share, layer share). */
import { LAYER_INFO } from '@/core/labels'
import { LAYERS, type Layer, type LanguageStat } from '@/core/types'

export interface BarSegment {
  key: string
  label: string
  value: number
  /** 0–100 share of the total. */
  percent: number
  color: string
  description?: string
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const CSS_VAR = /^var\(--[a-z0-9-]+\)$/i

/** Only allow plain hex colors or our own CSS variables (colors can come from analysis data). */
export function safeColor(color: string | null | undefined, fallback = 'var(--layer-other)'): string {
  const c = color?.trim()
  if (c && (HEX.test(c) || CSS_VAR.test(c))) return c
  return fallback
}

export const OTHER_KEY = '__other__'

/**
 * Language share segments: the top `max` languages by size, the rest folded into one "Other" segment
 * (or shown by name if only one language would be folded). Percentages are recomputed from bytes so the
 * bar and the legend always agree.
 */
export function foldLanguages(languages: readonly LanguageStat[], max = 6): BarSegment[] {
  const list = languages.filter((l) => l.bytes > 0 || l.percent > 0)
  const totalBytes = list.reduce((s, l) => s + Math.max(0, l.bytes), 0)
  const useBytes = totalBytes > 0
  const total = useBytes ? totalBytes : list.reduce((s, l) => s + Math.max(0, l.percent), 0)
  if (!list.length || total <= 0) return []
  const sorted = list
    .map((l, i) => ({ l, i, v: useBytes ? Math.max(0, l.bytes) : Math.max(0, l.percent) }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
  const limit = Math.max(1, Math.floor(max))
  const keep = sorted.length > limit + 1 ? sorted.slice(0, limit) : sorted
  const rest = sorted.length > limit + 1 ? sorted.slice(limit) : []
  const segments: BarSegment[] = keep
    .filter((x) => x.v > 0)
    .map(({ l, v }) => ({
      key: `lang:${l.name}`,
      label: l.name,
      value: v,
      percent: (v / total) * 100,
      color: safeColor(l.color),
      description: `${l.files} ${l.files === 1 ? 'file' : 'files'}`,
    }))
  const restValue = rest.reduce((s, x) => s + x.v, 0)
  if (restValue > 0) {
    segments.push({
      key: OTHER_KEY,
      label: 'Other',
      value: restValue,
      percent: (restValue / total) * 100,
      color: 'var(--layer-other)',
      description: rest.map((x) => x.l.name).join(', '),
    })
  }
  return segments
}

/** Layer share segments in the fixed layer order (never by size, so colors and positions stay put). */
export function layerSegments(breakdown: Partial<Record<Layer, number>>): BarSegment[] {
  const total = LAYERS.reduce((s, l) => s + Math.max(0, breakdown[l] ?? 0), 0)
  if (total <= 0) return []
  return LAYERS.filter((l) => (breakdown[l] ?? 0) > 0).map((l) => {
    const value = breakdown[l] ?? 0
    return {
      key: `layer:${l}`,
      label: LAYER_INFO[l].label,
      value,
      percent: (value / total) * 100,
      color: LAYER_INFO[l].color,
      description: LAYER_INFO[l].description,
    }
  })
}
