import { basename } from '@/core/paths'

export interface LanguageDef {
  /** Display name, e.g. "TypeScript" */
  name: string
  /** Hex color (GitHub linguist colors). */
  color: string
  /** true for programming languages (counted as "code"); false for markup/data/prose/config formats. */
  isCode: boolean
}

/**
 * Broad language families. Consumers branch on these instead of on dozens of display names
 * (e.g. every JavaScript-flavored file — TS, TSX, Vue, Svelte, Astro — is 'js').
 */
export type LanguageFamily =
  | 'js'
  | 'python'
  | 'go'
  | 'rust'
  | 'jvm'
  | 'csharp'
  | 'c'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'dart'
  | 'elixir'
  | 'lua'
  | 'r'
  | 'shell'
  | 'css'
  | 'html'
  | 'other'

export const LANGUAGE_FAMILIES: readonly LanguageFamily[] = [
  'js',
  'python',
  'go',
  'rust',
  'jvm',
  'csharp',
  'c',
  'ruby',
  'php',
  'swift',
  'dart',
  'elixir',
  'lua',
  'r',
  'shell',
  'css',
  'html',
  'other',
] as const

interface LangSpec {
  color: string
  isCode: boolean
  family: LanguageFamily
}

const NEUTRAL = '#9b9a94'

/** Display name → spec. Colors follow GitHub linguist. */
const LANGS: Record<string, LangSpec> = {
  // JavaScript family
  TypeScript: { color: '#3178c6', isCode: true, family: 'js' },
  // Linguist gives TSX the same blue as TypeScript; shift it so charts can tell the two apart.
  TSX: { color: '#235a97', isCode: true, family: 'js' },
  JavaScript: { color: '#f1e05a', isCode: true, family: 'js' },
  Vue: { color: '#41b883', isCode: true, family: 'js' },
  Svelte: { color: '#ff3e00', isCode: true, family: 'js' },
  Astro: { color: '#ff5a03', isCode: true, family: 'js' },
  CoffeeScript: { color: '#244776', isCode: true, family: 'other' },
  // Python
  Python: { color: '#3572A5', isCode: true, family: 'python' },
  Cython: { color: '#fedf5b', isCode: true, family: 'python' },
  'Jupyter Notebook': { color: '#DA5B0B', isCode: true, family: 'python' },
  Starlark: { color: '#76d275', isCode: true, family: 'other' },
  // Systems & compiled
  Go: { color: '#00ADD8', isCode: true, family: 'go' },
  Rust: { color: '#dea584', isCode: true, family: 'rust' },
  C: { color: '#555555', isCode: true, family: 'c' },
  'C++': { color: '#f34b7d', isCode: true, family: 'c' },
  'Objective-C': { color: '#438eff', isCode: true, family: 'c' },
  'Objective-C++': { color: '#6866fb', isCode: true, family: 'c' },
  Cuda: { color: '#3A4E3A', isCode: true, family: 'c' },
  Metal: { color: '#8f14e9', isCode: true, family: 'c' },
  GLSL: { color: '#5686a5', isCode: true, family: 'other' },
  HLSL: { color: '#aace60', isCode: true, family: 'other' },
  Zig: { color: '#ec915c', isCode: true, family: 'other' },
  Nim: { color: '#ffc200', isCode: true, family: 'other' },
  D: { color: '#ba595e', isCode: true, family: 'other' },
  V: { color: '#4f87c4', isCode: true, family: 'other' },
  Verilog: { color: '#b2b7f8', isCode: true, family: 'other' },
  VHDL: { color: '#adb2cb', isCode: true, family: 'other' },
  Assembly: { color: '#6E4C13', isCode: true, family: 'other' },
  Fortran: { color: '#4d41b1', isCode: true, family: 'other' },
  WebAssembly: { color: '#04133b', isCode: true, family: 'other' },
  // JVM
  Java: { color: '#b07219', isCode: true, family: 'jvm' },
  Kotlin: { color: '#A97BFF', isCode: true, family: 'jvm' },
  Scala: { color: '#c22d40', isCode: true, family: 'jvm' },
  Groovy: { color: '#4298b8', isCode: true, family: 'jvm' },
  Gradle: { color: '#02303a', isCode: true, family: 'jvm' },
  Clojure: { color: '#db5855', isCode: true, family: 'other' },
  // .NET
  'C#': { color: '#178600', isCode: true, family: 'csharp' },
  'F#': { color: '#b845fc', isCode: true, family: 'other' },
  'Visual Basic .NET': { color: '#945db7', isCode: true, family: 'other' },
  // Apple & mobile
  Swift: { color: '#F05138', isCode: true, family: 'swift' },
  Dart: { color: '#00B4AB', isCode: true, family: 'dart' },
  // Scripting
  Ruby: { color: '#701516', isCode: true, family: 'ruby' },
  Crystal: { color: '#000100', isCode: true, family: 'other' },
  PHP: { color: '#4F5D95', isCode: true, family: 'php' },
  Blade: { color: '#f7523f', isCode: true, family: 'php' },
  Hack: { color: '#878787', isCode: true, family: 'php' },
  Perl: { color: '#0298c3', isCode: true, family: 'other' },
  Raku: { color: '#0000fb', isCode: true, family: 'other' },
  Lua: { color: '#000080', isCode: true, family: 'lua' },
  Luau: { color: '#00A2FF', isCode: true, family: 'lua' },
  R: { color: '#198CE7', isCode: true, family: 'r' },
  'R Markdown': { color: '#198CE7', isCode: false, family: 'other' },
  Julia: { color: '#a270ba', isCode: true, family: 'other' },
  MATLAB: { color: '#e16737', isCode: true, family: 'other' },
  Tcl: { color: '#e4cc98', isCode: true, family: 'other' },
  Shell: { color: '#89e051', isCode: true, family: 'shell' },
  fish: { color: '#4aae47', isCode: true, family: 'shell' },
  PowerShell: { color: '#012456', isCode: true, family: 'other' },
  Batchfile: { color: '#C1F12E', isCode: true, family: 'other' },
  'Vim Script': { color: '#199f4b', isCode: true, family: 'other' },
  AWK: { color: '#c30e9b', isCode: true, family: 'other' },
  // Functional
  Elixir: { color: '#6e4a7e', isCode: true, family: 'elixir' },
  Erlang: { color: '#B83998', isCode: true, family: 'other' },
  Haskell: { color: '#5e5086', isCode: true, family: 'other' },
  Elm: { color: '#60B5CC', isCode: true, family: 'other' },
  PureScript: { color: '#1D222D', isCode: true, family: 'other' },
  OCaml: { color: '#ef7a08', isCode: true, family: 'other' },
  ReScript: { color: '#ed5051', isCode: true, family: 'other' },
  Gleam: { color: '#ffaff3', isCode: true, family: 'other' },
  'Common Lisp': { color: '#3fb68b', isCode: true, family: 'other' },
  Scheme: { color: '#1e4aec', isCode: true, family: 'other' },
  Racket: { color: '#3c5caa', isCode: true, family: 'other' },
  'Emacs Lisp': { color: '#c065db', isCode: true, family: 'other' },
  Prolog: { color: '#74283c', isCode: true, family: 'other' },
  // Other programming
  Solidity: { color: '#AA6746', isCode: true, family: 'other' },
  Vyper: { color: '#2980b9', isCode: true, family: 'other' },
  Move: { color: '#4a137a', isCode: true, family: 'other' },
  Cairo: { color: '#ff4a48', isCode: true, family: 'other' },
  Haxe: { color: '#df7900', isCode: true, family: 'other' },
  Apex: { color: '#1797c0', isCode: true, family: 'jvm' },
  GDScript: { color: '#355570', isCode: true, family: 'other' },
  Pascal: { color: '#E3F171', isCode: true, family: 'other' },
  Ada: { color: '#02f88c', isCode: true, family: 'other' },
  COBOL: { color: NEUTRAL, isCode: true, family: 'other' },
  SQL: { color: '#e38c00', isCode: true, family: 'other' },
  PLpgSQL: { color: '#336790', isCode: true, family: 'other' },
  GraphQL: { color: '#e10098', isCode: true, family: 'other' },
  'Protocol Buffer': { color: '#4285f4', isCode: true, family: 'other' },
  Thrift: { color: '#D12127', isCode: true, family: 'other' },
  Prisma: { color: '#0c344b', isCode: true, family: 'other' },
  // Web markup & styles
  HTML: { color: '#e34c26', isCode: true, family: 'html' },
  CSS: { color: '#663399', isCode: true, family: 'css' },
  SCSS: { color: '#c6538c', isCode: true, family: 'css' },
  Sass: { color: '#a53b70', isCode: true, family: 'css' },
  Less: { color: '#1d365d', isCode: true, family: 'css' },
  Stylus: { color: '#ff6347', isCode: true, family: 'css' },
  PostCSS: { color: '#dc3a0c', isCode: true, family: 'css' },
  Handlebars: { color: '#f7931e', isCode: true, family: 'html' },
  Pug: { color: '#a86454', isCode: true, family: 'other' },
  EJS: { color: '#a91e50', isCode: true, family: 'html' },
  Twig: { color: '#c1d026', isCode: true, family: 'html' },
  Liquid: { color: '#67b8de', isCode: true, family: 'html' },
  Jinja: { color: '#a52a22', isCode: true, family: 'html' },
  Mustache: { color: '#724b3b', isCode: true, family: 'html' },
  // Build & infrastructure
  Dockerfile: { color: '#384d54', isCode: true, family: 'other' },
  Makefile: { color: '#427819', isCode: true, family: 'other' },
  CMake: { color: '#DA3434', isCode: true, family: 'other' },
  Meson: { color: '#007800', isCode: true, family: 'other' },
  Just: { color: '#384d54', isCode: true, family: 'other' },
  Nix: { color: '#7e7eff', isCode: true, family: 'other' },
  HCL: { color: '#844FBA', isCode: true, family: 'other' },
  Puppet: { color: '#302B6D', isCode: true, family: 'other' },
  Bicep: { color: '#519aba', isCode: true, family: 'other' },
  Nginx: { color: '#009639', isCode: false, family: 'other' },
  Caddyfile: { color: '#22b638', isCode: false, family: 'other' },
  // Prose
  Markdown: { color: '#083fa1', isCode: false, family: 'other' },
  MDX: { color: '#fcb32c', isCode: false, family: 'other' },
  reStructuredText: { color: '#141414', isCode: false, family: 'other' },
  AsciiDoc: { color: '#73a0c5', isCode: false, family: 'other' },
  Org: { color: '#77aa99', isCode: false, family: 'other' },
  TeX: { color: '#3D6117', isCode: false, family: 'other' },
  BibTeX: { color: '#778899', isCode: false, family: 'other' },
  Text: { color: NEUTRAL, isCode: false, family: 'other' },
  // Data & config
  JSON: { color: '#292929', isCode: false, family: 'other' },
  JSON5: { color: '#267CB9', isCode: false, family: 'other' },
  YAML: { color: '#cb171e', isCode: false, family: 'other' },
  TOML: { color: '#9c4221', isCode: false, family: 'other' },
  XML: { color: '#0060ac', isCode: false, family: 'other' },
  SVG: { color: '#ff9900', isCode: false, family: 'other' },
  INI: { color: '#d1dbe0', isCode: false, family: 'other' },
  CSV: { color: '#237346', isCode: false, family: 'other' },
  TSV: { color: '#237346', isCode: false, family: 'other' },
  Dotenv: { color: '#e5d559', isCode: false, family: 'other' },
  EditorConfig: { color: '#fff1f2', isCode: false, family: 'other' },
  'Ignore List': { color: '#000000', isCode: false, family: 'other' },
  'Git Config': { color: '#F44D27', isCode: false, family: 'other' },
  'Git Attributes': { color: '#F44D27', isCode: false, family: 'other' },
  'Go Module': { color: '#00ADD8', isCode: false, family: 'other' },
  'Go Checksums': { color: '#00ADD8', isCode: false, family: 'other' },
  'Pip Requirements': { color: '#FFD343', isCode: false, family: 'other' },
  Procfile: { color: '#3B2F63', isCode: false, family: 'other' },
  Diff: { color: NEUTRAL, isCode: false, family: 'other' },
  Lockfile: { color: NEUTRAL, isCode: false, family: 'other' },
}

/** Lower-case extension (no dot) → display name. */
const EXTENSIONS: Record<string, string> = {
  ts: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  es6: 'JavaScript',
  vue: 'Vue',
  svelte: 'Svelte',
  astro: 'Astro',
  coffee: 'CoffeeScript',
  py: 'Python',
  pyw: 'Python',
  pyi: 'Python',
  pyx: 'Cython',
  pxd: 'Cython',
  ipynb: 'Jupyter Notebook',
  bzl: 'Starlark',
  star: 'Starlark',
  go: 'Go',
  rs: 'Rust',
  c: 'C',
  h: 'C',
  cc: 'C++',
  cpp: 'C++',
  cxx: 'C++',
  'c++': 'C++',
  hh: 'C++',
  hpp: 'C++',
  hxx: 'C++',
  'h++': 'C++',
  ipp: 'C++',
  tpp: 'C++',
  ino: 'C++',
  m: 'Objective-C',
  mm: 'Objective-C++',
  cu: 'Cuda',
  cuh: 'Cuda',
  metal: 'Metal',
  glsl: 'GLSL',
  vert: 'GLSL',
  frag: 'GLSL',
  hlsl: 'HLSL',
  zig: 'Zig',
  nim: 'Nim',
  d: 'D',
  v: 'Verilog',
  sv: 'Verilog',
  vhd: 'VHDL',
  vhdl: 'VHDL',
  asm: 'Assembly',
  s: 'Assembly',
  f: 'Fortran',
  f90: 'Fortran',
  f95: 'Fortran',
  for: 'Fortran',
  wat: 'WebAssembly',
  java: 'Java',
  kt: 'Kotlin',
  kts: 'Kotlin',
  scala: 'Scala',
  sc: 'Scala',
  groovy: 'Groovy',
  gvy: 'Groovy',
  gradle: 'Gradle',
  clj: 'Clojure',
  cljs: 'Clojure',
  cljc: 'Clojure',
  edn: 'Clojure',
  cs: 'C#',
  csx: 'C#',
  fs: 'F#',
  fsx: 'F#',
  fsi: 'F#',
  vb: 'Visual Basic .NET',
  swift: 'Swift',
  dart: 'Dart',
  rb: 'Ruby',
  rake: 'Ruby',
  gemspec: 'Ruby',
  ru: 'Ruby',
  erb: 'HTML',
  cr: 'Crystal',
  php: 'PHP',
  phtml: 'PHP',
  php3: 'PHP',
  php4: 'PHP',
  php5: 'PHP',
  phps: 'PHP',
  hack: 'Hack',
  pl: 'Perl',
  pm: 'Perl',
  t: 'Perl',
  raku: 'Raku',
  lua: 'Lua',
  luau: 'Luau',
  r: 'R',
  rmd: 'R Markdown',
  jl: 'Julia',
  tcl: 'Tcl',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  ksh: 'Shell',
  command: 'Shell',
  fish: 'fish',
  ps1: 'PowerShell',
  psm1: 'PowerShell',
  psd1: 'PowerShell',
  bat: 'Batchfile',
  cmd: 'Batchfile',
  vim: 'Vim Script',
  awk: 'AWK',
  ex: 'Elixir',
  exs: 'Elixir',
  heex: 'Elixir',
  erl: 'Erlang',
  hrl: 'Erlang',
  hs: 'Haskell',
  lhs: 'Haskell',
  elm: 'Elm',
  purs: 'PureScript',
  ml: 'OCaml',
  mli: 'OCaml',
  res: 'ReScript',
  resi: 'ReScript',
  gleam: 'Gleam',
  lisp: 'Common Lisp',
  lsp: 'Common Lisp',
  cl: 'Common Lisp',
  scm: 'Scheme',
  ss: 'Scheme',
  rkt: 'Racket',
  el: 'Emacs Lisp',
  sol: 'Solidity',
  vy: 'Vyper',
  move: 'Move',
  cairo: 'Cairo',
  hx: 'Haxe',
  cls: 'Apex',
  trigger: 'Apex',
  gd: 'GDScript',
  pas: 'Pascal',
  pp: 'Puppet',
  adb: 'Ada',
  ads: 'Ada',
  cob: 'COBOL',
  cbl: 'COBOL',
  sql: 'SQL',
  psql: 'PLpgSQL',
  pgsql: 'PLpgSQL',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  graphqls: 'GraphQL',
  proto: 'Protocol Buffer',
  thrift: 'Thrift',
  prisma: 'Prisma',
  html: 'HTML',
  htm: 'HTML',
  xhtml: 'HTML',
  css: 'CSS',
  pcss: 'PostCSS',
  postcss: 'PostCSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  styl: 'Stylus',
  hbs: 'Handlebars',
  handlebars: 'Handlebars',
  pug: 'Pug',
  jade: 'Pug',
  ejs: 'EJS',
  twig: 'Twig',
  liquid: 'Liquid',
  jinja: 'Jinja',
  jinja2: 'Jinja',
  j2: 'Jinja',
  njk: 'Jinja',
  mustache: 'Mustache',
  dockerfile: 'Dockerfile',
  mk: 'Makefile',
  mak: 'Makefile',
  make: 'Makefile',
  cmake: 'CMake',
  just: 'Just',
  nix: 'Nix',
  tf: 'HCL',
  tfvars: 'HCL',
  hcl: 'HCL',
  bicep: 'Bicep',
  md: 'Markdown',
  markdown: 'Markdown',
  mdown: 'Markdown',
  mkd: 'Markdown',
  mdx: 'MDX',
  rst: 'reStructuredText',
  adoc: 'AsciiDoc',
  asciidoc: 'AsciiDoc',
  org: 'Org',
  tex: 'TeX',
  sty: 'TeX',
  bib: 'BibTeX',
  txt: 'Text',
  text: 'Text',
  json: 'JSON',
  jsonc: 'JSON',
  json5: 'JSON5',
  geojson: 'JSON',
  webmanifest: 'JSON',
  har: 'JSON',
  yml: 'YAML',
  yaml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  xsd: 'XML',
  xsl: 'XML',
  xslt: 'XML',
  plist: 'XML',
  csproj: 'XML',
  fsproj: 'XML',
  vbproj: 'XML',
  props: 'XML',
  targets: 'XML',
  resx: 'XML',
  xaml: 'XML',
  storyboard: 'XML',
  xib: 'XML',
  svg: 'SVG',
  ini: 'INI',
  cfg: 'INI',
  conf: 'INI',
  properties: 'INI',
  csv: 'CSV',
  tsv: 'TSV',
  env: 'Dotenv',
  diff: 'Diff',
  patch: 'Diff',
  lock: 'Lockfile',
}

/** Exact lower-case basenames → display name. */
const BASENAMES: Record<string, string> = {
  dockerfile: 'Dockerfile',
  containerfile: 'Dockerfile',
  makefile: 'Makefile',
  gnumakefile: 'Makefile',
  'makefile.am': 'Makefile',
  'makefile.in': 'Makefile',
  'cmakelists.txt': 'CMake',
  'meson.build': 'Meson',
  justfile: 'Just',
  '.justfile': 'Just',
  gemfile: 'Ruby',
  rakefile: 'Ruby',
  podfile: 'Ruby',
  vagrantfile: 'Ruby',
  brewfile: 'Ruby',
  guardfile: 'Ruby',
  capfile: 'Ruby',
  fastfile: 'Ruby',
  appfile: 'Ruby',
  dangerfile: 'Ruby',
  berksfile: 'Ruby',
  thorfile: 'Ruby',
  '.irbrc': 'Ruby',
  '.pryrc': 'Ruby',
  jenkinsfile: 'Groovy',
  procfile: 'Procfile',
  'build.bazel': 'Starlark',
  'workspace.bazel': 'Starlark',
  'module.bazel': 'Starlark',
  tiltfile: 'Starlark',
  sconstruct: 'Python',
  sconscript: 'Python',
  snakefile: 'Python',
  '.bashrc': 'Shell',
  '.bash_profile': 'Shell',
  '.bash_aliases': 'Shell',
  '.bash_logout': 'Shell',
  '.zshrc': 'Shell',
  '.zshenv': 'Shell',
  '.zprofile': 'Shell',
  '.zlogin': 'Shell',
  '.profile': 'Shell',
  '.envrc': 'Shell',
  pkgbuild: 'Shell',
  gradlew: 'Shell',
  '.vimrc': 'Vim Script',
  '_vimrc': 'Vim Script',
  '.gvimrc': 'Vim Script',
  caddyfile: 'Caddyfile',
  'nginx.conf': 'Nginx',
  'go.mod': 'Go Module',
  'go.work': 'Go Module',
  'go.sum': 'Go Checksums',
  'go.work.sum': 'Go Checksums',
  pipfile: 'TOML',
  'cargo.lock': 'Lockfile',
  'poetry.lock': 'Lockfile',
  'uv.lock': 'Lockfile',
  'pdm.lock': 'Lockfile',
  'gemfile.lock': 'Lockfile',
  'podfile.lock': 'Lockfile',
  'mix.lock': 'Lockfile',
  'pubspec.lock': 'Lockfile',
  'composer.lock': 'Lockfile',
  'package-lock.json': 'Lockfile',
  'npm-shrinkwrap.json': 'Lockfile',
  'yarn.lock': 'Lockfile',
  'pnpm-lock.yaml': 'Lockfile',
  'bun.lock': 'Lockfile',
  'pipfile.lock': 'Lockfile',
  'flake.lock': 'Lockfile',
  'deno.lock': 'Lockfile',
  'packages.lock.json': 'Lockfile',
  'gradle.lockfile': 'Lockfile',
  'package.resolved': 'Lockfile',
  '.babelrc': 'JSON',
  '.eslintrc': 'JSON',
  '.prettierrc': 'JSON',
  '.swcrc': 'JSON',
  '.jshintrc': 'JSON',
  '.stylelintrc': 'JSON',
  '.watchmanconfig': 'JSON',
  '.npmrc': 'INI',
  '.yarnrc': 'YAML',
  '.pylintrc': 'INI',
  '.flake8': 'INI',
  'setup.cfg': 'INI',
  'tox.ini': 'INI',
  '.gitconfig': 'Git Config',
  '.gitmodules': 'Git Config',
  '.gitattributes': 'Git Attributes',
  '.editorconfig': 'EditorConfig',
  '.gitignore': 'Ignore List',
  '.dockerignore': 'Ignore List',
  '.npmignore': 'Ignore List',
  '.prettierignore': 'Ignore List',
  '.eslintignore': 'Ignore List',
  '.stylelintignore': 'Ignore List',
  '.vercelignore': 'Ignore List',
  '.gcloudignore': 'Ignore List',
  '.helmignore': 'Ignore List',
  '.slugignore': 'Ignore List',
  '.hgignore': 'Ignore List',
  '.env': 'Dotenv',
  '.clang-format': 'YAML',
  '.clang-tidy': 'YAML',
  '.nvmrc': 'Text',
  '.node-version': 'Text',
  '.python-version': 'Text',
  '.ruby-version': 'Text',
  '.tool-versions': 'Text',
  license: 'Text',
  licence: 'Text',
  copying: 'Text',
  authors: 'Text',
  contributors: 'Text',
  notice: 'Text',
  changelog: 'Text',
  readme: 'Text',
  codeowners: 'Text',
  owners: 'Text',
  version: 'Text',
}

/** Compound suffixes checked before the plain extension (longest first). */
const SUFFIXES: [suffix: string, name: string][] = [
  ['.blade.php', 'Blade'],
  ['.gradle.kts', 'Kotlin'],
  ['.html.erb', 'HTML'],
  ['.d.mts', 'TypeScript'],
  ['.d.cts', 'TypeScript'],
  ['.d.ts', 'TypeScript'],
  ['.html.twig', 'Twig'],
  ['.lock.json', 'Lockfile'],
]

/** Case-insensitive name → canonical display name (built lazily). */
let byLowerName: Map<string, string> | null = null

function canonicalName(name: string): string | null {
  if (LANGS[name]) return name
  if (!byLowerName) {
    byLowerName = new Map()
    for (const key of Object.keys(LANGS)) byLowerName.set(key.toLowerCase(), key)
  }
  return byLowerName.get(name.toLowerCase()) ?? null
}

function def(name: string): LanguageDef {
  const spec = LANGS[name]
  return { name, color: spec.color, isCode: spec.isCode }
}

/** Case-sensitive basenames (lower-case versions are often unrelated scripts). */
const EXACT_BASENAMES: Record<string, string> = {
  BUILD: 'Starlark',
  WORKSPACE: 'Starlark',
  BUCK: 'Starlark',
}

function nameFromBasename(base: string): string | null {
  const exactCase = EXACT_BASENAMES[base]
  if (exactCase) return exactCase
  const lower = base.toLowerCase()
  const exact = BASENAMES[lower]
  if (exact) return exact
  // Dockerfile variants: Dockerfile.dev, dev.Dockerfile, Containerfile.prod
  if (/^(docker|container)file[._-]/.test(lower) || lower.endsWith('.dockerfile')) return 'Dockerfile'
  if (/^makefile[._-]/.test(lower)) return 'Makefile'
  if (/^(jenkinsfile)[._-]/.test(lower)) return 'Groovy'
  if (/^\.env[._-]/.test(lower) || lower.endsWith('.env')) return 'Dotenv'
  if (/^requirements([._-][\w.-]*)?\.(txt|in)$/.test(lower) || /^constraints[\w.-]*\.txt$/.test(lower)) return 'Pip Requirements'
  if (/^\.(babelrc|eslintrc|prettierrc|stylelintrc|swcrc)\.json5?$/.test(lower)) return 'JSON'
  if (/^\.(eslintrc|prettierrc|stylelintrc)\.ya?ml$/.test(lower)) return 'YAML'
  if (lower.endsWith('ignore') && lower.startsWith('.') && !lower.includes('.', 1)) return 'Ignore List'
  for (const [suffix, name] of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length > suffix.length) return name
  }
  return null
}

/**
 * Detect a file's language from its path (extension, special basenames like Dockerfile/Makefile/Gemfile/.bashrc,
 * and compound names like "*.d.ts"). Returns null for unknown / binary types.
 * Covers 150+ languages & formats with GitHub-linguist display names and colors.
 */
export function detectLanguage(path: string): LanguageDef | null {
  const base = basename(path)
  if (!base) return null
  const special = nameFromBasename(base)
  if (special) return def(special)
  const dot = base.lastIndexOf('.')
  if (dot === -1 || dot === base.length - 1) return null
  const ext = base.slice(dot + 1)
  // ".R" and ".r" are both R; extensions are matched case-insensitively.
  const name = EXTENSIONS[ext.toLowerCase()]
  return name ? def(name) : null
}

/** Color for a language display name (fallback neutral gray). Case-insensitive. */
export function languageColor(name: string): string {
  const canonical = canonicalName(name)
  return canonical ? LANGS[canonical].color : NEUTRAL
}

/** Whether a display name is a programming language (vs. prose / data / config). Unknown names → false. */
export function isCodeLanguage(name: string | null | undefined): boolean {
  if (!name) return false
  const canonical = canonicalName(name)
  return canonical ? LANGS[canonical].isCode : false
}

/** Look up a language by display name (case-insensitive). */
export function languageByName(name: string): LanguageDef | null {
  const canonical = canonicalName(name)
  return canonical ? def(canonical) : null
}

/**
 * The broad family a language belongs to, so consumers can branch on syntax style.
 * Accepts a display name ("TypeScript", "Kotlin", "Jupyter Notebook") or a family id itself ("js"), case-insensitively.
 * Unknown names, prose and data formats → 'other'.
 */
export function languageFamily(name: string | null | undefined): LanguageFamily {
  if (!name) return 'other'
  const canonical = canonicalName(name)
  if (canonical) return LANGS[canonical].family
  const lower = name.toLowerCase()
  if ((LANGUAGE_FAMILIES as readonly string[]).includes(lower)) return lower as LanguageFamily
  switch (lower) {
    case 'jsx':
    case 'ts':
    case 'mjs':
    case 'cjs':
    case 'javascriptreact':
    case 'typescriptreact':
      return 'js'
    case 'py':
      return 'python'
    case 'golang':
      return 'go'
    case 'rs':
      return 'rust'
    case 'cpp':
    case 'objc':
    case 'objective-c':
    case 'c/c++':
      return 'c'
    case 'cs':
    case 'csharp':
      return 'csharp'
    case 'kt':
    case 'java':
      return 'jvm'
    case 'bash':
    case 'sh':
    case 'zsh':
      return 'shell'
    default:
      return 'other'
  }
}

/** Convenience: family for a path (detects the language first). */
export function familyForPath(path: string): LanguageFamily {
  return languageFamily(detectLanguage(path)?.name ?? null)
}
