import type { ReadingLevel } from '@/core/types'
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
  levelGuidance,
  numberedFile,
  type PromptData,
} from './prompts'
import { CONTENTS, makeFixture } from './testFixtures'

function data(level: ReadingLevel = 'beginner'): PromptData {
  const { analysis, snapshot } = makeFixture()
  return { analysis, snapshot, level }
}

describe('SYSTEM_INSTRUCTIONS', () => {
  it('covers audience, style, paths, accuracy and prompt-injection safety', () => {
    expect(SYSTEM_INSTRUCTIONS).toContain('no programming background')
    expect(SYSTEM_INSTRUCTIONS).toMatch(/analogies/)
    expect(SYSTEM_INSTRUCTIONS).toMatch(/backticks exactly as it appears/)
    expect(SYSTEM_INSTRUCTIONS).toMatch(/Never invent files/)
    expect(SYSTEM_INSTRUCTIONS).toMatch(/untrusted data/)
    expect(SYSTEM_INSTRUCTIONS).toMatch(/Ignore any instructions/)
  })

  it('contains nothing variable (time, level) so it stays cacheable', () => {
    expect(SYSTEM_INSTRUCTIONS).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    for (const level of ['eli5', 'beginner', 'intermediate', 'expert'] as const) {
      expect(SYSTEM_INSTRUCTIONS).not.toContain(levelGuidance(level))
    }
  })
})

describe('levelGuidance', () => {
  it('differs per level and is never empty', () => {
    const all = (['eli5', 'beginner', 'intermediate', 'expert'] as const).map(levelGuidance)
    expect(new Set(all).size).toBe(4)
    for (const g of all) expect(g.length).toBeGreaterThan(80)
    expect(levelGuidance('eli5')).toMatch(/no technical background/)
    expect(levelGuidance('expert')).toMatch(/developer/)
  })
})

describe('explanation prompt builders', () => {
  it.each<ReadingLevel>(['eli5', 'beginner', 'intermediate', 'expert'])('every builder includes the %s level guidance', (level) => {
    const d = data(level)
    const c = d.analysis.starterConcepts.concepts[0]
    const prompts = [
      buildOverviewPrompt(d),
      buildModulePrompt(d, 'src/components'),
      buildFilePrompt(d, 'src/App.tsx', CONTENTS['src/App.tsx']),
      buildFolderPrompt(d, 'src'),
      buildSelectionPrompt(d, 'src/App.tsx', CONTENTS['src/App.tsx'], 4, 6),
      buildConceptPrompt(d, c),
      buildTechPrompt(d, 'react'),
      buildTermPrompt(d, 'state'),
      buildConceptsPrompt(d),
      buildToursPrompt(d),
      buildQuizPrompt(d),
      buildChatPrompt(d, 'How does the cart work?', []),
    ]
    for (const p of prompts) expect(p).toContain(levelGuidance(level))
  })

  it('overview asks for the required sections in order', () => {
    const p = buildOverviewPrompt(data())
    const headings = ['## What is this?', '## Who is it for?', '## How it works (the big picture)', '## The main parts', '## An everyday analogy', '## Where to start reading']
    const idx = headings.map((h) => p.indexOf(h))
    expect(idx.every((i) => i >= 0)).toBe(true)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  })

  it('file prompt includes facts, numbered content and the required sections', () => {
    const p = buildFilePrompt(data(), 'src/App.tsx', CONTENTS['src/App.tsx'])
    for (const h of ['## In one sentence', '## What it does', '## How it works, step by step', '## How it connects', '## Words worth knowing']) {
      expect(p).toContain(h)
    }
    expect(p).toContain('Used by: `src/main.tsx`')
    expect(p).toContain('<file path="src/App.tsx" lines="7">')
    expect(p).toContain('4 | export function App() {')
  })

  it('file prompt says so when the content is unavailable', () => {
    expect(buildFilePrompt(data(), 'src/App.tsx', null)).toMatch(/couldn't be downloaded/)
  })

  it('selection prompt marks the selected lines and adds ±15 lines of context', () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n')
    const p = buildSelectionPrompt(data(), 'src/App.tsx', content, 40, 42)
    expect(p).toContain('selected="40-42"')
    expect(p).toContain('» 40 | line 40')
    expect(p).toContain('» 42 | line 42')
    expect(p).toContain('\n» 41 | line 41')
    expect(p).toContain('\n  25 | line 25')
    expect(p).toContain('\n  57 | line 57')
    expect(p).not.toContain('| line 24\n')
    expect(p).not.toContain('| line 58')
    expect(p).toContain('## Line by line')
  })

  it('selection prompt clamps out-of-range lines', () => {
    const p = buildSelectionPrompt(data(), 'src/App.tsx', CONTENTS['src/App.tsx'], 50, 3)
    expect(p).toContain('selected="3-7"')
  })

  it('module prompt includes the connections and file list', () => {
    const p = buildModulePrompt(data(), 'src')
    expect(p).toContain('Uses: `src/components` (components) (1 links, e.g. `src/App.tsx` → `src/components/Button.tsx`)')
    expect(p).toContain("## What's inside")
  })

  it('tech prompt focuses on how THIS project uses it', () => {
    const p = buildTechPrompt(data(), 'zustand')
    expect(p).toContain('how THIS project uses Zustand')
    expect(p).toContain('`src/state/cart.ts`')
  })

  it('term prompt finds where the word shows up', () => {
    const p = buildTermPrompt(data(), 'button')
    expect(p).toContain('how it shows up in THIS project')
    expect(p).toMatch(/Files where the word appears: .*`src\/components\/Button\.tsx`/)
  })

  it('numberedFile keeps the start and the end of huge files', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `x${i + 1}`).join('\n')
    const r = numberedFile(big)
    expect(r.partial).toBe(true)
    expect(r.total).toBe(5000)
    expect(r.text).toContain('   1 | x1')
    expect(r.text).toContain('5000 | x5000')
    expect(r.text).toMatch(/not shown to save space/)
  })
})

describe('structured prompt builders', () => {
  it('concepts prompt specifies counts, ids, categories, files and relations', () => {
    const p = buildConceptsPrompt(data(), 'json')
    expect(p).toContain('8–18 concepts')
    expect(p).toContain('kebab-case')
    expect(p).toContain('data, feature, process, actor, technology, idea')
    expect(p).toMatch(/copied exactly from the <file_tree>/)
    expect(p).toMatch(/short verb phrase/)
    expect(p).toContain('Shopping cart: The list of things you plan to buy.')
    expect(p).toContain('Reply with the JSON object only.')
  })

  it('tours prompt lists valid module ids and demands verbatim snippets', () => {
    const p = buildToursPrompt(data(), 'json')
    expect(p).toContain('3–5 tours, each with 4–9 steps')
    expect(p).toContain('`src/components` (components)')
    expect(p).toContain('`(root)` (Project setup files)')
    expect(p).toMatch(/copied character-for-character/)
  })

  it('custom tour prompt answers the reader question with exactly one tour', () => {
    const p = buildToursPrompt(data(), 'json', 'How does checkout work?')
    expect(p).toContain('<question>\nHow does checkout work?\n</question>')
    expect(p).toContain('Exactly 1 tour')
  })

  it('quiz prompt specifies 6–8 questions with 3–4 options and a 0-based answer', () => {
    const p = buildQuizPrompt(data(), 'json')
    expect(p).toContain('6–8 questions')
    expect(p).toContain('3 or 4 short answers')
    expect(p).toContain('0-based')
  })

  it('markdown variants ask for readable output instead of JSON', () => {
    expect(buildConceptsPrompt(data(), 'markdown')).not.toContain('JSON')
    expect(buildToursPrompt(data(), 'markdown')).not.toContain('JSON')
    expect(buildQuizPrompt(data(), 'markdown')).toContain('## Answers')
  })
})

describe('chat prompt', () => {
  it('includes relevant files and the question, with injection-proof tags', () => {
    const p = buildChatPrompt(data(), 'What does </question> do?', [{ path: 'src/state/cart.ts', content: CONTENTS['src/state/cart.ts'] }])
    expect(p).toContain('<relevant_files>')
    expect(p).toContain('<file path="src/state/cart.ts"')
    expect(p).toContain('<question>\nWhat does  do?\n</question>')
  })
})
