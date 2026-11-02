import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/icons'

interface Props {
  /** When this changes (e.g. the route), a crashed page gets another chance. */
  resetKey: string
  children: ReactNode
}

interface State {
  error: Error | null
  key: string
}

/**
 * Keeps one broken view from taking down the whole app: shows a friendly note in its place, and resets when the reader
 * moves to another view. Renders no wrapper element, so pages keep their full-height layout.
 */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('A view crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center" role="alert">
          <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
            <Icon as={TriangleAlert} size={18} />
          </span>
          <h2 className="mt-4 text-xl font-medium text-ink">This view hit a snag</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Part of the page couldn’t be drawn for this project. The other views should still work. Pick one from the menu, or try this one again.
          </p>
          <Button className="mt-6" icon={<Icon as={RotateCcw} />} onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      </div>
    )
  }
}
