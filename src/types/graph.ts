/**
 * Astrolabe Graph Types
 *
 * Unified Node and Edge type definitions
 * This is the sole source of Node/Edge types for the entire project
 */

// ============================================
// 基础枚举类型
// ============================================

export type NodeKind =
  | 'theorem'
  | 'lemma'
  | 'definition'
  | 'proposition'
  | 'corollary'
  | 'axiom'
  | 'conjecture'
  | 'example'
  | 'custom'  // Virtual node

export type NodeStatus =
  | 'proven'   // Proof complete, no sorry
  | 'sorry'    // Has sorry, proof incomplete
  | 'error'    // Has compilation errors
  | 'stated'   // Declaration only, no proof content
  | 'unknown'  // Status unknown

// ============================================
// File location
// ============================================

export interface FileLocation {
  path: string
  line: number
}

// ============================================
// Node type
// ============================================

export interface AstrolabeNode {
  // Identity
  id: string
  name: string

  // Classification
  kind: NodeKind
  status: NodeStatus

  // Lean file location
  leanFile?: FileLocation

  // Content (from meta.json user edit)
  notes?: string         // User notes

  // Default styles (obtained from theme based on kind)
  defaultColor: string
  defaultSize: number
  defaultShape: string

  // Visual style overrides (from meta.json user edit)
  // Note: color removed - always use defaultColor based on kind
  size?: number
  shape?: string
  effect?: string

  // Layout
  position?: { x: number; y: number; z: number }  // 3D position (optional, from backend)
  pinned: boolean
  visible: boolean
}

// ============================================
// Edge type
// ============================================

export interface AstrolabeEdge {
  // Identity (source-target combination)
  id: string
  source: string
  target: string

  // Source marker
  fromLean: boolean  // From Lean code analysis

  // Default styles (obtained from theme based on fromLean)
  defaultColor: string
  defaultWidth: number
  defaultStyle: string  // 'solid' | 'dashed' | 'polyline'

  // Visual style overrides (from meta.json user edit)
  // Note: color and width removed - always use defaults based on fromLean
  style?: string
  effect?: string
  notes?: string
  visible: boolean
}

// ============================================
// Legacy compatibility type aliases (for transition period)
// ============================================

/** @deprecated Use AstrolabeNode instead */
export interface GraphNode {
  id: string
  name: string
  type: NodeKind  // Old code uses type, new code uses kind
  status: NodeStatus
  leanFilePath?: string
  leanLineNumber?: number
  notes?: string  // User notes
  customColor?: string
  customSize?: number
  customEffect?: string
  x?: number
  y?: number
  z?: number
}

/** @deprecated Use AstrolabeEdge instead */
export interface GraphLink {
  source: string
  target: string
  type?: 'latex' | 'lean' | 'both'
}

// ============================================
// Conversion functions
// ============================================

/**
 * Convert old GraphNode to new AstrolabeNode
 */
export function toAstrolabeNode(old: GraphNode): AstrolabeNode {
  return {
    id: old.id,
    name: old.name,
    kind: old.type,
    status: old.status,
    leanFile: old.leanFilePath ? { path: old.leanFilePath, line: old.leanLineNumber ?? 0 } : undefined,
    notes: old.notes,
    // Default styles
    defaultColor: old.customColor ?? '#888888',
    defaultSize: old.customSize ?? 1.0,
    defaultShape: 'sphere',
    // User overrides (color removed)
    size: old.customSize,
    position: (old.x !== undefined && old.y !== undefined && old.z !== undefined)
      ? { x: old.x, y: old.y, z: old.z }
      : undefined,
    pinned: false,
    visible: true,
  }
}

/**
 * Convert new AstrolabeNode to old GraphNode (legacy code compatibility)
 */
export function toGraphNode(node: AstrolabeNode): GraphNode {
  return {
    id: node.id,
    name: node.name,
    type: node.kind,
    status: node.status,
    leanFilePath: node.leanFile?.path,
    leanLineNumber: node.leanFile?.line,
    notes: node.notes,
    customColor: node.defaultColor,  // Use default color
    customSize: node.size,
    x: node.position?.x,
    y: node.position?.y,
    z: node.position?.z,
  }
}

/**
 * Convert old GraphLink to new AstrolabeEdge
 */
export function toAstrolabeEdge(old: GraphLink): AstrolabeEdge {
  const fromLean = old.type === 'lean' || old.type === 'both'
  return {
    id: `${old.source}->${old.target}`,
    source: old.source,
    target: old.target,
    fromLean,
    // Default styles
    defaultColor: fromLean ? '#2ecc71' : '#888888',
    defaultWidth: fromLean ? 1.0 : 0.8,
    defaultStyle: fromLean ? 'solid' : 'dashed',
    visible: true,
  }
}

/**
 * Convert new AstrolabeEdge to old GraphLink (legacy code compatibility)
 */
export function toGraphLink(edge: AstrolabeEdge): GraphLink {
  return {
    source: edge.source,
    target: edge.target,
    type: 'lean',
  }
}
