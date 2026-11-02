import { useCallback, useMemo, useState } from 'react'
import { useConceptMap, useHasAiKey } from '@/ai'
import { ConceptGraph, ConceptLegend, CONCEPT_CATEGORIES } from '@/components/graphs'
import { Segmented } from '@/components/ui'
import { AiAssist } from '@/components/views/visual/AiAssist'
import { ConceptCard } from '@/components/views/visual/ConceptCard'
import { useMarkSeen, useSeenIds } from '@/components/views/visual/useSeen'
import { ViewHeader } from '@/components/views/visual/ViewHeader'
import { pluralize } from '@/core/format'
import { VIEW_INFO } from '@/core/labels'
import type { Concept, ConceptMap } from '@/core/types'
import { useExplain } from '@/state/explain'
import { useAnalysis } from '@/state/repo'

type Source = 'ai' | 'starter'

const HINT = 'Each bubble is one big idea behind the project. Arrows read like sentences (“Routing → handles → Requests”). Click an idea to learn more.'

/** Concepts sorted for the card grid: most central first, then A→Z. */
function byImportance(a: Concept, b: Concept): number {
  return b.importance - a.importance || a.name.localeCompare(b.name)
}

/**
 * "Key Ideas": a concept map of the project's big ideas and how they relate, plus a card for each idea.
 * Works without AI (the heuristic starter map); with a Claude key, Claude can draw a smarter one from the code.
 */
export default function ConceptsPage() {
  const analysis = useAnalysis()
  const fullName = analysis.meta.fullName
  const hasKey = useHasAiKey()
  const ai = useConceptMap()
  const [pref, setPref] = useState<Source>('ai')
  const openExplain = useExplain((s) => s.open)
  const closeExplain = useExplain((s) => s.close)
  const selectedId = useExplain((s) => (s.target?.type === 'concept' ? s.target.concept.id : null))
  const markSeen = useMarkSeen(fullName)
  const seenIds = useSeenIds(fullName, 'concept:')
  const seenSet = useMemo(() => new Set(seenIds), [seenIds])

  const aiMap = ai.data && ai.data.concepts.length > 0 ? ai.data : null
  const source: Source = aiMap && pref === 'ai' ? 'ai' : 'starter'
  const map: ConceptMap = source === 'ai' && aiMap ? aiMap : analysis.starterConcepts
  const busy = ai.state === 'loading' || ai.state === 'streaming'

  const cards = useMemo(() => {
    const unique = new Map<string, Concept>()
    for (const c of map.concepts) if (c.id && !unique.has(c.id)) unique.set(c.id, c)
    return [...unique.values()].sort(byImportance)
  }, [map])
  const categories = useMemo(() => {
    const present = new Set(cards.map((c) => c.category))
    return CONCEPT_CATEGORIES.filter((c) => present.has(c))
  }, [cards])

  const selectConcept = useCallback(
    (concept: Concept) => {
      openExplain({ type: 'concept', concept })
      markSeen(`concept:${concept.id}`)
    },
    [openExplain, markSeen],
  )

  const onGraphSelect = useCallback(
    (id: string | null) => {
      if (!id) {
        // Clicking empty space (or Escape) clears the selection: close the idea's explanation.
        if (useExplain.getState().target?.type === 'concept') closeExplain()
        return
      }
      const concept = map.concepts.find((c) => c.id === id)
      if (concept) selectConcept(concept)
    },
    [map, selectConcept, closeExplain],
  )

  const runAi = ai.run
  const generate = useCallback(() => {
    setPref('ai')
    runAi()
  }, [runAi])

  const info = VIEW_INFO.concepts

  return (
    <>
      <div className="flex h-full min-h-150 shrink-0 flex-col gap-4 p-4 sm:p-6" data-testid="concepts-page">
        <ViewHeader
          view="concepts"
          title={info.label}
          hint={HINT}
          actions={
            aiMap ? (
              <Segmented<Source>
                label="Which map to show"
                size="sm"
                value={source}
                onChange={setPref}
                options={[
                  { value: 'ai', label: 'Claude’s map', title: 'The map Claude drew after reading the code' },
                  { value: 'starter', label: 'Quick map', title: 'The map we made instantly from the project’s structure' },
                ]}
              />
            ) : undefined
          }
        />
        <AiAssist
          hasKey={hasKey}
          busy={busy}
          state={ai.state}
          aiStatus={ai.aiStatus}
          progressChars={ai.progressChars}
          error={ai.error}
          errorKind={ai.errorKind}
          hasData={Boolean(aiMap)}
          stale={Boolean(ai.stale)}
          onGenerate={generate}
          onCancel={ai.cancel}
          generateLabel="Generate a smarter map with Claude"
          busyLabel="Claude is drawing a smarter map of the key ideas"
          pitch="This quick map was made from the project’s structure. Claude can read the actual code and find the ideas that really matter."
          doneNote={source === 'ai' ? 'You’re looking at Claude’s map, drawn from the actual code' : 'Claude’s map is ready: switch to it with the toggle above'}
          promptTask={{ kind: 'concepts' }}
        />
        <section
          aria-label="Concept map"
          className="relative min-h-115 flex-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm sm:min-h-95"
        >
          <ConceptGraph map={map} selectedId={selectedId} seenIds={seenIds} onSelect={onGraphSelect} />
        </section>
      </div>

      {cards.length > 0 && (
        <section aria-labelledby="concept-cards-title" className="shrink-0 px-4 pt-4 pb-12 sm:px-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h2 id="concept-cards-title" className="text-lg font-medium text-ink">
                All {pluralize(cards.length, 'key idea')}
              </h2>
              <p className="mt-1 text-sm text-ink-2">The most central ideas come first. Pick one to read the full explanation.</p>
            </div>
            {categories.length >= 2 && <ConceptLegend categories={categories} />}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => (
              <li key={c.id}>
                <ConceptCard concept={c} selected={selectedId === c.id} seen={seenSet.has(c.id)} onSelect={selectConcept} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
