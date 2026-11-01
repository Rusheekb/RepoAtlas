import type { TechKnowledgeEntry } from './types'
import { LANGUAGE_ENTRIES } from './catalog/languages'
import { WEB_ENTRIES } from './catalog/web'
import { SERVER_ENTRIES } from './catalog/server'
import { DATA_ENTRIES } from './catalog/data'
import { APP_ENTRIES } from './catalog/apps'
import { TOOLING_ENTRIES } from './catalog/tooling'
import { INFRA_ENTRIES } from './catalog/infra'

/**
 * Built-in knowledge base of popular technologies, explained for non-technical readers.
 * 440+ entries across ecosystems (JS/TS, Python, Go, Rust, Ruby, PHP, Java/Kotlin, C#, Dart/Flutter, Swift),
 * databases, cloud, CI, containers, testing, styling, AI/ML. Ids are unique, kebab-case and stable.
 *
 * The data lives in ./catalog/*.ts, grouped by area; this file just stitches it together.
 */
export const TECH_CATALOG: TechKnowledgeEntry[] = [
  ...LANGUAGE_ENTRIES,
  ...WEB_ENTRIES,
  ...SERVER_ENTRIES,
  ...DATA_ENTRIES,
  ...APP_ENTRIES,
  ...TOOLING_ENTRIES,
  ...INFRA_ENTRIES,
]
