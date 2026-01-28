/**
 * Dependency Filters
 *
 * ancestors - finds all nodes that the focus node depends on (imports)
 * descendants - finds all nodes that depend on the focus node (importers)
 *
 * Edge direction: source -> target means "source depends on target"
 * - ancestors: follow edges where focus is source (focus -> ?)
 * - descendants: follow edges where focus is target (? -> focus)
 */

import type { Node, Edge, LensFilter, LensFilterContext } from '../types'

// ============================================
// Shared Helpers
// ============================================

/**
 * Build adjacency list for outgoing edges (source -> targets)
 */
function buildOutgoingAdjacency(edges: Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const edge of edges) {
    if (!adj.has(edge.source)) {
      adj.set(edge.source, [])
    }
    adj.get(edge.source)!.push(edge.target)
  }
  return adj
}

/**
 * Build adjacency list for incoming edges (target -> sources)
 */
function buildIncomingAdjacency(edges: Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const edge of edges) {
    if (!adj.has(edge.target)) {
      adj.set(edge.target, [])
    }
    adj.get(edge.target)!.push(edge.source)
  }
  return adj
}

/**
 * BFS traversal following adjacency list
 */
function bfsTraverse(
  startId: string,
  adjacency: Map<string, string[]>,
  maxDepth: number
): Set<string> {
  const visited = new Set<string>()
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }]

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!

    if (visited.has(id)) continue
    visited.add(id)

    if (depth >= maxDepth) continue

    const neighbors = adjacency.get(id) ?? []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push({ id: neighbor, depth: depth + 1 })
      }
    }
  }

  return visited
}

/**
 * Filter edges to only include those between visited nodes
 */
function filterEdges(edges: Edge[], visitedIds: Set<string>): Edge[] {
  return edges.filter(
    edge => visitedIds.has(edge.source) && visitedIds.has(edge.target)
  )
}

// ============================================
// Ancestors Filter
// ============================================

/**
 * Find all nodes that the focus node depends on (transitively)
 *
 * Follows outgoing edges: if focus -> X, then X is an ancestor
 */
export const ancestorsFilter: LensFilter = (
  nodes: Node[],
  edges: Edge[],
  context: LensFilterContext
): { nodes: Node[]; edges: Edge[] } => {
  const { focusNodeId, options } = context
  const maxDepth = options.maxDepth ?? 10

  // Handle null focus
  if (!focusNodeId) {
    return { nodes: [], edges: [] }
  }

  // Check focus node exists
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  if (!nodeMap.has(focusNodeId)) {
    return { nodes: [], edges: [] }
  }

  // Build adjacency and traverse
  const outgoing = buildOutgoingAdjacency(edges)
  const visitedIds = bfsTraverse(focusNodeId, outgoing, maxDepth)

  // Filter nodes and edges
  const resultNodes = nodes.filter(n => visitedIds.has(n.id))
  const resultEdges = filterEdges(edges, visitedIds)

  return { nodes: resultNodes, edges: resultEdges }
}

// ============================================
// Descendants Filter
// ============================================

/**
 * Find all nodes that depend on the focus node (transitively)
 *
 * Follows incoming edges: if X -> focus, then X is a descendant
 */
export const descendantsFilter: LensFilter = (
  nodes: Node[],
  edges: Edge[],
  context: LensFilterContext
): { nodes: Node[]; edges: Edge[] } => {
  const { focusNodeId, options } = context
  const maxDepth = options.maxDepth ?? 10

  // Handle null focus
  if (!focusNodeId) {
    return { nodes: [], edges: [] }
  }

  // Check focus node exists
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  if (!nodeMap.has(focusNodeId)) {
    return { nodes: [], edges: [] }
  }

  // Build adjacency and traverse (incoming edges)
  const incoming = buildIncomingAdjacency(edges)
  const visitedIds = bfsTraverse(focusNodeId, incoming, maxDepth)

  // Filter nodes and edges
  const resultNodes = nodes.filter(n => visitedIds.has(n.id))
  const resultEdges = filterEdges(edges, visitedIds)

  return { nodes: resultNodes, edges: resultEdges }
}
