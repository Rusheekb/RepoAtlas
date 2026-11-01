import { makeModule } from '@/components/graphs/testFixtures'
import { betterDirection, presentLayers } from './architecture'
import { keyBelongsToSomethingElse } from './tours'

describe('presentLayers (map legend)', () => {
  it('includes every layer a card’s mini bar draws, not only each part’s main layer', () => {
    const mods = [
      makeModule('src/flask', { layer: 'logic', layerBreakdown: { logic: 70, api: 20, data: 5, config: 5 } }),
      makeModule('tests', { layer: 'test', layerBreakdown: { test: 100, infra: 0 } }),
    ]
    expect(presentLayers(mods)).toEqual(['api', 'logic', 'data', 'test', 'config'])
  })
})

describe('betterDirection', () => {
  it('picks the layout that can be drawn biggest, with a tie-breaker', () => {
    const wide = { width: 1200, height: 500 }
    const sizes = { LR: { width: 2400, height: 300 }, TB: { width: 900, height: 1400 } }
    expect(betterDirection(wide, (d) => sizes[d])).toBe('LR')
    expect(betterDirection({ width: 360, height: 640 }, (d) => sizes[d])).toBe('TB')
    const same = { LR: { width: 1000, height: 1000 }, TB: { width: 1000, height: 1000 } }
    expect(betterDirection(wide, (d) => same[d])).toBe('TB')
    expect(betterDirection(wide, (d) => same[d], 'LR')).toBe('LR')
  })
})

describe('tour arrow keys', () => {
  const press = (target: HTMLElement, key = 'ArrowRight') => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true })
    Object.defineProperty(e, 'target', { value: target })
    return keyBelongsToSomethingElse(e)
  }

  it('leave ← / → to a focused code block so it can scroll sideways (regression: the tour jumped a step)', () => {
    const region = document.createElement('div')
    region.setAttribute('role', 'region')
    region.tabIndex = 0
    document.body.appendChild(region)
    expect(press(region)).toBe(true)
    const pre = document.createElement('pre')
    const inner = document.createElement('span')
    pre.appendChild(inner)
    document.body.appendChild(pre)
    expect(press(inner)).toBe(true)
  })

  it('leave them to anything that scrolls sideways', () => {
    const scroller = document.createElement('div')
    scroller.style.overflowX = 'auto'
    Object.defineProperty(scroller, 'scrollWidth', { value: 900 })
    Object.defineProperty(scroller, 'clientWidth', { value: 400 })
    const child = document.createElement('button')
    scroller.appendChild(child)
    document.body.appendChild(scroller)
    expect(press(child)).toBe(true)
  })

  it('still turn the page from ordinary places', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    expect(press(button)).toBe(false)
    expect(press(document.body)).toBe(false)
  })
})
