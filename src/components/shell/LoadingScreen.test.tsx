import { render, screen } from '@testing-library/react'
import type { LoadProgress } from '@/core/types'
import { announcement, LoadingScreen } from './LoadingScreen'

describe('LoadingScreen announcements', () => {
  it('announces each stage once, not every file downloaded', () => {
    const ticks: LoadProgress[] = Array.from({ length: 50 }, (_, i) => ({ stage: 'files', message: `Reading ${i} of 223 files…`, done: i, total: 223 }))
    expect(new Set(ticks.map(announcement))).toEqual(new Set(['Reading the important files…']))
    expect(announcement({ stage: 'tree', message: 'Listing every file in the project…' })).toBe('Listing every file in the project…')
    expect(announcement({ stage: 'files', message: 'Opening the copy saved from your last visit — no download needed.' })).toMatch(/saved from your last visit/)
    expect(announcement(null)).toBe('Getting started…')
  })

  it('shows the counter on screen but keeps it out of the live region', () => {
    const { rerender } = render(<LoadingScreen progress={{ stage: 'files', message: 'Reading 3 of 223 files…', done: 3, total: 223 }} repoLabel="pallets/flask" />)
    expect(screen.getByTestId('loading-message')).toHaveTextContent('Reading 3 of 223 files…')
    expect(screen.getByTestId('loading-message')).toHaveAttribute('aria-hidden', 'true')
    const live = screen.getByRole('status')
    expect(live).toHaveTextContent('Reading the important files…')
    rerender(<LoadingScreen progress={{ stage: 'files', message: 'Reading 4 of 223 files…', done: 4, total: 223 }} repoLabel="pallets/flask" />)
    expect(live).toHaveTextContent('Reading the important files…')
    rerender(<LoadingScreen progress={{ stage: 'analyze', message: 'Mapping how the pieces fit together…' }} repoLabel="pallets/flask" />)
    expect(live).toHaveTextContent('Mapping how the pieces fit together…')
  })
})
