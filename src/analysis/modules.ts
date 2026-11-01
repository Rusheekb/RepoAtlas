import type { AnalyzedFile, FileEdge, ModuleEdge, ModuleInfo } from '@/core/types'

/**
 * Group files into architecture-level modules (usually folders) that make a readable map: aim for ~6–24 modules.
 * Algorithm sketch: start from top-level folders; if one folder holds most of the code (e.g. "src", "lib", "app",
 * "packages"), expand it into its children; repeat while a module dominates (> ~55% of lines) and has sub-folders;
 * merge tiny folders (< ~2% of lines) into their parent or an "other" bucket; loose root files go to ROOT_MODULE_ID
 * ("Project setup files"). Every file gets exactly one moduleId. Name/role/description/emoji come from
 * knowledge/folders describeFolder + the dominant layer of the files inside.
 */
export function buildModules(files: AnalyzedFile[]): { modules: ModuleInfo[]; assignments: Record<string, string> } {
  void files
  return { modules: [], assignments: {} }
}

/** Aggregate file edges into module edges (skip self-loops), with up to 3 example file pairs each. */
export function buildModuleEdges(fileEdges: FileEdge[], assignments: Record<string, string>): ModuleEdge[] {
  void fileEdges; void assignments
  return []
}
