import type { CodeSymbol, FileKind, FileRole, Layer, RouteInfo } from '@/core/types'
import { basename, extname } from '@/core/paths'
import { describeFolder } from '@/knowledge'
import { familyOf, type Family } from './structure/family'
import { detectStartIn, hasJsx, isOrmModel, isValidationSchema, looksLikeCli, looksLikeClient, looksLikeTest, type StartSignal } from './structure/signals'
import { folderSegments, isTestFileName, zonesOf, type Zone } from './structure/zones'

export interface ClassifyContext {
  content?: string
  language: string | null
  symbols?: CodeSymbol[]
  routes?: RouteInfo[]
  /** Detected TechItem ids (e.g. "react", "django") to sharpen guesses. */
  techIds?: Set<string>
  /** Whether `language` is a programming language (false for prose, data and settings formats). Optional. */
  isCode?: boolean
}

export interface Classification {
  kind: FileKind
  role: FileRole
  layer: Layer
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension families
// ─────────────────────────────────────────────────────────────────────────────

const DOC_EXT = new Set(['md', 'mdx', 'markdown', 'mdown', 'mkd', 'rst', 'adoc', 'asciidoc', 'txt', 'text', 'org', 'tex', 'rtf', 'pod', 'textile', 'rdoc'])
const STYLE_EXT = new Set(['css', 'scss', 'sass', 'less', 'styl', 'stylus', 'pcss', 'postcss', 'vanilla.css'])
const MARKUP_EXT = new Set([
  'html', 'htm', 'xhtml', 'ejs', 'hbs', 'handlebars', 'pug', 'jade', 'njk', 'nunjucks', 'jinja', 'jinja2', 'j2',
  'twig', 'liquid', 'mustache', 'erb', 'haml', 'slim', 'cshtml', 'razor', 'jsp', 'tmpl', 'tpl', 'gohtml', 'heex', 'leex', 'eex',
])
const DATA_EXT = new Set([
  'json', 'jsonc', 'json5', 'jsonl', 'ndjson', 'geojson', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg',
  'conf', 'properties', 'env', 'plist', 'webmanifest', 'parquet', 'arrow', 'feather', 'avro', 'xls', 'xlsx', 'sqlite',
  'sqlite3', 'db', 'pkl', 'pickle', 'npy', 'npz', 'h5', 'hdf5', 'mat', 'rds', 'rdata', 'dta', 'sav',
])
const ASSET_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'icns', 'svg', 'tif', 'tiff', 'psd', 'ai', 'eps', 'sketch',
  'fig', 'xcf', 'heic', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'ttc', 'mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac',
  'mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v', 'pdf', 'zip', 'gz', 'tgz', 'tar', 'bz2', 'xz', '7z', 'rar', 'jar', 'war',
  'exe', 'dll', 'so', 'dylib', 'a', 'o', 'lib', 'bin', 'dat', 'glb', 'gltf', 'fbx', 'blend', 'stl', 'obj', 'mtl',
  'unitypackage', 'cur', 'ani', 'swf', 'apk', 'ipa', 'dmg', 'iso', 'wasm', 'pyc', 'class', 'keystore', 'p12', 'pem',
  'crt', 'key', 'der', 'mo', 'riv', 'lottie',
])
const I18N_EXT = new Set(['po', 'pot', 'xliff', 'xlf', 'arb', 'strings', 'stringsdict', 'resx', 'ftl', 'lang'])
const SHELL_EXT = new Set(['sh', 'bash', 'zsh', 'ksh', 'fish', 'ps1', 'psm1', 'psd1', 'bat', 'cmd', 'command'])
const SCHEMA_LANG_EXT = new Set(['graphql', 'gql', 'graphqls', 'proto', 'thrift', 'avsc', 'avdl', 'smithy'])
/** Display names of formats that are not program code (lower-case). */
const NON_CODE_LANGUAGES = new Set([
  'markdown', 'mdx', 'restructuredtext', 'asciidoc', 'org', 'tex', 'bibtex', 'text', 'json', 'json5', 'yaml', 'toml',
  'xml', 'svg', 'ini', 'csv', 'tsv', 'dotenv', 'editorconfig', 'ignore list', 'git config', 'git attributes',
  'go module', 'go checksums', 'pip requirements', 'procfile', 'diff', 'lockfile', 'nginx', 'caddyfile', 'r markdown',
])
const JS_EXT = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts'])
const SFC_EXT = new Set(['vue', 'svelte', 'astro'])

// ─────────────────────────────────────────────────────────────────────────────
// Well-known file names
// ─────────────────────────────────────────────────────────────────────────────

const C = (kind: FileKind, role: FileRole, layer: Layer): Classification => ({ kind, role, layer })

const CONFIG = C('config', 'config', 'config')
const BUILD_CONFIG = C('config', 'build', 'infra')
const BUILD = C('build', 'build', 'infra')
const DEPLOY = C('config', 'config', 'infra')
const CI = C('config', 'ci', 'infra')
const CONTAINER = C('build', 'container', 'infra')
const DOCS = C('docs', 'docs', 'docs')

/** Exact lower-case basenames. */
const EXACT_NAMES: Record<string, Classification> = {
  // Package manifests & project settings
  'package.json': CONFIG,
  'deno.json': CONFIG,
  'deno.jsonc': CONFIG,
  'bunfig.toml': CONFIG,
  'pyproject.toml': CONFIG,
  'setup.cfg': CONFIG,
  pipfile: CONFIG,
  'environment.yml': CONFIG,
  'environment.yaml': CONFIG,
  'go.mod': CONFIG,
  'go.work': CONFIG,
  'cargo.toml': CONFIG,
  gemfile: CONFIG,
  'composer.json': CONFIG,
  'pom.xml': CONFIG,
  'pubspec.yaml': CONFIG,
  'package.swift': CONFIG,
  podfile: CONFIG,
  'mix.exs': CONFIG,
  'deps.edn': CONFIG,
  'project.clj': CONFIG,
  'build.sbt': CONFIG,
  'stack.yaml': CONFIG,
  description: CONFIG,
  'manifest.json': CONFIG,
  'app.json': CONFIG,
  'components.json': CONFIG,
  'angular.json': CONFIG,
  'tsconfig.json': CONFIG,
  'jsconfig.json': CONFIG,
  '.editorconfig': CONFIG,
  '.gitignore': CONFIG,
  '.gitattributes': CONFIG,
  '.gitmodules': CONFIG,
  '.npmrc': CONFIG,
  '.nvmrc': CONFIG,
  '.node-version': CONFIG,
  '.python-version': CONFIG,
  '.ruby-version': CONFIG,
  '.tool-versions': CONFIG,
  '.yarnrc': CONFIG,
  '.yarnrc.yml': CONFIG,
  '.browserslistrc': CONFIG,
  '.dockerignore': CONTAINER,
  '.flake8': CONFIG,
  '.pylintrc': CONFIG,
  '.coveragerc': CONFIG,
  'tox.ini': CONFIG,
  'pytest.ini': CONFIG,
  'mypy.ini': CONFIG,
  'ruff.toml': CONFIG,
  '.ruff.toml': CONFIG,
  'rustfmt.toml': CONFIG,
  '.rustfmt.toml': CONFIG,
  'clippy.toml': CONFIG,
  '.rubocop.yml': CONFIG,
  '.golangci.yml': CONFIG,
  '.golangci.yaml': CONFIG,
  'biome.json': CONFIG,
  'biome.jsonc': CONFIG,
  'codeowners': CONFIG,
  'robots.txt': CONFIG,
  'renovate.json': CI,
  '.pre-commit-config.yaml': CI,
  '.pre-commit-hooks.yaml': CI,
  '.gitlab-ci.yml': CI,
  '.travis.yml': CI,
  'azure-pipelines.yml': CI,
  'bitbucket-pipelines.yml': CI,
  jenkinsfile: CI,
  '.drone.yml': CI,
  'appveyor.yml': CI,
  '.appveyor.yml': CI,
  'cloudbuild.yaml': CI,
  'cloudbuild.yml': CI,
  'codemagic.yaml': CI,
  '.woodpecker.yml': CI,
  'dependabot.yml': CI,
  '.readthedocs.yaml': CI,
  '.readthedocs.yml': CI,
  '.goreleaser.yaml': CI,
  '.goreleaser.yml': CI,
  // Deployment
  procfile: DEPLOY,
  'vercel.json': DEPLOY,
  'now.json': DEPLOY,
  'netlify.toml': DEPLOY,
  'fly.toml': DEPLOY,
  'render.yaml': DEPLOY,
  'railway.json': DEPLOY,
  'railway.toml': DEPLOY,
  'firebase.json': DEPLOY,
  '.firebaserc': DEPLOY,
  'wrangler.toml': DEPLOY,
  'wrangler.json': DEPLOY,
  'nginx.conf': DEPLOY,
  caddyfile: DEPLOY,
  'heroku.yml': DEPLOY,
  'app.yaml': DEPLOY,
  'serverless.yml': DEPLOY,
  'serverless.yaml': DEPLOY,
  'pulumi.yaml': DEPLOY,
  'cdk.json': DEPLOY,
  'skaffold.yaml': C('config', 'container', 'infra'),
  'kustomization.yaml': C('config', 'container', 'infra'),
  'chart.yaml': C('config', 'container', 'infra'),
  vagrantfile: DEPLOY,
  // Containers
  dockerfile: CONTAINER,
  containerfile: CONTAINER,
  'docker-compose.yml': CONTAINER,
  'docker-compose.yaml': CONTAINER,
  'compose.yml': CONTAINER,
  'compose.yaml': CONTAINER,
  // Build
  makefile: BUILD,
  gnumakefile: BUILD,
  justfile: BUILD,
  '.justfile': BUILD,
  'cmakelists.txt': BUILD,
  'meson.build': BUILD,
  build: BUILD,
  'build.bazel': BUILD,
  workspace: BUILD,
  'workspace.bazel': BUILD,
  'module.bazel': BUILD,
  'build.gradle': BUILD,
  'build.gradle.kts': BUILD,
  'settings.gradle': BUILD,
  'settings.gradle.kts': BUILD,
  'gradle.properties': CONFIG,
  gradlew: BUILD,
  'gradlew.bat': BUILD,
  'build.rs': BUILD,
  rakefile: BUILD,
  'setup.py': BUILD,
  'manifest.in': BUILD,
  'taskfile.yml': BUILD,
  'taskfile.yaml': BUILD,
  'turbo.json': BUILD_CONFIG,
  'nx.json': BUILD_CONFIG,
  'lerna.json': BUILD_CONFIG,
  'pnpm-workspace.yaml': CONFIG,
  '.babelrc': BUILD_CONFIG,
  '.swcrc': BUILD_CONFIG,
  // Docs
  license: DOCS,
  licence: DOCS,
  copying: DOCS,
  notice: DOCS,
  authors: DOCS,
  contributors: DOCS,
  maintainers: DOCS,
  changelog: DOCS,
  readme: DOCS,
  // Python conventions
  'conftest.py': C('test', 'fixture', 'test'),
  '__main__.py': C('source', 'entry', 'logic'),
  'manage.py': C('source', 'cli', 'api'),
  'wsgi.py': C('source', 'entry', 'api'),
  'asgi.py': C('source', 'entry', 'api'),
  'program.cs': C('source', 'entry', 'logic'),
}

/** Prefix rules on lower-case basenames for docs files: README.md, CONTRIBUTING.rst, LICENSE-MIT … */
const DOC_NAME_RE = /^(readme|changelog|changes|history|news|contributing|code_of_conduct|code-of-conduct|security|support|authors|contributors|maintainers|governance|license|licence|copying|notice|upgrading|migration|faq|roadmap|releasing|release-notes|patents|funding|citation)([._-].*)?$/

/** Tool configuration files matched by stem ("vite.config.ts", ".eslintrc.cjs", "jest.config.js" …). */
const BUILD_TOOL_CONFIG_RE =
  /^(vite|vitest\.workspace|rollup|rolldown|esbuild|tsup|tsdown|parcel|snowpack|metro|babel|swc|turbopack|rspack|craco|unbuild|electron-builder|electron\.vite|forge|build)[.-]config(\.[\w-]+)*\.(js|cjs|mjs|ts|cts|mts|json|ya?ml)$|^webpack(\.[\w-]+)*\.(js|cjs|mjs|ts)$|^(gulpfile|gruntfile)(\.[\w-]+)?\.(js|cjs|mjs|ts|coffee)$/i
const TOOL_CONFIG_RE =
  /^(\.?(eslintrc|prettierrc|stylelintrc|lintstagedrc|mocharc|babelrc|commitlintrc|releaserc|huskyrc|npmpackagejsonlintrc|markdownlint|remarkrc|textlintrc|nycrc|c8rc|jshintrc|jscsrc))(\..+)?$|^(eslint|prettier|stylelint|jest|vitest|karma|playwright|cypress|tailwind|postcss|next|nuxt|svelte|astro|remix|docusaurus|vuepress|vitepress|quasar|commitlint|lint-staged|release|semantic-release|knip|drizzle|prisma|typedoc|tsdoc|api-extractor|wxt|plasmo|capacitor|ionic|tauri|uno|windi|panda|histoire|storybook|wdio|nodemon|pm2|ecosystem|ava|uvu|svgo|sentry|codecov|app|site|theme|i18n)[.-]config(\.[\w-]+)*\.(js|cjs|mjs|ts|cts|mts|json|jsonc|ya?ml|toml)$|^gatsby-(config|node|browser|ssr)\.(js|ts|mjs|tsx|jsx)$|^ember-cli-build\.js$|^(nodemon|lint-staged|knip|typedoc|renovate|\.?codecov|tauri\.conf|capacitor\.config|ionic\.config)\.(json|ya?ml)$/i
const TSCONFIG_RE = /^(tsconfig|jsconfig)(\.[\w-]+)*\.json$/
const REQUIREMENTS_RE = /^(requirements|constraints|dev-requirements|test-requirements)([._-][\w.-]*)?\.(txt|in)$/
const ENV_RE = /^\.env(\..+)?$|\.env$/
const DOCKER_RE = /^(docker|container)file([._-].*)?$|\.dockerfile$|^(docker-)?compose([._-].*)?\.ya?ml$/
const MAKE_RE = /^makefile([._-].*)?$|\.mk$|\.mak$|\.make$|\.cmake$|\.bzl$|\.bazel$/
const IAC_EXT = new Set(['tf', 'tfvars', 'hcl', 'bicep', 'nomad'])
const GENERATED_NAME_RE =
  /\.min\.(js|css|mjs)$|\.(js|css)\.map$|\.map$|\.pb\.(go|cc|h|ts|js|swift|dart)$|_pb2(_grpc)?\.pyi?$|_pb\.(js|ts|d\.ts)$|_grpc\.pb\.go$|\.g\.(dart|cs)$|\.freezed\.dart$|\.generated\.\w+$|_generated\.\w+$|\.gen\.(ts|js|go)$|\.designer\.cs$|^zz_generated|\.snap$|\.bundle\.js$|-lock\.json$|\.lock$|^package-lock\.json$|^npm-shrinkwrap\.json$|^pnpm-lock\.yaml$|^go\.sum$|^go\.work\.sum$/

// ─────────────────────────────────────────────────────────────────────────────
// Folder conventions → role (nearest folder wins)
// ─────────────────────────────────────────────────────────────────────────────

const FOLDER_ROLE: Record<string, FileRole> = {
  components: 'component',
  component: 'component',
  ui: 'component',
  widgets: 'component',
  widget: 'component',
  elements: 'component',
  atoms: 'component',
  molecules: 'component',
  organisms: 'component',
  primitives: 'component',
  partials: 'component',
  pages: 'page',
  page: 'page',
  screens: 'page',
  screen: 'page',
  views: 'page',
  view: 'page',
  layouts: 'layout',
  layout: 'layout',
  _layouts: 'layout',
  hooks: 'hook',
  composables: 'hook',
  store: 'state',
  stores: 'state',
  state: 'state',
  redux: 'state',
  reducers: 'state',
  slices: 'state',
  context: 'state',
  contexts: 'state',
  providers: 'state',
  signals: 'state',
  routes: 'route',
  router: 'route',
  routers: 'route',
  routing: 'route',
  urls: 'route',
  endpoints: 'route',
  api: 'route',
  controllers: 'controller',
  controller: 'controller',
  handlers: 'controller',
  handler: 'controller',
  resolvers: 'controller',
  middleware: 'middleware',
  middlewares: 'middleware',
  guards: 'middleware',
  interceptors: 'middleware',
  policies: 'middleware',
  services: 'service',
  service: 'service',
  usecases: 'service',
  'use-cases': 'service',
  use_cases: 'service',
  jobs: 'service',
  workers: 'service',
  tasks: 'service',
  queues: 'service',
  listeners: 'service',
  subscribers: 'service',
  clients: 'client',
  sdk: 'client',
  integrations: 'client',
  adapters: 'client',
  gateways: 'client',
  models: 'model',
  model: 'model',
  entities: 'model',
  entity: 'model',
  schemas: 'schema',
  schema: 'schema',
  validators: 'schema',
  validation: 'schema',
  dto: 'schema',
  dtos: 'schema',
  serializers: 'schema',
  migrations: 'migration',
  migration: 'migration',
  migrate: 'migration',
  alembic: 'migration',
  repositories: 'repository',
  repository: 'repository',
  repos: 'repository',
  dao: 'repository',
  daos: 'repository',
  db: 'repository',
  database: 'repository',
  persistence: 'repository',
  queries: 'repository',
  utils: 'util',
  util: 'util',
  helpers: 'util',
  helper: 'util',
  common: 'util',
  shared: 'util',
  types: 'types',
  typings: 'types',
  '@types': 'types',
  interfaces: 'types',
  constants: 'constants',
  consts: 'constants',
  enums: 'constants',
  config: 'config',
  configs: 'config',
  configuration: 'config',
  settings: 'config',
  conf: 'config',
  cli: 'cli',
  cmd: 'cli',
  commands: 'cli',
  command: 'cli',
  bin: 'cli',
  styles: 'style',
  style: 'style',
  css: 'style',
  scss: 'style',
  theme: 'style',
  themes: 'style',
  i18n: 'i18n',
  locales: 'i18n',
  locale: 'i18n',
  lang: 'i18n',
  translations: 'i18n',
  l10n: 'i18n',
  plugins: 'library',
  extensions: 'library',
}

const I18N_DIRS = new Set(['i18n', 'locales', 'locale', 'lang', 'langs', 'translations', 'l10n', 'messages', 'intl'])
/** Folders where even code files (en.ts, fr.js) are translations. */
const I18N_CODE_DIRS = new Set(['i18n', 'locales', 'locale', 'translations', 'l10n'])
const CONFIG_DIRS = new Set(['config', 'configs', 'conf', 'settings', '.config', 'environments', 'env', '.vscode', '.idea', '.zed', '.fleet'])
const DATA_DIRS = new Set(['data', 'datasets', 'dataset', 'seeds', 'seed', 'sample-data', 'sample_data', 'raw', 'processed', 'corpus'])
const FIXTURE_DIRS = new Set(['fixtures', '__fixtures__', '__mocks__', 'mocks', 'testdata', 'test-data', 'test_data', '__snapshots__', 'snapshots', 'stubs'])
const LAYOUT_NAME_RE = /^(_?layout|_?base|master|application|_?default|head|header|_header|foot|footer|_footer|nav|navbar|_nav|sidebar|_sidebar|wrapper)([._-].*)?\.[a-z0-9.]+$/

/** Default layer for each role. */
const ROLE_LAYER: Record<FileRole, Layer> = {
  entry: 'logic',
  page: 'ui',
  component: 'ui',
  layout: 'ui',
  hook: 'logic',
  state: 'logic',
  route: 'api',
  controller: 'api',
  middleware: 'api',
  service: 'logic',
  client: 'api',
  model: 'data',
  schema: 'data',
  migration: 'data',
  repository: 'data',
  util: 'logic',
  types: 'data',
  constants: 'logic',
  config: 'config',
  test: 'test',
  fixture: 'test',
  style: 'ui',
  docs: 'docs',
  script: 'infra',
  build: 'infra',
  ci: 'infra',
  container: 'infra',
  asset: 'other',
  i18n: 'ui',
  cli: 'api',
  library: 'logic',
  other: 'other',
}

export function layerForRole(role: FileRole): Layer {
  return ROLE_LAYER[role]
}

// ─────────────────────────────────────────────────────────────────────────────
// Code-file naming conventions (checked against the original-case basename)
// ─────────────────────────────────────────────────────────────────────────────

const PY_NAMES: Record<string, FileRole> = {
  'models.py': 'model',
  'model.py': 'model',
  'views.py': 'controller',
  'viewsets.py': 'controller',
  'urls.py': 'route',
  'routes.py': 'route',
  'router.py': 'route',
  'routers.py': 'route',
  'endpoints.py': 'route',
  'api.py': 'route',
  'serializers.py': 'schema',
  'schemas.py': 'schema',
  'schema.py': 'schema',
  'forms.py': 'schema',
  'validators.py': 'schema',
  'admin.py': 'config',
  'apps.py': 'config',
  'settings.py': 'config',
  'config.py': 'config',
  'conf.py': 'config',
  'tasks.py': 'service',
  'signals.py': 'service',
  'services.py': 'service',
  'service.py': 'service',
  'managers.py': 'repository',
  'crud.py': 'repository',
  'repository.py': 'repository',
  'database.py': 'repository',
  'db.py': 'repository',
  'dependencies.py': 'service',
  'middleware.py': 'middleware',
  'middlewares.py': 'middleware',
  'permissions.py': 'middleware',
  'client.py': 'client',
  'constants.py': 'constants',
  'types.py': 'types',
  'typing.py': 'types',
  'utils.py': 'util',
  'util.py': 'util',
  'helpers.py': 'util',
  'exceptions.py': 'util',
  'errors.py': 'util',
  'cli.py': 'cli',
  'commands.py': 'cli',
  'main.py': 'entry',
  'resolvers.py': 'controller',
  'handlers.py': 'controller',
}

interface NameRule {
  re: RegExp
  role: FileRole
}

/** Ordered rules over the basename (original case). First match wins. */
const NAME_RULES: NameRule[] = [
  { re: /^entry\.(client|server)\.(tsx|jsx|ts|js)$/, role: 'entry' },
  { re: /\.d\.(ts|mts|cts)$/, role: 'types' },
  { re: /\.module\.(css|scss|sass|less)$/i, role: 'style' },
  { re: /(^|[.\-_])(controller|controllers)\.[a-z]+$|[a-z]Controller\.[a-z]+$/, role: 'controller' },
  { re: /(^|[.\-_])(resolver|resolvers)\.[a-z]+$|[a-z]Resolver\.[a-z]+$/, role: 'controller' },
  { re: /(^|[.\-_])(handler|handlers)\.[a-z]+$|[a-z]Handler\.[a-z]+$/, role: 'controller' },
  { re: /(^|[.\-_])(middleware|middlewares|guard|interceptor|pipe|filter)\.[a-z]+$|[a-z](Middleware|Guard|Interceptor)\.[a-z]+$/, role: 'middleware' },
  { re: /(^|[.\-_])(service|services)\.[a-z]+$|[a-z]Service\.[a-z]+$/, role: 'service' },
  { re: /\.module\.(ts|js)$|[a-z]Module\.(kt|java|ts)$/, role: 'config' },
  { re: /(^|[.\-_])(entity|entities)\.[a-z]+$|[a-z]Entity\.[a-z]+$/, role: 'model' },
  { re: /ViewModel\.[a-z]+$|(^|[._-])view-?model\.[a-z]+$/i, role: 'state' },
  { re: /(^|[.\-_])(model|models)\.[a-z]+$|[a-z]Model\.[a-z]+$/, role: 'model' },
  { re: /(^|[.\-_])(dto|dtos)\.[a-z]+$|[a-z](Dto|DTO|Request|Response)\.(java|kt|cs|ts)$/, role: 'schema' },
  { re: /(^|[.\-_])(repository|repositories|repo|dao)\.[a-z]+$|[a-z](Repository|Repo|Dao|DAO)\.[a-z]+$/, role: 'repository' },
  { re: /(^|[.\-_])(schema|schemas|validator|validators|validation)\.[a-z]+$|[a-z](Schema|Validator)\.[a-z]+$/, role: 'schema' },
  { re: /^(routes?|router|routers|routing|urls|endpoints)\.[a-z]+$|[.\-_](routes?|router)\.[a-z]+$|[a-z](Router|Routes)\.[a-z]+$/, role: 'route' },
  { re: /^use[A-Z0-9][A-Za-z0-9]*\.(ts|tsx|js|jsx|mjs)$|^use-[a-z][\w-]*\.(ts|tsx|js|jsx|mjs)$/, role: 'hook' },
  { re: /^(store|stores|state)\.[a-z]+$|[.\-_](store|state|slice|reducer|reducers|atoms?|actions)\.[a-z]+$|[a-z](Store|Slice|Reducer)\.[a-z]+$|^(slice|reducer|reducers)\.[a-z]+$/, role: 'state' },
  { re: /[a-z]Context\.(tsx|jsx|ts|js)$|[a-z]Provider\.(tsx|jsx)$/, role: 'state' },
  { re: /^(types?|typings|interfaces?)\.[a-z]+$|[.\-_](types?|interfaces?)\.[a-z]+$/, role: 'types' },
  { re: /^(constants?|consts?|enums?)\.[a-z]+$|[.\-_](constants?|consts?|enums?)\.[a-z]+$|[a-z]Constants\.[a-z]+$/, role: 'constants' },
  { re: /^(config|configuration|settings|env|environment)\.[a-z]+$|[.\-_](config|settings|env)\.[a-z]+$|[a-z](Config|Settings|Configuration)\.[a-z]+$/, role: 'config' },
  { re: /^(api-?client|http|fetcher|axios|apiClient)\.[a-z]+$|[.\-_]client\.[a-z]+$|[a-z](Client|Api|API)\.[a-z]+$/, role: 'client' },
  { re: /^(utils?|helpers?|misc|tools?)\.[a-z]+$|[.\-_](utils?|helpers?)\.[a-z]+$|[a-z](Utils?|Helpers?)\.[a-z]+$/, role: 'util' },
  { re: /^(cli|cmd|commands?)\.[a-z]+$|[.\-_]command\.[a-z]+$|[a-z]Command\.[a-z]+$/, role: 'cli' },
  { re: /^_?(app|document)\.(tsx|jsx)$/i, role: 'component' },
  { re: /Layout\.(tsx|jsx|vue|svelte|astro|js|ts|dart)$|^_?layout\.(tsx|jsx|vue|svelte|astro)$/, role: 'layout' },
  { re: /[a-z](Page|Screen)\.(tsx|jsx|vue|svelte|dart|swift|kt|java)$|_(page|screen)\.dart$|[a-z]View\.(swift|vue)$|[a-z](Activity|Fragment)\.(kt|java)$|[a-z]ViewController\.swift$/, role: 'page' },
  { re: /\.component\.(ts|js)$|[a-z]Widget\.(dart|tsx|jsx)$|_widget\.dart$/, role: 'component' },
  { re: /^(theme|tokens|colors|palette|typography)\.(ts|js|tsx|dart|kt)$/, role: 'style' },
  { re: /^(main)\.[a-z]+$/, role: 'entry' },
]

function nameRole(name: string, family: Family, depth: number, segs: string[]): FileRole | null {
  if (family === 'python') {
    const py = PY_NAMES[name.toLowerCase()]
    if (py) return py
    if ((name === 'app.py' || name === 'server.py') && depth <= 1) return 'entry'
    if (/_(model|models)\.py$/.test(name)) return 'model'
    if (/_(view|views)\.py$/.test(name)) return 'controller'
  }
  for (const rule of NAME_RULES) if (rule.re.test(name)) return rule.role
  if (/^server\.[a-z]+$/.test(name) && depth <= 2) return 'entry'
  if (/^(app|index)\.(js|ts|mjs|cjs|go|rb|php)$|^index\.(tsx|jsx)$/.test(name) && (depth === 0 || (depth === 1 && (segs[0] === 'src' || segs[0] === 'server')))) return 'entry'
  if (/^lib\.rs$/.test(name)) return 'library'
  return null
}

/** Framework file-system routing conventions (Next.js, Nuxt, SvelteKit, Remix, Astro …). */
function frameworkRole(name: string, segs: string[], ext: string, jsx: boolean): FileRole | null {
  const lower = name.toLowerCase()
  // SvelteKit
  if (lower.startsWith('+')) {
    if (/^\+page\.svelte$/.test(lower)) return 'page'
    if (/^\+layout\.svelte$/.test(lower)) return 'layout'
    if (/^\+server\.(ts|js)$/.test(lower)) return 'route'
    if (/^\+(page|layout)(\.server)?\.(ts|js)$/.test(lower)) return 'controller'
    if (/^\+error\.svelte$/.test(lower)) return 'component'
  }
  const appIdx = segs.lastIndexOf('app')
  if (appIdx !== -1 && (JS_EXT.has(ext) || ext === 'mdx')) {
    if (/^page\.(tsx|jsx|js|ts|mdx)$/.test(lower)) return 'page'
    if (/^layout\.(tsx|jsx|js|ts)$/.test(lower)) return 'layout'
    if (/^route\.(ts|js)$/.test(lower)) return 'route'
    if (/^(loading|error|not-found|global-error|template|default)\.(tsx|jsx|js|ts)$/.test(lower)) return 'component'
    if (segs[appIdx + 1] === 'routes' && (jsx || ext === 'tsx' || ext === 'jsx')) return 'page' // Remix / React Router
    if (/^root\.(tsx|jsx)$/.test(lower) && appIdx === segs.length - 1) return 'layout'
  }
  const pagesIdx = segs.lastIndexOf('pages')
  if (pagesIdx !== -1) {
    if (segs[pagesIdx + 1] === 'api' && JS_EXT.has(ext)) return 'route'
    if (/^_(app|document)\.(tsx|jsx|js|ts)$/.test(lower)) return 'layout'
    if (SFC_EXT.has(ext) || ext === 'tsx' || ext === 'jsx' || ext === 'mdx' || (jsx && JS_EXT.has(ext))) return 'page'
  }
  // Nuxt server routes
  const serverIdx = segs.lastIndexOf('server')
  if (serverIdx !== -1 && segs[serverIdx + 1] === 'api' && JS_EXT.has(ext)) return 'route'
  return null
}

function folderRole(segs: string[], family: Family, jsx: boolean, content: string | undefined, hasRoutes: boolean): FileRole | null {
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i]
    let role = FOLDER_ROLE[seg]
    if (!role) continue
    // Note: "client" is deliberately absent: a top-level client/ folder means "the front-end app".
    if (seg === 'views' || seg === 'view') role = family === 'python' ? 'controller' : 'page'
    if ((seg === 'routes' || seg === 'router') && jsx) role = 'page'
    if (seg === 'api') {
      if (hasRoutes) role = 'route'
      else if (jsx) role = 'component'
      else if (content && looksLikeClient(content) && family === 'js') role = 'client'
      else role = 'route'
    }
    if (seg === 'providers' && family === 'php') role = 'config'
    if (seg === 'common' || seg === 'shared') {
      if (jsx) return 'component'
    }
    return role
  }
  return null
}

function symbolRole(symbols: CodeSymbol[] | undefined): FileRole | null {
  if (!symbols || symbols.length === 0) return null
  const top = symbols.filter((s) => s.kind !== 'method')
  if (top.length === 0) return null
  const kinds = new Set(top.map((s) => s.kind))
  if (kinds.has('component')) return 'component'
  if ([...kinds].every((k) => k === 'hook') ) return 'hook'
  if ([...kinds].every((k) => k === 'interface' || k === 'type' || k === 'enum')) return 'types'
  if ([...kinds].every((k) => k === 'constant')) return 'constants'
  return null
}

function fallbackLayer(segs: string[]): Layer | null {
  for (let i = segs.length - 1; i >= 0; i--) {
    const info = describeFolder(segs[i])
    if (info && info.layer !== 'other') return info.layer
  }
  return null
}

function zoneLayer(zones: Zone[]): Layer | null {
  for (const z of zones) {
    if (z === 'test') return 'test'
    if (z === 'example' || z === 'docs') return 'docs'
    if (z === 'infra' || z === 'scripts') return 'infra'
    if (z === 'vendor' || z === 'generated') return 'other'
  }
  return null
}

function hasAny(segs: string[], set: Set<string>): boolean {
  return segs.some((s) => set.has(s))
}

/**
 * Classify a file by path conventions (folder names via knowledge/folders describeFolder, file names, extensions)
 * and light content signals (JSX, route definitions, ORM model declarations, test frameworks …).
 * Examples: src/components/Button.tsx → source/component/ui; app/models/user.rb → source/model/data;
 * tests/test_api.py → test/test/test; .github/workflows/ci.yml → config/ci/infra; Dockerfile → build/container/infra;
 * package.json → config/config/config; README.md → docs/docs/docs; styles/main.css → style/style/ui;
 * migrations/0001_init.sql → source/migration/data; src/routes/users.ts with routes → source/route/api.
 */
export function classifyFile(path: string, ctx: ClassifyContext): Classification {
  const name = basename(path)
  const lower = name.toLowerCase()
  const ext = extname(path)
  const segs = folderSegments(path)
  const depth = segs.length
  const zones = zonesOf(path)
  const family = familyOf(ctx.language)
  const content = ctx.content

  // 1. Machine-made and borrowed files.
  if (zones.includes('generated') || GENERATED_NAME_RE.test(lower)) {
    if (/lock|\.sum$/.test(lower) && !/\.(js|css|map)$/.test(lower)) return C('generated', 'config', 'config')
    return C('generated', 'other', 'other')
  }
  if (zones.includes('vendor')) {
    const base = baseKind(lower, ext, ctx.language)
    return C(base, 'library', 'other')
  }

  // 2. Automation pipelines.
  const p = path.toLowerCase()
  if (p.startsWith('.github/workflows/') || p.startsWith('.github/actions/') || p.startsWith('.circleci/') || p.startsWith('.buildkite/') || p.startsWith('.gitlab/ci') || p.startsWith('.husky/')) {
    if (DATA_EXT.has(ext)) return CI
    if (DOC_EXT.has(ext)) return DOCS
    return C('script', 'ci', 'infra')
  }

  // 3. Well-known names.
  const exact = EXACT_NAMES[lower]
  // Code conventions (wsgi.py, __main__.py …) inside a test folder are test helpers, not the real thing.
  if (exact && !(exact.kind === 'source' && zones.includes('test'))) return exact
  if (DOC_NAME_RE.test(lower) && (DOC_EXT.has(ext) || ext === '' || ext === 'html' || /^(license|licence|copying|notice)/.test(lower))) return DOCS
  if (DOCKER_RE.test(lower)) return CONTAINER
  if (MAKE_RE.test(lower)) return BUILD
  if (REQUIREMENTS_RE.test(lower) || lower.endsWith('.gemspec') || lower.endsWith('.csproj') || lower.endsWith('.fsproj') || lower.endsWith('.vbproj') || lower.endsWith('.sln') || lower.endsWith('.cabal') || lower === 'directory.build.props') return CONFIG
  if (ENV_RE.test(lower)) return CONFIG
  if (TSCONFIG_RE.test(lower)) return CONFIG
  if (BUILD_TOOL_CONFIG_RE.test(lower)) return BUILD_CONFIG
  if (TOOL_CONFIG_RE.test(lower)) return CONFIG
  if (IAC_EXT.has(ext)) return DEPLOY
  if (p.startsWith('.github/')) {
    if (DOC_EXT.has(ext)) return DOCS
    if (DATA_EXT.has(ext) || ext === '') return lower === 'dependabot.yml' ? CI : CONFIG
  }
  if (hasAny(segs, CONFIG_DIRS) && segs.some((s) => s.startsWith('.')) && !zones.includes('test')) {
    // Editor / tool folders (.vscode, .idea …)
    if (!isCodeExt(ext, ctx.language) || DATA_EXT.has(ext)) return CONFIG
  }
  if (zones.includes('infra') && (DATA_EXT.has(ext) || ext === '')) {
    const k8s = segs.some((s) => s === 'k8s' || s === 'kubernetes' || s === 'helm' || s === 'charts')
    return k8s ? C('config', 'container', 'infra') : DEPLOY
  }

  // 4. Tests (by name anywhere, or anything inside a test folder).
  const testByName = isTestFileName(name)
  if (testByName || zones.includes('test')) {
    if (lower === 'conftest.py') return C('test', 'fixture', 'test')
    const inFixtures = hasAny(segs, FIXTURE_DIRS)
    if (!isCodeExt(ext, ctx.language) || inFixtures) return C('test', 'fixture', 'test')
    const helperFolder = segs.some((s) => ['support', 'helpers', 'helper', 'utils', 'util', 'common', 'shared', 'setup', 'test-utils', 'testutils', 'test_utils'].includes(s))
    if (!testByName && (helperFolder || /^(utils?|helpers?|setup|support|common|testutils?|test[-_]?utils?|test[-_]?helpers?)\.[a-z]+$/.test(lower))) return C('test', 'util', 'test')
    return C('test', 'test', 'test')
  }
  if (/\.stories\.[a-z]+$|\.story\.[a-z]+$/.test(lower)) return C('docs', 'docs', 'docs')

  const zLayer = zoneLayer(zones)

  // 5. Docs & prose.
  if (DOC_EXT.has(ext)) {
    if (ext === 'txt' && hasAny(segs, DATA_DIRS)) return C('data', 'other', 'data')
    return DOCS
  }

  // 6. Translations.
  const localeFile = /^[a-z]{2,3}([-_][a-z0-9]{2,4})?\.(js|ts|json|ya?ml)$/i.test(name)
  if (I18N_EXT.has(ext) || (hasAny(segs, I18N_DIRS) && (DATA_EXT.has(ext) || (localeFile && hasAny(segs, I18N_CODE_DIRS))))) {
    return C('data', 'i18n', zLayer === 'docs' ? 'docs' : 'ui')
  }

  // 7. Database structure.
  if (ext === 'sql' || ext === 'psql' || ext === 'pgsql' || ext === 'prisma' || ext === 'edgeql' || ext === 'cql') {
    if (ext === 'prisma') return C('source', 'schema', 'data')
    const inMigrations = segs.some((s) => s === 'migrations' || s === 'migration' || s === 'migrate' || s === 'versions' || s === 'changelogs')
    if (inMigrations || /^v?\d{3,}[_.-]/.test(lower)) return C('source', 'migration', 'data')
    if (segs.some((s) => s === 'seeds' || s === 'seed') || /seed/.test(lower)) return C('data', 'other', 'data')
    if (content && !/\b(create|alter)\s+(table|index|view|type|schema)\b/i.test(content) && /\b(select|insert|update|delete)\b/i.test(content)) return C('source', 'repository', 'data')
    return C('source', 'schema', 'data')
  }
  if (SCHEMA_LANG_EXT.has(ext)) return C('source', 'schema', 'api')
  if (/^(openapi|swagger|asyncapi)([._-].*)?\.(ya?ml|json)$/.test(lower)) return C('data', 'schema', 'api')

  // 8. Media.
  if (ASSET_EXT.has(ext)) return C('asset', 'asset', 'other')

  // 9. Styles.
  if (STYLE_EXT.has(ext)) return C('style', 'style', zLayer === 'docs' ? 'docs' : 'ui')

  // 10. Page templates.
  if (MARKUP_EXT.has(ext) || lower.endsWith('.blade.php') || lower.endsWith('.html.erb')) {
    let role: FileRole = 'page'
    if (LAYOUT_NAME_RE.test(lower) || segs.some((s) => s === 'layouts' || s === '_layouts' || s === 'layout')) role = 'layout'
    else if (segs.some((s) => s === 'partials' || s === '_includes' || s === 'includes' || s === 'components' || s === 'shared' || s === 'fragments')) role = 'component'
    else if (lower.startsWith('_') && ext !== 'html') role = 'component'
    return C('markup', role, zLayer === 'docs' ? 'docs' : 'ui')
  }

  // 11. Data & settings files.
  if (DATA_EXT.has(ext)) {
    const stem = lower.replace(/\.[^.]+$/, '')
    if (/\.schema\.json$|^schema\.json$/.test(lower)) return C('data', 'schema', 'data')
    if (/^(appsettings|application)([._-].*)?\.(json|ya?ml|properties)$/.test(lower)) return CONFIG
    if (
      hasAny(segs, CONFIG_DIRS) ||
      /(^|[._-])(config|configuration|settings|conf)([._-]|$)/.test(stem) ||
      /^\..*rc$/.test(stem) ||
      ext === 'ini' ||
      ext === 'cfg' ||
      ext === 'conf' ||
      ext === 'properties' ||
      ext === 'env' ||
      lower.startsWith('.')
    ) {
      return C('config', 'config', zLayer && zLayer !== 'other' && zLayer !== 'test' ? zLayer : 'config')
    }
    if (zLayer === 'docs') return C('data', 'other', 'docs')
    return C('data', 'other', 'data')
  }

  // Files with no known language: tool settings, executable scripts (judged by their first line), or unknown.
  if (!ctx.language) {
    const shebang = content ? /^#!\s*\S*?(?:\benv\s+)?(node|deno|bun|python3?|ruby|perl|php|bash|sh|zsh)\b/.exec(content) : null
    if (shebang) {
      const interp = shebang[1]
      const fam: Family = interp === 'node' || interp === 'deno' || interp === 'bun' ? 'js' : interp.startsWith('python') ? 'python' : interp === 'ruby' ? 'ruby' : interp === 'php' ? 'php' : 'shell'
      if (fam === 'shell') return segs.includes('bin') ? C('script', 'cli', zLayer ?? 'api') : C('script', 'script', 'infra')
      const res = classifyCode(path, name, ext, segs, depth, zones, fam, ctx)
      if (res.role === 'library') return { kind: segs.includes('bin') ? 'source' : 'script', role: 'cli', layer: zLayer ?? 'api' }
      return res
    }
    if (lower.startsWith('.')) return CONFIG
    if (ext === '' && (segs.includes('bin') || segs.includes('scripts'))) return C('script', 'script', 'infra')
    return C('other', 'other', zLayer ?? 'other')
  }

  // Prose, data and settings formats that slipped through (ignore lists, git settings, plain text …).
  if (ctx.isCode === false || NON_CODE_LANGUAGES.has(ctx.language.toLowerCase())) {
    if (lower.startsWith('.') || /ignore$|rc$|config$/.test(lower)) return CONFIG
    if (ctx.language === 'Text') return DOCS
    if (ctx.language === 'Diff') return C('data', 'other', zLayer ?? 'data')
    return C('other', 'other', zLayer ?? 'other')
  }

  // 12. Notebooks & shell scripts.
  if (ext === 'ipynb') return C('source', 'script', zLayer === 'docs' ? 'docs' : 'logic')
  if (SHELL_EXT.has(ext) || family === 'shell') {
    if (segs.includes('bin') || segs.includes('cmd')) return C('script', 'cli', zLayer ?? 'api')
    return C('script', 'script', 'infra')
  }

  // 13. Program code.
  return classifyCode(path, name, ext, segs, depth, zones, family, ctx)
}

function classifyCode(
  path: string,
  name: string,
  ext: string,
  segs: string[],
  depth: number,
  zones: Zone[],
  family: Family,
  ctx: ClassifyContext,
): Classification {
  const content = ctx.content ?? ''
  const hasRoutes = (ctx.routes?.length ?? 0) > 0
  const jsx = family === 'js' && hasJsx(content, ext, ctx.techIds)
  const zLayer = zoneLayer(zones)

  // Chore scripts and pipeline code.
  if (zones.includes('scripts') && !zones.includes('example')) return C('script', 'script', 'infra')
  if (zones.includes('infra')) return C('script', path.toLowerCase().startsWith('.github/') ? 'ci' : 'script', 'infra')

  // Content that is unmistakably a test, whatever the name.
  if (content && looksLikeTest(content, family)) return C('test', 'test', 'test')

  let role: FileRole | null = frameworkRole(name, segs, ext, jsx) ?? nameRole(name, family, depth, segs)

  // Strong content signals override generic or weak name guesses.
  if (content) {
    const generic = role === null || role === 'library' || role === 'util' || role === 'entry'
    if (isOrmModel(content) && (role === null || role === 'library' || role === 'util' || role === 'schema' || role === 'types')) role = 'model'
    else if (hasRoutes && (role === null || role === 'library' || role === 'util' || role === 'service' || role === 'entry') && !jsx) role = role === 'entry' ? 'entry' : 'route'
    else if (generic && role !== 'entry' && isValidationSchema(content)) role = 'schema'
  }

  if (role === null) role = folderRole(segs, family, jsx, content, hasRoutes)

  // Something starts running here (a server, the first screen, a window, a bot, a main function).
  const startOf = (): StartSignal | null => (content ? detectStartIn(content, family, ctx.language) : null) // cached per content
  if (content && (role === null || role === 'library' || role === 'cli' || role === 'util')) {
    const start = startOf()
    if (start && start.kind !== 'cli' && !(start.kind === 'main' && (role === 'cli' || role === 'util'))) role = 'entry'
  }

  // Weak content and symbol signals for anything still unknown.
  if (role === null || role === 'library') {
    if (content) {
      if (jsx) role = 'component'
      else if (looksLikeCli(content)) role = 'cli'
      else if (SFC_EXT.has(ext)) role = 'component'
      else role = symbolRole(ctx.symbols) ?? role
    } else if (SFC_EXT.has(ext)) {
      role = 'component'
    }
  }
  if (role === 'util' && jsx) role = 'component'
  if ((role === 'route' || role === 'controller') && jsx && !hasRoutes) role = 'page'
  if (role === null) role = 'library'

  // Layer.
  let layer: Layer = ROLE_LAYER[role]
  if (role === 'entry') {
    const start = startOf()
    if (jsx || start?.kind === 'ui') layer = 'ui'
    else if (start?.kind === 'server' || hasRoutes || name === 'wsgi.py' || name === 'asgi.py') layer = 'api'
    else if (start?.kind === 'cli') layer = 'api'
    else layer = 'logic'
  } else if (role === 'library') {
    layer = fallbackLayer(segs) ?? 'logic'
    if (layer === 'test' || layer === 'docs' || layer === 'infra' || layer === 'config' || layer === 'other') layer = 'logic'
  } else if (role === 'config' && /\.module\.(ts|js)$|Module\.(kt|java|ts)$/.test(name)) {
    layer = 'logic'
  } else if (role === 'config' && name === 'admin.py') {
    layer = 'ui'
  } else if (role === 'schema' && name === 'forms.py') {
    layer = 'ui'
  }
  if (zLayer === 'docs') layer = 'docs'

  const kind: FileKind = role === 'config' && (depth === 0 || /\.config\.[a-z]+$/.test(name)) ? 'config' : 'source'
  return { kind, role, layer }
}

/** Broad kind for a file by extension alone (used for vendored files). */
function baseKind(lower: string, ext: string, language: string | null): FileKind {
  if (DOC_EXT.has(ext)) return 'docs'
  if (STYLE_EXT.has(ext)) return 'style'
  if (MARKUP_EXT.has(ext)) return 'markup'
  if (ASSET_EXT.has(ext)) return 'asset'
  if (DATA_EXT.has(ext)) return 'data'
  if (SHELL_EXT.has(ext)) return 'script'
  if (language || isCodeExt(ext, language) || lower === 'makefile') return 'source'
  return 'other'
}

function isCodeExt(ext: string, language: string | null): boolean {
  if (!language) return false
  if (DOC_EXT.has(ext) || DATA_EXT.has(ext) || ASSET_EXT.has(ext) || STYLE_EXT.has(ext) || MARKUP_EXT.has(ext) || I18N_EXT.has(ext)) return false
  return true
}
