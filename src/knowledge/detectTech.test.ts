import { describe, expect, it } from 'vitest'
import type { LanguageStat, TechItem } from '@/core/types'
import { describeLanguage, detectTechStack, getTech, lookupPackage, normalizePackageName } from './detectTech'
import { parseManifests } from './manifests'

function lang(name: string, bytes: number): LanguageStat {
  return { name, bytes, files: 1, percent: 0, color: '#000' }
}

function detect(files: Record<string, string>, extraPaths: string[], languages: LanguageStat[], importedPackages: { name: string; count: number }[] = []): TechItem[] {
  const paths = [...new Set([...Object.keys(files), ...extraPaths])]
  const manifests = parseManifests(files, paths)
  return detectTechStack({ paths, files, manifests, languages, importedPackages })
}

const ids = (items: TechItem[]) => items.map((t) => t.id)
const item = (items: TechItem[], id: string) => items.find((t) => t.id === id)

describe('detectTechStack: Next.js + Prisma + Tailwind', () => {
  const files = {
    'package.json': JSON.stringify({
      name: 'storefront',
      scripts: { dev: 'next dev', build: 'next build' },
      dependencies: { next: '15.0.0', react: '19.0.0', 'react-dom': '19.0.0', '@prisma/client': '5.0.0', '@radix-ui/react-dialog': '1.0.0' },
      devDependencies: { prisma: '5.0.0', tailwindcss: '4.0.0', typescript: '5.6.0', eslint: '9.0.0', '@types/react': '19.0.0' },
    }),
    'components.json': JSON.stringify({ $schema: 'https://ui.shadcn.com/schema.json' }),
  }
  const paths = ['next.config.mjs', 'tailwind.config.ts', 'prisma/schema.prisma', 'app/page.tsx', 'tsconfig.json', 'pnpm-lock.yaml', '.github/workflows/ci.yml']
  const stack = detect(files, paths, [lang('TypeScript', 60_000), lang('TSX', 30_000), lang('CSS', 5_000), lang('JSON', 50_000)], [
    { name: 'react', count: 40 },
    { name: 'next', count: 18 },
    { name: '@prisma/client', count: 6 },
  ])

  it('finds the framework, its foundation, the database toolkit and the styling system', () => {
    expect(ids(stack)).toEqual(expect.arrayContaining(['next', 'react', 'typescript', 'prisma', 'tailwind', 'radix', 'shadcn', 'eslint', 'pnpm', 'github-actions']))
  })

  it('merges evidence from manifests, files and imports into one item per technology', () => {
    const next = item(stack, 'next')!
    expect(next.evidence).toEqual(['package.json → dependencies', 'next.config.mjs', 'used in 18 files'])
    expect(stack.filter((t) => t.id === 'react')).toHaveLength(1)
    const prisma = item(stack, 'prisma')!
    expect(prisma.evidence).toEqual(expect.arrayContaining(['package.json → dependencies', 'package.json → devDependencies', 'prisma/schema.prisma']))
  })

  it('adds TypeScript as a language item (TSX counted with it) and ignores data formats like JSON', () => {
    const ts = item(stack, 'typescript')!
    expect(ts.category).toBe('language')
    expect(ts.importance).toBe('core')
    expect(ts.evidence[0]).toBe('package.json → devDependencies')
    expect(ts.evidence).toContain('95% of the code')
    expect(ids(stack)).not.toContain('json')
    expect(item(stack, 'css')).toBeDefined()
  })

  it('orders core → supporting → tooling, strongest first, with the framework leading', () => {
    const rank = { core: 0, supporting: 1, tooling: 2 }
    const ranks = stack.map((t) => rank[t.importance])
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    expect(stack[0].id).toBe('next')
    expect(item(stack, 'tailwind')?.importance).toBe('supporting')
    expect(item(stack, 'eslint')?.importance).toBe('tooling')
  })

  it('carries plain-English descriptions, analogies and links', () => {
    const react = item(stack, 'react')!
    expect(react.description.length).toBeGreaterThan(40)
    expect(react.analogy).toBeTruthy()
    expect(react.url).toMatch(/^https:\/\//)
  })

  it('skips @types/* packages', () => {
    expect(stack.some((t) => t.evidence.some((e) => e.includes('@types')))).toBe(false)
  })
})

describe('detectTechStack: Django + Celery + Postgres', () => {
  const files = {
    'requirements.txt': 'Django==5.0\ncelery[redis]==5.3\npsycopg2-binary==2.9\ngunicorn\n',
    'requirements-dev.txt': 'pytest\npytest-django\nblack\n',
    'docker-compose.yml': 'services:\n  web:\n    build: .\n  db:\n    image: postgres:16-alpine\n  cache:\n    image: "redis:7"\n',
    'shop/settings.py': "DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql'}}\n",
  }
  const stack = detect(files, ['manage.py', 'Dockerfile', 'shop/celery.py'], [lang('Python', 90_000), lang('HTML', 8_000), lang('Shell', 300)], [
    { name: 'django', count: 30 },
    { name: 'celery', count: 3 },
  ])

  it('detects the framework, the job queue, the database and the containers', () => {
    expect(ids(stack)).toEqual(expect.arrayContaining(['django', 'celery', 'postgresql', 'redis', 'gunicorn', 'docker', 'docker-compose', 'python', 'pytest', 'black']))
  })

  it('cites the database from three independent places', () => {
    expect(item(stack, 'postgresql')!.evidence).toEqual(
      expect.arrayContaining(['requirements.txt', 'docker-compose.yml → postgres service', 'shop/settings.py → database engine']),
    )
    expect(item(stack, 'django')!.evidence).toEqual(expect.arrayContaining(['requirements.txt', 'manage.py', 'used in 30 files']))
  })

  it('marks dev-only Python tools as tooling and lists only languages above 5%', () => {
    expect(item(stack, 'pytest')?.importance).toBe('tooling')
    expect(item(stack, 'python')?.importance).toBe('core')
    expect(item(stack, 'html')?.importance).toBe('core')
    expect(ids(stack)).not.toContain('shell')
  })
})

describe('detectTechStack: Go CLI with cobra', () => {
  const files = {
    'go.mod': 'module github.com/acme/todo\n\ngo 1.22\n\nrequire (\n\tgithub.com/spf13/cobra v1.8.0\n\tgithub.com/spf13/viper v1.18.0\n\tgithub.com/stretchr/testify v1.9.0\n\tgolang.org/x/text v0.14.0 // indirect\n)\n',
    '.goreleaser.yaml': 'builds: []\n',
  }
  const stack = detect(files, ['main.go', 'cmd/root.go', 'cmd/add.go', 'Makefile', '.golangci.yml'], [lang('Go', 40_000), lang('Makefile', 400)], [
    { name: 'github.com/spf13/cobra', count: 5 },
    { name: 'github.com/spf13/viper', count: 2 },
    { name: 'github.com/stretchr/testify/assert', count: 4 },
  ])

  it('detects Go, Cobra, Viper and the testing / quality tools', () => {
    expect(ids(stack)).toEqual(expect.arrayContaining(['go', 'cobra', 'viper', 'testify', 'make', 'golangci-lint']))
    expect(item(stack, 'go')?.importance).toBe('core')
    expect(item(stack, 'cobra')?.evidence).toEqual(['go.mod → require', 'used in 5 files'])
  })

  it('matches imported Go sub-packages to their module', () => {
    expect(item(stack, 'testify')?.evidence).toContain('used in 4 files')
  })
})

describe('detectTechStack: Rust with tokio + axum', () => {
  const files = {
    'Cargo.toml': '[package]\nname = "api"\n\n[dependencies]\ntokio = { version = "1", features = ["full"] }\naxum = "0.7"\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\nsqlx = { version = "0.7", features = ["postgres"] }\ntracing = "0.1"\n\n[dev-dependencies]\nreqwest = "0.12"\n',
  }
  const stack = detect(files, ['src/main.rs', 'src/routes.rs', 'Dockerfile', 'migrations/0001_init.sql'], [lang('Rust', 30_000), lang('SQL', 2_000), lang('Dockerfile', 300)], [
    { name: 'tokio', count: 4 },
    { name: 'axum', count: 6 },
    { name: 'serde_json', count: 2 },
  ])

  it('detects the async engine, web framework and helpers', () => {
    expect(ids(stack)).toEqual(expect.arrayContaining(['rust', 'axum', 'tokio', 'serde', 'sqlx-rust', 'tracing', 'reqwest', 'docker', 'cargo', 'sql']))
    expect(stack.filter((t) => t.id === 'serde')).toHaveLength(1)
  })

  it('demotes a dev-only dependency that the code does not import', () => {
    expect(item(stack, 'reqwest')?.importance).toBe('tooling')
    expect(item(stack, 'axum')?.importance).toBe('core')
  })
})

describe('detectTechStack: implied foundations and edge cases', () => {
  it('adds what a framework is built on, but keeps both when both are present', () => {
    const stack = detect({ 'package.json': JSON.stringify({ dependencies: { expo: '50.0.0' } }) }, [], [lang('TypeScript', 1000)])
    expect(ids(stack)).toEqual(expect.arrayContaining(['expo', 'react-native', 'react']))
    expect(item(stack, 'react')?.evidence).toEqual(['React Native is built on it'])
  })

  it('still lists the main language when no language reaches 5%', () => {
    const many = Array.from({ length: 30 }, (_, i) => lang(['Python', 'Go', 'Rust', 'Ruby', 'PHP', 'Java'][i % 6] + (i >= 6 ? ` ${i}` : ''), 100 - i))
    const stack = detect({}, [], many)
    expect(stack.filter((t) => t.category === 'language')).toHaveLength(1)
  })

  it('gives unknown languages a generic but friendly entry that getTech can find again', () => {
    const stack = detect({}, [], [lang('Common Lisp', 1000)])
    expect(stack[0]).toMatchObject({ id: 'lang-common-lisp', name: 'Common Lisp', category: 'language', importance: 'core' })
    expect(getTech('lang-common-lisp')?.name).toBe('Common Lisp')
  })

  it('ignores files in vendored, example and fixture folders', () => {
    const stack = detect({}, ['examples/docker/Dockerfile', 'vendor/x/next.config.js', 'test/fixtures/terraform/main.tf'], [])
    expect(stack).toEqual([])
  })

  it('ignores packages only examples import when the project lists its own packages', () => {
    const files = { 'package.json': JSON.stringify({ dependencies: { express: '4' } }) }
    const few = detect(files, [], [lang('JavaScript', 1000)], [{ name: 'redis', count: 1 }, { name: 'express', count: 9 }])
    expect(ids(few)).not.toContain('redis')
    const many = detect(files, [], [lang('JavaScript', 1000)], [{ name: 'redis', count: 6 }])
    expect(item(many, 'redis')).toMatchObject({ importance: 'tooling', evidence: ['used in 6 files'] })
    // Without any package list (a folder of scripts), imports alone are trusted.
    const scripts = detect({}, [], [lang('Python', 1000)], [{ name: 'pandas', count: 1 }])
    expect(item(scripts, 'pandas')?.importance).toBe('core')
  })

  it('compresses long manifest evidence lists', () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 6; i++) files[`packages/p${i}/package.json`] = JSON.stringify({ dependencies: { react: '19' } })
    const react = item(detect(files, [], []), 'react')!
    expect(react.evidence).toHaveLength(4)
    expect(react.evidence[3]).toBe('and 3 more package lists')
  })

  it('is robust to missing or malformed input', () => {
    expect(() => detectTechStack({ paths: [], files: {}, manifests: { dependencies: [], scripts: [], entryHints: [], workspaces: [], psr4: {}, projectNames: [], descriptions: [] }, languages: [] })).not.toThrow()
    expect(() =>
      detectTechStack({
        paths: undefined as unknown as string[],
        files: undefined as unknown as Record<string, string>,
        manifests: {} as never,
        languages: [null as unknown as LanguageStat],
        importedPackages: [{ name: '', count: 1 }],
      }),
    ).not.toThrow()
  })

  it('reads Kubernetes manifests, browser-extension manifests and SwiftUI imports from file contents', () => {
    const stack = detect(
      {
        'deploy/app.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n',
        'manifest.json': '{ "manifest_version": 3, "name": "Tab Tamer" }',
        'App/ContentView.swift': 'import SwiftUI\nstruct ContentView: View {}\n',
      },
      [],
      [lang('Swift', 1000)],
    )
    expect(ids(stack)).toEqual(expect.arrayContaining(['kubernetes', 'browser-extension', 'swiftui', 'swift']))
    expect(ids(stack)).not.toContain('gcp')
  })

  it('stays fast on hostile file contents', () => {
    const blank = '\n'.repeat(150_000)
    const files = {
      'docker-compose.yml': `${blank}image:${' '.repeat(50_000)}`,
      Dockerfile: `${blank}FROM${' '.repeat(50_000)}`,
      'App/View.swift': `${blank}import`,
      'Game/Player.cs': `${blank}using`,
      'k8s.yaml': `apiVersion:${blank}kind:${blank}`,
      'config/database.yml': `${blank}adapter:`,
      'plugin.php': `${' '.repeat(3999)}`,
    }
    const t0 = performance.now()
    detectTechStack({ paths: Object.keys(files), files, manifests: parseManifests({}, []), languages: [] })
    expect(performance.now() - t0).toBeLessThan(1500)
  })

  it('stays fast on large trees', () => {
    const paths = Array.from({ length: 50_000 }, (_, i) => `src/module${i % 500}/file${i}.ts`)
    const t0 = performance.now()
    detectTechStack({ paths, files: {}, manifests: parseManifests({}, []), languages: [lang('TypeScript', 1)] })
    expect(performance.now() - t0).toBeLessThan(1500)
  })
})

describe('lookupPackage', () => {
  it('matches exact names per ecosystem', () => {
    expect(lookupPackage('npm', 'react')?.id).toBe('react')
    expect(lookupPackage('npm', 'react-dom')?.id).toBe('react')
    expect(lookupPackage('pypi', 'django')?.id).toBe('django')
    expect(lookupPackage('cargo', 'tokio')?.id).toBe('tokio')
    expect(lookupPackage('gem', 'rails')?.id).toBe('rails')
    expect(lookupPackage('composer', 'laravel/framework')?.id).toBe('laravel')
    expect(lookupPackage('pub', 'flutter')?.id).toBe('flutter')
    expect(lookupPackage('npm', 'definitely-not-a-real-package')).toBeUndefined()
  })

  it('honours "*" prefix patterns', () => {
    expect(lookupPackage('npm', '@radix-ui/react-dialog')?.id).toBe('radix')
    expect(lookupPackage('npm', '@radix-ui/react-popover')?.id).toBe('radix')
    expect(lookupPackage('npm', '@nestjs/common')?.id).toBe('nestjs')
    expect(lookupPackage('npm', '@remix-run/node')?.id).toBe('remix')
    expect(lookupPackage('npm', 'd3-force')?.id).toBe('d3')
    expect(lookupPackage('npm', 'eslint-plugin-react')?.id).toBe('eslint')
    expect(lookupPackage('pypi', 'pytest-cov')?.id).toBe('pytest')
    expect(lookupPackage('maven', 'org.springframework.boot:spring-boot-starter-web')?.id).toBe('spring-boot')
    expect(lookupPackage('nuget', 'Microsoft.EntityFrameworkCore.SqlServer')?.id).toBe('entity-framework')
    expect(lookupPackage('npm', '@radix-ui')).toBeUndefined()
  })

  it('prefers an exact match over a broader prefix', () => {
    expect(lookupPackage('npm', '@aws-sdk/client-dynamodb')?.id).toBe('dynamodb')
    expect(lookupPackage('npm', '@aws-sdk/client-s3')?.id).toBe('aws-sdk')
  })

  it('normalizes names the way each ecosystem compares them', () => {
    expect(lookupPackage('pypi', 'Django')?.id).toBe('django')
    expect(lookupPackage('pypi', 'scikit_learn')?.id).toBe('scikit-learn')
    expect(lookupPackage('cargo', 'actix_web')?.id).toBe('actix-web')
    expect(lookupPackage('nuget', 'xunit.runner.visualstudio')?.id).toBe('xunit')
    expect(normalizePackageName('pypi', 'Zope.Interface__x')).toBe('zope-interface-x')
  })

  it('understands import names that differ from package names', () => {
    expect(lookupPackage('pypi', 'sklearn')?.id).toBe('scikit-learn')
    expect(lookupPackage('pypi', 'bs4')?.id).toBe('beautifulsoup')
    expect(lookupPackage('pypi', 'cv2')?.id).toBe('opencv')
    expect(lookupPackage('pypi', 'PIL')?.id).toBe('pillow')
    expect(lookupPackage('pypi', 'yaml')?.id).toBe('pyyaml')
    expect(lookupPackage('pypi', 'rest_framework')?.id).toBe('django-rest-framework')
    expect(lookupPackage('maven', 'org.springframework.boot.autoconfigure.SpringBootApplication')?.id).toBe('spring-boot')
    expect(lookupPackage('swift', 'SwiftUI')?.id).toBe('swiftui')
    expect(lookupPackage('composer', 'Illuminate\\Support\\Facades\\Route')?.id).toBe('laravel')
  })

  it('matches Go module sub-paths and major-version suffixes', () => {
    expect(lookupPackage('go', 'github.com/gin-gonic/gin/binding')?.id).toBe('gin')
    expect(lookupPackage('go', 'github.com/labstack/echo/v4')?.id).toBe('echo')
    expect(lookupPackage('go', 'github.com/aws/aws-sdk-go-v2/service/s3')?.id).toBe('aws-sdk')
    expect(lookupPackage('go', 'github.com/unknown/thing')).toBeUndefined()
  })

  it('falls back from conda to PyPI names', () => {
    expect(lookupPackage('conda', 'pandas')?.id).toBe('pandas')
    expect(lookupPackage('conda', 'seaborn')?.id).toBe('seaborn')
  })

  it('handles junk input', () => {
    expect(lookupPackage('npm', '')).toBeUndefined()
    expect(lookupPackage('npm', undefined as unknown as string)).toBeUndefined()
  })
})

describe('getTech and describeLanguage', () => {
  it('finds catalog entries by id', () => {
    expect(getTech('react')?.name).toBe('React')
    expect(getTech('postgresql')?.category).toBe('database')
    expect(getTech('nope')).toBeUndefined()
  })

  it('describes languages by their display names', () => {
    expect(describeLanguage('TSX')?.name).toBe('TypeScript')
    expect(describeLanguage('Jupyter Notebook')?.id).toBe('jupyter')
    expect(describeLanguage('Klingon')).toBeNull()
  })
})
