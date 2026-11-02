/**
 * One icon set (lucide), one size and one stroke everywhere — the "Field atlas" replacement for emoji icons.
 * Icons take the colour of their text role (pass a text-ink-2 / text-ink-3 class); they never get their own colours.
 * Categories that need colour use a small dot (LayerDot) instead of a coloured icon.
 */
import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  AppWindow,
  BookA,
  BookOpen,
  Bot,
  Boxes,
  ChartLine,
  Cloud,
  Component,
  ConciergeBell,
  Container,
  Cpu,
  Database,
  DoorOpen,
  File,
  FileCode,
  FileCode2,
  FlaskConical,
  Folder,
  Gamepad2,
  Globe,
  Hammer,
  Hash,
  Image,
  Languages,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  Library,
  Lightbulb,
  ListChecks,
  MemoryStick,
  MessagesSquare,
  Monitor,
  Newspaper,
  Package,
  Palette,
  Plug,
  Plug2,
  Puzzle,
  Radio,
  Repeat,
  Route,
  Ruler,
  ScrollText,
  Server,
  ShieldCheck,
  Signpost,
  SlidersHorizontal,
  Smartphone,
  SquareTerminal,
  Table2,
  Tags,
  Telescope,
  TestTubes,
  User,
  Waypoints,
  Workflow,
  Wrench,
} from 'lucide-react'
import { LAYER_INFO } from '@/core/labels'
import type { ConceptCategory, FileRole, Layer, ProjectKindId, ViewId } from '@/core/types'
import { cn } from './cn'

export const ICON_STROKE = 1.5

export const VIEW_ICON: Record<ViewId, LucideIcon> = {
  overview: Telescope,
  map: Waypoints,
  codemap: LayoutGrid,
  concepts: Lightbulb,
  tours: Route,
  explore: FileCode2,
  ask: MessagesSquare,
  quiz: ListChecks,
  glossary: BookA,
}

export const ROLE_ICON: Record<FileRole, LucideIcon> = {
  entry: DoorOpen,
  page: AppWindow,
  component: Component,
  layout: LayoutTemplate,
  hook: Plug,
  state: MemoryStick,
  route: Signpost,
  controller: Workflow,
  middleware: ShieldCheck,
  service: ConciergeBell,
  client: Radio,
  model: Table2,
  schema: Ruler,
  migration: Layers,
  repository: Database,
  util: Wrench,
  types: Tags,
  constants: Hash,
  config: SlidersHorizontal,
  test: FlaskConical,
  fixture: TestTubes,
  style: Palette,
  docs: BookOpen,
  script: ScrollText,
  build: Hammer,
  ci: Repeat,
  container: Container,
  asset: Image,
  i18n: Languages,
  cli: SquareTerminal,
  library: FileCode,
  other: File,
}

export const KIND_ICON: Record<ProjectKindId, LucideIcon> = {
  'web-app': Globe,
  website: Newspaper,
  'api-server': Server,
  library: Package,
  'cli-tool': SquareTerminal,
  'mobile-app': Smartphone,
  'desktop-app': Monitor,
  'browser-extension': Puzzle,
  'data-science': ChartLine,
  'ml-model': Cpu,
  game: Gamepad2,
  infrastructure: Cloud,
  documentation: Library,
  monorepo: Boxes,
  bot: Bot,
  plugin: Plug2,
  unknown: Folder,
}

export const CONCEPT_ICON: Record<ConceptCategory, LucideIcon> = {
  feature: Puzzle,
  actor: User,
  process: Workflow,
  data: Database,
  idea: Lightbulb,
  technology: Cpu,
}

type IconProps = Omit<LucideProps, 'ref'> & { size?: 14 | 16 | 18 | 20 }

/** Render any lucide icon with the house size/stroke, decorative by default. */
export function Icon({ as: As, size = 16, className, ...rest }: IconProps & { as: LucideIcon }) {
  return <As aria-hidden size={size} strokeWidth={ICON_STROKE} className={cn('shrink-0', className)} {...rest} />
}

export function ViewIcon({ view, ...rest }: IconProps & { view: ViewId }) {
  return <Icon as={VIEW_ICON[view]} {...rest} />
}

export function RoleIcon({ role, ...rest }: IconProps & { role: FileRole }) {
  return <Icon as={ROLE_ICON[role] ?? File} {...rest} />
}

export function KindIcon({ kind, ...rest }: IconProps & { kind: ProjectKindId }) {
  return <Icon as={KIND_ICON[kind] ?? Folder} {...rest} />
}

export function ConceptIcon({ category, ...rest }: IconProps & { category: ConceptCategory }) {
  return <Icon as={CONCEPT_ICON[category] ?? Lightbulb} {...rest} />
}

/** The small colour dot that identifies a kind of code (layer). Always next to a text label or in a legend. */
export function LayerDot({ layer, className }: { layer: Layer; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: LAYER_INFO[layer].color }} />
}
