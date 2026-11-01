import { render, screen } from '@testing-library/react'
import { AiProgress } from './AiAssist'

describe('AiProgress', () => {
  it('announces Claude’s status, but not the running character count', () => {
    const { rerender } = render(<AiProgress label="Claude is drawing a smarter map" status="writing" progressChars={20} onCancel={() => {}} />)
    const live = screen.getByRole('status')
    expect(live).toHaveTextContent(/^Claude is writing it up…$/)
    rerender(<AiProgress label="Claude is drawing a smarter map" status="writing" progressChars={3900} onCancel={() => {}} />)
    expect(live).toHaveTextContent(/^Claude is writing it up…$/)
    expect(screen.getByText(/characters written so far/)).toHaveAttribute('aria-hidden', 'true')
  })
})
