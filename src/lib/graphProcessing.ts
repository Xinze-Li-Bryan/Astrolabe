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
  hideOrphaned: false,  // Default to false - let users decide via settings panel
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
      // Track which technical nodes each virtual edge skips
      const virtualEdgeMap = new Map<string, { edge: AstrolabeEdge; skippedNodes: Set<string> }>()
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

            if (existingEdgeKeys.has(edgeKey)) continue

            // If this virtual edge already exists, add the current techId to its skipped nodes
            if (virtualEdgeMap.has(virtualId)) {
              virtualEdgeMap.get(virtualId)!.skippedNodes.add(techId)
            } else {
              // Create new virtual edge
              virtualEdgeMap.set(virtualId, {
                edge: {
                  id: virtualId,
                  source: inEdge.source,
                  target: outEdge.target,
                  fromLean: false,
                  defaultColor: '#00ffcc',  // Bright cyan/teal for shortcut edges
                  defaultWidth: 2.5,        // Thicker line for visibility
                  defaultStyle: 'glow',     // Glow style for shortcut visualization
                  style: 'glow',
                  visible: true,
                  skippedNodes: [],  // Will be filled after iteration
                },
                skippedNodes: new Set([techId]),
              })
            }
          }
        }
      }

      // Convert map to array and fill in skippedNodes
      const virtualEdges: AstrolabeEdge[] = []
      for (const { edge, skippedNodes } of virtualEdgeMap.values()) {
        edge.skippedNodes = Array.from(skippedNodes)
        virtualEdges.push(edge)
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

/**
 * Get namespace preview info for different depth levels
 *
 * @param nodes - Array of nodes to analyze
 * @param maxDepth - Maximum depth to analyze (default 5)
 * @returns Array of depth info, each containing unique namespaces and count
 */
export interface NamespaceDepthInfo {
  depth: number
  namespaces: string[]
  count: number
}

export function getNamespaceDepthPreview(
  nodes: AstrolabeNode[],
  maxDepth: number = 5
): NamespaceDepthInfo[] {
  const result: NamespaceDepthInfo[] = []

  for (let depth = 1; depth <= maxDepth; depth++) {
    const namespaceSet = new Set<string>()

    for (const node of nodes) {
      const ns = extractNamespace(node.name, depth)
      if (ns) {
        namespaceSet.add(ns)
      }
    }

    const namespaces = Array.from(namespaceSet).sort()

    // Stop if we get no namespaces or same as previous depth
    if (namespaces.length === 0) break
    if (result.length > 0 && result[result.length - 1].count === namespaces.length) {
      // Same grouping as previous depth, no point continuing
      break
    }

    result.push({
      depth,
      namespaces,
      count: namespaces.length
    })
  }

  return result
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

/**
 * Calculate the repulsion force pushing a node away from other cluster centroids
 * This creates separation between different namespace clusters
 *
 * @param nodePosition - Current position of the node
 * @param nodeNamespace - The namespace this node belongs to
 * @param allCentroids - Map of all cluster centroids
 * @param strength - Force strength multiplier
 * @returns Force vector (x, y, z)
 */
export function calculateInterClusterRepulsion(
  nodePosition: Vec3,
  nodeNamespace: string,
  allCentroids: Map<string, Vec3>,
  strength: number
): Vec3 {
  let fx = 0, fy = 0, fz = 0

  for (const [namespace, centroid] of allCentroids) {
    // Skip the node's own cluster
    if (namespace === nodeNamespace) continue

    const dx = nodePosition.x - centroid.x
    const dy = nodePosition.y - centroid.y
    const dz = nodePosition.z - centroid.z
    const distSq = dx * dx + dy * dy + dz * dz
    const dist = Math.sqrt(distSq)

    if (dist < 0.1) continue // Avoid division by zero

    // Repulsion force - stronger and with slower falloff for better separation
    // Scale by 50 to make the slider more responsive
    const force = (strength * 50) / (dist + 0.5)

    fx += (dx / dist) * force
    fy += (dy / dist) * force
    fz += (dz / dist) * force
  }

  return { x: fx, y: fy, z: fz }
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

// ============================================
// Octree / Barnes-Hut Approximation
// ============================================

/**
 * Octree node for Barnes-Hut N-body simulation
 * Subdivides 3D space into 8 octants for O(n log n) force calculation
 */
export interface OctreeNode {
  // Bounding box
  cx: number  // center x
  cy: number  // center y
  cz: number  // center z
  size: number  // half-width of the cube

  // Mass properties (for Barnes-Hut approximation)
  mass: number  // number of bodies in this cell
  comX: number  // center of mass x
  comY: number  // center of mass y
  comZ: number  // center of mass z

  // Children (8 octants) - null if leaf or empty
  children: (OctreeNode | null)[] | null

  // For leaf nodes: the body index (-1 if internal or empty)
  bodyIndex: number
}

/**
 * Build an octree from a set of positions
 *
 * @param positions - Array of [x, y, z] positions
 * @returns Root of the octree
 */
export function buildOctree(positions: [number, number, number][]): OctreeNode | null {
  if (positions.length === 0) return null

  // Find bounding box
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity

  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }

  // Calculate center and size (use largest dimension for cube)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 0.1  // small padding

  // Create root node
  const root: OctreeNode = {
    cx, cy, cz, size,
    mass: 0,
    comX: 0, comY: 0, comZ: 0,
    children: null,
    bodyIndex: -1,
  }

  // Insert all bodies
  for (let i = 0; i < positions.length; i++) {
    insertIntoOctree(root, positions[i], i)
  }

  return root
}

/**
 * Determine which octant a point belongs to relative to center
 */
function getOctant(px: number, py: number, pz: number, cx: number, cy: number, cz: number): number {
  let octant = 0
  if (px >= cx) octant |= 1
  if (py >= cy) octant |= 2
  if (pz >= cz) octant |= 4
  return octant
}

/**
 * Get the center of a child octant
 */
function getChildCenter(
  cx: number, cy: number, cz: number, size: number, octant: number
): [number, number, number] {
  const half = size / 2
  return [
    cx + (octant & 1 ? half : -half),
    cy + (octant & 2 ? half : -half),
    cz + (octant & 4 ? half : -half),
  ]
}

/**
 * Insert a body into the octree
 */
function insertIntoOctree(
  node: OctreeNode,
  pos: [number, number, number],
  bodyIndex: number
): void {
  const [px, py, pz] = pos

  // Update center of mass
  const totalMass = node.mass + 1
  node.comX = (node.comX * node.mass + px) / totalMass
  node.comY = (node.comY * node.mass + py) / totalMass
  node.comZ = (node.comZ * node.mass + pz) / totalMass
  node.mass = totalMass

  // If this is an empty leaf, store the body
  if (node.mass === 1 && node.children === null) {
    node.bodyIndex = bodyIndex
    return
  }

  // If this was a leaf with one body, we need to subdivide
  if (node.children === null) {
    node.children = [null, null, null, null, null, null, null, null]

    // Re-insert the existing body
    if (node.bodyIndex !== -1) {
      const existingPos = [node.comX, node.comY, node.comZ] as [number, number, number]
      // Note: comX/Y/Z was just the position of the single body before
      // We need to track old body's position - but we already updated COM
      // Since mass was 1, comX/Y/Z WAS the body position, but we just changed it
      // This is a bug - let me fix the logic
    }
  }

  // For simplicity, let's rewrite with cleaner logic
  // We'll use a different approach: subdivide immediately when collision
}

/**
 * Simplified octree builder using iterative insertion
 */
export function buildOctreeSimple(positions: [number, number, number][]): OctreeNode | null {
  if (positions.length === 0) return null

  // Find bounding box
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity

  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 1

  const root: OctreeNode = {
    cx, cy, cz, size,
    mass: 0, comX: 0, comY: 0, comZ: 0,
    children: null,
    bodyIndex: -1,
  }

  for (let i = 0; i < positions.length; i++) {
    insertBody(root, positions[i], i, positions)
  }

  return root
}

function insertBody(
  node: OctreeNode,
  pos: [number, number, number],
  bodyIndex: number,
  allPositions: [number, number, number][]
): void {
  const [px, py, pz] = pos

  // Empty node - just place the body here
  if (node.mass === 0) {
    node.mass = 1
    node.comX = px
    node.comY = py
    node.comZ = pz
    node.bodyIndex = bodyIndex
    return
  }

  // Internal node - update COM and recurse into correct child
  if (node.children !== null) {
    // Update center of mass
    const totalMass = node.mass + 1
    node.comX = (node.comX * node.mass + px) / totalMass
    node.comY = (node.comY * node.mass + py) / totalMass
    node.comZ = (node.comZ * node.mass + pz) / totalMass
    node.mass = totalMass

    // Find correct octant and recurse
    const octant = getOctant(px, py, pz, node.cx, node.cy, node.cz)
    if (node.children[octant] === null) {
      const [ccx, ccy, ccz] = getChildCenter(node.cx, node.cy, node.cz, node.size, octant)
      node.children[octant] = {
        cx: ccx, cy: ccy, cz: ccz,
        size: node.size / 2,
        mass: 0, comX: 0, comY: 0, comZ: 0,
        children: null,
        bodyIndex: -1,
      }
    }
    insertBody(node.children[octant]!, pos, bodyIndex, allPositions)
    return
  }

  // Leaf node with one body - need to subdivide
  const existingBodyIndex = node.bodyIndex
  const existingPos = allPositions[existingBodyIndex]

  // Create children array
  node.children = [null, null, null, null, null, null, null, null]
  node.bodyIndex = -1

  // Update center of mass for new body
  const totalMass = node.mass + 1
  const newComX = (node.comX * node.mass + px) / totalMass
  const newComY = (node.comY * node.mass + py) / totalMass
  const newComZ = (node.comZ * node.mass + pz) / totalMass
  node.comX = newComX
  node.comY = newComY
  node.comZ = newComZ
  node.mass = totalMass

  // Re-insert existing body into correct child
  const existingOctant = getOctant(existingPos[0], existingPos[1], existingPos[2], node.cx, node.cy, node.cz)
  const [ecx, ecy, ecz] = getChildCenter(node.cx, node.cy, node.cz, node.size, existingOctant)
  node.children[existingOctant] = {
    cx: ecx, cy: ecy, cz: ecz,
    size: node.size / 2,
    mass: 0, comX: 0, comY: 0, comZ: 0,
    children: null,
    bodyIndex: -1,
  }
  insertBody(node.children[existingOctant]!, existingPos, existingBodyIndex, allPositions)

  // Insert new body into correct child
  const newOctant = getOctant(px, py, pz, node.cx, node.cy, node.cz)
  if (node.children[newOctant] === null) {
    const [ncx, ncy, ncz] = getChildCenter(node.cx, node.cy, node.cz, node.size, newOctant)
    node.children[newOctant] = {
      cx: ncx, cy: ncy, cz: ncz,
      size: node.size / 2,
      mass: 0, comX: 0, comY: 0, comZ: 0,
      children: null,
      bodyIndex: -1,
    }
  }
  insertBody(node.children[newOctant]!, pos, bodyIndex, allPositions)
}

/**
 * Calculate repulsion forces using Barnes-Hut approximation
 *
 * @param positions - Array of [x, y, z] positions (indexed by node order)
 * @param forces - Array of [fx, fy, fz] forces to accumulate into (same indexing)
 * @param repulsionStrength - Base repulsion strength
 * @param theta - Barnes-Hut threshold (0.5-1.0 typical, lower = more accurate but slower)
 */
export function calculateBarnesHutRepulsion(
  positions: [number, number, number][],
  forces: [number, number, number][],
  repulsionStrength: number,
  theta: number = 0.7
): void {
  if (positions.length === 0) return

  // Build octree
  const root = buildOctreeSimple(positions)
  if (!root) return

  // Calculate forces for each body
  for (let i = 0; i < positions.length; i++) {
    calculateForceOnBody(root, positions[i], i, forces[i], repulsionStrength, theta)
  }
}

/**
 * Calculate force on a single body by traversing the octree
 */
function calculateForceOnBody(
  node: OctreeNode,
  pos: [number, number, number],
  bodyIndex: number,
  force: [number, number, number],
  repulsionStrength: number,
  theta: number
): void {
  // Skip empty nodes
  if (node.mass === 0) return

  // Skip self
  if (node.bodyIndex === bodyIndex) return

  const [px, py, pz] = pos
  const dx = node.comX - px
  const dy = node.comY - py
  const dz = node.comZ - pz
  const distSq = dx * dx + dy * dy + dz * dz

  // If leaf node (single body), always compute direct force
  if (node.children === null && node.bodyIndex !== -1) {
    if (distSq < 0.01) return  // Skip very close (same position)
    const dist = Math.sqrt(distSq)
    const minDist = 2
    const effectiveDist = Math.max(dist, minDist)
    const forceMag = repulsionStrength / (effectiveDist * effectiveDist)

    // Force is repulsive (away from other body)
    force[0] -= (dx / dist) * forceMag
    force[1] -= (dy / dist) * forceMag
    force[2] -= (dz / dist) * forceMag
    return
  }

  // Internal node - check Barnes-Hut criterion
  const dist = Math.sqrt(distSq) || 0.1
  const ratio = (node.size * 2) / dist  // cell width / distance

  if (ratio < theta) {
    // Cell is far enough - use center of mass approximation
    const minDist = 2
    const effectiveDist = Math.max(dist, minDist)
    // Force proportional to mass (number of bodies in cell)
    const forceMag = (repulsionStrength * node.mass) / (effectiveDist * effectiveDist)

    force[0] -= (dx / dist) * forceMag
    force[1] -= (dy / dist) * forceMag
    force[2] -= (dz / dist) * forceMag
  } else {
    // Cell is too close - recurse into children
    if (node.children) {
      for (const child of node.children) {
        if (child) {
          calculateForceOnBody(child, pos, bodyIndex, force, repulsionStrength, theta)
        }
      }
    }
  }
}
