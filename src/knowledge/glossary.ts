import type { GlossaryTerm, Layer, ProjectKindId, FileRole } from '@/core/types'

/**
 * 150+ technical terms explained in plain English with analogies. Ids are kebab-case.
 * Must include at least: api, function, class, component, module, import, dependency, package, framework, library,
 * database, server, client, frontend, backend, route, endpoint, middleware, state, hook, props, async, promise,
 * callback, test, unit-test, ci-cd, container, docker, environment-variable, config, build, compile, bundle,
 * package-manager, repository, commit, branch, json, yaml, schema, orm, migration, query, cache, authentication,
 * authorization, token, cookie, session, rest, graphql, websocket, http, request, response, type, interface,
 * variable, loop, recursion, algorithm, cli, sdk, deployment, linting, typescript, runtime, nodejs, event,
 * handler, render, dom, css, html, responsive, accessibility, model, controller, view, mvc, monorepo, entry-point,
 * script, terminal, open-source, license, readme, pull-request, issue, version-control, git, markdown, regex,
 * concurrency, thread, queue, webhook, oauth, encryption, hash, serialization, parsing, template, plugin,
 * microservice, load-balancer, cloud, serverless, kubernetes, infrastructure-as-code, logging, error-handling,
 * exception, null, boolean, string, array, object, dictionary, decorator, generics, inheritance, interface,
 * dependency-injection, singleton, factory, observer, reactive, virtual-dom, spa, ssr, static-site, cdn, dns,
 * port, localhost, ip-address, url, query-string, crud, sql, nosql, index, transaction, machine-learning,
 * neural-network, training, inference, llm, prompt, embedding, dataframe, notebook.
 */
export const GLOSSARY: GlossaryTerm[] = []

export function getTerm(id: string): GlossaryTerm | undefined {
  void id
  return undefined
}

/** Glossary ids relevant to a repo, most relevant first (≈20–40 ids). */
export function findRelevantTerms(input: {
  techIds: string[]
  roles: FileRole[]
  layers: Layer[]
  projectKind: ProjectKindId
  languages: string[]
}): string[] {
  void input
  return []
}

/**
 * Find glossary terms mentioned in a piece of plain text (whole-word, case-insensitive, matching term + aliases),
 * for auto-linking. Returns non-overlapping matches sorted by position; at most one match per term
 * (the first occurrence) unless `allOccurrences` is true.
 */
export function findTermsInText(text: string, opts?: { allOccurrences?: boolean; only?: string[] }): { start: number; end: number; termId: string }[] {
  void text; void opts
  return []
}
