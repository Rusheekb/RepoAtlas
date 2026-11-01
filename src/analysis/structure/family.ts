/**
 * Broad language families, so the structure code can branch on syntax style instead of dozens of display names.
 * Deliberately local (a tiny mirror of the languages module's own family table) so this area does not depend on
 * that module's internal exports.
 */
export type Family =
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

const BY_NAME: Record<string, Family> = {
  typescript: 'js',
  tsx: 'js',
  javascript: 'js',
  jsx: 'js',
  vue: 'js',
  svelte: 'js',
  astro: 'js',
  python: 'python',
  cython: 'python',
  'jupyter notebook': 'python',
  go: 'go',
  rust: 'rust',
  java: 'jvm',
  kotlin: 'jvm',
  scala: 'jvm',
  groovy: 'jvm',
  apex: 'jvm',
  'c#': 'csharp',
  c: 'c',
  'c++': 'c',
  'objective-c': 'c',
  'objective-c++': 'c',
  cuda: 'c',
  metal: 'c',
  ruby: 'ruby',
  php: 'php',
  blade: 'php',
  hack: 'php',
  swift: 'swift',
  dart: 'dart',
  elixir: 'elixir',
  lua: 'lua',
  luau: 'lua',
  r: 'r',
  shell: 'shell',
  fish: 'shell',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  stylus: 'css',
  postcss: 'css',
  html: 'html',
  handlebars: 'html',
  ejs: 'html',
  twig: 'html',
  liquid: 'html',
  jinja: 'html',
  mustache: 'html',
}

/** Family for a display language name ("TypeScript" → "js"). Unknown / null → "other". */
export function familyOf(language: string | null | undefined): Family {
  if (!language) return 'other'
  return BY_NAME[language.toLowerCase()] ?? 'other'
}

/** Package ecosystem used by a language family (for looking packages up in the tech catalog). */
export function ecosystemOf(family: Family): 'npm' | 'pypi' | 'go' | 'cargo' | 'gem' | 'composer' | 'maven' | 'nuget' | 'pub' | 'swift' | null {
  switch (family) {
    case 'js':
      return 'npm'
    case 'python':
      return 'pypi'
    case 'go':
      return 'go'
    case 'rust':
      return 'cargo'
    case 'ruby':
      return 'gem'
    case 'php':
      return 'composer'
    case 'jvm':
      return 'maven'
    case 'csharp':
      return 'nuget'
    case 'dart':
      return 'pub'
    case 'swift':
      return 'swift'
    default:
      return null
  }
}
