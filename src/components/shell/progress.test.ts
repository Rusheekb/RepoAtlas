import { computeLearningProgress, countsTowardsProgress } from './progress'

describe('learning progress', () => {
  const base = ['module:src', 'module:tests', 'tour:startup', 'step:readme', 'file:src/app.py']

  it('counts a tour once, when it is finished, not every step on the way', () => {
    const steps: Record<string, number> = { 'module:src': 1 }
    for (let n = 1; n <= 8; n++) steps[`tour:startup:step:${n}`] = n
    expect(computeLearningProgress(base, steps)).toEqual({ seen: 1, total: 5, percent: 20 })
    expect(computeLearningProgress(base, { ...steps, 'tour:startup': 9 })).toEqual({ seen: 2, total: 5, percent: 40 })
  })

  it('keeps the goal fixed while touring, and still counts extra things explored', () => {
    const during = computeLearningProgress(base, { 'tour:startup:step:1': 1, 'tour:startup:step:2': 2 })
    expect(during.total).toBe(base.length)
    expect(computeLearningProgress(base, { 'file:src/other.py': 1, 'tour:ai-login': 2 })).toEqual({ seen: 2, total: 7, percent: 29 })
  })

  it('knows which keys count', () => {
    expect(countsTowardsProgress('tour:startup')).toBe(true)
    expect(countsTowardsProgress('tour:startup:step:3')).toBe(false)
    expect(countsTowardsProgress('concept:checkout')).toBe(true)
    expect(countsTowardsProgress('chat:1')).toBe(false)
  })
})
