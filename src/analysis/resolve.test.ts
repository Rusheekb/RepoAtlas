import { extractImports } from './imports'
import { detectLanguage } from './languages'
import { createResolver, type ResolvedImport, type ResolverContext } from './resolve'
import { cargoTables } from './imports/resolvers/rust'

/** Build a resolver over a fake repo and return a `(from, spec, opts) → result` helper. */
function repo(paths: string[], files: Record<string, string> = {}, extra: Partial<ResolverContext> = {}) {
  const all = [...new Set([...paths, ...Object.keys(files)])]
  const resolver = createResolver({ paths: all, files, ...extra })
  return (from: string, specifier: string, opts: { kind?: string; names?: string[]; lang?: string } = {}): ResolvedImport =>
    resolver(from, { specifier, line: 1, kind: opts.kind, names: opts.names }, opts.lang ?? detectLanguage(from)?.name ?? '')
}

const int = (...paths: string[]): ResolvedImport => ({ type: 'internal', paths })
const ext = (packageName: string): ResolvedImport => ({ type: 'external', packageName })
const bi = (name: string): ResolvedImport => ({ type: 'builtin', name })
const NONE: ResolvedImport = { type: 'unresolved' }

describe('JavaScript / TypeScript resolution', () => {
  const r = repo([
    'src/main.tsx',
    'src/App.tsx',
    'src/utils.ts',
    'src/utils.test.ts',
    'src/legacy.js',
    'src/legacy.ts',
    'src/components/Button.tsx',
    'src/components/Button.module.css',
    'src/components/index.ts',
    'src/hooks/useAuth.ts',
    'src/data/config.json',
    'src/assets/logo.svg',
    'src/esm/thing.ts',
    'src/types.d.ts',
    'lib/index.js',
    'src/pages/Home.vue',
  ])

  it('resolves relative paths with extension and index probing', () => {
    expect(r('src/main.tsx', './App')).toEqual(int('src/App.tsx'))
    expect(r('src/main.tsx', './utils')).toEqual(int('src/utils.ts'))
    expect(r('src/App.tsx', './components/Button')).toEqual(int('src/components/Button.tsx'))
    expect(r('src/App.tsx', './components')).toEqual(int('src/components/index.ts'))
    expect(r('src/App.tsx', '../lib')).toEqual(int('lib/index.js'))
    expect(r('src/App.tsx', './pages/Home.vue')).toEqual(int('src/pages/Home.vue'))
  })

  it('prefers TypeScript over JavaScript and maps .js specifiers to .ts sources', () => {
    expect(r('src/main.tsx', './legacy')).toEqual(int('src/legacy.ts'))
    expect(r('src/main.tsx', './esm/thing.js')).toEqual(int('src/esm/thing.ts'))
    expect(r('src/main.tsx', './types')).toEqual(int('src/types.d.ts'))
  })

  it('handles explicit extensions, assets, queries and loader prefixes', () => {
    expect(r('src/App.tsx', './data/config.json')).toEqual(int('src/data/config.json'))
    expect(r('src/App.tsx', './assets/logo.svg')).toEqual(int('src/assets/logo.svg'))
    expect(r('src/App.tsx', './assets/logo.svg?react')).toEqual(int('src/assets/logo.svg'))
    expect(r('src/App.tsx', 'raw-loader!./utils')).toEqual(int('src/utils.ts'))
    expect(r('src/components/Button.tsx', './Button.module.css')).toEqual(int('src/components/Button.module.css'))
  })

  it('returns unresolved for missing relative files and never links a file to itself', () => {
    expect(r('src/App.tsx', './nope')).toEqual(NONE)
    expect(r('src/utils.ts', './utils')).toEqual(int())
  })

  it('classifies builtins and externals with normalized names', () => {
    expect(r('src/a.ts', 'fs')).toEqual(bi('fs'))
    expect(r('src/a.ts', 'node:fs/promises')).toEqual(bi('fs'))
    expect(r('src/a.ts', 'path')).toEqual(bi('path'))
    expect(r('src/a.ts', 'child_process')).toEqual(bi('child_process'))
    expect(r('src/a.ts', 'react')).toEqual(ext('react'))
    expect(r('src/a.ts', 'react-dom/client')).toEqual(ext('react-dom'))
    expect(r('src/a.ts', 'lodash/fp')).toEqual(ext('lodash'))
    expect(r('src/a.ts', '@tanstack/react-query/devtools')).toEqual(ext('@tanstack/react-query'))
    expect(r('src/a.ts', 'https://deno.land/std@0.200.0/http/server.ts')).toEqual(ext('deno.land/std'))
    expect(r('src/a.ts', 'npm:chalk@5')).toEqual(ext('chalk'))
    expect(r('src/a.ts', 'virtual:pwa-register')).toEqual(bi('virtual:pwa-register'))
    expect(r('src/a.ts', '$app/stores')).toEqual(bi('$app/stores'))
  })

  it('falls back to src/ for "@/" and "~/" aliases without a tsconfig', () => {
    expect(r('src/pages/Home.vue', '@/components/Button')).toEqual(int('src/components/Button.tsx'))
    expect(r('src/App.tsx', '~/hooks/useAuth')).toEqual(int('src/hooks/useAuth.ts'))
    expect(r('src/App.tsx', '@/missing')).toEqual(NONE)
  })

  it('treats bare paths into the repo as internal when they are not declared dependencies', () => {
    expect(r('src/App.tsx', 'components/Button')).toEqual(int('src/components/Button.tsx'))
    const withDeps = repo(['src/a.ts', 'src/events.ts', 'package.json'], {
      'package.json': '{"dependencies": {"events": "^3.0.0"}}',
    })
    expect(withDeps('src/a.ts', 'events')).toEqual(ext('events'))
  })
})

describe('tsconfig / jsconfig paths', () => {
  it('reads JSONC paths and baseUrl relative to the tsconfig', () => {
    const r = repo(['src/lib/api.ts', 'src/components/Card.tsx', 'src/config/index.ts', 'src/utils/date.ts', 'src/main.ts'], {
      'tsconfig.json': `{
        // comments are fine
        "compilerOptions": {
          "baseUrl": ".", /* block too */
          "paths": {
            "@/*": ["./src/*"],
            "@components/*": ["src/components/*",],
            "config": ["src/config/index.ts"],
          },
        },
      }`,
    })
    expect(r('src/main.ts', '@/lib/api')).toEqual(int('src/lib/api.ts'))
    expect(r('src/main.ts', '@components/Card')).toEqual(int('src/components/Card.tsx'))
    expect(r('src/main.ts', 'config')).toEqual(int('src/config/index.ts'))
    expect(r('src/main.ts', 'src/utils/date')).toEqual(int('src/utils/date.ts'))
    expect(r('src/main.ts', 'react')).toEqual(ext('react'))
  })

  it('follows "extends" and applies paths relative to the config that defines them', () => {
    const r = repo(['packages/shared/src/index.ts', 'apps/web/src/app.ts', 'apps/web/src/ui/Nav.tsx'], {
      'tsconfig.base.json': '{"compilerOptions": {"paths": {"@shared/*": ["packages/shared/src/*"], "@shared": ["packages/shared/src/index.ts"]}}}',
      'apps/web/tsconfig.json': '{"extends": "../../tsconfig.base.json", "compilerOptions": {"strict": true}}',
    })
    expect(r('apps/web/src/app.ts', '@shared')).toEqual(int('packages/shared/src/index.ts'))
    expect(r('apps/web/src/app.ts', '@shared/index')).toEqual(int('packages/shared/src/index.ts'))
  })

  it('uses solution-style references (tsconfig.json → tsconfig.app.json)', () => {
    const r = repo(['src/App.tsx', 'src/state/store.ts'], {
      'tsconfig.json': '{"files": [], "references": [{"path": "./tsconfig.app.json"}, {"path": "./tsconfig.node.json"}]}',
      'tsconfig.app.json': '{"compilerOptions": {"paths": {"@/*": ["./src/*"]}}}',
      'tsconfig.node.json': '{"compilerOptions": {}}',
    })
    expect(r('src/App.tsx', '@/state/store')).toEqual(int('src/state/store.ts'))
  })

  it('lets the nearest tsconfig win in a monorepo', () => {
    const r = repo(['apps/web/src/a.ts', 'apps/web/src/b.ts', 'packages/ui/lib/b.ts', 'packages/ui/lib/c.ts'], {
      'apps/web/tsconfig.json': '{"compilerOptions": {"paths": {"@/*": ["./src/*"]}}}',
      'packages/ui/tsconfig.json': '{"compilerOptions": {"baseUrl": "lib", "paths": {"@/*": ["*"]}}}',
    })
    expect(r('apps/web/src/a.ts', '@/b')).toEqual(int('apps/web/src/b.ts'))
    expect(r('packages/ui/lib/c.ts', '@/b')).toEqual(int('packages/ui/lib/b.ts'))
  })

  it('survives malformed configs', () => {
    const r = repo(['src/a.ts', 'src/b.ts'], { 'tsconfig.json': '{ this is not json' })
    expect(r('src/a.ts', './b')).toEqual(int('src/b.ts'))
  })
})

describe('workspace packages', () => {
  const r = repo(
    [
      'packages/utils/src/index.ts',
      'packages/utils/src/format.ts',
      'packages/ui/src/Button.tsx',
      'packages/ui/src/index.ts',
      'packages/icons/package.json',
      'packages/icons/src/index.ts',
      'apps/web/src/main.ts',
    ],
    {
      'package.json': '{"name": "acme-monorepo", "workspaces": ["packages/*", "apps/*"]}',
      'packages/utils/package.json': '{"name": "@acme/utils", "main": "dist/index.js", "types": "dist/index.d.ts"}',
      'packages/ui/package.json': '{"name": "@acme/ui", "exports": {".": {"import": "./dist/index.mjs", "types": "./dist/index.d.ts"}, "./*": "./src/*.tsx"}}',
      'apps/web/package.json': '{"name": "web", "dependencies": {"@acme/utils": "workspace:*", "react": "^19"}}',
    },
  )

  it('maps package names to their source entry points', () => {
    expect(r('apps/web/src/main.ts', '@acme/utils')).toEqual(int('packages/utils/src/index.ts'))
    expect(r('apps/web/src/main.ts', '@acme/utils/format')).toEqual(int('packages/utils/src/format.ts'))
    expect(r('apps/web/src/main.ts', '@acme/ui')).toEqual(int('packages/ui/src/index.ts'))
    expect(r('apps/web/src/main.ts', '@acme/ui/Button')).toEqual(int('packages/ui/src/Button.tsx'))
  })

  it('finds packages whose package.json was not downloaded by folder name', () => {
    expect(r('apps/web/src/main.ts', '@acme/icons')).toEqual(int('packages/icons/src/index.ts'))
  })

  it('keeps real dependencies external', () => {
    expect(r('apps/web/src/main.ts', 'react')).toEqual(ext('react'))
    expect(r('apps/web/src/main.ts', '@other/thing')).toEqual(ext('@other/thing'))
  })

  it('supports package.json "imports" (#subpath)', () => {
    const r2 = repo(['src/internal/db.ts', 'src/app.ts'], {
      'package.json': '{"imports": {"#internal/*": "./src/internal/*.ts", "#db": {"default": "./src/internal/db.ts"}}}',
    })
    expect(r2('src/app.ts', '#internal/db')).toEqual(int('src/internal/db.ts'))
    expect(r2('src/app.ts', '#db')).toEqual(int('src/internal/db.ts'))
  })

  it('resolves SvelteKit $lib', () => {
    const r3 = repo(['src/lib/Button.svelte', 'src/routes/+page.svelte'])
    expect(r3('src/routes/+page.svelte', '$lib/Button.svelte')).toEqual(int('src/lib/Button.svelte'))
  })
})

describe('end-to-end: extract + resolve (JS family)', () => {
  it('resolves every import of a Vue component, including its <style> block', () => {
    const files = {
      'src/App.vue': [
        '<script setup>',
        "import Child from './components/Child.vue'",
        "import { useStore } from '@/stores/main'",
        "import axios from 'axios'",
        '</script>',
        '<style lang="scss">',
        "@use './styles/vars';",
        '</style>',
      ].join('\n'),
    }
    const paths = ['src/App.vue', 'src/components/Child.vue', 'src/stores/main.ts', 'src/styles/_vars.scss']
    const resolver = createResolver({ paths, files })
    const out = extractImports('src/App.vue', files['src/App.vue'], 'Vue').map((imp) => resolver('src/App.vue', imp, 'Vue'))
    expect(out).toEqual([int('src/components/Child.vue'), int('src/stores/main.ts'), ext('axios'), int('src/styles/_vars.scss')])
  })

  it('resolves index.html script tags against the project root', () => {
    const files = { 'index.html': '<link rel="stylesheet" href="./global.css"><script type="module" src="/src/main.tsx"></script>' }
    const paths = ['index.html', 'src/main.tsx', 'global.css']
    const resolver = createResolver({ paths, files })
    const out = extractImports('index.html', files['index.html'], 'HTML').map((imp) => resolver('index.html', imp, 'HTML'))
    expect(out).toEqual([int('global.css'), int('src/main.tsx')])
  })
})

describe('Python resolution', () => {
  const r = repo([
    'app/__init__.py',
    'app/main.py',
    'app/models.py',
    'app/api/__init__.py',
    'app/api/users.py',
    'app/api/items.py',
    'app/core/__init__.py',
    'app/core/config.py',
    'scripts/run.py',
    'scripts/helpers.py',
    'src/mypkg/__init__.py',
    'src/mypkg/core.py',
    'backend/manage.py',
    'backend/polls/__init__.py',
    'backend/polls/models.py',
    'tests/test_api.py',
  ])

  it('resolves relative imports, including submodules named in from-imports', () => {
    expect(r('app/main.py', '.', { names: ['models'] })).toEqual(int('app/models.py'))
    expect(r('app/main.py', '.api', { names: ['users', 'items'] })).toEqual(int('app/api/users.py', 'app/api/items.py'))
    expect(r('app/main.py', '.api', { names: ['router'] })).toEqual(int('app/api/__init__.py'))
    expect(r('app/main.py', '.core.config', { names: ['settings'] })).toEqual(int('app/core/config.py'))
    expect(r('app/api/users.py', '..core', { names: ['config'] })).toEqual(int('app/core/config.py'))
    expect(r('app/api/users.py', '..models', { names: ['User'] })).toEqual(int('app/models.py'))
    expect(r('app/main.py', '.missing', { names: ['x'] })).toEqual(NONE)
  })

  it('resolves absolute imports against the repo root, src/ layouts and project folders', () => {
    expect(r('tests/test_api.py', 'app.api.users', { names: ['get_user'] })).toEqual(int('app/api/users.py'))
    expect(r('tests/test_api.py', 'app.core.config')).toEqual(int('app/core/config.py'))
    expect(r('tests/test_api.py', 'app.core.config.Settings')).toEqual(int('app/core/config.py'))
    expect(r('tests/test_api.py', 'app.api', { names: ['users'] })).toEqual(int('app/api/users.py'))
    expect(r('tests/test_api.py', 'mypkg.core')).toEqual(int('src/mypkg/core.py'))
    expect(r('backend/polls/__init__.py', 'polls.models', { names: ['Question'] })).toEqual(int('backend/polls/models.py'))
    expect(r('scripts/run.py', 'helpers')).toEqual(int('scripts/helpers.py'))
  })

  it('classifies stdlib and third-party packages', () => {
    expect(r('app/main.py', 'os')).toEqual(bi('os'))
    expect(r('app/main.py', 'os.path')).toEqual(bi('os'))
    expect(r('app/main.py', 'collections.abc')).toEqual(bi('collections'))
    expect(r('app/main.py', '__future__')).toEqual(bi('__future__'))
    expect(r('app/main.py', 'numpy')).toEqual(ext('numpy'))
    expect(r('app/main.py', 'sklearn.model_selection')).toEqual(ext('sklearn'))
    expect(r('app/main.py', 'fastapi')).toEqual(ext('fastapi'))
  })
})

describe('Go resolution', () => {
  const paths = [
    'go.mod',
    'cmd/server/main.go',
    'internal/db/db.go',
    'internal/db/conn.go',
    'internal/db/db_test.go',
    'pkg/util/strings.go',
    'tools/go.mod',
    'tools/gen/gen.go',
    'third_party/fork/fork.go',
  ]
  const files = {
    'go.mod': 'module github.com/acme/app\n\ngo 1.22\n\nreplace github.com/other/fork => ./third_party/fork\n',
    'tools/go.mod': 'module github.com/acme/app/tools\n',
  }
  const r = repo(paths, files)

  it('maps internal packages to their non-test .go files', () => {
    expect(r('cmd/server/main.go', 'github.com/acme/app/internal/db')).toEqual(int('internal/db/conn.go', 'internal/db/db.go'))
    expect(r('cmd/server/main.go', 'github.com/acme/app/pkg/util')).toEqual(int('pkg/util/strings.go'))
    expect(r('cmd/server/main.go', 'github.com/acme/app/missing')).toEqual(NONE)
  })

  it('supports nested modules and replace directives', () => {
    expect(r('cmd/server/main.go', 'github.com/acme/app/tools/gen')).toEqual(int('tools/gen/gen.go'))
    expect(r('cmd/server/main.go', 'github.com/other/fork')).toEqual(int('third_party/fork/fork.go'))
  })

  it('classifies stdlib and external modules', () => {
    expect(r('cmd/server/main.go', 'fmt')).toEqual(bi('fmt'))
    expect(r('cmd/server/main.go', 'net/http')).toEqual(bi('net/http'))
    expect(r('cmd/server/main.go', 'github.com/gin-gonic/gin')).toEqual(ext('github.com/gin-gonic/gin'))
    expect(r('cmd/server/main.go', 'github.com/go-redis/redis/v8')).toEqual(ext('github.com/go-redis/redis'))
    expect(r('cmd/server/main.go', 'github.com/aws/aws-sdk-go/service/s3')).toEqual(ext('github.com/aws/aws-sdk-go'))
    expect(r('cmd/server/main.go', 'golang.org/x/sync/errgroup')).toEqual(ext('golang.org/x/sync'))
    expect(r('cmd/server/main.go', 'go.uber.org/zap')).toEqual(ext('go.uber.org/zap'))
    expect(r('cmd/server/main.go', 'gopkg.in/yaml.v3')).toEqual(ext('gopkg.in/yaml.v3'))
  })

  it('uses goModulePath when go.mod contents are unavailable', () => {
    const r2 = repo(['go.mod', 'api/handler.go', 'main.go'], {}, { goModulePath: 'example.com/svc' })
    expect(r2('main.go', 'example.com/svc/api')).toEqual(int('api/handler.go'))
  })
})

describe('Rust resolution', () => {
  const paths = [
    'Cargo.toml',
    'src/main.rs',
    'src/lib.rs',
    'src/config.rs',
    'src/db/mod.rs',
    'src/db/models.rs',
    'src/api.rs',
    'src/api/routes.rs',
    'src/bin/tool.rs',
    'tests/integration.rs',
    'tests/common/mod.rs',
    'crates/core/Cargo.toml',
    'crates/core/src/lib.rs',
    'crates/core/src/math.rs',
    'src/platform/unix.rs',
  ]
  const files = {
    'Cargo.toml': '[package]\nname = "my-app"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"\n',
    'crates/core/Cargo.toml': '[package]\nname = "core-utils"\n',
    'src/lib.rs': 'pub mod config;\npub mod db;\npub mod api;\n',
  }
  const r = repo(paths, files)

  it('resolves mod declarations (file.rs, dir/mod.rs, nested module folders)', () => {
    expect(r('src/lib.rs', 'config', { kind: 'mod' })).toEqual(int('src/config.rs'))
    expect(r('src/lib.rs', 'db', { kind: 'mod' })).toEqual(int('src/db/mod.rs'))
    expect(r('src/db/mod.rs', 'models', { kind: 'mod' })).toEqual(int('src/db/models.rs'))
    expect(r('src/api.rs', 'routes', { kind: 'mod' })).toEqual(int('src/api/routes.rs'))
    expect(r('tests/integration.rs', 'common', { kind: 'mod' })).toEqual(int('tests/common/mod.rs'))
    expect(r('src/lib.rs', 'platform/unix.rs', { kind: 'mod-path' })).toEqual(int('src/platform/unix.rs'))
    expect(r('src/lib.rs', 'missing', { kind: 'mod' })).toEqual(NONE)
  })

  it('resolves crate::, self:: and super:: paths', () => {
    expect(r('src/api/routes.rs', 'crate::db::models::User')).toEqual(int('src/db/models.rs'))
    expect(r('src/api/routes.rs', 'crate::config')).toEqual(int('src/config.rs'))
    expect(r('src/api/routes.rs', 'crate::Config')).toEqual(int('src/lib.rs'))
    expect(r('src/api.rs', 'self::routes::handler')).toEqual(int('src/api/routes.rs'))
    expect(r('src/db/models.rs', 'super::Pool')).toEqual(int('src/db/mod.rs'))
    expect(r('src/api/routes.rs', 'super::super::config::Settings')).toEqual(int('src/config.rs'))
    expect(r('src/db/mod.rs', 'super::api')).toEqual(int('src/api.rs'))
  })

  it('resolves workspace crates by name and 2018-style child paths', () => {
    expect(r('src/lib.rs', 'core_utils::math::add')).toEqual(int('crates/core/src/math.rs'))
    expect(r('src/bin/tool.rs', 'my_app::config')).toEqual(int('src/config.rs'))
    expect(r('src/api.rs', 'routes::list')).toEqual(int('src/api/routes.rs'))
  })

  it('classifies std and external crates', () => {
    expect(r('src/lib.rs', 'std::collections::HashMap')).toEqual(bi('std'))
    expect(r('src/lib.rs', 'core::fmt')).toEqual(bi('core'))
    expect(r('src/lib.rs', 'serde::Serialize')).toEqual(ext('serde'))
    expect(r('src/lib.rs', 'tokio', { kind: 'extern' })).toEqual(ext('tokio'))
  })

  it('treats [[bin]] and [lib] paths from Cargo.toml as crate roots (ripgrep layout)', () => {
    const rg = repo(
      [
        'crates/core/main.rs',
        'crates/core/flags/mod.rs',
        'crates/core/flags/hiargs.rs',
        'crates/core/search.rs',
        'crates/ignore/Cargo.toml',
        'crates/ignore/src/lib.rs',
        'crates/ignore/src/walk.rs',
        'crates/odd/Cargo.toml',
        'crates/odd/lib/root.rs',
        'crates/odd/lib/inner.rs',
      ],
      {
        'Cargo.toml': [
          '[package]',
          'name = "ripgrep"',
          'description = """',
          '[[bin]] inside a long description is not a table',
          '"""',
          '',
          '[[bin]]',
          'bench = false',
          'path = "crates/core/main.rs"',
          'name = "rg"',
          '',
          '[[test]]',
          'name = "integration"',
          'path = "tests/tests.rs"',
          '',
          '[dependencies]',
          'ignore = { version = "0.4", path = "crates/ignore" }',
        ].join('\n'),
        'crates/ignore/Cargo.toml': '[package]\nname = "ignore"\n',
        'crates/odd/Cargo.toml': '[package]\nname = "odd-pkg"\n\n[lib]\nname = "odd_lib"\npath = "lib/root.rs"\n',
        'crates/core/main.rs': 'mod flags;\nmod search;\n',
        'crates/odd/lib/root.rs': 'pub mod inner;\n',
      },
    )
    // `mod x;` in the [[bin]] root looks next to it, and `crate::` means that root everywhere below it.
    expect(rg('crates/core/main.rs', 'flags', { kind: 'mod' })).toEqual(int('crates/core/flags/mod.rs'))
    expect(rg('crates/core/main.rs', 'search', { kind: 'mod' })).toEqual(int('crates/core/search.rs'))
    expect(rg('crates/core/main.rs', 'crate::flags::HiArgs')).toEqual(int('crates/core/flags/mod.rs'))
    expect(rg('crates/core/flags/mod.rs', 'hiargs', { kind: 'mod' })).toEqual(int('crates/core/flags/hiargs.rs'))
    expect(rg('crates/core/flags/hiargs.rs', 'crate::search::SearchWorker')).toEqual(int('crates/core/search.rs'))
    expect(rg('crates/core/search.rs', 'super::flags::HiArgs')).toEqual(int('crates/core/flags/mod.rs'))
    // Workspace crates still resolve by name; a [lib] name and path override the defaults.
    expect(rg('crates/core/main.rs', 'ignore::WalkState')).toEqual(int('crates/ignore/src/lib.rs'))
    expect(rg('crates/core/main.rs', 'odd_lib::inner::Thing')).toEqual(int('crates/odd/lib/inner.rs'))
    expect(rg('crates/odd/lib/root.rs', 'inner', { kind: 'mod' })).toEqual(int('crates/odd/lib/inner.rs'))
    expect(rg('crates/odd/lib/inner.rs', 'crate::Thing')).toEqual(int('crates/odd/lib/root.rs'))
  })

  it('reads Cargo tables line by line, quickly, whatever the manifest holds', () => {
    const tables = cargoTables('[package]\nname = "a-b"\n\n[[bin]]\npath = "x.rs"\n[[bin]]\npath = \'y.rs\'\n[lib]\npath="l.rs"\n')
    expect(tables.filter((t) => t.header === '[bin]').map((t) => t.values.get('path'))).toEqual(['x.rs', 'y.rs'])
    expect(tables.find((t) => t.header === 'lib')?.values.get('path')).toBe('l.rs')
    const t0 = performance.now()
    cargoTables(`[package]\n${' \n'.repeat(50_000)}${'['.repeat(100_000)}\n${'a = '.repeat(25_000)}`)
    expect(performance.now() - t0).toBeLessThan(1500)
  })
})

describe('JVM resolution', () => {
  const files = {
    'src/main/java/com/acme/app/service/UserService.java': 'package com.acme.app.service;\npublic class UserService {}\n',
    'src/main/kotlin/com/acme/util/Format.kt': 'package com.acme.util\n\nfun formatDate(d: Long): String = ""\nobject Formats {}\n',
    'app/src/main/kotlin/Flat.kt': 'package com.acme.flat\n\nclass Widget\n',
  }
  const r = repo(
    [
      'src/main/java/com/acme/app/App.java',
      'src/main/java/com/acme/app/models/User.java',
      'src/main/java/com/acme/app/models/Order.java',
    ],
    files,
  )

  it('resolves classes, wildcards, static imports and Kotlin top-level declarations', () => {
    const from = 'src/main/java/com/acme/app/App.java'
    expect(r(from, 'com.acme.app.models.User')).toEqual(int('src/main/java/com/acme/app/models/User.java'))
    expect(r(from, 'com.acme.app.models.*')).toEqual(
      int('src/main/java/com/acme/app/models/Order.java', 'src/main/java/com/acme/app/models/User.java'),
    )
    expect(r(from, 'com.acme.app.service.UserService.findAll', { kind: 'static' })).toEqual(
      int('src/main/java/com/acme/app/service/UserService.java'),
    )
    expect(r(from, 'com.acme.util.formatDate')).toEqual(int('src/main/kotlin/com/acme/util/Format.kt'))
    expect(r(from, 'com.acme.util.Formats')).toEqual(int('src/main/kotlin/com/acme/util/Format.kt'))
    expect(r(from, 'com.acme.flat.Widget')).toEqual(int('app/src/main/kotlin/Flat.kt'))
  })

  it('classifies JDK/Android builtins and external libraries', () => {
    const from = 'src/main/java/com/acme/app/App.java'
    expect(r(from, 'java.util.List')).toEqual(bi('java.util'))
    expect(r(from, 'javax.inject.Inject')).toEqual(bi('javax.inject'))
    expect(r(from, 'android.os.Bundle')).toEqual(bi('android.os'))
    expect(r(from, 'org.springframework.boot.SpringApplication')).toEqual(ext('org.springframework.boot'))
    expect(r(from, 'kotlinx.coroutines.flow.Flow')).toEqual(ext('kotlinx.coroutines'))
    expect(r(from, 'lombok.Data')).toEqual(ext('lombok'))
  })
})

describe('C# resolution', () => {
  const files = {
    'src/Program.cs': 'using MyApp.Services;\nvar svc = new UserService();\n',
    'src/Services/UserService.cs': 'namespace MyApp.Services;\npublic class UserService {}\n',
    'src/Services/EmailService.cs': 'namespace MyApp.Services\n{\n  public class EmailService {}\n}\n',
    'src/Models/User.cs': 'namespace MyApp.Models;\npublic record User(string Name);\n',
  }
  const r = repo(['src/MyApp.Data/Repo.cs', 'src/MyApp.Data/Db.cs'], files)

  it('maps namespaces to the files whose types are used', () => {
    expect(r('src/Program.cs', 'MyApp.Services')).toEqual(int('src/Services/UserService.cs'))
    expect(r('src/Services/UserService.cs', 'MyApp.Models')).toEqual(int('src/Models/User.cs'))
  })

  it('falls back to folder names when the files were not downloaded', () => {
    expect(r('src/Program.cs', 'MyApp.Data')).toEqual(int('src/MyApp.Data/Db.cs', 'src/MyApp.Data/Repo.cs'))
  })

  it('classifies System and NuGet namespaces', () => {
    expect(r('src/Program.cs', 'System.Linq')).toEqual(bi('System.Linq'))
    expect(r('src/Program.cs', 'System')).toEqual(bi('System'))
    expect(r('src/Program.cs', 'Newtonsoft.Json')).toEqual(ext('Newtonsoft.Json'))
    expect(r('src/Program.cs', 'Microsoft.EntityFrameworkCore')).toEqual(ext('Microsoft.EntityFrameworkCore'))
  })
})

describe('C / C++ resolution', () => {
  const r = repo(['src/main.c', 'src/utils/helpers.h', 'include/mylib/api.h', 'libs/foo/include/foo/foo.h', 'src/net/socket.c', 'src/net/socket.h'])

  it('resolves quoted includes relative to the file, include roots and by suffix', () => {
    expect(r('src/main.c', 'utils/helpers.h', { kind: 'include' })).toEqual(int('src/utils/helpers.h'))
    expect(r('src/net/socket.c', 'socket.h', { kind: 'include' })).toEqual(int('src/net/socket.h'))
    expect(r('src/net/socket.c', 'utils/helpers.h', { kind: 'include' })).toEqual(int('src/utils/helpers.h'))
    expect(r('src/main.c', 'mylib/api.h', { kind: 'include' })).toEqual(int('include/mylib/api.h'))
    expect(r('src/main.c', 'missing.h', { kind: 'include' })).toEqual(NONE)
  })

  it('treats angle includes as internal when found, otherwise builtin or external', () => {
    expect(r('src/main.c', 'mylib/api.h', { kind: 'include-system' })).toEqual(int('include/mylib/api.h'))
    expect(r('src/main.c', 'foo/foo.h', { kind: 'include-system' })).toEqual(int('libs/foo/include/foo/foo.h'))
    expect(r('src/main.c', 'stdio.h', { kind: 'include-system' })).toEqual(bi('stdio.h'))
    expect(r('src/main.cpp', 'vector', { kind: 'include-system' })).toEqual(bi('vector'))
    expect(r('src/main.c', 'sys/socket.h', { kind: 'include-system' })).toEqual(bi('sys/socket.h'))
    expect(r('src/main.cpp', 'boost/asio.hpp', { kind: 'include-system' })).toEqual(ext('boost'))
    expect(r('src/main.c', 'zlib.h', { kind: 'include-system' })).toEqual(ext('zlib'))
  })
})

describe('Ruby, PHP, Swift, Dart, Elixir, Lua, R, Shell', () => {
  it('Ruby', () => {
    const r = repo(['lib/my_gem.rb', 'lib/my_gem/parser.rb', 'spec/spec_helper.rb', 'spec/parser_spec.rb'])
    expect(r('spec/spec_helper.rb', '../lib/my_gem', { kind: 'require_relative' })).toEqual(int('lib/my_gem.rb'))
    expect(r('spec/parser_spec.rb', 'spec_helper', { kind: 'require_relative' })).toEqual(int('spec/spec_helper.rb'))
    expect(r('spec/spec_helper.rb', 'my_gem/parser', { kind: 'require' })).toEqual(int('lib/my_gem/parser.rb'))
    expect(r('spec/spec_helper.rb', 'json', { kind: 'require' })).toEqual(bi('json'))
    expect(r('spec/spec_helper.rb', 'net/http', { kind: 'require' })).toEqual(bi('net/http'))
    expect(r('spec/spec_helper.rb', 'rails', { kind: 'require' })).toEqual(ext('rails'))
    expect(r('spec/spec_helper.rb', 'active_support/core_ext', { kind: 'require' })).toEqual(ext('active_support'))
  })

  it('PHP (PSR-4, suffix matching, includes)', () => {
    const r = repo(['app/Models/User.php', 'app/Http/Controllers/UserController.php', 'public/index.php', 'bootstrap/app.php'], {
      'composer.json': '{"autoload": {"psr-4": {"App\\\\": "app/"}}, "autoload-dev": {"psr-4": {"Tests\\\\": "tests/"}}}',
    })
    const from = 'app/Http/Controllers/UserController.php'
    expect(r(from, 'App\\Models\\User', { kind: 'use' })).toEqual(int('app/Models/User.php'))
    expect(r(from, 'Illuminate\\Http\\Request', { kind: 'use' })).toEqual(ext('Illuminate'))
    expect(r('public/index.php', './../bootstrap/app.php', { kind: 'include' })).toEqual(int('bootstrap/app.php'))
    const noComposer = repo(['app/Models/Post.php', 'app/Http/Kernel.php'])
    expect(noComposer('app/Http/Kernel.php', 'App\\Models\\Post', { kind: 'use' })).toEqual(int('app/Models/Post.php'))
    const ctxMap = repo(['src/Domain/Order.php', 'src/Main.php'], {}, { psr4: { 'Shop\\': 'src/' } })
    expect(ctxMap('src/Main.php', 'Shop\\Domain\\Order', { kind: 'use' })).toEqual(int('src/Domain/Order.php'))
  })

  it('Swift', () => {
    const r = repo(['Sources/App/main.swift', 'Sources/Core/Core.swift', 'Sources/Core/Models.swift'])
    expect(r('Sources/App/main.swift', 'Core')).toEqual(int('Sources/Core/Core.swift'))
    expect(r('Sources/App/main.swift', 'Foundation')).toEqual(bi('Foundation'))
    expect(r('Sources/App/main.swift', 'SwiftUI')).toEqual(bi('SwiftUI'))
    expect(r('Sources/App/main.swift', 'Vapor')).toEqual(ext('Vapor'))
  })

  it('Dart', () => {
    const r = repo(['lib/main.dart', 'lib/src/widgets/button.dart'], { 'pubspec.yaml': 'name: my_app\nversion: 1.0.0\n' })
    expect(r('lib/main.dart', 'package:my_app/src/widgets/button.dart')).toEqual(int('lib/src/widgets/button.dart'))
    expect(r('lib/main.dart', 'src/widgets/button.dart')).toEqual(int('lib/src/widgets/button.dart'))
    expect(r('lib/main.dart', 'package:flutter/material.dart')).toEqual(ext('flutter'))
    expect(r('lib/main.dart', 'dart:async')).toEqual(bi('dart:async'))
  })

  it('Elixir', () => {
    const r = repo(['lib/my_app/accounts/user.ex', 'lib/my_app_web/router.ex'], {
      'lib/my_app/accounts.ex': 'defmodule MyApp.Accounts do\n  def list, do: []\nend\n',
    })
    expect(r('lib/my_app_web/router.ex', 'MyApp.Accounts')).toEqual(int('lib/my_app/accounts.ex'))
    expect(r('lib/my_app_web/router.ex', 'MyApp.Accounts.User')).toEqual(int('lib/my_app/accounts/user.ex'))
    expect(r('lib/my_app_web/router.ex', 'Logger')).toEqual(bi('Logger'))
    expect(r('lib/my_app_web/router.ex', 'Ecto.Query')).toEqual(ext('Ecto'))
  })

  it('Lua', () => {
    const r = repo(['lua/myplugin/init.lua', 'lua/myplugin/config.lua', 'plugin/main.lua'])
    expect(r('plugin/main.lua', 'myplugin.config')).toEqual(int('lua/myplugin/config.lua'))
    expect(r('plugin/main.lua', 'myplugin')).toEqual(int('lua/myplugin/init.lua'))
    expect(r('plugin/main.lua', 'string')).toEqual(bi('string'))
    expect(r('plugin/main.lua', 'lpeg')).toEqual(ext('lpeg'))
  })

  it('R and Shell', () => {
    const r = repo(['analysis.R', 'R/helpers.R', 'scripts/deploy.sh', 'scripts/lib/common.sh'])
    expect(r('analysis.R', 'R/helpers.R', { kind: 'source' })).toEqual(int('R/helpers.R'))
    expect(r('analysis.R', 'dplyr', { kind: 'library' })).toEqual(ext('dplyr'))
    expect(r('analysis.R', 'stats', { kind: 'library' })).toEqual(bi('stats'))
    expect(r('scripts/deploy.sh', './lib/common.sh', { kind: 'source' })).toEqual(int('scripts/lib/common.sh'))
    expect(r('scripts/deploy.sh', 'lib/common', { kind: 'source' })).toEqual(int('scripts/lib/common.sh'))
  })
})

describe('CSS and HTML resolution', () => {
  const r = repo(['styles/main.scss', 'styles/_variables.scss', 'styles/mixins/_index.scss', 'styles/theme.css', 'public/img/bg.css', 'index.html', 'src/main.tsx'])

  it('resolves Sass partials, index files and packages', () => {
    expect(r('styles/main.scss', 'variables', { kind: '@import' })).toEqual(int('styles/_variables.scss'))
    expect(r('styles/main.scss', 'mixins', { kind: '@use' })).toEqual(int('styles/mixins/_index.scss'))
    expect(r('styles/main.scss', 'theme.css', { kind: '@import' })).toEqual(int('styles/theme.css'))
    expect(r('styles/main.scss', 'sass:math', { kind: '@use' })).toEqual(bi('sass:math'))
    expect(r('styles/main.scss', '~bootstrap/scss/functions', { kind: '@import' })).toEqual(ext('bootstrap'))
    expect(r('styles/main.scss', 'bootstrap/scss/functions', { kind: '@import' })).toEqual(ext('bootstrap'))
    expect(r('styles/main.scss', '@fontsource/inter', { kind: '@import' })).toEqual(ext('@fontsource/inter'))
  })

  it('resolves HTML references', () => {
    expect(r('index.html', '/src/main.tsx', { kind: 'script' })).toEqual(int('src/main.tsx'))
    expect(r('index.html', '/img/bg.css', { kind: 'stylesheet' })).toEqual(int('public/img/bg.css'))
    expect(r('index.html', 'styles/theme.css', { kind: 'stylesheet' })).toEqual(int('styles/theme.css'))
    expect(r('index.html', 'missing.js', { kind: 'script' })).toEqual(NONE)
  })
})

describe('other languages', () => {
  it('Terraform, Bazel, Haskell, templates, Zig', () => {
    const r = repo([
      'main.tf',
      'modules/vpc/main.tf',
      'modules/vpc/variables.tf',
      'tools/defs.bzl',
      'tools/BUILD',
      'src/App/Types.hs',
      'src/Main.hs',
      'templates/base.html',
      'templates/blog/index.html',
      'resources/views/layouts/app.blade.php',
      'resources/views/home.blade.php',
    ])
    expect(r('main.tf', './modules/vpc', { lang: 'HCL' })).toEqual(int('modules/vpc/main.tf', 'modules/vpc/variables.tf'))
    expect(r('main.tf', 'hashicorp/consul/aws', { lang: 'HCL' })).toEqual(ext('hashicorp/consul/aws'))
    expect(r('tools/BUILD', '//tools:defs.bzl', { lang: 'Starlark' })).toEqual(int('tools/defs.bzl'))
    expect(r('tools/BUILD', ':defs.bzl', { lang: 'Starlark' })).toEqual(int('tools/defs.bzl'))
    expect(r('tools/BUILD', '@rules_go//go:def.bzl', { lang: 'Starlark' })).toEqual(ext('rules_go'))
    expect(r('src/Main.hs', 'App.Types')).toEqual(int('src/App/Types.hs'))
    expect(r('src/Main.hs', 'Data.Map')).toEqual(bi('Data'))
    expect(r('templates/blog/index.html', 'base.html', { kind: 'extends', lang: 'Jinja' })).toEqual(int('templates/base.html'))
    expect(r('resources/views/home.blade.php', 'layouts.app', { kind: 'view', lang: 'Blade' })).toEqual(
      int('resources/views/layouts/app.blade.php'),
    )
    expect(r('src/main.zig', 'std', { lang: 'Zig' })).toEqual(bi('std'))
  })
})

describe('robustness & performance', () => {
  it('handles empty input and unknown languages', () => {
    const r = createResolver({ paths: [], files: {} })
    expect(r('a.ts', { specifier: '', line: 1 }, 'TypeScript')).toEqual(NONE)
    expect(r('a.xyz', { specifier: './b', line: 1 }, 'Unknown')).toEqual(NONE)
    expect(r('a.ts', { specifier: 'react', line: 1 }, '')).toEqual(ext('react'))
  })

  it('resolves thousands of imports over a 30k-file repo quickly', () => {
    const paths: string[] = []
    for (let i = 0; i < 300; i++) for (let j = 0; j < 100; j++) paths.push(`src/m${i}/f${j}.ts`)
    const t0 = performance.now()
    const r = createResolver({ paths, files: { 'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}' } })
    let internalCount = 0
    for (let k = 0; k < 5000; k++) {
      const i = k % 300
      const res = r(`src/m${i}/f0.ts`, { specifier: k % 2 ? `./f${k % 100}` : `@/m${(i + 1) % 300}/f${k % 100}`, line: 1 }, 'TypeScript')
      if (res.type === 'internal') internalCount++
    }
    expect(internalCount).toBeGreaterThan(4900)
    expect(performance.now() - t0).toBeLessThan(3000)
  })
})

describe('resolution order and strictness', () => {
  it('looks under baseUrl before treating a name as a package, but never guesses non-script files', () => {
    const r = repo(['src/config/index.ts', 'src/react.svg', 'src/main.ts'], {
      'tsconfig.json': '{"compilerOptions": {"baseUrl": "src"}}',
      'package.json': '{"dependencies": {"config": "^3", "react": "^19"}}',
    })
    expect(r('src/main.ts', 'config')).toEqual(int('src/config/index.ts'))
    expect(r('src/main.ts', 'react')).toEqual(ext('react'))
    expect(r('src/main.ts', 'react.svg')).toEqual(int('src/react.svg'))
  })

  it('still allows extension-less relative imports of data files (bundler plugins)', () => {
    const r = repo(['src/main.ts', 'src/data.yaml'])
    expect(r('src/main.ts', './data')).toEqual(int('src/data.yaml'))
  })
})

describe('Python import roots', () => {
  it('uses folders above the importing file and top-level packages', () => {
    const r = repo(['services/api/app/__init__.py', 'services/api/app/models.py', 'services/api/app/routes/users.py', 'mypkg/__init__.py', 'mypkg/utils.py', 'mypkg/cli/main.py'])
    expect(r('services/api/app/routes/users.py', 'app.models', { names: ['User'] })).toEqual(int('services/api/app/models.py'))
    expect(r('mypkg/cli/main.py', 'utils', { names: ['helper'] })).toEqual(int('mypkg/utils.py'))
    expect(r('mypkg/cli/main.py', 'requests')).toEqual(ext('requests'))
  })
})

describe('site roots for page assets', () => {
  it('finds "/style.css" in a public/ folder next to the views folder', () => {
    const r = repo(['examples/mvc/views/404.ejs', 'examples/mvc/public/style.css', 'examples/mvc/index.js'])
    expect(r('examples/mvc/views/404.ejs', '/style.css', { kind: 'stylesheet', lang: 'EJS' })).toEqual(int('examples/mvc/public/style.css'))
  })
})
