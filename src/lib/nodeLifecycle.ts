/**
 * Node Lifecycle Manager
 *
 * Manages node appearance and disappearance logic, solving:
 * 1. Overlapping when multiple nodes appear simultaneously
 * 2. Shared nodes not appearing from the center of connected nodes
 * 3. Nodes lined up in a row when batch adding
 * 4. Lag when deleting large numbers of nodes
 */

import type { Edge } from '@/types/node'

export type Position3D = [number, number, number]
export type PositionMap = Map<string, Position3D>

interface SpawnContext {
  // Existing node positions
  existingPositions: PositionMap
  // All edges (used to find connections)
  edges: Edge[]
  // Graph centroid
  centroid: Position3D
  // Graph distribution radius
  radius: number
}

/**
 * Calculate graph centroid and radius
 */
export function calculateGraphMetrics(positions: PositionMap): { centroid: Position3D; radius: number } {
  if (positions.size === 0) {
    return { centroid: [0, 0, 0], radius: 8 }
  }

  let centroid: Position3D = [0, 0, 0]
  let count = 0

  for (const pos of positions.values()) {
    centroid[0] += pos[0]
    centroid[1] += pos[1]
    centroid[2] += pos[2]
    count++
  }

  centroid[0] /= count
  centroid[1] /= count
  centroid[2] /= count

  // Calculate maximum distribution radius
  let maxDist = 0
  for (const pos of positions.values()) {
    const dx = pos[0] - centroid[0]
    const dy = pos[1] - centroid[1]
    const dz = pos[2] - centroid[2]
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    maxDist = Math.max(maxDist, dist)
  }

  return {
    centroid,
    radius: Math.max(8, maxDist * 1.2),
  }
}

/**
 * Find all existing connected nodes for a given node
 */
function findConnectedNodes(
  nodeId: string,
  edges: Edge[],
  existingPositions: PositionMap
): string[] {
  const connected: string[] = []

  for (const edge of edges) {
    if (edge.source === nodeId && existingPositions.has(edge.target)) {
      connected.push(edge.target)
    } else if (edge.target === nodeId && existingPositions.has(edge.source)) {
      connected.push(edge.source)
    }
  }

  return connected
}

/**
 * Calculate weighted center of multiple connected nodes
 */
function calculateConnectedCenter(
  connectedIds: string[],
  existingPositions: PositionMap
): Position3D | null {
  if (connectedIds.length === 0) return null

  let center: Position3D = [0, 0, 0]
  let count = 0

  for (const id of connectedIds) {
    const pos = existingPositions.get(id)
    if (pos) {
      center[0] += pos[0]
      center[1] += pos[1]
      center[2] += pos[2]
      count++
    }
  }

  if (count === 0) return null

  return [
    center[0] / count,
    center[1] / count,
    center[2] / count,
  ]
}

/**
 * Generate evenly distributed points on a sphere (Fibonacci sphere)
 * Uses golden angle to ensure uniform distribution
 */
function fibonacciSphere(index: number, total: number): Position3D {
  // Golden angle ≈ 137.5° ≈ 2.399963 radians
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const theta = index * goldenAngle
  // phi distributed uniformly from north to south pole
  const phi = Math.acos(1 - 2 * (index + 0.5) / total)

  return [
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
  ]
}

/**
 * Calculate optimal initial position for a single new node
 *
 * Logic:
 * 1. If multiple connected nodes → appear at their center, with slight offset
 * 2. If only one connected node → appear near that node, random angle
 * 3. If no connected nodes → appear at graph periphery, random direction
 */
export function calculateSpawnPosition(
  nodeId: string,
  savedPosition: Position3D | undefined,
  context: SpawnContext,
  batchIndex: number = 0,
  batchTotal: number = 1
): Position3D {
  // 1. If there's a saved position, use it directly
  if (savedPosition) {
    return [...savedPosition]
  }

  const { existingPositions, edges, centroid, radius } = context
  const connectedIds = findConnectedNodes(nodeId, edges, existingPositions)

  // 2. Multiple connected nodes → appear from their center
  if (connectedIds.length >= 2) {
    const center = calculateConnectedCenter(connectedIds, existingPositions)
    if (center) {
      // Add offset to center position to avoid overlap
      // Use Fibonacci sphere for offset direction to ensure uniform dispersion
      const effectiveTotal = Math.max(batchTotal, 12)
      const offsetDir = fibonacciSphere(batchIndex, effectiveTotal)

      // Very close to center - physics will fine-tune
      const baseDistance = 1.5
      const spacing = 0.1
      const offsetDist = baseDistance + (batchIndex % effectiveTotal) * spacing

      // Add small random jitter
      const jitter = 0.5
      const jx = (Math.random() - 0.5) * jitter
      const jy = (Math.random() - 0.5) * jitter
      const jz = (Math.random() - 0.5) * jitter

      return [
        center[0] + offsetDir[0] * offsetDist + jx,
        center[1] + offsetDir[1] * offsetDist + jy,
        center[2] + offsetDir[2] * offsetDist + jz,
      ]
    }
  }

  // 3. Only one connected node → appear near that node
  if (connectedIds.length === 1) {
    const connectedPos = existingPositions.get(connectedIds[0])!

    // Use Fibonacci sphere to generate uniformly distributed direction
    // Use a larger effective total to ensure better angular spread
    const effectiveTotal = Math.max(batchTotal, 12)
    const dir = fibonacciSphere(batchIndex, effectiveTotal)

    // Distance: very close to parent, like radiating outward
    // Physics simulation will push them to proper distance
    const baseDistance = 2
    const spacing = 0.15
    const dist = baseDistance + (batchIndex % effectiveTotal) * spacing

    // Add small random jitter to prevent perfect alignment
    const jitter = 0.5
    const jx = (Math.random() - 0.5) * jitter
    const jy = (Math.random() - 0.5) * jitter
    const jz = (Math.random() - 0.5) * jitter

    return [
      connectedPos[0] + dir[0] * dist + jx,
      connectedPos[1] + dir[1] * dist + jy,
      connectedPos[2] + dir[2] * dist + jz,
    ]
  }

  // 4. No connected nodes → appear near graph centroid
  // Use Fibonacci sphere but keep close - physics will spread them
  const effectiveTotal = Math.max(batchTotal, 12)
  const dir = fibonacciSphere(batchIndex, effectiveTotal)

  // Keep close to centroid, not at periphery
  const spawnRadius = Math.min(radius * 0.5, 10)

  // Add small random jitter
  const jitter = 1
  const jx = (Math.random() - 0.5) * jitter
  const jy = (Math.random() - 0.5) * jitter
  const jz = (Math.random() - 0.5) * jitter

  return [
    centroid[0] + dir[0] * spawnRadius + jx,
    centroid[1] + dir[1] * spawnRadius + jy,
    centroid[2] + dir[2] * spawnRadius + jz,
  ]
}

/**
 * Calculate initial positions for batch of new nodes
 * Ensures they are evenly dispersed and don't overlap
 */
export function calculateBatchSpawnPositions(
  newNodeIds: string[],
  savedPositions: Map<string, Position3D | undefined>,
  existingPositions: PositionMap,
  edges: Edge[]
): Map<string, Position3D> {
  const result = new Map<string, Position3D>()

  if (newNodeIds.length === 0) return result

  // Calculate current graph state
  const { centroid, radius } = calculateGraphMetrics(existingPositions)

  const context: SpawnContext = {
    existingPositions,
    edges,
    centroid,
    radius,
  }

  // Group new nodes by their connected parent(s)
  // This ensures nodes sharing the same parent are spread around that parent
  const nodesByParent = new Map<string, { id: string; savedPosition: Position3D | undefined }[]>()
  const nodesWithSavedPos: { id: string; savedPosition: Position3D }[] = []
  const nodesWithNoParent: { id: string; savedPosition: Position3D | undefined }[] = []

  for (const id of newNodeIds) {
    const savedPos = savedPositions.get(id)
    if (savedPos) {
      nodesWithSavedPos.push({ id, savedPosition: savedPos })
      continue
    }

    const connectedIds = findConnectedNodes(id, edges, existingPositions)
    if (connectedIds.length === 0) {
      nodesWithNoParent.push({ id, savedPosition: undefined })
    } else {
      // Use the first connected node as the "parent" for grouping
      // This groups siblings together
      const parentKey = connectedIds.sort().join(',')
      if (!nodesByParent.has(parentKey)) {
        nodesByParent.set(parentKey, [])
      }
      nodesByParent.get(parentKey)!.push({ id, savedPosition: undefined })
    }
  }

  // 1. First, apply saved positions (but reject positions that are too far from centroid)
  // Use a smaller threshold to reject positions that got pushed too far by physics
  const maxSavedDistance = Math.min(radius * 0.8, 20) // At most 80% of radius or 20 units
  const rejectedSavedPos: { id: string; savedPosition: Position3D | undefined }[] = []

  for (const node of nodesWithSavedPos) {
    const pos = node.savedPosition
    const dx = pos[0] - centroid[0]
    const dy = pos[1] - centroid[1]
    const dz = pos[2] - centroid[2]
    const distFromCentroid = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (distFromCentroid > maxSavedDistance) {
      // Saved position is too far - recalculate
      rejectedSavedPos.push({ id: node.id, savedPosition: undefined })
    } else {
      result.set(node.id, [...pos])
      context.existingPositions.set(node.id, [...pos])
    }
  }

  // Re-categorize rejected nodes (check if they have parents)
  for (const node of rejectedSavedPos) {
    const connectedIds = findConnectedNodes(node.id, edges, existingPositions)
    if (connectedIds.length === 0) {
      nodesWithNoParent.push(node)
    } else {
      const parentKey = connectedIds.sort().join(',')
      if (!nodesByParent.has(parentKey)) {
        nodesByParent.set(parentKey, [])
      }
      nodesByParent.get(parentKey)!.push(node)
    }
  }

  // 2. Process nodes grouped by parent - spread each group around its parent
  for (const [parentKey, siblings] of nodesByParent) {
    siblings.forEach((node, siblingIndex) => {
      const position = calculateSpawnPosition(
        node.id,
        undefined,
        context,
        siblingIndex,           // Use sibling index for better spread around parent
        siblings.length         // Total siblings sharing this parent
      )
      result.set(node.id, position)
      context.existingPositions.set(node.id, position)
    })
  }

  // 3. Finally, process nodes with no parent (orphans)
  nodesWithNoParent.forEach((node, index) => {
    const position = calculateSpawnPosition(
      node.id,
      undefined,
      context,
      index,
      nodesWithNoParent.length
    )
    result.set(node.id, position)
    context.existingPositions.set(node.id, position)
  })

  return result
}

/**
 * Node disappearance animation state management
 * Used to smoothly remove nodes instead of instant disappearance
 */
export interface FadingNode {
  id: string
  startTime: number
  duration: number
  startPosition: Position3D
  startScale: number
}

export class NodeRemovalManager {
  private fadingNodes: Map<string, FadingNode> = new Map()
  private onComplete?: (id: string) => void

  constructor(onComplete?: (id: string) => void) {
    this.onComplete = onComplete
  }

  /**
   * Start fade-out animation
   */
  startFadeOut(
    nodeId: string,
    currentPosition: Position3D,
    duration: number = 300 // milliseconds
  ) {
    this.fadingNodes.set(nodeId, {
      id: nodeId,
      startTime: performance.now(),
      duration,
      startPosition: [...currentPosition],
      startScale: 1,
    })
  }

  /**
   * Start batch fade-out
   */
  startBatchFadeOut(
    nodeIds: string[],
    positions: PositionMap,
    staggerDelay: number = 30 // delay per node
  ) {
    nodeIds.forEach((id, index) => {
      const pos = positions.get(id)
      if (pos) {
        setTimeout(() => {
          this.startFadeOut(id, pos)
        }, index * staggerDelay)
      }
    })
  }

  /**
   * Get current state of fading node
   * Returns null when animation is complete
   */
  getFadingState(nodeId: string): { scale: number; opacity: number } | null {
    const fading = this.fadingNodes.get(nodeId)
    if (!fading) return null

    const elapsed = performance.now() - fading.startTime
    const progress = Math.min(elapsed / fading.duration, 1)

    if (progress >= 1) {
      this.fadingNodes.delete(nodeId)
      this.onComplete?.(nodeId)
      return null
    }

    // ease out cubic
    const t = 1 - Math.pow(1 - progress, 3)

    return {
      scale: 1 - t,
      opacity: 1 - t,
    }
  }

  /**
   * Get all fading node IDs
   */
  getFadingNodeIds(): string[] {
    return Array.from(this.fadingNodes.keys())
  }

  /**
   * Clear all fade-out states
   */
  clear() {
    this.fadingNodes.clear()
  }
}

/**
 * Detect node changes (additions and removals)
 */
export function detectNodeChanges(
  prevIds: Set<string>,
  currentIds: Set<string>
): { added: string[]; removed: string[] } {
  const added: string[] = []
  const removed: string[] = []

  // Find additions
  for (const id of currentIds) {
    if (!prevIds.has(id)) {
      added.push(id)
    }
  }

  // Find removals
  for (const id of prevIds) {
    if (!currentIds.has(id)) {
      removed.push(id)
    }
  }

  return { added, removed }
}
