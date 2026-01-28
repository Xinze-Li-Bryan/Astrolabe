/**
 * N-Hop Neighborhood Filter
 *
 * Filters the graph to show only nodes within N hops of the focus node.
 * Traverses both incoming and outgoing edges (undirected BFS).
 * Used by the "Ego Network" lens.
 */

import type { Node, Edge, LensFilter, LensFilterContext } from '../types'

const DEFAULT_N_HOP = 2

/**
 * Build adjacency list for bidirectional traversal
 * Returns a map from node ID to set of neighbor IDs
 */
function buildAdjacencyList(edges: Edge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()

  for (const edge of edges) {
    // Forward direction: source → target
    if (!adj.has(edge.source)) {
      adj.set(edge.source, new Set())
    }
    adj.get(edge.source)!.add(edge.target)

    // Backward direction: target → source (for undirected traversal)
    if (!adj.has(edge.target)) {
      adj.set(edge.target, new Set())
    }
    adj.get(edge.target)!.add(edge.source)
  }

  return adj
}

/**
 * BFS to find all nodes within N hops of the start node
 */
function findNodesWithinNHops(
  startNodeId: string,
  nHop: number,
  adjacencyList: Map<string, Set<string>>,
  nodeIds: Set<string>
): Set<string> {
  // Check if start node exists
  if (!nodeIds.has(startNodeId)) {
    return new Set()
  }

  const visited = new Set<string>([startNodeId])
  let frontier = new Set<string>([startNodeId])

  for (let hop = 0; hop < nHop; hop++) {
    const nextFrontier = new Set<string>()

    for (const nodeId of frontier) {
      const neighbors = adjacencyList.get(nodeId)
      if (!neighbors) continue

      for (const neighborId of neighbors) {
        // Only include nodes that exist in the graph
        if (!visited.has(neighborId) && nodeIds.has(neighborId)) {
          visited.add(neighborId)
          nextFrontier.add(neighborId)
        }
      }
    }

    frontier = nextFrontier
    if (frontier.size === 0) break  // No more nodes to explore
  }

  return visited
}

/**
 * Filter edges to only include those between included nodes
 */
function filterEdges(edges: Edge[], includedNodeIds: Set<string>): Edge[] {
  return edges.filter(edge =>
    includedNodeIds.has(edge.source) && includedNodeIds.has(edge.target)
  )
}

/**
 * N-Hop Filter Implementation
 *
 * Given a focus node, returns only nodes within N hops and their connecting edges.
 */
export const nHopFilter: LensFilter = (
  nodes: Node[],
  edges: Edge[],
  context: LensFilterContext
): { nodes: Node[]; edges: Edge[] } => {
  const { focusNodeId, options } = context
  const nHop = options.nHop ?? DEFAULT_N_HOP

  // No focus node = empty result
  if (!focusNodeId) {
    return { nodes: [], edges: [] }
  }

  // Build set of all node IDs for existence checking
  const nodeIds = new Set(nodes.map(n => n.id))

  // Focus node doesn't exist = empty result
  if (!nodeIds.has(focusNodeId)) {
    return { nodes: [], edges: [] }
  }

  // Build adjacency list for BFS
  const adjacencyList = buildAdjacencyList(edges)

  // Find all nodes within N hops
  const includedNodeIds = findNodesWithinNHops(
    focusNodeId,
    nHop,
    adjacencyList,
    nodeIds
  )

  // Filter nodes and edges
  const filteredNodes = nodes.filter(n => includedNodeIds.has(n.id))
  const filteredEdges = filterEdges(edges, includedNodeIds)

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
  }
}

export default nHopFilter
