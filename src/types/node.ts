/**
 * Astrolabe Graph Types
 * Unified Node and Edge type definitions
 *
 * Data sources:
 * - Lean files (source of truth): id, name, kind, filePath, lineNumber, content, status, references
 * - .astrolabe/meta.json (user edited): meta
 */

// ============================================
// 基础枚举类型
// ============================================

export type NodeKind =
  | "theorem"
  | "lemma"
  | "definition"
  | "proposition"
  | "corollary"
  | "axiom"
  | "conjecture"
  | "example"
  | "structure"
  | "class"
  | "instance"
  | "inductive"
  | "custom";  // Virtual node

export type ProofStatus =
  | "proven"  // Found in Lean, no sorry
  | "sorry"   // Found in Lean, has sorry
  | "error"   // Has errors
  | "stated"  // Types that don't require proof (definition, axiom, etc.)
  | "loading" // Awaiting diagnostic verification (cached status)
  | "unknown"; // Referenced but not defined

// ============================================
// NodeMeta type (from .astrolabe/meta.json)
// ============================================

export interface NodeMeta {
  // Display
  label?: string;
  size?: number;
  shape?: string;
  effect?: string;

  // Position
  position?: [number, number, number];
  pinned?: boolean;

  // Content
  notes?: string;
  tags?: string[];
}

// ============================================
// Node type (matches Python Node.to_dict() output)
// ============================================

export interface Node {
  // === From Lean (source of truth, read-only) ===
  id: string;
  name: string;
  kind: NodeKind;
  filePath: string;
  lineNumber: number;
  status: ProofStatus;
  references: string[];

  // === Statistics fields (calculated) ===
  dependsOnCount: number;
  usedByCount: number;
  depth: number;

  // === Default styles (obtained from theme based on kind) ===
  defaultColor: string;
  defaultSize: number;
  defaultShape: string;

  // === From .astrolabe/meta.json (user editable) ===
  meta: NodeMeta;
}

// ============================================
// EdgeMeta type (from .astrolabe/meta.json)
// ============================================

export interface EdgeMeta {
  style?: string;  // 'solid' | 'dashed' | 'polyline'
  effect?: string;
  notes?: string;
}

// ============================================
// Edge type (matches Python Edge.to_dict() output)
// ============================================

export interface Edge {
  id: string;
  source: string;
  target: string;
  fromLean: boolean;
  visible?: boolean;

  // === Default styles (obtained from theme based on fromLean) ===
  defaultColor: string;
  defaultWidth: number;
  defaultStyle: string;  // 'solid' | 'dashed' | 'polyline'

  meta: EdgeMeta;
}

// ============================================
// API 请求/响应类型
// ============================================

export interface NodeMetaUpdate {
  label?: string;
  size?: number;
  shape?: string;
  effect?: string;
  position?: [number, number, number];
  pinned?: boolean;
  notes?: string;
  tags?: string[];
}

export interface ProjectStats {
  total_nodes: number;
  total_edges: number;
  by_kind: Record<string, number>;
  by_status: Record<string, number>;
}

export interface ProjectData {
  path: string;
  nodes: Node[];
  edges: Edge[];
  stats?: ProjectStats;
}

export interface ProjectStatus {
  exists: boolean;
  hasLakefile: boolean;
  hasLakeCache: boolean;
  usesMathlib: boolean;
  leanFileCount: number;
  needsInit: boolean;
  notSupported: boolean;
  message: string;
}
