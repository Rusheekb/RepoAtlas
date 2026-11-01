import { describe, expect, it } from 'vitest'
import { LAYERS } from '@/core/types'
import { FOLDER_ROLES, describeFolder } from './folders'

const roleOf = (name: string) => describeFolder(name)?.role ?? null
const layerOf = (name: string) => describeFolder(name)?.layer ?? null

describe('FOLDER_ROLES data', () => {
  it('covers 130+ conventional folder names, including the essentials', () => {
    expect(Object.keys(FOLDER_ROLES).length).toBeGreaterThanOrEqual(130)
    const essentials = `src lib app components pages views screens routes api server client public static assets images styles css hooks store
state redux context services utils helpers common shared core models schemas entities db database migrations seeds config settings scripts
bin cmd internal pkg tests test __tests__ spec e2e fixtures mocks docs examples demo .github workflows ci deploy infra terraform k8s docker
middleware controllers handlers plugins templates layouts i18n locales types typings interfaces constants data notebooks benchmarks tools
packages apps crates modules features domain adapters vendor dist build`.split(/\s+/)
    expect(essentials.filter((n) => !FOLDER_ROLES[n])).toEqual([])
  })

  it('uses lower-case keys and fills every field', () => {
    for (const [name, role] of Object.entries(FOLDER_ROLES)) {
      expect(name).toBe(name.toLowerCase())
      expect(role.role.trim(), name).not.toBe('')
      expect(role.description.trim().length, name).toBeGreaterThan(20)
      expect(role.description.length, name).toBeLessThanOrEqual(200)
      expect(role.emoji.trim(), name).not.toBe('')
      expect(LAYERS).toContain(role.layer)
    }
  })

  it('writes descriptions as full sentences', () => {
    for (const [name, role] of Object.entries(FOLDER_ROLES)) {
      expect(role.description, name).toMatch(/^[A-Z"“]/)
      expect(role.description, name).toMatch(/[.)]$/)
    }
  })
})

describe('describeFolder', () => {
  it('describes conventional names', () => {
    expect(describeFolder('components')).toMatchObject({ role: 'Reusable screen pieces', layer: 'ui' })
    expect(layerOf('migrations')).toBe('data')
    expect(layerOf('tests')).toBe('test')
    expect(layerOf('docs')).toBe('docs')
    expect(layerOf('.github')).toBe('infra')
    expect(layerOf('config')).toBe('config')
    expect(layerOf('controllers')).toBe('api')
    expect(layerOf('services')).toBe('logic')
  })

  it('is case-insensitive and ignores trailing slashes and parent folders', () => {
    expect(roleOf('Components')).toBe(roleOf('components'))
    expect(roleOf('SRC')).toBe(roleOf('src'))
    expect(roleOf('components/')).toBe(roleOf('components'))
    expect(roleOf('src/app/components')).toBe(roleOf('components'))
  })

  it('strips leading "_", "." and "@" and trailing "_"', () => {
    expect(roleOf('__tests__')).toBe(roleOf('tests'))
    expect(roleOf('_posts')).toBe(roleOf('posts'))
    expect(roleOf('_layouts')).toBe(roleOf('layouts'))
    expect(roleOf('.docker')).toBe(roleOf('docker'))
    expect(roleOf('.config')).toBe(roleOf('config'))
    expect(roleOf('@types')).toBe(roleOf('types'))
    expect(roleOf('_utils_')).toBe(roleOf('utils'))
  })

  it('handles singular and plural forms', () => {
    expect(roleOf('component')).toBe(roleOf('components'))
    expect(roleOf('fixture')).toBe(roleOf('fixtures'))
    expect(roleOf('utility')).toBe(roleOf('utilities'))
    expect(roleOf('factories')).toBeNull()
    expect(roleOf('entity')).toBe(roleOf('entities'))
    expect(roleOf('migration')).toBe(roleOf('migrations'))
    expect(roleOf('reducer')).toBe(roleOf('reducers'))
    expect(roleOf('notebooks')).toBe(roleOf('notebook'))
  })

  it('understands test prefixes and suffixes', () => {
    for (const name of ['test_utils', 'tests-e2e', 'integration_tests', 'unit-tests', 'test-fixtures', 'TestHelpers', 'apiTests', 'spec_helpers']) {
      expect(layerOf(name), name).toBe('test')
    }
  })

  it('understands compound names by their last (or first) word', () => {
    expect(roleOf('shared-components')).toBe(roleOf('components'))
    expect(roleOf('user_services')).toBe(roleOf('services'))
    expect(roleOf('sharedComponents')).toBe(roleOf('components'))
    expect(roleOf('api-gateway')).toBe(roleOf('gateway'))
    expect(roleOf('docs-old')).toBe(roleOf('old'))
    expect(roleOf('payments-api')).toBe(roleOf('api'))
  })

  it('understands version folders and framework route segments', () => {
    expect(describeFolder('v2')).toMatchObject({ role: 'Version 2', layer: 'other' })
    expect(describeFolder('v1.1')?.role).toBe('Version 1.1')
    expect(describeFolder('[id]')).toMatchObject({ role: 'Changing page address', layer: 'ui' })
    expect(describeFolder('[...slug]')?.role).toBe('Changing page address')
    expect(describeFolder('(auth)')?.role).toBe(roleOf('auth'))
    expect(describeFolder('(marketing)')?.role).toBe('Page group')
  })

  it('returns null for unknown names and junk', () => {
    expect(describeFolder('zebra-crossing')).toBeNull()
    expect(describeFolder('acme')).toBeNull()
    expect(describeFolder('')).toBeNull()
    expect(describeFolder('   ')).toBeNull()
    expect(describeFolder('___')).toBeNull()
    expect(describeFolder(undefined as unknown as string)).toBeNull()
  })

  it('never answers with built-in object properties', () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) expect(describeFolder(name), name).toBeNull()
    // "__proto__" is just "proto" with underscores, a real convention (Protocol Buffers), never Object.prototype.
    expect(describeFolder('__proto__')).toEqual(FOLDER_ROLES.proto)
  })
})

describe('folder names that need their contents to agree', () => {
  it('mark the names that only mean something with the right files or technology', () => {
    expect(describeFolder('output')?.requires).toBe('generated')
    expect(describeFolder('releases')?.requires).toBe('generated')
    expect(describeFolder('charts')?.requires).toBe('helm-chart')
    expect(describeFolder('scenes')?.requires).toBe('game')
    expect(describeFolder('renderer')?.requires).toBe('desktop-shell')
    expect(describeFolder('pkg')?.requires).toBe('go-code')
    expect(describeFolder('components')?.requires).toBeUndefined()
    expect(describeFolder('generated')?.requires).toBeUndefined()
  })
})

