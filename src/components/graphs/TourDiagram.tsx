import type { AnalyzedFile, ModuleInfo, Tour } from '@/core/types'

export interface TourDiagramProps {
  tour: Tour
  activeStep: number
  onStepClick?: (index: number) => void
  modules?: ModuleInfo[]
  files?: Record<string, AnalyzedFile>
  className?: string
}

/** A flow diagram of the tour's steps (numbered nodes connected by arrows, each showing the step title and file), active step emphasized, completed steps checked. */
export function TourDiagram(props: TourDiagramProps) {
  return <div className={props.className} data-testid="tour-diagram" />
}
