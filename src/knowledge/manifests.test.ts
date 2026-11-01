import { describe, expect, it } from 'vitest'
import { parseManifests } from './manifests'
import type { DependencyRef, ManifestInfo } from './types'

function parse(files: Record<string, string>, extraPaths: string[] = []): ManifestInfo {
  return parseManifests(files, [...Object.keys(files), ...extraPaths])
}

function dep(info: ManifestInfo, name: string): DependencyRef | undefined {
  return info.dependencies.find((d) => d.name === name)
}

function names(info: ManifestInfo, filter?: (d: DependencyRef) => boolean): string[] {
  return info.dependencies.filter(filter ?? (() => true)).map((d) => d.name)
}

describe('package.json', () => {
  const pkg = JSON.stringify({
    name: '@acme/shop',
    description: 'An online shop',
    main: 'dist/index.js',
    module: './dist/index.mjs',
    bin: { shop: './bin/shop.js' },
    exports: { '.': { import: './dist/index.mjs', types: './dist/index.d.ts' }, './utils': './dist/utils.js' },
    scripts: { dev: 'vite', build: 'tsc && vite build', start: 'node server/index.js' },
    dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
    devDependencies: { vitest: '^2.0.0', '@types/react': '^19' },
    peerDependencies: { zod: '>=3' },
    workspaces: ['packages/*', '!packages/legacy'],
  })
  const info = parse({ 'package.json': pkg }, ['src/index.ts', 'src/utils.ts', 'bin/shop.js', 'server/index.js'])

  it('reads dependencies with dev flags and sections', () => {
    expect(dep(info, 'react')).toMatchObject({ ecosystem: 'npm', dev: false, version: '^19.0.0', section: 'dependencies', source: 'package.json' })
    expect(dep(info, 'vitest')).toMatchObject({ dev: true, section: 'devDependencies' })
    expect(dep(info, 'zod')).toMatchObject({ dev: true, section: 'peerDependencies' })
  })

  it('reads scripts, names and descriptions', () => {
    expect(info.scripts).toContainEqual({ name: 'build', command: 'tsc && vite build', source: 'package.json' })
    expect(info.projectNames).toContain('@acme/shop')
    expect(info.descriptions).toContain('An online shop')
  })

  it('resolves main/module/exports from dist to src, and bin as-is', () => {
    const paths = info.entryHints.map((h) => h.path)
    expect(paths).toContain('src/index.ts')
    expect(paths).toContain('src/utils.ts')
    expect(paths).toContain('bin/shop.js')
    expect(info.entryHints.find((h) => h.path === 'bin/shop.js')?.reason).toMatch(/"shop"/)
  })

  it('finds the file a start script runs', () => {
    expect(info.entryHints.find((h) => h.path === 'server/index.js')?.reason).toMatch(/"start"/)
  })

  it('reads workspaces as an array and as {packages}, skipping negations', () => {
    expect(info.workspaces).toEqual(['packages/*'])
    const nested = parse({ 'package.json': JSON.stringify({ workspaces: { packages: ['apps/*', 'libs/*'] } }) })
    expect(nested.workspaces).toEqual(['apps/*', 'libs/*'])
  })

  it('prefixes nested package workspaces and resolves nested entries relative to their folder', () => {
    const nested = parse(
      { 'tools/cli/package.json': JSON.stringify({ name: 'cli', bin: 'cli.js', workspaces: ['plugins/*'] }) },
      ['tools/cli/cli.js'],
    )
    expect(nested.workspaces).toEqual(['tools/cli/plugins/*'])
    expect(nested.entryHints[0]).toMatchObject({ path: 'tools/cli/cli.js' })
  })

  it('tries extensions and index files for extension-less entries', () => {
    const info2 = parse({ 'package.json': JSON.stringify({ main: 'lib/server' }) }, ['lib/server/index.js'])
    expect(info2.entryHints.map((h) => h.path)).toEqual(['lib/server/index.js'])
  })

  it('never reports entry hints that do not exist', () => {
    const info2 = parse({ 'package.json': JSON.stringify({ main: 'dist/missing.js', bin: { x: './nope.js' } }) })
    expect(info2.entryHints).toEqual([])
  })
})

describe('pnpm and lerna workspaces', () => {
  it('reads pnpm-workspace.yaml and lerna.json', () => {
    const info = parse({
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - apps/web\n  - '!**/test/**'\n",
      'lerna.json': JSON.stringify({ packages: ['modules/*'] }),
    })
    expect(info.workspaces).toEqual(expect.arrayContaining(['packages/*', 'apps/web', 'modules/*']))
    expect(info.workspaces.some((w) => w.includes('!'))).toBe(false)
  })
})

describe('Python manifests', () => {
  it('parses requirements.txt, skipping options, includes, editable installs and comments', () => {
    const info = parse({
      'requirements.txt': [
        '# core',
        'Django==5.0.1',
        'celery[redis]>=5.3 ; python_version >= "3.9"',
        'psycopg2-binary',
        '-r base.txt',
        '-e git+https://github.com/x/y.git#egg=y',
        '--index-url https://pypi.org/simple',
        'git+https://github.com/a/b.git@v1#egg=b',
        './local-wheel.whl',
        'requests  # http client',
        '',
      ].join('\n'),
    })
    expect(names(info)).toEqual(['Django', 'celery', 'psycopg2-binary', 'requests'])
    expect(dep(info, 'Django')).toMatchObject({ ecosystem: 'pypi', version: '==5.0.1', dev: false })
    expect(dep(info, 'celery')?.version).toBe('>=5.3')
  })

  it('treats requirements-dev.txt and requirements/test.txt as dev', () => {
    const info = parse({ 'requirements-dev.txt': 'pytest\n', 'requirements/test.txt': 'coverage\n', 'requirements/base.txt': 'flask\n' })
    expect(dep(info, 'pytest')?.dev).toBe(true)
    expect(dep(info, 'coverage')?.dev).toBe(true)
    expect(dep(info, 'flask')?.dev).toBe(false)
  })

  it('parses pyproject.toml (PEP 621): deps, optional deps, scripts → entry hints', () => {
    const toml = `
[project]
name = "acme-cli"
description = "Does acme things"
dependencies = ["click>=8", "rich[jupyter]~=13.0", "httpx; python_version>'3.8'"]

[project.optional-dependencies]
dev = ["pytest>=7", "ruff"]

[project.scripts]
acme = "acme.cli:main"
`
    const info = parse({ 'pyproject.toml': toml }, ['src/acme/cli.py'])
    expect(names(info, (d) => !d.dev)).toEqual(['click', 'rich', 'httpx'])
    expect(names(info, (d) => d.dev)).toEqual(['pytest', 'ruff'])
    expect(info.projectNames).toContain('acme-cli')
    expect(info.scripts).toContainEqual({ name: 'acme', command: 'acme.cli:main', source: 'pyproject.toml' })
    expect(info.entryHints).toEqual([{ path: 'src/acme/cli.py', reason: expect.stringContaining('"acme"') }])
  })

  it('parses Poetry dependencies, dev groups and scripts', () => {
    const toml = `
[tool.poetry]
name = "shop"
description = "Shop backend"

[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.110"
sqlalchemy = { version = "^2.0", extras = ["asyncio"] }

[tool.poetry.group.dev.dependencies]
pytest = "^8"

[tool.poetry.dev-dependencies]
black = "*"

[tool.poetry.scripts]
serve = "shop.main:run"
`
    const info = parse({ 'pyproject.toml': toml }, ['shop/main.py'])
    expect(names(info, (d) => !d.dev)).toEqual(['fastapi', 'sqlalchemy'])
    expect(names(info, (d) => d.dev).sort()).toEqual(['black', 'pytest'])
    expect(dep(info, 'sqlalchemy')?.version).toBe('^2.0')
    expect(info.entryHints[0].path).toBe('shop/main.py')
  })

  it('parses PEP 735 dependency groups and uv dev dependencies', () => {
    const toml = `
[project]
name = "x"
dependencies = []
[dependency-groups]
test = ["pytest"]
[tool.uv]
dev-dependencies = ["mypy"]
`
    const info = parse({ 'pyproject.toml': toml })
    expect(names(info, (d) => d.dev).sort()).toEqual(['mypy', 'pytest'])
  })

  it('parses Pipfile', () => {
    const info = parse({ Pipfile: '[packages]\nflask = "*"\nrequests = {version = ">=2"}\n\n[dev-packages]\npytest = "*"\n\n[scripts]\nstart = "python app.py"\n' })
    expect(names(info, (d) => !d.dev)).toEqual(['flask', 'requests'])
    expect(names(info, (d) => d.dev)).toEqual(['pytest'])
    expect(info.scripts[0]).toMatchObject({ name: 'start', command: 'python app.py' })
  })

  it('parses setup.py and setup.cfg best-effort', () => {
    const setupPy = `
from setuptools import setup
setup(
    name="legacy-tool",
    description='An older tool',
    install_requires=["numpy>=1.20", 'pandas'],
    tests_require=["pytest"],
    entry_points={"console_scripts": ["legacy = legacy.main:run"]},
)
`
    const setupCfg = `
[metadata]
name = cfg-tool
description = Configured tool

[options]
install_requires =
    requests>=2
    click

[options.entry_points]
console_scripts =
    cfgtool = cfgtool.cli:main
`
    const info = parse({ 'setup.py': setupPy, 'tools/setup.cfg': setupCfg }, ['legacy/main.py', 'tools/cfgtool/cli.py'])
    expect(names(info)).toEqual(expect.arrayContaining(['numpy', 'pandas', 'pytest', 'requests', 'click']))
    expect(dep(info, 'pytest')?.dev).toBe(true)
    expect(info.projectNames).toEqual(expect.arrayContaining(['legacy-tool', 'cfg-tool']))
    expect(info.entryHints.map((h) => h.path)).toEqual(expect.arrayContaining(['legacy/main.py', 'tools/cfgtool/cli.py']))
  })

  it('parses conda environment.yml including nested pip packages', () => {
    const yml = `
name: research
channels: [conda-forge]
dependencies:
  - python=3.11
  - numpy=1.26
  - conda-forge::pandas>=2
  - pip
  - pip:
      - transformers==4.40
`
    const info = parse({ 'environment.yml': yml })
    expect(info.dependencies.map((d) => `${d.ecosystem}:${d.name}`)).toEqual(['conda:numpy', 'conda:pandas', 'pypi:transformers'])
    expect(info.projectNames).toContain('research')
  })
})

describe('Go', () => {
  it('parses go.mod module path and direct requirements, skipping indirect ones', () => {
    const gomod = `module github.com/acme/tool

go 1.22

require (
\tgithub.com/spf13/cobra v1.8.0
\tgithub.com/spf13/viper v1.18.2
\tgolang.org/x/sys v0.15.0 // indirect
)

require github.com/stretchr/testify v1.9.0
`
    const info = parse({ 'go.mod': gomod })
    expect(info.goModulePath).toBe('github.com/acme/tool')
    expect(names(info)).toEqual(['github.com/spf13/cobra', 'github.com/spf13/viper', 'github.com/stretchr/testify'])
    expect(dep(info, 'github.com/spf13/cobra')).toMatchObject({ ecosystem: 'go', version: 'v1.8.0', section: 'require' })
    expect(info.projectNames).toContain('tool')
  })

  it('prefers the root go.mod module path and reads go.work', () => {
    const info = parse({
      'go.mod': 'module example.com/root\n',
      'svc/go.mod': 'module example.com/root/svc\n',
      'go.work': 'go 1.22\n\nuse (\n\t./svc\n\t./tools\n)\n',
    })
    expect(info.goModulePath).toBe('example.com/root')
    expect(info.workspaces).toEqual(['svc', 'tools'])
  })
})

describe('Rust', () => {
  it('parses Cargo.toml dependencies, renamed packages, bins, workspace members', () => {
    const cargo = `
[package]
name = "server"
description = "A web server"

[dependencies]
tokio = { version = "1", features = ["full"] }
axum = "0.7"
json = { package = "serde_json", version = "1" }

[dev-dependencies]
insta = "1"

[target.'cfg(unix)'.dependencies]
nix = "0.28"

[[bin]]
name = "worker"
path = "src/bin/worker.rs"

[workspace]
members = ["crates/*"]
`
    const info = parse({ 'Cargo.toml': cargo }, ['src/main.rs', 'src/bin/worker.rs', 'src/lib.rs'])
    expect(names(info, (d) => !d.dev)).toEqual(['tokio', 'axum', 'serde_json', 'nix'])
    expect(names(info, (d) => d.dev)).toEqual(['insta'])
    expect(dep(info, 'tokio')?.version).toBe('1')
    expect(info.workspaces).toEqual(['crates/*'])
    expect(info.entryHints.map((h) => h.path)).toEqual(['src/bin/worker.rs', 'src/lib.rs'])
  })

  it('uses src/main.rs as the default entry when no [[bin]] is declared', () => {
    const info = parse({ 'Cargo.toml': '[package]\nname = "cli"\n[dependencies]\nclap = "4"\n' }, ['src/main.rs'])
    expect(info.entryHints).toEqual([{ path: 'src/main.rs', reason: expect.stringContaining('Rust program') }])
  })
})

describe('Ruby', () => {
  it('parses Gemfile groups (block and inline) as dev', () => {
    const gemfile = `source "https://rubygems.org"
ruby "3.3.0"

gem "rails", "~> 7.1"
gem 'pg'
gem "rubocop", require: false, group: :development

group :development, :test do
  gem "rspec-rails"
  if ENV["CI"]
    gem "simplecov"
  end
  gem "factory_bot_rails"
end

group :production do
  gem "puma"
end

gemspec
`
    const info = parse({ Gemfile: gemfile })
    expect(names(info, (d) => !d.dev)).toEqual(['rails', 'pg', 'puma'])
    expect(names(info, (d) => d.dev)).toEqual(['rubocop', 'rspec-rails', 'simplecov', 'factory_bot_rails'])
    expect(dep(info, 'rails')?.version).toBe('~> 7.1')
  })

  it('parses gemspec dependencies', () => {
    const spec = `Gem::Specification.new do |s|
  s.name = "widget"
  s.summary = "Widgets for everyone"
  s.add_dependency "thor", "~> 1.2"
  s.add_development_dependency "rspec"
end`
    const info = parse({ 'widget.gemspec': spec })
    expect(dep(info, 'thor')).toMatchObject({ dev: false, version: '~> 1.2' })
    expect(dep(info, 'rspec')?.dev).toBe(true)
    expect(info.projectNames).toContain('widget')
  })
})

describe('PHP', () => {
  it('parses composer.json require, require-dev, PSR-4 and bin', () => {
    const composer = JSON.stringify({
      name: 'acme/blog',
      description: 'A Laravel blog',
      require: { php: '^8.2', 'ext-json': '*', 'laravel/framework': '^11.0' },
      'require-dev': { 'phpunit/phpunit': '^11' },
      autoload: { 'psr-4': { 'App\\': 'app/', 'Acme\\Lib\\': ['src/', 'lib/'] } },
      'autoload-dev': { 'psr-4': { 'Tests\\': 'tests/' } },
      bin: ['bin/blog'],
    })
    const info = parse({ 'composer.json': composer }, ['bin/blog'])
    expect(names(info)).toEqual(['laravel/framework', 'phpunit/phpunit'])
    expect(dep(info, 'phpunit/phpunit')?.dev).toBe(true)
    expect(info.psr4).toEqual({ 'App\\': 'app', 'Acme\\Lib\\': 'src', 'Tests\\': 'tests' })
    expect(info.entryHints[0].path).toBe('bin/blog')
  })
})

describe('JVM', () => {
  it('parses pom.xml dependencies, test scope, parent, modules and main class', () => {
    const pom = `<?xml version="1.0"?>
<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
  </parent>
  <artifactId>shop-api</artifactId>
  <name>Shop API</name>
  <description>REST API for the shop</description>
  <modules><module>core</module></modules>
  <properties><start-class>com.acme.shop.ShopApplication</start-class></properties>
  <dependencyManagement><dependencies><dependency><groupId>managed</groupId><artifactId>bom</artifactId></dependency></dependencies></dependencyManagement>
  <dependencies>
    <!-- web -->
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build><plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId></plugin></plugins></build>
</project>`
    const info = parse({ 'pom.xml': pom }, ['src/main/java/com/acme/shop/ShopApplication.java'])
    expect(names(info)).toEqual([
      'org.springframework.boot:spring-boot-starter-parent',
      'org.springframework.boot:spring-boot-starter-web',
      'org.junit.jupiter:junit-jupiter',
    ])
    expect(dep(info, 'org.junit.jupiter:junit-jupiter')?.dev).toBe(true)
    expect(info.projectNames).toContain('Shop API')
    expect(info.workspaces).toEqual(['core'])
    expect(info.entryHints[0].path).toBe('src/main/java/com/acme/shop/ShopApplication.java')
  })

  it('parses build.gradle(.kts) coordinates, plugins and test configurations', () => {
    const groovy = `plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}
dependencies {
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation platform('androidx.compose:compose-bom:2024.02.00')
    testImplementation "junit:junit:4.13.2"
    // implementation 'commented:out:1.0'
    api group: 'com.squareup.okhttp3', name: 'okhttp', version: '4.12.0'
}`
    const kts = `plugins { kotlin("jvm") version "1.9.0"
  application
}
application { mainClass.set("com.acme.MainKt") }
dependencies {
  implementation("io.ktor:ktor-server-core:2.3.0")
  testImplementation(kotlin("test"))
}`
    const info = parse({ 'app/build.gradle': groovy, 'server/build.gradle.kts': kts }, ['server/src/main/kotlin/com/acme/Main.kt'])
    expect(names(info)).toEqual(
      expect.arrayContaining(['com.android.application', 'androidx.core:core-ktx', 'androidx.compose:compose-bom', 'junit:junit', 'com.squareup.okhttp3:okhttp', 'io.ktor:ktor-server-core']),
    )
    expect(names(info)).not.toContain('commented:out')
    expect(dep(info, 'junit:junit')?.dev).toBe(true)
  })

  it('parses settings.gradle includes and the version catalog', () => {
    const info = parse({
      'settings.gradle.kts': 'rootProject.name = "notes"\ninclude(":app", ":core:data")\n',
      'gradle/libs.versions.toml': '[versions]\nkotlin = "1.9"\n[libraries]\nretrofit = { module = "com.squareup.retrofit2:retrofit", version = "2.9" }\nroom = { group = "androidx.room", name = "room-runtime", version = "2.6" }\nlegacy = "com.google.code.gson:gson:2.10"\n[plugins]\nandroid-application = { id = "com.android.application", version = "8.2" }\n',
    })
    expect(info.projectNames).toContain('notes')
    expect(info.workspaces).toEqual(['app', 'core/data'])
    expect(names(info)).toEqual(['com.squareup.retrofit2:retrofit', 'androidx.room:room-runtime', 'com.google.code.gson:gson', 'com.android.application'])
  })
})

describe('.NET', () => {
  it('parses csproj PackageReference items and the SDK', () => {
    const csproj = `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.0" />
    <PackageReference Include="Serilog">
      <Version>3.1.1</Version>
    </PackageReference>
  </ItemGroup>
</Project>`
    const info = parse({ 'src/Shop.Api/Shop.Api.csproj': csproj })
    expect(names(info)).toEqual(['Microsoft.NET.Sdk.Web', 'Microsoft.EntityFrameworkCore', 'Serilog'])
    expect(dep(info, 'Serilog')?.version).toBe('3.1.1')
    expect(dep(info, 'Microsoft.EntityFrameworkCore')?.dev).toBe(false)
  })

  it('marks every package of a test project as dev', () => {
    const csproj = `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup>
<PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.0.0" />
<PackageReference Include="xunit" Version="2.6.0" />
</ItemGroup></Project>`
    const info = parse({ 'tests/Shop.Tests/Shop.Tests.csproj': csproj })
    expect(info.dependencies.every((d) => d.dev)).toBe(true)
  })
})

describe('Dart, Swift, CocoaPods', () => {
  it('parses pubspec.yaml', () => {
    const yaml = `name: notes
description: A note-taking app.
dependencies:
  flutter:
    sdk: flutter
  provider: ^6.0.0
  http: any
dev_dependencies:
  flutter_test:
    sdk: flutter
`
    const info = parse({ 'pubspec.yaml': yaml }, ['lib/main.dart'])
    expect(names(info, (d) => !d.dev)).toEqual(['flutter', 'provider', 'http'])
    expect(names(info, (d) => d.dev)).toEqual(['flutter_test'])
    expect(info.entryHints[0].path).toBe('lib/main.dart')
  })

  it('parses Package.swift dependencies and executable targets', () => {
    const swift = `// swift-tools-version:5.9
import PackageDescription
let package = Package(
    name: "Weather",
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.3.0"),
        .package(url: "https://github.com/Alamofire/Alamofire", .upToNextMajor(from: "5.8.0")),
    ],
    targets: [
        .executableTarget(name: "weather", dependencies: []),
    ]
)`
    const info = parse({ 'Package.swift': swift }, ['Sources/weather/main.swift'])
    expect(names(info)).toEqual(['swift-argument-parser', 'Alamofire'])
    expect(dep(info, 'swift-argument-parser')?.version).toBe('1.3.0')
    expect(info.projectNames).toContain('Weather')
    expect(info.entryHints[0].path).toBe('Sources/weather/main.swift')
  })

  it('parses Podfile pods, with test targets as dev', () => {
    const podfile = `platform :ios, '15.0'
target 'App' do
  use_frameworks!
  pod 'Alamofire', '~> 5.0'
  pod 'Firebase/Analytics'
  target 'AppTests' do
    inherit! :search_paths
    pod 'Quick'
  end
end
post_install do |installer|
  installer.pods_project.targets.each do |t|
  end
end`
    const info = parse({ Podfile: podfile })
    expect(names(info, (d) => !d.dev)).toEqual(['Alamofire', 'Firebase'])
    expect(names(info, (d) => d.dev)).toEqual(['Quick'])
  })
})

describe('Dockerfile, Makefile, Procfile', () => {
  it('turns Dockerfile CMD / ENTRYPOINT into entry hints for repo files', () => {
    const dockerfile = `FROM node:20 AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build
CMD ["node", "ignored-stage.js"]

FROM node:20-slim
WORKDIR /usr/src/app
COPY --from=build /app/dist ./dist
CMD ["node", "/usr/src/app/dist/server.js"]
`
    const info = parse({ Dockerfile: dockerfile }, ['src/server.ts', 'ignored-stage.js'])
    expect(info.entryHints).toEqual([{ path: 'src/server.ts', reason: 'The Docker container starts by running this file' }])
  })

  it('understands Python servers and shell-form commands', () => {
    const info = parse(
      {
        'api/Dockerfile': 'FROM python:3.12\nWORKDIR /code\nENTRYPOINT ["uvicorn"]\nCMD ["app.main:app", "--host", "0.0.0.0"]\n',
        'worker/Dockerfile.worker': 'FROM python:3.12\nCMD python -m jobs.run --verbose\n',
      },
      ['api/app/main.py', 'worker/jobs/run.py'],
    )
    expect(info.entryHints.map((h) => h.path).sort()).toEqual(['api/app/main.py', 'worker/jobs/run.py'])
  })

  it('reads Makefile targets as scripts, ignoring variables and special targets', () => {
    const makefile = `APP := shop
VERSION ?= 1.0

.PHONY: build test lint

build: deps
\t@go build -o bin/$(APP) ./cmd/shop

test:
\tgo test ./...

lint: ; golangci-lint run

%.o: %.c
\t$(CC) -c $<

bin/shop: build
`
    const info = parse({ Makefile: makefile })
    expect(info.scripts.map((s) => s.name)).toEqual(['build', 'test', 'lint'])
    expect(info.scripts[0]).toMatchObject({ command: 'go build -o bin/$(APP) ./cmd/shop', source: 'Makefile' })
    expect(info.scripts[2]).toMatchObject({ name: 'lint', command: 'golangci-lint run' })
  })

  it('reads Procfile processes and resolves the files they run', () => {
    const info = parse({ Procfile: 'web: gunicorn shop.wsgi:application --log-file -\nworker: celery -A shop worker\nrelease: node scripts/migrate.js\n' }, [
      'shop/wsgi.py',
      'scripts/migrate.js',
    ])
    expect(info.scripts.map((s) => s.name)).toEqual(['web', 'worker', 'release'])
    expect(info.entryHints.map((h) => h.path)).toEqual(['shop/wsgi.py', 'scripts/migrate.js'])
  })
})

describe('resilience', () => {
  it('never throws on malformed manifests and keeps parsing the others', () => {
    const files: Record<string, string> = {
      'package.json': '{ "name": "broken", ',
      'pyproject.toml': '[project\nname = ',
      'Cargo.toml': '[dependencies\nserde = ',
      'composer.json': 'not json at all',
      'pubspec.yaml': 'name: [unclosed',
      'environment.yml': ': : :',
      'pom.xml': '<project><dependency><groupId>only-group',
      'build.gradle': 'dependencies { implementation(',
      'Package.swift': '.package(url:',
      'Gemfile': 'gem',
      'go.mod': 'require (',
      'Dockerfile': 'CMD ["unterminated',
      'Makefile': '\t\t\n:::\n',
      'requirements.txt': '==\n@@@\n',
      'lerna.json': '[1, 2',
      'deno.json': '{ tasks: ',
      'Pipfile': '[packages',
      'apps/web/package.json': JSON.stringify({ dependencies: { next: '15.0.0' } }),
    }
    let info: ManifestInfo | undefined
    expect(() => {
      info = parseManifests(files, Object.keys(files))
    }).not.toThrow()
    expect(info?.dependencies.map((d) => d.name)).toContain('next')
  })

  it('tolerates wrong value types inside valid JSON', () => {
    const info = parse({
      'package.json': JSON.stringify({ name: 42, dependencies: ['react'], scripts: { a: 1 }, workspaces: 'packages/*', bin: 7, exports: null }),
    })
    expect(info).toMatchObject({ dependencies: [], scripts: [], workspaces: [], entryHints: [] })
  })

  it('stays fast on hostile input (unclosed tags, comments, quotes and huge whitespace runs)', () => {
    const spaces = ' '.repeat(200_000)
    const files: Record<string, string> = {
      'pom.xml': '<dependency><groupId>'.repeat(20_000) + '<!--'.repeat(20_000) + '<build>'.repeat(20_000),
      'a/App.csproj': '<PackageReference Include="x">'.repeat(30_000),
      'build.gradle': `implementation${spaces}x` + '/*'.repeat(30_000) + `plugins {${'{'.repeat(50_000)}`,
      'settings.gradle': `include${spaces}x`,
      'x.gemspec': `.add_dependency${spaces}x`,
      'Gemfile': `group${' '.repeat(1900)}x\n`.repeat(400) + `gem${' '.repeat(1900)}x\n`.repeat(400),
      'setup.py': 'install_requires=['.repeat(30_000) + `name=${spaces}`,
      'setup.cfg': `[options]\nkey${spaces}`,
      'Package.swift': '.package(url:'.repeat(30_000) + '/*'.repeat(30_000),
      'Makefile': `${'a '.repeat(900)}\n`.repeat(500),
      'Dockerfile': `CMD ${'"'.repeat(100_000)}`,
      'package.json': JSON.stringify({ scripts: { start: `node ${'"'.repeat(100_000)}` } }),
      'requirements.txt': `${'a'.repeat(1999)}!\n`.repeat(400),
    }
    const t0 = performance.now()
    parseManifests(files, Object.keys(files))
    expect(performance.now() - t0).toBeLessThan(2000)
  })

  it('handles empty input and missing paths', () => {
    expect(parseManifests({}, [])).toEqual({ dependencies: [], scripts: [], entryHints: [], workspaces: [], psr4: {}, projectNames: [], descriptions: [] })
    expect(() => parseManifests({ 'package.json': '{}' }, undefined as unknown as string[])).not.toThrow()
  })

  it('ignores manifests in examples and fixtures when the project has its own', () => {
    const info = parse({
      'package.json': JSON.stringify({ dependencies: { express: '4' } }),
      'examples/next-app/package.json': JSON.stringify({ dependencies: { next: '15' } }),
      'test/fixtures/pkg/package.json': JSON.stringify({ dependencies: { lodash: '4' } }),
      'node_modules/foo/package.json': JSON.stringify({ dependencies: { left: '1' } }),
    })
    expect(names(info)).toEqual(['express'])
  })

  it('falls back to example manifests when they are all there is', () => {
    const info = parse({ 'examples/demo/package.json': JSON.stringify({ dependencies: { vue: '3' } }) })
    expect(names(info)).toEqual(['vue'])
  })

  it('reads root manifests first so root names lead', () => {
    const info = parse({
      'packages/b/package.json': JSON.stringify({ name: 'b' }),
      'package.json': JSON.stringify({ name: 'root' }),
    })
    expect(info.projectNames[0]).toBe('root')
  })
})
