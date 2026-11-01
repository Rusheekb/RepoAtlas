/**
 * Test-only helpers for the shell, pages and panels: browser APIs jsdom lacks, and rendering inside a memory router.
 * Nothing in the app imports this file.
 */
import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'

/** Stub ResizeObserver, matchMedia, <dialog> methods, scrolling and the clipboard. Call in beforeAll/beforeEach. */
export function stubBrowser(opts: { wide?: boolean } = {}) {
  const wide = opts.wide ?? true
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO)
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: /min-width/.test(query) ? wide : /max-width/.test(query) ? !wide : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  )
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void; close?: () => void }
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
}

/** Shows the current location so tests can assert on navigation. */
export function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{`${loc.pathname}${loc.search}`}</div>
}

/** Render `ui` at `path` (pattern `route`), with a catch-all route that shows where navigation went. */
export function renderAt(ui: ReactNode, { path = '/', route = '/' }: { path?: string; route?: string } = {}) {
  const router = createMemoryRouter(
    [
      { path: route, element: ui },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...render(<RouterProvider router={router} />) }
}
