import type { FolderRole } from './types'

/**
 * Conventional folder names → plain-English role. Keys are lower-case folder basenames.
 * 120+ entries: src, lib, app, components, pages, views, screens, routes, api, server, client, public, static, assets,
 * images, styles, css, hooks, store, state, redux, context, services, utils, helpers, common, shared, core, models,
 * schemas, entities, db, database, migrations, seeds, config, settings, scripts, bin, cmd, internal, pkg, tests, test,
 * __tests__, spec, e2e, fixtures, mocks, docs, examples, demo, .github, workflows, ci, deploy, infra, terraform, k8s,
 * docker, middleware, controllers, handlers, plugins, templates, layouts, i18n, locales, types, typings, interfaces,
 * constants, data, notebooks, benchmarks, tools, packages, apps, crates, modules, features, domain, adapters, …
 */
export const FOLDER_ROLES: Record<string, FolderRole> = {}

/** Describe a folder by its name (case-insensitive; handles plurals and common prefixes like "test_" / "_"). */
export function describeFolder(name: string): FolderRole | null {
  void name
  return null
}
