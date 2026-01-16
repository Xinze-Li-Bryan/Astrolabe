/**
 * Graph Processing Utilities
 *
 * Pure functions for filtering and transforming graph data.
 * These are extracted from useGraphData for testability and reuse.
 */

import type { AstrolabeNode, AstrolabeEdge } from '@/types/graph'

// ============================================
// Filter Options
// ============================================

export interface GraphFilterOptions {
  hideTechnical: boolean  // Hide instances, generated coercions, etc.
  hideOrphaned: boolean   // Auto-hide nodes that become disconnected after filtering
}

export const DEFAULT_FILTER_OPTIONS: GraphFilterOptions = {
  hideTechnical: false,
  hideOrphaned: true,  // Default to true - orphaned nodes are usually not useful
}

// ============================================
// Technical Node Detection
// ============================================

/**
 * Check if a node is "technical" (implementation detail)
 * These nodes clutter the graph without adding conceptual value
 *
 * Technical nodes include:
 * - Type class instances (instance, class kinds)
 * - Auto-generated names (instDecidable, instRepr, etc.)
 * - Generated coercions and conversions (_of_, _to_)
 * - Decidability instances
 * - Type class projections (mk, mk1, etc.)
 */
export function isTechnicalNode(node: AstrolabeNode): boolean {
  const name = node.name
  const kind = node.kind.toLowerCase()

  // 1. Instance nodes (type class machinery)
  if (kind === 'instance' || kind === 'class') return true

  // Get the last segment of the name (after the last dot)
  const lastPart = name.split('.').pop() || ''

  // 2. Names where last segment starts with 'inst' followed by uppercase or end
  // Matches: instDecidable, instRepr, inst (but not: instrument, instance as regular word)
  if (/^inst([A-Z]|$)/.test(lastPart)) return true

  // 3. Generated coercions and conversions
  if (name.includes('_of_') || name.includes('.of_')) return true
  if (name.includes('_to_') || name.includes('.to_')) return true

  // 4. Auto-generated names (often start with underscore or have numeric suffixes)
  if (lastPart.startsWith('_') || /\.\d+$/.test(name)) return true

  // 5. Decidability instances
  if (name.includes('Decidable') || name.includes('decidable')) return true

  // 6. Type class projections
  if (lastPart.startsWith('mk') && lastPart.length <= 4) return true

  return false
}

// ============================================
// Graph Contraction (Through-Links)
// ============================================

export interface ProcessGraphResult {
  nodes: AstrolabeNode[]
  edges: AstrolabeEdge[]
  stats: {
    removedNodes: number
    virtualEdgesCreated: number
    orphanedNodes: number  // Nodes removed because they became disconnected
  }
}

/**
 * Process graph with filtering and through-links (graph contraction)
 *
 * When a technical node T is hidden:
 * - If A -> T and T -> B, create virtual edge A -> B
 * - Remove T and all its direct edges
 *
 * This preserves the logical dependency chain while hiding implementation details.
 *
 * @param nodes - All nodes in the graph
 * @param edges - All edges in the graph
 * @param options - Filter options
 * @returns Processed graph with filtered nodes and through-link edges
 */
export function processGraph(
  nodes: AstrolabeNode[],
  edges: AstrolabeEdge[],
  options: GraphFilterOptions
): ProcessGraphResult {
  if (!options.hideTechnical) {
    return {
      nodes,
      edges,
      stats: { removedNodes: 0, virtualEdgesCreated: 0, orphanedNodes: 0 }
    }
  }

  // Identify technical nodes
  const technicalIds = new Set<string>()

  for (const node of nodes) {
    if (isTechnicalNode(node)) {
      technicalIds.add(node.id)
    }
  }

  // If no technical nodes, return as-is
  if (technicalIds.size === 0) {
    return {
      nodes,
      edges,
      stats: { removedNodes: 0, virtualEdgesCreated: 0, orphanedNodes: 0 }
    }
  }

  // Build adjacency lists for through-link computation
  const incomingEdges = new Map<string, AstrolabeEdge[]>()  // target -> edges
  const outgoingEdges = new Map<string, AstrolabeEdge[]>()  // source -> edges

  for (const edge of edges) {
    if (!incomingEdges.has(edge.target)) incomingEdges.set(edge.target, [])
    if (!outgoingEdges.has(edge.source)) outgoingEdges.set(edge.source, [])
    incomingEdges.get(edge.target)!.push(edge)
    outgoingEdges.get(edge.source)!.push(edge)
  }

  // Create through-links for each technical node
  const virtualEdges: AstrolabeEdge[] = []
  const seenVirtualEdges = new Set<string>()  // Prevent duplicates

  // Also track existing edges to avoid duplicates
  const existingEdgeKeys = new Set(
    edges.map(e => `${e.source}->${e.target}`)
  )

  for (const techId of technicalIds) {
    const incoming = incomingEdges.get(techId) || []
    const outgoing = outgoingEdges.get(techId) || []

    // For each pair of (incoming source, outgoing target), create virtual edge
    for (const inEdge of incoming) {
      // Skip if source is also technical (will be handled when processing that node)
      if (technicalIds.has(inEdge.source)) continue

      for (const outEdge of outgoing) {
        // Skip if target is also technical
        if (technicalIds.has(outEdge.target)) continue

        // Skip self-loops
        if (inEdge.source === outEdge.target) continue

        const edgeKey = `${inEdge.source}->${outEdge.target}`
        const virtualId = `virtual-${edgeKey}`

        // Skip if we already have this edge (real or virtual)
        if (seenVirtualEdges.has(virtualId)) continue
        if (existingEdgeKeys.has(edgeKey)) continue

        seenVirtualEdges.add(virtualId)

        virtualEdges.push({
          id: virtualId,
          source: inEdge.source,
          target: outEdge.target,
          fromLean: false,
          defaultColor: '#6b7280',  // Gray for virtual edges
          defaultWidth: 0.8,
          defaultStyle: 'dashed',
          style: 'dashed',
          visible: true,
        })
      }
    }
  }

  // Filter out technical nodes
  const filteredNodes = nodes.filter(n => !technicalIds.has(n.id))

  // Filter out edges connected to technical nodes, add virtual edges
  const filteredEdges = edges.filter(
    e => !technicalIds.has(e.source) && !technicalIds.has(e.target)
  )

  let finalEdges = [...filteredEdges, ...virtualEdges]
  let finalNodes = filteredNodes

  // If hideOrphaned is enabled (default), remove nodes that became disconnected
  let orphanedCount = 0
  if (options.hideOrphaned !== false) {
    // Find nodes that have at least one edge
    const connectedNodeIds = new Set<string>()
    for (const edge of finalEdges) {
      connectedNodeIds.add(edge.source)
      connectedNodeIds.add(edge.target)
    }

    // Filter out orphaned nodes (nodes with no edges)
    const nodesBeforeOrphanRemoval = finalNodes.length
    finalNodes = finalNodes.filter(n => connectedNodeIds.has(n.id))
    orphanedCount = nodesBeforeOrphanRemoval - finalNodes.length
  }

  return {
    nodes: finalNodes,
    edges: finalEdges,
    stats: {
      removedNodes: technicalIds.size,
      virtualEdgesCreated: virtualEdges.length,
      orphanedNodes: orphanedCount
    }
  }
}

/**
 * Get IDs of all technical nodes without processing
 * Useful for highlighting or counting without full graph transformation
 */
export function getTechnicalNodeIds(nodes: AstrolabeNode[]): Set<string> {
  const technicalIds = new Set<string>()
  for (const node of nodes) {
    if (isTechnicalNode(node)) {
      technicalIds.add(node.id)
    }
  }
  return technicalIds
}
