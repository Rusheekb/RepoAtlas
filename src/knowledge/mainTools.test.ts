/**
 * Regression tests for "the main tools it relies on": only what the project's own running code uses counts.
 * (Express showed "Markdown renderers" from its examples, gin showed "MongoDB" for a BSON encoder,
 * changesets showed "Vue" from its docs website.)
 */
import { describe, expect, it } from 'vitest'
import type { LanguageStat, TechItem } from '@/core/types'
import { detectTechStack, type ImportedPackage } from './detectTech'
import { parseManifests } from './manifests'
import { docsSiteRoots, inDocsSite, isPeripheralPath } from './parsers/util'

function lang(name: string, bytes: number): LanguageStat {
  return { name, bytes, files: 1, percent: 0, color: '#000' }
}

function detect(files: Record<string, string>, extraPaths: string[], languages: LanguageStat[], importedPackages: ImportedPackage[] = []): TechItem[] {
  const paths = [...new Set([...Object.keys(files), ...extraPaths])]
  return detectTechStack({ paths, files, manifests: parseManifests(files, paths), languages, importedPackages })
}

const mainTools = (items: TechItem[]) => items.filter((t) => t.category !== 'language' && t.importance !== 'tooling').map((t) => t.id)
const item = (items: TechItem[], id: string) => items.find((t) => t.id === id)

describe('dev tools that only the examples or tests import', () => {
  const files = {
    'package.json': JSON.stringify({ name: 'express', dependencies: { 'body-parser': '2.0.0' }, devDependencies: { marked: '15.0.0', mocha: '10.0.0' } }),
  }
  const stack = detect(files, ['lib/express.js', 'examples/markdown/index.js'], [lang('JavaScript', 50_000)], [
    { name: 'marked', count: 2, coreCount: 0, specifiers: ['marked'] },
  ])

  it('are helper tools, never main tools', () => {
    expect(mainTools(stack)).not.toContain('markdown-renderer')
    expect(item(stack, 'markdown-renderer')?.importance).toBe('tooling')
    expect(item(stack, 'markdown-renderer')?.evidence).toContain('only used by tests, examples or docs (2 files)')
  })

  it('still count when the project’s own code imports them', () => {
    const real = detect(files, ['lib/render.js'], [lang('JavaScript', 50_000)], [{ name: 'marked', count: 3, coreCount: 1 }])
    expect(item(real, 'markdown-renderer')?.importance).toBe('supporting')
    expect(item(real, 'markdown-renderer')?.evidence).toContain('used in 1 file')
  })

  it('leaves runtime dependencies alone, even when only tests name them (C# uses packages without importing them)', () => {
    const cs = {
      'src/Infrastructure/Infrastructure.csproj': '<Project><ItemGroup><PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="8.0.0" /></ItemGroup></Project>',
    }
    const stack2 = detect(cs, ['src/Infrastructure/DependencyInjection.cs'], [lang('C#', 50_000)], [{ name: 'Npgsql', count: 1, coreCount: 0 }])
    expect(item(stack2, 'postgresql')?.importance).toBe('core')
  })
})

describe('a database driver used only for its data format', () => {
  const files = { 'go.mod': 'module github.com/gin-gonic/gin\n\ngo 1.23\n\nrequire (\n\tgo.mongodb.org/mongo-driver/v2 v2.0.0\n\tgoogle.golang.org/protobuf v1.36.0\n)\n' }
  const bsonOnly: ImportedPackage = {
    name: 'go.mongodb.org/mongo-driver',
    count: 5,
    coreCount: 2,
    specifiers: ['go.mongodb.org/mongo-driver/v2/bson'],
  }

  it('shows the data format (BSON), not the database', () => {
    const stack = detect(files, ['render/bson.go', 'binding/bson.go'], [lang('Go', 80_000)], [bsonOnly])
    expect(item(stack, 'mongodb')).toBeUndefined()
    const bson = item(stack, 'bson')
    expect(bson?.importance).toBe('supporting')
    expect(bson?.evidence).toEqual(expect.arrayContaining(['go.mod → require', 'used in 2 files']))
  })

  it('keeps the database when the code really talks to it', () => {
    const stack = detect(files, ['db/client.go'], [lang('Go', 80_000)], [
      { ...bsonOnly, specifiers: ['go.mongodb.org/mongo-driver/v2/bson', 'go.mongodb.org/mongo-driver/v2/mongo'] },
    ])
    expect(item(stack, 'mongodb')?.importance).toBe('core')
  })
})

describe('a documentation website’s own package list', () => {
  const files = {
    'package.json': JSON.stringify({ name: '@changesets/monorepo', private: true, devDependencies: { typescript: '5.6.0' } }),
    'packages/cli/package.json': JSON.stringify({ name: '@changesets/cli', dependencies: { enquirer: '2.4.0' } }),
    'site/package.json': JSON.stringify({ name: 'site', dependencies: { vue: '3.5.0' }, devDependencies: { vitepress: '1.6.0' } }),
  }
  const paths = ['site/.vitepress/config.ts', 'site/.vitepress/theme/index.ts', 'site/guide/intro.md', 'packages/cli/src/index.ts']

  it('is recognised by its docs-site generator', () => {
    expect([...docsSiteRoots([...Object.keys(files), ...paths])]).toEqual(['site'])
    expect(docsSiteRoots(['site/index.html', 'site/app.js']).size).toBe(0)
    expect(docsSiteRoots(['docs/index.md']).has('docs')).toBe(true)
    expect(inDocsSite('site/package.json', new Set(['site']))).toBe(true)
  })

  it('doesn’t make its framework one of the project’s main tools', () => {
    const stack = detect(files, paths, [lang('TypeScript', 90_000)], [{ name: 'vue', count: 3, coreCount: 0 }])
    expect(mainTools(stack)).not.toContain('vue')
    expect(item(stack, 'vue')?.evidence[0]).toBe('site/package.json → dependencies (docs website)')
    expect(item(stack, 'vitepress')).toBeDefined()
  })
})

describe('isPeripheralPath', () => {
  it('ignores Java package names below a source root', () => {
    expect(isPeripheralPath('src/main/java/com/example/demo/pom.xml')).toBe(false)
    expect(isPeripheralPath('examples/demo/package.json')).toBe(true)
    expect(isPeripheralPath('samples/web/src/main/java/com/acme/pom.xml')).toBe(true)
  })
})
