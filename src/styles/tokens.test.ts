import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Design-token checks: text and graph contrast, and layer colors that stay tellable apart on the code map. */
const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2].toLowerCase()
  return out
}
const THEMES = { light: block(':root'), dark: block('[data-theme="dark"]') }

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(channel)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
/** color-mix(in oklab, c p, surface) as OKLab. */
const tint = (c: string, surface: string, p: number) => {
  const a = oklab(c)
  const b = oklab(surface)
  return a.map((v, i) => v * p + b[i] * (1 - p))
}
const deltaE = (a: number[], b: number[]) => 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe.each(Object.entries(THEMES))('%s theme tokens', (_, t) => {
  it('secondary text (ink-3) reads at WCAG AA on every page surface', () => {
    for (const bg of ['canvas', 'surface', 'surface-2', 'brand-soft']) expect(contrast(t['ink-3'], t[bg])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['ink-3'], t['surface-3'])).toBeGreaterThanOrEqual(4.5)
  })

  it('graph lines and arrowheads have at least 3:1 contrast on the map surface', () => {
    expect(contrast(t.edge, t.surface)).toBeGreaterThanOrEqual(3)
  })

  it('no two kinds of code look alike on the code map (regression: Connections vs Build & deploy, Screens vs Documentation)', () => {
    const layers = ['ui', 'api', 'logic', 'data', 'test', 'config', 'docs', 'infra', 'other']
    const tinted = layers.map((l) => tint(t[`layer-${l}`], t.surface, 0.65))
    let worst = Infinity
    for (let i = 0; i < layers.length; i++) for (let j = i + 1; j < layers.length; j++) worst = Math.min(worst, deltaE(tinted[i], tinted[j]))
    // The palette's own closest anchors sit at ~8.4 (light) / ~6.8 (dark); nothing we picked may be closer.
    expect(worst).toBeGreaterThanOrEqual(6.5)
  })
})
