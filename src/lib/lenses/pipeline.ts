/**
 * Lens Pipeline
 *
 * The core engine that transforms raw graph data through a lens.
 * This is a pure function - given the same inputs, it always produces
 * the same outputs. No side effects, no state mutation.
 *
 * Pipeline: Raw Data → Filter → Aggregate → Output
 */

import type {
  Node,
  Edge,
  Lens,
  LensOptions,
  LensFilter,
  LensAggregate,
  LensPipelineResult,
  LensFilterContext,
  LensAggregateContext,
  DEFAULT_LENS_OPTIONS,
} from './types'
import { LENSES_BY_ID } from './presets'
import { nHopFilter } from './filters/nHop'
import { ancestorsFilter, descendantsFilter } from './filters/dependency'
import { byNamespaceAggregator } from './aggregators/byNamespace'

// ============================================
// Filter Registry
// ============================================

const FILTERS: Map<string, LensFilter> = new Map([
  // Phase 2: nHop filter for ego network
  ['nHop', nHopFilter],

  // Phase 4: ancestor/descendant filters
  ['ancestors', ancestorsFilter],
  ['descendants', descendantsFilter],
])

// ============================================
// Aggregator Registry
// ============================================

const AGGREGATORS: Map<string, LensAggregate> = new Map([
  // Phase 3: namespace aggregation
  ['byNamespace', byNamespaceAggregator],
])

// ============================================
// Identity Functions (passthrough)
// ============================================

const identityFilter: LensFilter = (nodes, edges, _context) => ({
  nodes,
  edges,
})

const identityAggregate: LensAggregate = (nodes, edges, _context) => ({
  nodes,
  edges,
  groups: [],
})

// ============================================
// Core Pipeline
// ============================================

/**
 * Apply a lens to transform raw graph data
 *
 * @param lensId - The lens ID to apply
 * @param nodes - Raw nodes from the graph
 * @param edges - Raw edges from the graph
 * @param focusNodeId - Currently focused node (if any)
 * @param options - Lens-specific options
 * @param expandedGroups - Set of expanded namespace group IDs
 * @returns Transformed graph data ready for rendering
 */
export function applyLens(
  lensId: string,
  nodes: Node[],
  edges: Edge[],
  focusNodeId: string | null,
  options: LensOptions = {},
  expandedGroups: Set<string> = new Set()
): LensPipelineResult {
  const lens = LENSES_BY_ID.get(lensId)

  if (!lens) {
    console.warn(`[Lens] Unknown lens ID: ${lensId}, falling back to 'full'`)
    return applyLens('full', nodes, edges, focusNodeId, options)
  }

  // Check if lens requires focus but none provided
  if (lens.requiresFocus && !focusNodeId) {
    // Return empty result - UI should show activation prompt
    return {
      nodes: [],
      edges: [],
      groups: [],
      layout: lens.layout,
    }
  }

  // Get filter function
  const filter = lens.filterId
    ? FILTERS.get(lens.filterId) ?? identityFilter
    : identityFilter

  // Get aggregator function
  const aggregate = lens.aggregateId
    ? AGGREGATORS.get(lens.aggregateId) ?? identityAggregate
    : identityAggregate

  // Build contexts
  const filterContext: LensFilterContext = { focusNodeId, options }
  const aggregateContext: LensAggregateContext & { expandedGroups: Set<string> } = {
    focusNodeId,
    options,
    expandedGroups,
  }

  // Execute pipeline: Filter → Aggregate
  const filtered = filter(nodes, edges, filterContext)
  const aggregated = aggregate(filtered.nodes, filtered.edges, aggregateContext)

  return {
    nodes: aggregated.nodes,
    edges: aggregated.edges,
    groups: aggregated.groups,
    layout: lens.layout,
  }
}

// ============================================
// Registration Functions (for Phase 2+)
// ============================================

/**
 * Register a custom filter function
 * Used internally to add filters in later phases
 */
export function registerFilter(id: string, filter: LensFilter): void {
  FILTERS.set(id, filter)
}

/**
 * Register a custom aggregator function
 * Used internally to add aggregators in later phases
 */
export function registerAggregator(id: string, aggregator: LensAggregate): void {
  AGGREGATORS.set(id, aggregator)
}

// ============================================
// Utility: Check if lens is fully implemented
// ============================================

/**
 * Check if all required transforms for a lens are available
 */
export function isLensImplemented(lensId: string): boolean {
  const lens = LENSES_BY_ID.get(lensId)
  if (!lens) return false

  // Check filter availability
  if (lens.filterId && !FILTERS.has(lens.filterId)) {
    return false
  }

  // Check aggregator availability
  if (lens.aggregateId && !AGGREGATORS.has(lens.aggregateId)) {
    return false
  }

  return true
}

/**
 * Get list of implemented lens IDs
 */
export function getImplementedLenses(): string[] {
  return Array.from(LENSES_BY_ID.keys()).filter(isLensImplemented)
}
