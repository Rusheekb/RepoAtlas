import { ANALYSIS_DEPTHS } from '@/core/labels'
import type { AnalysisDepth, SkipReason, TreeEntry } from '@/core/types'

/** Files bigger than this are never downloaded (they're almost always data, bundles or generated code). */
export const MAX_FILE_BYTES = 512 * 1024

// ─────────────────────────────────────────────────────────────────────────────
// Skip rules
// ─────────────────────────────────────────────────────────────────────────────

/** Extensions of files that are not readable code: images, media, fonts, archives, compiled output, data blobs. */
const BINARY_EXTS = new Set([
  // images & design files
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'icns', 'cur', 'tif', 'tiff', 'avif', 'heic', 'heif', 'svg', 'svgz',
  'psd', 'ai', 'eps', 'sketch', 'fig', 'xcf', 'raw', 'cr2', 'nef', 'dng', 'jxl', 'apng', 'exr', 'hdr', 'tga', 'dds', 'ktx', 'ktx2', 'basis',
  // documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'key', 'numbers', 'pages', 'epub', 'mobi', 'rtf',
  // archives & packages
  'zip', 'gz', 'tgz', 'bz2', 'xz', 'txz', '7z', 'rar', 'tar', 'zst', 'lz', 'lz4', 'lzma', 'cab', 'jar', 'war', 'ear', 'aar', 'apk',
  'aab', 'ipa', 'xapk', 'dmg', 'iso', 'img', 'deb', 'rpm', 'msi', 'msix', 'appx', 'pkg', 'snap', 'nupkg', 'whl', 'egg', 'gem', 'crx', 'xpi', 'vsix',
  // compiled code & native libraries
  'exe', 'dll', 'so', 'dylib', 'a', 'lib', 'o', 'obj', 'ko', 'elf', 'bin', 'dat', 'class', 'pyc', 'pyo', 'pyd', 'wasm', 'node',
  'beam', 'dex', 'odex', 'pdb', 'ilk', 'exp', 'idb', 'nib', 'car', 'out', 'hex', 'rlib', 'rmeta', 'luac',
  // fonts
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'fon', 'ttc', 'pfb', 'pfm',
  // audio & video
  'mp3', 'wav', 'ogg', 'oga', 'flac', 'aac', 'm4a', 'wma', 'opus', 'mid', 'midi', 'aif', 'aiff', 'caf', 'amr',
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v', 'mpg', 'mpeg', '3gp', 'ogv',
  // databases & data science blobs
  'db', 'sqlite', 'sqlite3', 'mdb', 'accdb', 'realm', 'ldb', 'parquet', 'pkl', 'pickle', 'npy', 'npz', 'h5', 'hdf5', 'onnx',
  'pt', 'pth', 'ckpt', 'safetensors', 'tflite', 'pb', 'mlmodel', 'joblib', 'feather', 'arrow', 'avro', 'orc', 'mat', 'sav', 'gguf', 'ggml',
  'rdata', 'rds', 'dta', 'xpt', 'nc', 'tfrecord', 'bson', 'mdf', 'ldf', 'lmdb',
  // 3D, game & misc media
  'glb', 'gltf', 'fbx', 'stl', 'blend', '3ds', 'dae', 'usdz', 'usd', 'ply', 'unitypackage', 'swf', 'fla', 'unity3d', 'pak', 'vpk',
  // keys, certificates & other opaque files
  'jks', 'keystore', 'p12', 'pfx', 'der', 'gpg', 'sig', 'icc',
])

/** Lockfiles: machine-written lists of exact dependency versions. Huge and not useful for understanding. */
const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock', 'deno.lock',
  'cargo.lock', 'poetry.lock', 'pipfile.lock', 'pdm.lock', 'uv.lock', 'pixi.lock', 'conda-lock.yml', 'gemfile.lock', 'composer.lock',
  'go.sum', 'go.work.sum', 'mix.lock', 'pubspec.lock', 'podfile.lock', 'cartfile.resolved', 'package.resolved', 'packages.lock.json',
  'paket.lock', 'flake.lock', 'gradle.lockfile', 'buildscript-gradle.lockfile', 'shard.lock', 'manifest.toml', 'stack.yaml.lock',
  'cabal.project.freeze', 'renv.lock', 'rebar.lock',
])

/** Folders holding other people's code that was copied in. */
const VENDORED_DIRS = new Set([
  'node_modules', 'bower_components', 'jspm_packages', 'web_modules', 'vendor', 'vendors', '_vendor', 'third_party', 'third-party',
  'thirdparty', '3rdparty', '.venv', 'venv', 'site-packages', 'pods', 'carthage', '.yarn', '.pnpm-store', '.bundle', 'elm-stuff',
  '.pub-cache', 'godeps',
])

/** Folders holding machine-made output (build results, caches, coverage reports …). */
const GENERATED_DIRS = new Set([
  'dist', 'build', 'out', '.next', '.nuxt', '.output', '.svelte-kit', '.astro', '.vercel', '.netlify', '.serverless', '.docusaurus',
  '.expo', '.angular', '.turbo', '.cache', '.parcel-cache', '.webpack', '.vite', 'target', '__pycache__', '.mypy_cache', '.pytest_cache',
  '.ruff_cache', '.tox', '.nox', '.eggs', '.ipynb_checkpoints', 'coverage', '.nyc_output', 'htmlcov', '.git', '.hg', '.svn', '.idea',
  '.gradle', '.dart_tool', 'deriveddata', '.terraform', '.terragrunt-cache', 'storybook-static', '_site', '.jekyll-cache',
  '.stack-work', 'dist-newstyle', 'zig-cache', '.zig-cache', 'zig-out', '__generated__', '.history', '.sass-cache',
  'obj',
])

/** Basename patterns for generated / minified files. */
const GENERATED_FILE_RES: RegExp[] = [
  /\.min\.(js|mjs|cjs|css)$/,
  /[.-]min\.js$/,
  /\.bundle\.(js|css)$/,
  /\.chunk\.(js|css)$/,
  /\.map$/,
  /\.pb\.(go|gw\.go|cc|h|swift|dart)$/,
  /_pb2(_grpc)?\.pyi?$/,
  /_(grpc_)?pb\.(js|d\.ts)$/,
  /_grpc_web_pb\.js$/,
  /\.generated\./,
  /\.g\.(dart|cs|i\.cs)$/,
  /\.freezed\.dart$/,
  /\.designer\.cs$/,
  /\.snap$/,
  /^\.pnp\.(c?js|loader\.mjs)$/,
]

function isGeneratedDir(segLower: string): boolean {
  return GENERATED_DIRS.has(segLower) || segLower.endsWith('.egg-info') || segLower.startsWith('cmake-build-')
}

/**
 * Why a file should never be downloaded, or null if it may be.
 * Order matters: folder rules first (most informative), then lockfiles, generated names, binaries, size.
 */
export function skipReasonFor(entry: TreeEntry): SkipReason | null {
  const path = entry.path
  const segments = path.split('/')
  const name = segments[segments.length - 1]
  const lower = name.toLowerCase()

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i].toLowerCase()
    if (VENDORED_DIRS.has(seg)) return 'vendored'
    if (isGeneratedDir(seg)) return 'generated'
    // .NET build output: bin/Debug, bin/Release
    if (seg === 'bin' && i + 1 < segments.length - 1) {
      const nextSeg = segments[i + 1].toLowerCase()
      if (nextSeg === 'debug' || nextSeg === 'release') return 'generated'
    }
  }

  if (LOCKFILES.has(lower) || lower.endsWith('.lock') || lower.endsWith('.lockb')) return 'lockfile'
  if (GENERATED_FILE_RES.some((re) => re.test(lower))) return 'generated'

  const dot = lower.lastIndexOf('.')
  const ext = dot > 0 ? lower.slice(dot + 1) : ''
  if ((ext && BINARY_EXTS.has(ext)) || lower === '.ds_store' || lower === 'thumbs.db' || lower === 'desktop.ini') return 'binary'

  if (entry.size > MAX_FILE_BYTES) return 'too-large'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification for priority
// ─────────────────────────────────────────────────────────────────────────────

/** Programming, markup, style and schema languages — "real code". */
const CODE_EXTS = new Set([
  'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte', 'astro', 'marko', 'riot',
  'py', 'pyi', 'pyx', 'pxd', 'ipynb', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'sc', 'groovy', 'gradle', 'clj', 'cljs', 'cljc',
  'c', 'h', 'cc', 'cpp', 'cxx', 'c++', 'hpp', 'hh', 'hxx', 'ipp', 'inl', 'm', 'mm', 'swift', 'cs', 'csx', 'fs', 'fsi', 'fsx', 'vb',
  'rb', 'rake', 'gemspec', 'php', 'ex', 'exs', 'heex', 'eex', 'leex', 'erl', 'hrl', 'hs', 'lhs', 'ml', 'mli', 're', 'rei', 'res', 'resi',
  'elm', 'dart', 'lua', 'luau', 'r', 'jl', 'nim', 'zig', 'v', 'sv', 'svh', 'vhd', 'vhdl', 'sol', 'move', 'cairo', 'cr', 'pl', 'pm', 't',
  'raku', 'rakumod', 'ps1', 'psm1', 'psd1', 'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd', 'awk', 'sed', 'tcl',
  'sql', 'psql', 'plsql', 'graphql', 'gql', 'proto', 'thrift', 'avsc', 'prisma', 'edgeql', 'cypher',
  'tf', 'tfvars', 'hcl', 'nix', 'bzl', 'bazel', 'star', 'cmake', 'mk', 'mak', 'gn', 'gni', 'just', 'dockerfile', 'containerfile',
  'css', 'scss', 'sass', 'less', 'styl', 'stylus', 'pcss', 'postcss',
  'html', 'htm', 'xhtml', 'ejs', 'hbs', 'handlebars', 'mustache', 'pug', 'jade', 'njk', 'nunjucks', 'liquid', 'twig', 'erb', 'haml',
  'slim', 'razor', 'cshtml', 'vbhtml', 'jinja', 'jinja2', 'j2', 'tmpl', 'tpl', 'gohtml', 'templ', 'blade',
  'wgsl', 'glsl', 'hlsl', 'vert', 'frag', 'comp', 'geom', 'shader', 'metal', 'cu', 'cuh', 'asm', 's', 'nasm', 'd', 'f', 'f90',
  'f95', 'for', 'pas', 'pp', 'dpr', 'cob', 'cbl', 'coffee', 'litcoffee', 'purs', 'hx', 'gd', 'gdshader', 'wat', 'ino', 'pde',
  'cls', 'apex', 'abap', 'al', 'scm', 'ss', 'rkt', 'lisp', 'lsp', 'el', 'fnl', 'janet', 'odin', 'gleam', 'roc', 'mojo', 'vala',
  'ada', 'adb', 'ads', 'pro', 'qml', 'xaml', 'axaml', 'storyboard', 'xib', 'tscn', 'tres',
])

/** Structured settings / data formats. */
const CONFIG_EXTS = new Set([
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'config', 'properties', 'xml', 'plist', 'xsd', 'props',
  'targets', 'csproj', 'fsproj', 'vbproj', 'vcxproj', 'sln', 'cabal', 'nimble', 'rockspec', 'opam', 'editorconfig', 'env',
  'webmanifest', 'jsonnet', 'libsonnet', 'cue', 'dhall', 'kdl', 'ron', 'nuspec', 'resx', 'entitlements', 'pbxproj', 'xcconfig',
])

const DOC_EXTS = new Set(['md', 'markdown', 'mdown', 'rst', 'adoc', 'asciidoc', 'txt', 'org', 'tex', 'textile', 'pod', 'rdoc', 'wiki'])
const DOC_NAMES = new Set([
  'license', 'licence', 'copying', 'notice', 'authors', 'contributors', 'changelog', 'changes', 'history', 'news', 'maintainers',
  'codeowners', 'security', 'support', 'code_of_conduct', 'patents', 'thanks', 'credits', 'todo', 'roadmap', 'faq',
])

/** Package manifests and build files: the project's "ingredients lists". Lower = more important. */
const PRIMARY_MANIFESTS = new Set([
  'package.json', 'deno.json', 'deno.jsonc', 'pyproject.toml', 'setup.py', 'setup.cfg', 'pipfile', 'environment.yml',
  'environment.yaml', 'go.mod', 'go.work', 'cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle',
  'settings.gradle.kts', 'gemfile', 'composer.json', 'mix.exs', 'pubspec.yaml', 'package.swift', 'podfile', 'build.sbt',
  'project.clj', 'deps.edn', 'shadow-cljs.edn', 'stack.yaml', 'cabal.project', 'dune-project', 'rebar.config', 'elm.json',
  'project.toml', 'cmakelists.txt', 'meson.build', 'build.zig', 'build.zig.zon', 'makefile', 'gnumakefile', 'dockerfile',
  'containerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', 'procfile', 'pnpm-workspace.yaml',
  'lerna.json', 'nx.json', 'turbo.json', 'rush.json', 'workspace', 'workspace.bazel', 'module.bazel', 'build.bazel', 'flake.nix',
  'default.nix', 'shell.nix', 'vcpkg.json', 'conanfile.txt', 'conanfile.py', 'global.json', 'directory.build.props', 'action.yml',
  'action.yaml', 'project.godot', 'gemfile.rb', 'rakefile', 'config.ru', 'justfile', 'taskfile.yml', 'taskfile.yaml', 'earthfile',
  'jenkinsfile', 'vagrantfile', 'serverless.yml', 'serverless.yaml', 'wrangler.toml', 'wrangler.json', 'vercel.json',
  'netlify.toml', 'fly.toml', 'render.yaml', 'railway.json', 'app.yaml', 'firebase.json', 'angular.json', 'chart.yaml',
  'kustomization.yaml', 'skaffold.yaml', 'tauri.conf.json', 'manifest.json', 'app.json', 'description', 'snapcraft.yaml',
  '.gitlab-ci.yml', '.travis.yml', 'azure-pipelines.yml', 'bitbucket-pipelines.yml', 'appveyor.yml', 'cloudbuild.yaml',
  'codemagic.yaml', 'mkdocs.yml', 'book.toml', 'requirements.txt',
])

/** Secondary config: tool settings that reveal how the project is built, checked and run. */
const SECONDARY_CONFIG = new Set([
  'jsconfig.json', 'bunfig.toml', '.babelrc', 'tox.ini', 'noxfile.py', 'pytest.ini', '.flake8', 'mypy.ini', 'ruff.toml',
  '.ruff.toml', '.rubocop.yml', 'phpunit.xml', 'phpunit.xml.dist', 'karma.conf.js', 'gatsby-config.js', 'gatsby-config.ts',
  'gatsby-node.js', 'gatsby-node.ts', 'gruntfile.js', 'gulpfile.js', 'gulpfile.ts', 'ember-cli-build.js', 'nodemon.json',
  'nest-cli.json', 'knexfile.js', 'knexfile.ts', 'alembic.ini', 'biome.json', 'biome.jsonc', 'deno.json', '.nvmrc', '.node-version',
  '.python-version', '.ruby-version', '.tool-versions', 'rust-toolchain', 'rust-toolchain.toml', 'gradle.properties',
  '.gitmodules', 'renovate.json', 'codecov.yml', '.pre-commit-config.yaml', 'application.properties', 'application.yml',
  'application.yaml', 'appsettings.json', 'nginx.conf', 'caddyfile', '_config.yml', 'hugo.toml', 'hugo.yaml', 'config.toml',
  'values.yaml', 'ecosystem.config.js', 'babel.config.json', '.swcrc', 'schema.prisma', 'env.example', 'mkdocs.yaml',
])

const DOC_EXT_OR_NONE = new Set(['', 'md', 'markdown', 'mdx', 'rst', 'txt', 'adoc', 'asciidoc', 'org'])

/** Words for "test" folders. */
const TEST_DIRS = new Set([
  'test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'testing', '__mocks__', 'mocks', 'fixtures', '__fixtures__', 'testdata',
  'test-data', 'test_data', 'cypress', 'integration-tests', 'androidtest', 'unittests', 'unit-tests', 'test-utils', 'testutils',
])
const EXAMPLE_DIRS = new Set([
  'examples', 'example', 'samples', 'sample', 'demo', 'demos', 'benchmarks', 'benchmark', 'bench', 'playground', 'sandbox',
  'stories', 'showcase', 'tutorials', 'tutorial', 'cookbook', 'starters', 'templates-examples',
])
const DOC_DIRS = new Set(['docs', 'doc', 'documentation', 'wiki', 'man', 'guides'])

const TEST_FILE_RES: RegExp[] = [
  /\.(test|spec|e2e|cy|bench|integration)\.[a-z0-9]+$/i,
  /_test\.(go|py|rb|exs|ex|dart|cc|cpp|c|rs|ts|js|lua|zig|nim|jl|php)$/i,
  /^test_.+\.py$/i,
  /_spec\.(rb|lua|cr)$/i,
  /(Test|Tests|Spec|IT|TestCase)\.(java|kt|cs|fs|scala|swift|php|groovy|m|mm)$/,
  /^conftest\.py$/i,
]

const STORY_RE = /\.(stories|story)\.[a-z0-9]+$/i
const LICENSE_RE = /^(license|licence|copying|notice)([-_.][\w.-]*)?$/
const STYLE_EXTS = new Set(['css', 'scss', 'sass', 'less', 'styl', 'stylus', 'pcss', 'postcss'])

/** Base-name stems that usually mark where a program starts. Lower rank = more likely. */
const ENTRY_STEMS = new Map<string, number>([
  ['main', 0],
  ['__main__', 0],
  ['index', 1],
  ['app', 2],
  ['program', 2],
  ['server', 3],
  ['cli', 4],
  ['manage', 5],
  ['run', 6],
  ['start', 6],
  ['entry', 6],
  ['bootstrap', 7],
  ['startup', 7],
  ['application', 7],
  ['wsgi', 8],
  ['asgi', 8],
])

type Tier =
  | 'key-doc'
  | 'manifest'
  | 'entry'
  | 'area-readme'
  | 'code'
  | 'config'
  | 'example'
  | 'test'
  | 'doc'
  | 'other'

interface Candidate {
  path: string
  size: number
  depth: number
  dir: string
  top: string
  tier: Tier
  /** Secondary sort key inside the fixed-order tiers (key-doc, manifest, entry). */
  weight: number
  isWorkflow: boolean
  /** Depth used for "nearest the root first" ordering (CI workflows count as top-level). */
  sortDepth: number
  /** Scratch sort keys used by spread(). */
  score: number
  turn: number
  topIndex: number
}

function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { stem: name, ext: '' }
  return { stem: name.slice(0, dot), ext: name.slice(dot + 1) }
}

/** Rank of a "start here" document at the top of the repo, or null. */
function keyDocWeight(segs: string[], lower: string): number | null {
  const depth = segs.length - 1
  const { stem, ext } = splitName(lower)
  if (!DOC_EXT_OR_NONE.has(ext)) return null
  const parent = depth === 1 ? segs[0].toLowerCase() : ''
  const atTop = depth === 0 || (depth === 1 && (parent === '.github' || parent === 'docs' || parent === 'doc'))
  if (!atTop) return null
  const bonus = depth === 0 ? 0 : 10
  const extBonus = ext === 'md' || ext === '' ? 0 : 1
  if (stem === 'readme') return bonus + extBonus
  if (stem === 'architecture' || stem === 'architecture_overview' || stem === 'design') return bonus + 2 + extBonus
  if (stem === 'contributing' || stem === 'hacking' || stem === 'development') return bonus + 4 + extBonus
  if (depth === 0 && (stem === 'agents' || stem === 'claude')) return 6
  if (depth === 1 && parent === '.github' && stem === 'copilot-instructions') return 16
  return null
}

function manifestWeight(path: string, segs: string[], lower: string): number | null {
  const depth = segs.length - 1
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)) return 3
  if (/^\.circleci\/config\.ya?ml$/i.test(path)) return 3
  if (/^\.devcontainer\/devcontainer\.json$/i.test(path)) return 2
  if (lower === 'manifest.json' || lower === 'app.json' || lower === 'description' || lower === 'app.yaml' || lower === 'config.toml') {
    // Generic names: only meaningful near the top.
    if (depth > 1) return null
  }
  if (PRIMARY_MANIFESTS.has(lower)) return 0
  if (/^requirements([-_.][\w.-]*)?\.(txt|in)$/.test(lower)) return 0
  if (depth >= 1 && segs[depth - 1].toLowerCase() === 'requirements' && /\.(txt|in)$/.test(lower)) return 0
  if (/^dockerfile[.-][\w.-]+$/.test(lower) || lower.endsWith('.dockerfile')) return 0
  if (/^docker-compose[.-][\w.-]+\.ya?ml$/.test(lower)) return 1
  if (/\.(csproj|fsproj|vbproj|sln|gemspec|cabal|nimble|rockspec|opam)$/.test(lower)) return 0
  if (SECONDARY_CONFIG.has(lower)) return 1
  if (/^tsconfig(\.[\w-]+)?\.json$/.test(lower)) return 1
  if (/^[\w-]+\.config\.(js|cjs|mjs|ts|cts|mts|json|jsonc|ya?ml|toml)$/.test(lower)) return 1
  if (/^\.(eslintrc|prettierrc|babelrc|stylelintrc)(\.(js|cjs|mjs|json|ya?ml))?$/.test(lower)) return 2
  if (/^\.env\.(example|sample|template|dist|defaults)$/.test(lower) || /^\.env\.[\w-]+\.example$/.test(lower)) return 2
  return null
}

function entryWeight(path: string, segs: string[], name: string, lower: string, ext: string): number | null {
  const depth = segs.length - 1
  if (/(^|\/)cmd\/[^/]+\/main\.go$/.test(path)) return 0
  if (/(^|\/)src\/(main|lib)\.rs$/.test(path)) return 0
  if (/(^|\/)src\/bin\/[^/]+\.rs$/.test(path)) return 2
  if (lower === 'program.cs' || lower === 'startup.cs' || lower === 'program.fs') return depth <= 4 ? 2 : null
  if (/(Application|Main)\.(java|kt|scala)$/.test(name)) return 3
  if (lower === '__main__.py' || lower === 'manage.py' || lower === 'wsgi.py' || lower === 'asgi.py') return depth <= 4 ? 1 : null
  if (/(^|\/)(src\/)?(pages\/_app|pages\/_document|app\/layout|app\/page)\.(tsx|jsx|ts|js)$/.test(path)) return depth <= 4 ? 2 : null
  if (depth === 1 && segs[0].toLowerCase() === 'bin' && (ext === '' || CODE_EXTS.has(ext))) return 4
  if (depth > 3) return null
  const { stem } = splitName(lower)
  const rank = ENTRY_STEMS.get(stem)
  if (rank == null) return null
  if (CODE_EXTS.has(ext) && !STYLE_EXTS.has(ext)) {
    if ((ext === 'html' || ext === 'htm') && stem !== 'index') return null
    return rank
  }
  return null
}

function isTestPath(dirsLower: string[], name: string): boolean {
  if (dirsLower.some((d) => TEST_DIRS.has(d))) return true
  return TEST_FILE_RES.some((re) => re.test(name))
}

function classify(entry: TreeEntry): Candidate {
  const path = entry.path
  const segs = path.split('/')
  const depth = segs.length - 1
  const name = segs[depth]
  const lower = name.toLowerCase()
  const dirsLower = segs.slice(0, depth).map((s) => s.toLowerCase())
  const dir = segs.slice(0, depth).join('/')
  const top = depth === 0 ? '' : segs[0]
  const { ext, stem } = splitName(lower)
  const base = { path, size: entry.size, depth, dir, top, weight: 0, isWorkflow: false, sortDepth: depth, score: 0, turn: 0, topIndex: 0 }

  const kd = keyDocWeight(segs, lower)
  if (kd != null) return { ...base, tier: 'key-doc', weight: kd }

  const inTopDocs = depth >= 1 && DOC_DIRS.has(dirsLower[0])
  const isDocFile = DOC_EXTS.has(ext) || (ext === '' && DOC_NAMES.has(stem)) || LICENSE_RE.test(lower)

  if (isTestPath(dirsLower, name)) return { ...base, tier: 'test' }
  if (dirsLower.some((d) => EXAMPLE_DIRS.has(d)) || STORY_RE.test(name)) return { ...base, tier: 'example' }

  const mw = manifestWeight(path, segs, lower)
  if (mw != null) {
    const isWorkflow = /^\.github\/workflows\//i.test(path)
    return { ...base, tier: 'manifest', weight: mw, isWorkflow, sortDepth: isWorkflow ? 1 : depth }
  }

  if (!inTopDocs) {
    const ew = entryWeight(path, segs, name, lower, ext)
    if (ew != null) return { ...base, tier: 'entry', weight: ew }
  }

  if (stem === 'readme' && DOC_EXT_OR_NONE.has(ext) && depth >= 1 && depth <= 3) return { ...base, tier: 'area-readme' }
  // Includes "README.zh-CN.md" and friends: translations of the main README.
  if (inTopDocs || isDocFile || ext === 'mdx' || (/^readme[._-]/.test(lower) && DOC_EXT_OR_NONE.has(ext))) {
    return { ...base, tier: 'doc' }
  }
  if (CODE_EXTS.has(ext) || lower === 'dockerfile' || lower === 'makefile') return { ...base, tier: 'code' }
  if (CONFIG_EXTS.has(ext)) return { ...base, tier: 'config' }
  return { ...base, tier: 'other' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ordering
// ─────────────────────────────────────────────────────────────────────────────

function byFixed(a: Candidate, b: Candidate): number {
  return a.sortDepth - b.sortDepth || a.weight - b.weight || a.size - b.size || cmp(a.path, b.path)
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Workflows named like the main pipelines come first. */
function workflowWeight(path: string): number {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (/\b(ci|build|test|tests|main)\b/.test(name.replace(/[._-]/g, ' '))) return 0
  if (/\b(deploy|release|publish|pages|cd)\b/.test(name.replace(/[._-]/g, ' '))) return 1
  return 2
}

/**
 * Spread files across the repo so every area is represented early:
 * a file's score is (its size-rank inside its folder) + (its depth), so the first, smallest file of every
 * folder comes before the tenth file of any one folder, and shallow folders come before deep ones.
 * Within the same score, top-level folders take turns (round-robin).
 */
function spread(items: Candidate[]): Candidate[] {
  if (items.length <= 1) return items
  const bySizeThenPath = (a: Candidate, b: Candidate) => a.size - b.size || cmp(a.path, b.path)

  const byDir = new Map<string, Candidate[]>()
  for (const c of items) {
    const list = byDir.get(c.dir)
    if (list) list.push(c)
    else byDir.set(c.dir, [c])
  }
  for (const list of byDir.values()) {
    list.sort(bySizeThenPath)
    for (let i = 0; i < list.length; i++) list[i].score = i + list[i].depth
  }

  const tops = [...new Set(items.map((c) => c.top))].sort(cmp)
  const topIndex = new Map(tops.map((t, i) => [t, i]))

  // Turn order inside each (score, top-level folder) bucket.
  const buckets = new Map<string, Candidate[]>()
  for (const c of items) {
    c.topIndex = topIndex.get(c.top) ?? 0
    const key = `${c.score}\u0000${c.top}`
    const list = buckets.get(key)
    if (list) list.push(c)
    else buckets.set(key, [c])
  }
  for (const list of buckets.values()) {
    list.sort(bySizeThenPath)
    for (let i = 0; i < list.length; i++) list[i].turn = i
  }

  return [...items].sort(
    (a, b) => a.score - b.score || a.turn - b.turn || a.topIndex - b.topIndex || bySizeThenPath(a, b),
  )
}

/** Build the overall priority order of every downloadable candidate. */
function orderCandidates(cands: Candidate[], maxFiles: number): Candidate[] {
  const tiers: Record<Tier, Candidate[]> = {
    'key-doc': [],
    manifest: [],
    entry: [],
    'area-readme': [],
    code: [],
    config: [],
    example: [],
    test: [],
    doc: [],
    other: [],
  }
  for (const c of cands) tiers[c.tier].push(c)

  const manifestCap = Math.max(20, Math.floor(maxFiles * 0.3))
  const workflowCap = 6
  const entryCap = Math.max(10, Math.floor(maxFiles * 0.15))
  const readmeCap = Math.max(5, Math.floor(maxFiles * 0.06))

  tiers['key-doc'].sort(byFixed)

  // Manifests: nearest the root first; workflows limited so they can't crowd out code.
  const manifests = tiers.manifest.sort((a, b) =>
    a.isWorkflow && b.isWorkflow ? workflowWeight(a.path) - workflowWeight(b.path) || byFixed(a, b) : byFixed(a, b),
  )
  const manifestFirst: Candidate[] = []
  const manifestLater: Candidate[] = []
  let workflows = 0
  for (const m of manifests) {
    if (m.isWorkflow) {
      if (workflows < workflowCap && manifestFirst.length < manifestCap) {
        workflows++
        manifestFirst.push(m)
      } else manifestLater.push(m)
    } else if (manifestFirst.length < manifestCap) manifestFirst.push(m)
    else manifestLater.push(m)
  }

  const entries = tiers.entry.sort(byFixed)
  const entryFirst = entries.slice(0, entryCap)
  const entryRest = entries.slice(entryCap)

  const readmes = tiers['area-readme'].sort(byFixed)
  const readmeFirst = readmes.slice(0, readmeCap)
  const readmeRest = readmes.slice(readmeCap)

  return [
    ...tiers['key-doc'],
    ...manifestFirst,
    ...entryFirst,
    ...readmeFirst,
    ...spread([...tiers.code, ...entryRest]),
    ...spread([...tiers.config, ...manifestLater]),
    ...spread(tiers.example),
    ...spread(tiers.test),
    ...spread([...tiers.doc, ...readmeRest]),
    ...spread(tiers.other),
  ]
}

/**
 * Decide which files' contents to download, most valuable first, within the depth's limits
 * (ANALYSIS_DEPTHS in src/core/labels.ts: maxFiles / maxTotalBytes).
 *
 * Priority: README(s) → package manifests & key config (package.json, pyproject.toml, go.mod, Cargo.toml, tsconfig.json,
 * Dockerfile, docker-compose, CI workflows …) → likely entry points (main/index/app/server/cli at shallow depth) →
 * source code (shallower first, spread across folders so every area is represented) → tests/docs.
 *
 * Never download: binaries/media (by extension), files > 512 KB, lockfiles, vendored/generated folders
 * (node_modules, vendor, dist, build, .next, target, __pycache__, coverage, *.min.js, *.map, generated protobufs …).
 * Those go to `skipped` with a reason. Files beyond the limit get reason 'limit'.
 *
 * Empty (0-byte) files are listed in `fetch` without counting toward the limits: they cost nothing to "read".
 * Every tree entry ends up in exactly one of `fetch` or `skipped`.
 */
export function selectFilesToFetch(
  tree: TreeEntry[],
  depth: AnalysisDepth,
): { fetch: string[]; skipped: { path: string; reason: SkipReason }[] } {
  const limits = ANALYSIS_DEPTHS[depth] ?? ANALYSIS_DEPTHS.standard
  const skipped: { path: string; reason: SkipReason }[] = []
  const cands: Candidate[] = []
  const seen = new Set<string>()

  for (const entry of tree) {
    if (!entry.path || seen.has(entry.path)) continue
    seen.add(entry.path)
    const reason = skipReasonFor(entry)
    if (reason) skipped.push({ path: entry.path, reason })
    else cands.push(classify(entry))
  }

  const ordered = orderCandidates(cands, limits.maxFiles)
  const fetch: string[] = []
  let count = 0
  let bytes = 0
  let freeEmpties = 0
  const maxFreeEmpties = limits.maxFiles * 2

  for (const c of ordered) {
    if (c.size === 0 && freeEmpties < maxFreeEmpties) {
      freeEmpties++
      fetch.push(c.path)
      continue
    }
    if (count < limits.maxFiles && bytes + c.size <= limits.maxTotalBytes) {
      count++
      bytes += c.size
      fetch.push(c.path)
    } else {
      skipped.push({ path: c.path, reason: 'limit' })
    }
  }

  return { fetch, skipped }
}
