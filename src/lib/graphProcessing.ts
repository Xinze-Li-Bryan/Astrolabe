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
  transitiveReduction?: boolean  // Remove redundant edges (A→C when A→B→C exists), default true
}

export const DEFAULT_FILTER_OPTIONS: GraphFilterOptions = {
  hideTechnical: false,
  hideOrphaned: true,  // Default to true - orphaned nodes are usually not useful
  transitiveReduction: true,  // Default to true - cleaner graphs
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
    transitiveEdgesRemoved: number  // Edges removed by transitive reduction
  }
}

/**
 * Process graph with filtering, through-links, and transitive reduction
 *
 * Processing order:
 * 1. Technical node filtering (hideTechnical) - removes implementation details
 * 2. Transitive reduction (transitiveReduction) - removes redundant edges
 * 3. Orphan removal (hideOrphaned) - removes disconnected nodes
 *
 * @param nodes - All nodes in the graph
 * @param edges - All edges in the graph
 * @param options - Filter options
 * @returns Processed graph with filtered nodes and edges
 */
export function processGraph(
  nodes: AstrolabeNode[],
  edges: AstrolabeEdge[],
  options: GraphFilterOptions
): ProcessGraphResult {
  let currentNodes = nodes
  let currentEdges = edges
  let removedNodesCount = 0
  let virtualEdgesCount = 0
  let orphanedCount = 0
  let transitiveEdgesRemoved = 0

  // ============================================
  // Step 1: Technical node filtering
  // ============================================
  if (options.hideTechnical) {
    // Identify technical nodes
    const technicalIds = new Set<string>()
    for (const node of currentNodes) {
      if (isTechnicalNode(node)) {
        technicalIds.add(node.id)
      }
    }

    if (technicalIds.size > 0) {
      // Build adjacency lists for through-link computation
      const incomingEdges = new Map<string, AstrolabeEdge[]>()
      const outgoingEdges = new Map<string, AstrolabeEdge[]>()

      for (const edge of currentEdges) {
        if (!incomingEdges.has(edge.target)) incomingEdges.set(edge.target, [])
        if (!outgoingEdges.has(edge.source)) outgoingEdges.set(edge.source, [])
        incomingEdges.get(edge.target)!.push(edge)
        outgoingEdges.get(edge.source)!.push(edge)
      }

      // Create through-links for each technical node
      const virtualEdges: AstrolabeEdge[] = []
      const seenVirtualEdges = new Set<string>()
      const existingEdgeKeys = new Set(currentEdges.map(e => `${e.source}->${e.target}`))

      for (const techId of technicalIds) {
        const incoming = incomingEdges.get(techId) || []
        const outgoing = outgoingEdges.get(techId) || []

        for (const inEdge of incoming) {
          if (technicalIds.has(inEdge.source)) continue
          for (const outEdge of outgoing) {
            if (technicalIds.has(outEdge.target)) continue
            if (inEdge.source === outEdge.target) continue

            const edgeKey = `${inEdge.source}->${outEdge.target}`
            const virtualId = `virtual-${edgeKey}`

            if (seenVirtualEdges.has(virtualId)) continue
            if (existingEdgeKeys.has(edgeKey)) continue

            seenVirtualEdges.add(virtualId)
            virtualEdges.push({
              id: virtualId,
              source: inEdge.source,
              target: outEdge.target,
              fromLean: false,
              defaultColor: '#6b7280',
              defaultWidth: 0.8,
              defaultStyle: 'dashed',
              style: 'dashed',
              visible: true,
            })
          }
        }
      }

      currentNodes = currentNodes.filter(n => !technicalIds.has(n.id))
      currentEdges = currentEdges.filter(
        e => !technicalIds.has(e.source) && !technicalIds.has(e.target)
      )
      currentEdges = [...currentEdges, ...virtualEdges]

      removedNodesCount = technicalIds.size
      virtualEdgesCount = virtualEdges.length
    }
  }

  // ============================================
  // Step 2: Transitive reduction (default: enabled)
  // ============================================
  if (options.transitiveReduction !== false && currentEdges.length > 0) {
    const reductionResult = computeTransitiveReduction(currentNodes, currentEdges)
    currentEdges = reductionResult.edges
    transitiveEdgesRemoved = reductionResult.stats.removedEdges
  }

  // ============================================
  // Step 3: Orphan removal
  // ============================================
  if (options.hideOrphaned !== false) {
    const connectedNodeIds = new Set<string>()
    for (const edge of currentEdges) {
      connectedNodeIds.add(edge.source)
      connectedNodeIds.add(edge.target)
    }

    const nodesBeforeOrphanRemoval = currentNodes.length
    currentNodes = currentNodes.filter(n => connectedNodeIds.has(n.id))
    orphanedCount = nodesBeforeOrphanRemoval - currentNodes.length
  }

  return {
    nodes: currentNodes,
    edges: currentEdges,
    stats: {
      removedNodes: removedNodesCount,
      virtualEdgesCreated: virtualEdgesCount,
      orphanedNodes: orphanedCount,
      transitiveEdgesRemoved,
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

// ============================================
// Transitive Reduction
// ============================================

/**
 * Build an adjacency list from edges for graph traversal
 * @param edges - Array of edges
 * @returns Map from source node ID to Set of target node IDs
 */
export function buildAdjacencyList(edges: AstrolabeEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()

  for (const edge of edges) {
    if (!adj.has(edge.source)) {
      adj.set(edge.source, new Set())
    }
    adj.get(edge.source)!.add(edge.target)
  }

  return adj
}

/**
 * Check if there's a path from source to target in the graph
 * Uses BFS to find any path
 *
 * @param source - Starting node ID
 * @param target - Target node ID
 * @param adj - Adjacency list
 * @param excludeDirectEdgeTo - If provided, excludes the direct edge from source to this node
 *                              Used to check if alternate paths exist
 * @returns true if a path exists
 */
export function hasPath(
  source: string,
  target: string,
  adj: Map<string, Set<string>>,
  excludeDirectEdgeTo?: string
): boolean {
  if (source === target) {
    // Check for self-loop
    const neighbors = adj.get(source)
    return neighbors?.has(source) ?? false
  }

  const visited = new Set<string>()
  const queue: string[] = []

  // Get starting neighbors, possibly excluding direct edge
  const startNeighbors = adj.get(source)
  if (!startNeighbors) return false

  for (const neighbor of startNeighbors) {
    // If we're checking for alternate paths, skip the direct edge to the excluded node
    if (excludeDirectEdgeTo && neighbor === excludeDirectEdgeTo) continue
    queue.push(neighbor)
  }

  while (queue.length > 0) {
    const current = queue.shift()!

    if (current === target) return true
    if (visited.has(current)) continue

    visited.add(current)

    const neighbors = adj.get(current)
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor)
        }
      }
    }
  }

  return false
}

export interface TransitiveReductionResult {
  nodes: AstrolabeNode[]
  edges: AstrolabeEdge[]
  stats: {
    removedEdges: number
  }
}

/**
 * Compute the transitive reduction of a DAG
 *
 * Removes redundant edges where A → C is redundant if a path A → B → ... → C exists.
 * This simplifies the graph visualization without losing dependency information.
 *
 * @param nodes - All nodes in the graph
 * @param edges - All edges in the graph
 * @returns Reduced graph with redundant edges removed
 */
export function computeTransitiveReduction(
  nodes: AstrolabeNode[],
  edges: AstrolabeEdge[]
): TransitiveReductionResult {
  if (edges.length === 0) {
    return {
      nodes,
      edges,
      stats: { removedEdges: 0 }
    }
  }

  // Build adjacency list
  const adj = buildAdjacencyList(edges)

  // For each edge, check if there's an alternate path
  const redundantEdgeIds = new Set<string>()

  for (const edge of edges) {
    // Check if there's a path from source to target that doesn't use the direct edge
    if (hasPath(edge.source, edge.target, adj, edge.target)) {
      redundantEdgeIds.add(edge.id)
    }
  }

  // Filter out redundant edges
  const reducedEdges = edges.filter(e => !redundantEdgeIds.has(e.id))

  return {
    nodes,
    edges: reducedEdges,
    stats: {
      removedEdges: redundantEdgeIds.size
    }
  }
}

// ============================================
// Namespace Clustering
// ============================================

/**
 * Extract the namespace from a Lean declaration name
 *
 * @param name - Full declaration name (e.g., "IChing.Hexagram.complement")
 * @param depth - How many levels up to go (1 = immediate parent, 2 = grandparent, etc.)
 * @returns The namespace (e.g., "IChing.Hexagram" for depth=1)
 */
export function extractNamespace(name: string, depth: number = 1): string {
  if (!name) return ''

  const parts = name.split('.')

  // Handle trailing dots by filtering empty strings
  const filteredParts = parts.filter((p, i) => p !== '' || i === 0)

  if (filteredParts.length <= depth) {
    return ''
  }

  return filteredParts.slice(0, -depth).join('.')
}

export interface NamespaceGroups extends Map<string, AstrolabeNode[]> {
  nodeNamespaceMap?: Map<string, string>
}

/**
 * Group nodes by their namespace
 *
 * @param nodes - Array of nodes to group
 * @param depth - Namespace depth (1 = immediate parent namespace)
 * @returns Map from namespace to array of nodes, with additional nodeNamespaceMap property
 */
export function groupNodesByNamespace(
  nodes: AstrolabeNode[],
  depth: number = 1
): NamespaceGroups {
  const groups: NamespaceGroups = new Map()
  const nodeNamespaceMap = new Map<string, string>()

  for (const node of nodes) {
    const namespace = extractNamespace(node.name, depth)
    nodeNamespaceMap.set(node.id, namespace)

    if (!groups.has(namespace)) {
      groups.set(namespace, [])
    }
    groups.get(namespace)!.push(node)
  }

  groups.nodeNamespaceMap = nodeNamespaceMap
  return groups
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * Compute the centroid (average position) of each namespace cluster
 *
 * @param groups - Namespace groups from groupNodesByNamespace
 * @param positions - Current positions of nodes
 * @returns Map from namespace to centroid position
 */
export function computeClusterCentroids(
  groups: NamespaceGroups,
  positions: Map<string, Vec3>
): Map<string, Vec3> {
  const centroids = new Map<string, Vec3>()

  for (const [namespace, nodes] of groups) {
    let sumX = 0, sumY = 0, sumZ = 0
    let count = 0

    for (const node of nodes) {
      const pos = positions.get(node.id)
      if (pos) {
        sumX += pos.x
        sumY += pos.y
        sumZ += pos.z
        count++
      }
    }

    if (count > 0) {
      centroids.set(namespace, {
        x: sumX / count,
        y: sumY / count,
        z: sumZ / count,
      })
    }
  }

  return centroids
}

/**
 * Calculate the force vector to pull a node toward its cluster centroid
 *
 * @param nodePosition - Current position of the node
 * @param clusterCentroid - Position of the cluster centroid
 * @param strength - Force strength multiplier
 * @returns Force vector (x, y, z)
 */
export function calculateClusterForce(
  nodePosition: Vec3,
  clusterCentroid: Vec3,
  strength: number
): Vec3 {
  const dx = clusterCentroid.x - nodePosition.x
  const dy = clusterCentroid.y - nodePosition.y
  const dz = clusterCentroid.z - nodePosition.z

  return {
    x: dx * strength,
    y: dy * strength,
    z: dz * strength,
  }
}

// ============================================
// Density-Adaptive Edge Length
// ============================================

export interface NodeDegree {
  in: number
  out: number
  total: number
}

/**
 * Calculate the in-degree, out-degree, and total degree for each node
 *
 * @param nodes - Array of nodes
 * @param edges - Array of edges
 * @returns Map from node ID to degree information
 */
export function calculateNodeDegrees(
  nodes: AstrolabeNode[],
  edges: AstrolabeEdge[]
): Map<string, NodeDegree> {
  const degrees = new Map<string, NodeDegree>()

  // Initialize degrees for all nodes
  for (const node of nodes) {
    degrees.set(node.id, { in: 0, out: 0, total: 0 })
  }

  // Count degrees from edges
  for (const edge of edges) {
    const sourceDeg = degrees.get(edge.source)
    const targetDeg = degrees.get(edge.target)

    if (sourceDeg) {
      sourceDeg.out++
      sourceDeg.total++
    }

    if (targetDeg) {
      targetDeg.in++
      targetDeg.total++
    }
  }

  return degrees
}

export type AdaptiveSpringMode = 'linear' | 'logarithmic' | 'sqrt'

export interface AdaptiveSpringOptions {
  mode: AdaptiveSpringMode
  baseLength: number
  scaleFactor: number
  minLength?: number
  maxLength?: number
}

/**
 * Calculate adaptive spring length based on node degrees
 *
 * Higher-degree nodes get longer edges to spread out their connections.
 *
 * Modes:
 * - linear: baseLength + (degree1 + degree2) * scaleFactor
 * - logarithmic: baseLength * (1 + log(degree1 + degree2 + 1) * scaleFactor)
 * - sqrt: baseLength + sqrt(degree1 + degree2) * scaleFactor
 *
 * @param degree1 - Degree info for first node
 * @param degree2 - Degree info for second node
 * @param options - Spring length calculation options
 * @returns Calculated spring length
 */
export function calculateAdaptiveSpringLength(
  degree1: NodeDegree,
  degree2: NodeDegree,
  options: AdaptiveSpringOptions
): number {
  const { mode, baseLength, scaleFactor, minLength, maxLength } = options
  const combinedDegree = degree1.total + degree2.total

  let length: number

  switch (mode) {
    case 'linear':
      length = baseLength + combinedDegree * scaleFactor
      break

    case 'logarithmic':
      length = baseLength * (1 + Math.log(combinedDegree + 1) * scaleFactor)
      break

    case 'sqrt':
      length = baseLength + Math.sqrt(combinedDegree) * scaleFactor
      break

    default:
      length = baseLength
  }

  // Apply clamping if specified
  if (minLength !== undefined && length < minLength) {
    length = minLength
  }
  if (maxLength !== undefined && length > maxLength) {
    length = maxLength
  }

  return length
}
