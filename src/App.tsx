import { lazy, Suspense, useEffect } from 'react'
import { createHashRouter, Navigate, RouterProvider } from 'react-router'
import HomePage from '@/pages/HomePage'
import RepoLayout from '@/pages/RepoLayout'
import { applyTheme, useSettings } from '@/state/settings'
import { Spinner } from '@/components/ui'

const OverviewPage = lazy(() => import('@/pages/OverviewPage'))
const ArchitecturePage = lazy(() => import('@/pages/ArchitecturePage'))
const CodeMapPage = lazy(() => import('@/pages/CodeMapPage'))
const ConceptsPage = lazy(() => import('@/pages/ConceptsPage'))
const ToursPage = lazy(() => import('@/pages/ToursPage'))
const ExplorerPage = lazy(() => import('@/pages/ExplorerPage'))
const AskPage = lazy(() => import('@/pages/AskPage'))
const QuizPage = lazy(() => import('@/pages/QuizPage'))
const GlossaryPage = lazy(() => import('@/pages/GlossaryPage'))

function PageFallback() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

const page = (el: React.ReactNode) => <Suspense fallback={<PageFallback />}>{el}</Suspense>

const router = createHashRouter([
  { path: '/', element: <HomePage /> },
  {
    path: '/gh/:owner/:repo',
    element: <RepoLayout />,
    children: [
      { index: true, element: page(<OverviewPage />) },
      { path: 'map', element: page(<ArchitecturePage />) },
      { path: 'codemap', element: page(<CodeMapPage />) },
      { path: 'concepts', element: page(<ConceptsPage />) },
      { path: 'tours', element: page(<ToursPage />) },
      { path: 'explore', element: page(<ExplorerPage />) },
      { path: 'ask', element: page(<AskPage />) },
      { path: 'quiz', element: page(<QuizPage />) },
      { path: 'glossary', element: page(<GlossaryPage />) },
      { path: '*', element: <Navigate to=".." replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  const theme = useSettings((s) => s.theme)
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])
  return <RouterProvider router={router} />
}
