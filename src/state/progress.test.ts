import { useProgress } from './progress'
import { useSettings } from './settings'

const saved = () => JSON.parse(localStorage.getItem('repoatlas:progress') ?? '{}').state as { recent: { fullName: string }[]; seen: Record<string, unknown> }

beforeEach(() => {
  localStorage.clear()
  useSettings.setState({ rememberKeys: false })
  useProgress.setState({ seen: {}, recent: [] })
})

describe('progress store: private projects', () => {
  it('flags private projects in the Recent list', () => {
    useProgress.getState().addRecent('pallets/flask', 'Web framework')
    useProgress.getState().addRecent('corp/secret', null, true)
    expect(useProgress.getState().recent).toEqual([
      expect.objectContaining({ fullName: 'corp/secret', isPrivate: true }),
      expect.not.objectContaining({ isPrivate: true }),
    ])
  })

  it('keeps private projects (and their progress) out of saved storage unless keys are remembered', () => {
    useProgress.getState().addRecent('corp/secret', null, true)
    useProgress.getState().markSeen('corp/secret', 'file:src/keys.py')
    useProgress.getState().addRecent('pallets/flask', null)
    useProgress.getState().markSeen('pallets/flask', 'module:src')
    expect(useProgress.getState().recent).toHaveLength(2)
    expect(saved().recent.map((r) => r.fullName)).toEqual(['pallets/flask'])
    expect(Object.keys(saved().seen)).toEqual(['pallets/flask'])

    useSettings.setState({ rememberKeys: true })
    useProgress.getState().markSeen('corp/secret', 'module:src')
    expect(saved().recent.map((r) => r.fullName)).toEqual(['pallets/flask', 'corp/secret'])
    expect(Object.keys(saved().seen).sort()).toEqual(['corp/secret', 'pallets/flask'])
  })

  it('forgets private projects: flagged ones and any named by the download cache', () => {
    useProgress.setState({
      recent: [
        { fullName: 'corp/secret', description: null, openedAt: 3, isPrivate: true },
        { fullName: 'Corp/Legacy', description: null, openedAt: 2 },
        { fullName: 'pallets/flask', description: null, openedAt: 1 },
      ],
      seen: { 'corp/secret': { 'file:a': 1 }, 'corp/legacy': { 'file:b': 1 }, 'pallets/flask': { 'file:c': 1 } },
    })
    useProgress.getState().forgetPrivateRepos(['corp/legacy'])
    expect(useProgress.getState().recent.map((r) => r.fullName)).toEqual(['pallets/flask'])
    expect(Object.keys(useProgress.getState().seen)).toEqual(['pallets/flask'])
  })
})
