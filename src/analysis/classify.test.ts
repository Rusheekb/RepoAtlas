import { describe, expect, it, vi } from 'vitest'

vi.mock('@/knowledge', () => ({
  describeFolder: (name: string) =>
    name === 'core' ? { role: 'Core logic', description: 'The heart of the app.', emoji: '⚙️', layer: 'logic' } : null,
}))

import { classifyFile } from './classify'
import { detectLanguage } from './languages'

function cls(path: string, content?: string, extra: Partial<Parameters<typeof classifyFile>[1]> = {}) {
  const r = classifyFile(path, { content, language: detectLanguage(path)?.name ?? null, ...extra })
  return `${r.kind}/${r.role}/${r.layer}`
}

describe('classifyFile — documented examples', () => {
  it.each([
    ['src/components/Button.tsx', 'source/component/ui'],
    ['app/models/user.rb', 'source/model/data'],
    ['tests/test_api.py', 'test/test/test'],
    ['.github/workflows/ci.yml', 'config/ci/infra'],
    ['Dockerfile', 'build/container/infra'],
    ['package.json', 'config/config/config'],
    ['README.md', 'docs/docs/docs'],
    ['styles/main.css', 'style/style/ui'],
    ['migrations/0001_init.sql', 'source/migration/data'],
  ])('%s → %s', (path, expected) => {
    expect(cls(path)).toBe(expected)
  })

  it('treats a routes file with detected routes as a web address handler', () => {
    expect(cls('src/routes/users.ts', 'router.get("/users", list)', { routes: [{ method: 'GET', path: '/users', line: 1 }] })).toBe('source/route/api')
  })
})

describe('classifyFile — file name conventions', () => {
  it.each([
    ['src/Button.test.tsx', 'test'],
    ['pkg/server/handler_test.go', 'test'],
    ['src/__tests__/login.ts', 'test'],
    ['src/__tests__/helpers.ts', 'util'],
    ['src/app/user.spec.ts', 'test'],
    ['tests/conftest.py', 'fixture'],
    ['src/main/java/com/acme/UserServiceTest.java', 'test'],
    ['shop/models.py', 'model'],
    ['shop/views.py', 'controller'],
    ['shop/urls.py', 'route'],
    ['shop/serializers.py', 'schema'],
    ['shop/admin.py', 'config'],
    ['src/users/users.controller.ts', 'controller'],
    ['src/users/users.service.ts', 'service'],
    ['src/users/users.module.ts', 'config'],
    ['src/users/user.entity.ts', 'model'],
    ['src/users/create-user.dto.ts', 'schema'],
    ['src/users/users.repository.ts', 'repository'],
    ['src/graphql/user.resolver.ts', 'controller'],
    ['src/db/schema.ts', 'schema'],
    ['src/server/routes.ts', 'route'],
    ['src/app/router.tsx', 'route'],
    ['src/state/store.ts', 'state'],
    ['src/features/cartSlice.ts', 'state'],
    ['src/lib/useDebounce.ts', 'hook'],
    ['src/types/index.d.ts', 'types'],
    ['src/constants.ts', 'constants'],
    ['src/middleware.ts', 'middleware'],
    ['src/api/auth.middleware.ts', 'middleware'],
    ['src/lib/utils.ts', 'util'],
    ['cmd/server/main.go', 'entry'],
    ['src/main.rs', 'entry'],
    ['src/flask/__main__.py', 'entry'],
  ])('%s → role %s', (path, role) => {
    expect(classifyFile(path, { language: detectLanguage(path)?.name ?? null }).role).toBe(role)
  })

  it('classifies config, CI, containers, infrastructure and build files', () => {
    expect(cls('tsconfig.json')).toBe('config/config/config')
    expect(cls('vite.config.ts')).toBe('config/build/infra')
    expect(cls('.eslintrc.cjs')).toBe('config/config/config')
    expect(cls('docker-compose.yml')).toBe('build/container/infra')
    expect(cls('infra/main.tf')).toBe('config/config/infra')
    expect(cls('Makefile')).toBe('build/build/infra')
    expect(cls('.gitlab-ci.yml')).toBe('config/ci/infra')
    expect(cls('requirements-dev.txt')).toBe('config/config/config')
    expect(cls('setup.py')).toBe('build/build/infra')
    expect(cls('.env.example')).toBe('config/config/config')
    expect(cls('k8s/deployment.yaml')).toBe('config/container/infra')
  })

  it('classifies docs, assets, translations and data', () => {
    expect(cls('LICENSE')).toBe('docs/docs/docs')
    expect(cls('docs/guide/intro.md')).toBe('docs/docs/docs')
    expect(cls('CONTRIBUTING.md')).toBe('docs/docs/docs')
    expect(cls('public/logo.png')).toBe('asset/asset/other')
    expect(cls('src/assets/fonts/Inter.woff2')).toBe('asset/asset/other')
    expect(cls('src/locales/fr.json')).toBe('data/i18n/ui')
    expect(cls('locale/de/LC_MESSAGES/django.po')).toBe('data/i18n/ui')
    expect(cls('data/countries.csv')).toBe('data/other/data')
    expect(cls('config/database.yml')).toBe('config/config/config')
    expect(cls('prisma/schema.prisma')).toBe('source/schema/data')
    expect(cls('schema.graphql')).toBe('source/schema/api')
  })

  it('classifies templates and single-file components', () => {
    expect(cls('templates/index.html')).toBe('markup/page/ui')
    expect(cls('templates/base.html')).toBe('markup/layout/ui')
    expect(cls('app/views/layouts/application.html.erb')).toBe('markup/layout/ui')
    expect(cls('src/components/Card.vue')).toBe('source/component/ui')
    expect(cls('src/pages/about.astro')).toBe('source/page/ui')
    expect(cls('src/routes/+page.svelte')).toBe('source/page/ui')
    expect(cls('src/routes/+layout.svelte')).toBe('source/layout/ui')
  })

  it('handles Next.js conventions', () => {
    expect(cls('app/dashboard/page.tsx')).toBe('source/page/ui')
    expect(cls('app/layout.tsx')).toBe('source/layout/ui')
    expect(cls('app/api/users/route.ts')).toBe('source/route/api')
    expect(cls('pages/api/login.ts')).toBe('source/route/api')
    expect(cls('pages/index.tsx')).toBe('source/page/ui')
    expect(cls('pages/_app.tsx')).toBe('source/layout/ui')
  })

  it('keeps stories, generated, vendored and lock files out of the real code', () => {
    expect(cls('src/components/Button.stories.tsx')).toBe('docs/docs/docs')
    expect(cls('dist/bundle.js')).toBe('generated/other/other')
    expect(cls('static/app.min.js')).toBe('generated/other/other')
    expect(cls('api/user.pb.go')).toBe('generated/other/other')
    expect(cls('package-lock.json')).toBe('generated/config/config')
    expect(cls('vendor/github.com/x/y/z.go')).toBe('source/library/other')
  })

  it('treats code in examples and docs folders as documentation-layer code', () => {
    const r = classifyFile('examples/auth/index.js', {
      language: 'JavaScript',
      content: "app.get('/', fn)\napp.listen(3000)",
      routes: [{ method: 'GET', path: '/', line: 1 }],
    })
    expect(r.layer).toBe('docs')
    expect(r.kind).toBe('source')
  })

  it('treats scripts and CI helpers as build & deploy', () => {
    expect(cls('scripts/release.ts')).toBe('script/script/infra')
    expect(cls('scripts/setup.sh')).toBe('script/script/infra')
    expect(cls('.github/actions/setup/index.js')).toBe('script/ci/infra')
  })
})

describe('classifyFile — content signals', () => {
  it('detects JSX as a UI building block', () => {
    expect(cls('src/App.tsx', 'export default function App() {\n  return <div className="app">Hi</div>\n}')).toBe('source/component/ui')
    expect(cls('src/widgets/Thing.jsx', 'const X = () => (<span>hi</span>)')).toBe('source/component/ui')
  })

  it('detects plain JS files with JSX only when React is around', () => {
    const content = "import React from 'react'\nexport function Hello() { return <p>Hello</p> }"
    expect(cls('src/hello.js', content)).toBe('source/component/ui')
  })

  it('detects ORM declarations as data models', () => {
    expect(cls('src/app/user.py', 'class User(models.Model):\n    name = models.CharField()')).toBe('source/model/data')
    expect(cls('src/db/user.ts', "const UserSchema = new mongoose.Schema({ name: String })")).toBe('source/model/data')
    expect(cls('app/orm.py', 'class Base(DeclarativeBase):\n  pass\nclass User(Base):\n  id = 1')).toBe('source/model/data')
    expect(cls('src/main/java/com/x/Order.java', '@Entity\npublic class Order {}')).toBe('source/model/data')
  })

  it('detects tests by content even with an ordinary name', () => {
    expect(cls('src/checks.ts', "describe('x', () => { it('works', () => { expect(1).toBe(1) }) })")).toBe('test/test/test')
  })

  it('detects entry points by content', () => {
    const r = classifyFile('src/start.ts', { language: 'TypeScript', content: "import express from 'express'\nconst app = express()\napp.listen(3000)" })
    expect(r.role).toBe('entry')
    expect(r.layer).toBe('api')
    const ui = classifyFile('src/index.tsx', { language: 'TSX', content: "createRoot(document.getElementById('root')!).render(<App />)" })
    expect(ui.role).toBe('entry')
    expect(ui.layer).toBe('ui')
  })

  it('detects command-line tools', () => {
    expect(classifyFile('tool/run.py', { language: 'Python', content: 'import argparse\nparser = argparse.ArgumentParser()' }).role).toBe('cli')
  })

  it('ignores start-up code that only appears in comments', () => {
    const r = classifyFile('lib/application.js', { language: 'JavaScript', content: '/**\n * Example:\n *   app.listen(3000)\n */\nfunction x() {}' })
    expect(r.role).not.toBe('entry')
  })

  it('reads executable scripts without an extension by their first line', () => {
    const r = classifyFile('bin/www', { language: null, content: "#!/usr/bin/env node\nvar app = require('../app')\nserver.listen(port)" })
    expect(r.role).toBe('entry')
  })

  it('uses symbols when nothing else is known', () => {
    const r = classifyFile('src/thing.ts', {
      language: 'TypeScript',
      content: 'export interface A {}',
      symbols: [{ name: 'A', kind: 'interface', line: 1, exported: true }],
    })
    expect(r.role).toBe('types')
  })

  it('falls back to the folder description for the layer of generic code', () => {
    const r = classifyFile('src/core/engine.ts', { language: 'TypeScript', content: 'export function run() {}' })
    expect(r).toEqual({ kind: 'source', role: 'library', layer: 'logic' })
  })

  it('keeps test helpers, ignore lists and ambiguous names in their place', () => {
    expect(cls('test/support/env.js', 'module.exports = {}')).toBe('test/util/test')
    expect(cls('tests/test_apps/helloworld/wsgi.py', 'from hello import app')).toBe('test/test/test')
    expect(cls('.eslintignore')).toBe('config/config/config')
    expect(classifyFile('lib/request.js', { language: 'JavaScript', content: 'var req = Object.create(http.IncomingMessage.prototype)' }).role).not.toBe('client')
    expect(classifyFile('notes', { language: 'Text', isCode: false }).kind).toBe('docs')
  })

  it('ignores example programs that only appear inside comments', () => {
    const doc = '/*\nPackage gin implements a web framework.\n\n\tpackage main\n\n\tfunc main() {\n\t\tr := gin.Default()\n\t\tr.Run()\n\t}\n*/\npackage gin\n'
    expect(classifyFile('doc.go', { language: 'Go', content: doc }).role).not.toBe('entry')
  })

  it('never throws on odd input', () => {
    for (const p of ['', 'noext', '.hidden', 'a/b/c/d/e/f/g/h.unknownext', 'weird name with spaces.tsx', 'UPPER.TXT']) {
      expect(() => classifyFile(p, { language: null })).not.toThrow()
      expect(() => classifyFile(p, { language: 'TypeScript', content: '' })).not.toThrow()
    }
  })
})

describe('classifyFile — project shapes from the review', () => {
  it('keeps Java package folders named example/samples as real code', () => {
    const app = 'package com.example.demo;\n\n@SpringBootApplication\npublic class DemoApplication {\n  public static void main(String[] args) { SpringApplication.run(DemoApplication.class, args); }\n}\n'
    expect(cls('src/main/java/com/example/demo/DemoApplication.java', app)).toBe('source/entry/api')
    expect(cls('src/main/java/org/springframework/samples/petclinic/owner/Owner.java', 'package x;\npublic class Owner {}\n')).not.toMatch(/\/docs$/)
    expect(cls('samples/web/src/main/java/com/acme/Web.java', 'package com.acme;\npublic class Web {}\n')).toMatch(/\/docs$/)
  })

  it('treats Django tests.py as tests', () => {
    expect(cls('aggregator/tests.py', 'from django.test import TestCase\n\nclass T(TestCase):\n    pass\n')).toBe('test/test/test')
  })

  it('treats binary test fixtures as media, not lines of test code', () => {
    expect(cls('dashboard/fixtures/example_data.json.gz')).toBe('asset/fixture/test')
  })
})
