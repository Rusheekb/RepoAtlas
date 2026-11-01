import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'
import { basename, joinPath } from '@/core/paths'
import type { ParseContext } from './util'
import {
  braceBlockAfter,
  collapseSpace,
  isRecord,
  linesOf,
  removeXmlElements,
  resolveJvmClass,
  stripBlockComments,
  stripHashComment,
  stripLineComments,
  xmlElements,
  xmlText,
} from './util'

// ── XML helpers ─────────────────────────────────────────────────────────────

function stripXmlComments(xml: string): string {
  return stripBlockComments(xml, '<!--', '-->')
}

// ── Maven ───────────────────────────────────────────────────────────────────

/** pom.xml: dependencies as "groupId:artifactId" (test scope → dev), the parent POM, modules, name, description, main class. */
export function parsePomXml(ctx: ParseContext): void {
  const xml = stripXmlComments(ctx.text)
  const { out, path } = ctx
  const parent = xmlElements(xml, 'parent')[0]
  if (parent !== undefined) {
    const g = xmlText(parent, 'groupId')
    const a = xmlText(parent, 'artifactId')
    if (g && a) out.addDep('maven', `${g}:${a}`, { dev: false, source: path, section: 'parent', version: xmlText(parent, 'version') })
  }
  // Managed versions and build plugins are not things the project itself uses.
  const body = removeXmlElements(removeXmlElements(removeXmlElements(xml, 'dependencyManagement'), 'build'), 'reporting')
  for (const d of xmlElements(body, 'dependency')) {
    const g = xmlText(d, 'groupId')
    const a = xmlText(d, 'artifactId')
    if (!g || !a) continue
    const dev = xmlText(d, 'scope') === 'test'
    out.addDep('maven', `${g}:${a}`, { dev, source: path, section: dev ? 'test dependencies' : 'dependencies', version: xmlText(d, 'version') })
  }
  const own = removeXmlElements(removeXmlElements(body, 'parent'), 'dependencies')
  out.addName(xmlText(own, 'name') ?? xmlText(own, 'artifactId'))
  out.addDescription(xmlText(own, 'description'))
  const modules = xmlElements(xml, 'modules')[0]
  if (modules !== undefined) for (const m of xmlElements(modules, 'module')) out.addWorkspace(ctx.dir, m.trim())
  const mainClass = xmlText(xml, 'mainClass') ?? xmlText(xml, 'start-class') ?? xmlText(xml, 'exec\\.mainClass')
  if (mainClass) out.addEntry(resolveJvmClass(mainClass, ctx.paths), 'pom.xml names this as the main class (where the program starts)')
}

// ── Gradle ──────────────────────────────────────────────────────────────────

const GRADLE_CONFIGS =
  'implementation|api|compile|compileOnly|runtimeOnly|runtime|testImplementation|testCompile|testCompileOnly|testRuntimeOnly|androidTestImplementation|debugImplementation|releaseImplementation|kapt|ksp|annotationProcessor|testAnnotationProcessor|kaptTest|developmentOnly|coreLibraryDesugaring|classpath|commonMainImplementation|commonTestImplementation|jvmMainImplementation|androidMainImplementation|iosMainImplementation'

function isGradleDev(config: string): boolean {
  return /^(test|androidTest|debug|kaptTest|commonTest)/.test(config)
}

/** build.gradle / build.gradle.kts: "group:artifact:version" coordinates, map-style coordinates, plugins, main class. */
export function parseGradle(ctx: ParseContext): void {
  const uncommented = stripLineComments(stripBlockComments(ctx.text))
  const { out, path } = ctx
  const plugins = braceBlockAfter(uncommented, /\bplugins\s*(?=\{)/)
  const text = collapseSpace(uncommented)
  const coord = new RegExp(`\\b(${GRADLE_CONFIGS}) ?\\(? ?(?:(?:enforcedPlatform|platform|kotlin) ?\\( ?)?["']([^"':\\s]{1,200}):([^"':\\s]{1,200})(?::([^"'\\s]{1,100}))?["']`, 'g')
  for (const m of text.matchAll(coord)) {
    const dev = isGradleDev(m[1])
    out.addDep('maven', `${m[2]}:${m[3]}`, { dev, source: path, section: m[1], version: m[4] })
  }
  const mapStyle = new RegExp(`\\b(${GRADLE_CONFIGS}) ?\\(? ?group ?[:=] ?["']([^"']+)["'] ?, ?name ?[:=] ?["']([^"']+)["'](?: ?, ?version ?[:=] ?["']([^"']+)["'])?`, 'g')
  for (const m of text.matchAll(mapStyle)) out.addDep('maven', `${m[2]}:${m[3]}`, { dev: isGradleDev(m[1]), source: path, section: m[1], version: m[4] })

  if (plugins !== null) {
    const block = collapseSpace(plugins)
    for (const m of block.matchAll(/\bid ?\(? ?["']([\w.-]+)["']/g)) out.addDep('maven', m[1], { dev: false, source: path, section: 'plugins' })
    for (const m of block.matchAll(/\bkotlin ?\( ?["']([\w.-]+)["'] ?\)/g)) out.addDep('maven', `org.jetbrains.kotlin.${m[1]}`, { dev: false, source: path, section: 'plugins' })
  }
  for (const m of text.matchAll(/\bapply ?\(? ?plugin ?[:=] ?["']([\w.-]+)["']/g)) out.addDep('maven', m[1], { dev: false, source: path, section: 'plugins' })
  const main = /\bmainClass(?:Name)? ?(?:\.set ?\(|=|\() ?["']([\w.$]+)["']/.exec(text)
  if (main) out.addEntry(resolveJvmClass(main[1], ctx.paths), 'The Gradle build names this as the main class (where the program starts)')
}

/** settings.gradle(.kts): included sub-projects become workspaces; rootProject.name is the project name. */
export function parseGradleSettings(ctx: ParseContext): void {
  const lines = stripLineComments(stripBlockComments(ctx.text)).split('\n').map(collapseSpace)
  const text = lines.join('\n')
  const name = /rootProject\.name ?= ?["']([^"']+)["']/.exec(text)
  if (name) ctx.out.addName(name[1])
  for (const m of text.matchAll(/\binclude ?\(?([^\n)]*)/g)) {
    for (const p of m[1].matchAll(/["']:?([\w.:-]+)["']/g)) ctx.out.addWorkspace(ctx.dir, p[1].replace(/:/g, '/'))
  }
}

/** gradle/libs.versions.toml: the version catalog's [libraries] and [plugins]. */
export function parseVersionCatalog(ctx: ParseContext): void {
  const doc = parseToml(ctx.text) as unknown
  if (!isRecord(doc)) return
  const { out, path } = ctx
  if (isRecord(doc.libraries)) {
    for (const lib of Object.values(doc.libraries)) {
      let coord: string | undefined
      if (typeof lib === 'string') coord = lib.split(':').slice(0, 2).join(':')
      else if (isRecord(lib)) {
        if (typeof lib.module === 'string') coord = lib.module
        else if (typeof lib.group === 'string' && typeof lib.name === 'string') coord = `${lib.group}:${lib.name}`
      }
      if (coord && coord.includes(':')) out.addDep('maven', coord, { dev: false, source: path, section: 'libraries' })
    }
  }
  if (isRecord(doc.plugins)) {
    for (const plugin of Object.values(doc.plugins)) {
      const id = typeof plugin === 'string' ? plugin.split(':')[0] : isRecord(plugin) && typeof plugin.id === 'string' ? plugin.id : undefined
      if (id) out.addDep('maven', id, { dev: false, source: path, section: 'plugins' })
    }
  }
}

// ── .NET ────────────────────────────────────────────────────────────────────

/** *.csproj / *.fsproj / *.vbproj: PackageReference items and the project SDK; test projects mark everything dev. */
export function parseCsproj(ctx: ParseContext): void {
  const xml = stripXmlComments(ctx.text)
  const { out, path } = ctx
  const refs: { name: string; version?: string }[] = []
  const opener = /<PackageReference\b([^>]{0,1000})>/g
  // Once a search for a closing tag fails, none further on can succeed: remember that to stay linear.
  let closingTagsLeft = true
  let m: RegExpExecArray | null
  while ((m = opener.exec(xml)) !== null) {
    const attrs = m[1]
    const name = /\b(?:Include|Update)\s*=\s*"([^"]+)"/.exec(attrs)?.[1]
    if (!name) continue
    let version = /\bVersion\s*=\s*"([^"]+)"/.exec(attrs)?.[1]
    if (!version && closingTagsLeft && !attrs.trimEnd().endsWith('/')) {
      const end = xml.indexOf('</PackageReference>', opener.lastIndex)
      if (end === -1) closingTagsLeft = false
      else if (end - opener.lastIndex < 2000) version = xmlText(xml.slice(opener.lastIndex, end), 'Version')
    }
    refs.push({ name, version })
  }
  const isTest =
    /<IsTestProject>\s*true\s*<\/IsTestProject>/i.test(xml) ||
    refs.some((r) => /^Microsoft\.NET\.Test\.Sdk$/i.test(r.name)) ||
    /(^|[.])(unit)?tests?\.(cs|fs|vb)proj$/i.test(basename(path))
  const sdk = /<Project\b[^>]{0,1000}?\bSdk\s*=\s*"([^"]{1,200})"/.exec(xml)?.[1]
  if (sdk) out.addDep('nuget', sdk.split('/')[0], { dev: isTest, source: path, section: 'SDK' })
  for (const r of refs) out.addDep('nuget', r.name, { dev: isTest, source: path, section: isTest ? 'test project packages' : 'PackageReference', version: r.version })
  if (!isTest) out.addName(xmlText(xml, 'AssemblyName') ?? basename(path).replace(/\.(cs|fs|vb)proj$/i, ''))
  out.addDescription(xmlText(xml, 'Description'))
}

/** packages.config (older .NET projects). */
export function parsePackagesConfig(ctx: ParseContext): void {
  for (const m of stripXmlComments(ctx.text).matchAll(/<package\b([^>]{0,1000})>/g)) {
    const id = /\bid\s*=\s*"([^"]+)"/.exec(m[1])?.[1]
    if (!id) continue
    const version = /\bversion\s*=\s*"([^"]+)"/.exec(m[1])?.[1]
    const dev = /\bdevelopmentDependency\s*=\s*"true"/i.test(m[1])
    ctx.out.addDep('nuget', id, { dev, source: ctx.path, section: 'packages', version })
  }
}

// ── Dart / Flutter ──────────────────────────────────────────────────────────

/** pubspec.yaml: dependencies / dev_dependencies (the Flutter SDK appears as "flutter"), name, description. */
export function parsePubspec(ctx: ParseContext): void {
  const doc: unknown = parseYaml(ctx.text)
  if (!isRecord(doc)) return
  const { out, path, dir, exists } = ctx
  out.addName(doc.name)
  out.addDescription(doc.description)
  for (const [key, dev] of [
    ['dependencies', false],
    ['dev_dependencies', true],
  ] as const) {
    const section = doc[key]
    if (!isRecord(section)) continue
    for (const [name, value] of Object.entries(section)) {
      const version = typeof value === 'string' ? value : isRecord(value) && typeof value.version === 'string' ? value.version : undefined
      out.addDep('pub', name, { dev, source: path, section: key, version })
    }
  }
  const main = joinPath(dir, 'lib/main.dart')
  if (exists(main)) out.addEntry(main, 'The standard starting file of a Flutter / Dart app')
  else if (typeof doc.name === 'string') {
    const bin = joinPath(dir, 'bin', `${doc.name}.dart`)
    if (exists(bin)) out.addEntry(bin, 'The standard starting file of a Dart command-line program')
  }
}

// ── Swift / CocoaPods ───────────────────────────────────────────────────────

/** Package.swift: `.package(url:)` dependencies (named after the repository), package name, executable targets. */
export function parsePackageSwift(ctx: ParseContext): void {
  const text = collapseSpace(stripLineComments(stripBlockComments(ctx.text)))
  const { out, path, dir, exists } = ctx
  const pkgName = /Package ?\( ?name ?: ?"([^"]+)"/.exec(text)
  if (pkgName) out.addName(pkgName[1])
  for (const m of text.matchAll(/\.package ?\(([^)]{0,2000})\)/g)) {
    const url = /url ?: ?"([^"]+)"/.exec(m[1])?.[1]
    if (!url) continue
    const repo = url.replace(/\/+$/, '').split('/').pop()?.replace(/\.git$/, '')
    const version = /(?:from|exact) ?: ?"([^"]+)"/.exec(m[1])?.[1]
    if (repo) out.addDep('swift', repo, { dev: false, source: path, section: 'dependencies', version })
  }
  for (const m of text.matchAll(/\.executableTarget ?\( ?name ?: ?"([^"]{1,200})"([^)]{0,2000})/g)) {
    const name = m[1]
    const customPath = /path ?: ?"([^"]+)"/.exec(m[2])?.[1]
    const folder = joinPath(dir, customPath ?? `Sources/${name}`)
    const hit = [`${folder}/main.swift`, `${folder}/${name}.swift`, `${folder}/App.swift`].find(exists)
    out.addEntry(hit ?? null, `Package.swift declares the "${name}" program starting here`)
  }
}

/** Podfile: `pod 'Name'` lines; pods inside a *Tests target are dev. */
export function parsePodfile(ctx: ParseContext): void {
  const stack: boolean[] = []
  for (const raw of linesOf(ctx.text)) {
    const line = collapseSpace(stripHashComment(raw)).trim()
    if (!line) continue
    const target = /^(?:abstract_)?target ['"]([^'"]+)['"] do\b/.exec(line)
    if (target) {
      stack.push(/tests?$/i.test(target[1]) || (stack.length > 0 && stack[stack.length - 1]))
      continue
    }
    if (/(^| )do$/.test(line) || /(^| )do ?\|[^|]*\|$/.test(line) || /^(if|unless|def|begin)\b/.test(line)) {
      stack.push(stack.length > 0 ? stack[stack.length - 1] : false)
      continue
    }
    if (/^end\b/.test(line)) {
      stack.pop()
      continue
    }
    const pod = /^pod ?\(? ?['"]([^'"/]+)(?:\/[^'"]*)?['"](?: ?, ?['"]([^'"]+)['"])?/.exec(line)
    if (pod) {
      const dev = stack.some(Boolean)
      ctx.out.addDep('cocoapods', pod[1], { dev, source: ctx.path, section: dev ? 'test target pods' : 'pods', version: pod[2] })
    }
  }
}
