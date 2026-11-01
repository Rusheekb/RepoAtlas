import type { GlossaryCategory, SymbolKind, TechCategory, TechItem } from '@/core/types'

/** Glossary categories in reading order, with friendly names. */
export const GLOSSARY_CATEGORY_INFO: Record<GlossaryCategory, { label: string; emoji: string }> = {
  basics: { label: 'The basics', emoji: '🌱' },
  web: { label: 'Websites & the internet', emoji: '🌐' },
  data: { label: 'Data & storage', emoji: '🗄️' },
  tools: { label: 'Tools of the trade', emoji: '🧰' },
  architecture: { label: 'How code is organized', emoji: '🏛️' },
  testing: { label: 'Testing', emoji: '✅' },
  devops: { label: 'Shipping & running', emoji: '🚀' },
  languages: { label: 'Languages', emoji: '🗣️' },
  security: { label: 'Security', emoji: '🔒' },
  ai: { label: 'AI', emoji: '🤖' },
}

export const GLOSSARY_CATEGORY_ORDER: GlossaryCategory[] = ['basics', 'web', 'data', 'tools', 'architecture', 'testing', 'devops', 'languages', 'security', 'ai']

/** What kind of technology something is, in a few everyday words. */
export const TECH_CATEGORY_LABEL: Record<TechCategory, string> = {
  language: 'Programming language',
  frontend: 'Builds what people see',
  backend: 'Server toolkit',
  mobile: 'Mobile apps',
  desktop: 'Desktop apps',
  database: 'Database',
  'data-science': 'Data analysis',
  ai: 'AI & machine learning',
  styling: 'Styling & looks',
  state: 'App memory',
  testing: 'Automatic checks',
  build: 'Build tool',
  quality: 'Code quality helper',
  infra: 'Servers & infrastructure',
  ci: 'Automation pipeline',
  docs: 'Documentation',
  api: 'Connections',
  auth: 'Sign-in & security',
  payments: 'Payments',
  cloud: 'Cloud service',
  cli: 'Command-line',
  game: 'Games',
  utility: 'Handy helper',
  'package-manager': 'Package manager',
}

export const TECH_IMPORTANCE_LABEL: Record<TechItem['importance'], string> = {
  core: 'A main ingredient',
  supporting: 'A helper',
  tooling: 'A developer tool',
}

/** Friendly names for the things code defines. */
export const SYMBOL_KIND_LABEL: Record<SymbolKind, string> = {
  function: 'Function',
  class: 'Class',
  component: 'Screen piece',
  hook: 'Reusable behavior',
  method: 'Method',
  interface: 'Shape',
  type: 'Type',
  enum: 'List of options',
  struct: 'Record',
  trait: 'Ability',
  constant: 'Fixed value',
  variable: 'Variable',
  module: 'Module',
}
