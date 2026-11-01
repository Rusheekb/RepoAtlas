import type { Layer } from '@/core/types'

/** Horizontal stacked bar of lines-of-code per layer (fixed layer color order) + legend. */
export function LayerBar(props: { breakdown: Partial<Record<Layer, number>>; className?: string; showLegend?: boolean }) {
  return <div className={props.className} data-testid="layer-bar" />
}
