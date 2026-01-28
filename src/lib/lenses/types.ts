/**
 * Lens System Types
 *
 * A lens is a composable view transform that controls how the graph is
 * filtered, aggregated, and laid out. Different lenses provide different
 * "ways of seeing" the same underlying graph data.
 */

import type { AstrolabeNode, AstrolabeEdge } from '@/types/graph'

// Use AstrolabeNode/AstrolabeEdge as the lens system's Node/Edge types
// This matches graphProcessing.ts and avoids the heavier @/types/node types
export type Node = AstrolabeNode
export type Edge = AstrolabeEdge

// ============================================
// Core Lens Types
// ============================================

export interface Lens {
  id: string
  name: string
  description: string
  icon: string  // lucide icon name

  // When to auto-suggest this lens based on graph size
  recommendedWhen?: {
    minNodes?: number
    maxNodes?: number
  }

  // Does this lens require a focus node to function?
  requiresFocus: boolean

  // Layout strategy
  layout: LensLayout

  // Transform functions (defined separately, referenced by id)
  filterId: string | null      // null = no filtering (show all)
  aggregateId: string | null   // null = no aggregation (individual nodes)
}

export type LensLayout = 'force' | 'radial' | 'hierarchical'

// ============================================
// Filter Types
// ============================================

export interface LensFilterContext {
  focusNodeId: string | null
  options: LensOptions
}

export type LensFilter = (
  nodes: Node[],
  edges: Edge[],
  context: LensFilterContext
) => { nodes: Node[]; edges: Edge[] }

// ============================================
// Aggregation Types
// ============================================

export interface NamespaceGroup {
  id: string                    // unique id for this group
  namespace: string             // namespace path (e.g., "Mathlib.Algebra.Group")
  label: string                 // display name
  nodeIds: string[]             // IDs of nodes contained in this group
  nodeCount: number             // count for display
  expanded: boolean             // UI state - is this group expanded?
}

export interface LensAggregateContext {
  focusNodeId: string | null
  options: LensOptions
}

export interface AggregateResult {
  nodes: Node[]                 // includes synthetic "bubble" nodes for collapsed groups
  edges: Edge[]                 // includes synthetic edges to bubbles
  groups: NamespaceGroup[]      // group metadata for rendering
}

export type LensAggregate = (
  nodes: Node[],
  edges: Edge[],
  context: LensAggregateContext
) => AggregateResult

// ============================================
// Options & Configuration
// ============================================

export interface LensOptions {
  // Ego network options
  nHop?: number                 // depth for ego network (default: 2)

  // Dependency tree options
  maxDepth?: number             // max depth for ancestor/descendant traversal (default: 10)

  // Namespace aggregation options
  namespaceDepth?: number       // how deep to group namespaces (default: 1)
  collapseThreshold?: number    // min nodes to show as bubble (default: 5)

  // General
  [key: string]: unknown        // extensible for future options
}

export const DEFAULT_LENS_OPTIONS: LensOptions = {
  nHop: 2,
  maxDepth: 10,
  namespaceDepth: 1,
  collapseThreshold: 5,
}

// ============================================
// Pipeline Output
// ============================================

export interface LensPipelineResult {
  nodes: Node[]
  edges: Edge[]
  groups: NamespaceGroup[]
  layout: LensLayout
}

// ============================================
// Store State
// ============================================

export type LensActivationState = 'idle' | 'awaiting-focus'

export interface LensState {
  activeLensId: string
  focusNodeId: string | null
  activationState: LensActivationState
  options: LensOptions
  expandedGroups: Set<string>   // which namespace groups are expanded
}
