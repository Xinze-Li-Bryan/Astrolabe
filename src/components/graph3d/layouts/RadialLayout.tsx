'use client'

/**
 * RadialLayout - Concentric Ring Layout for Ego Networks
 *
 * Places nodes in concentric rings based on their hop distance from a focus node.
 * - Focus node at center (0, 0, 0)
 * - 1-hop neighbors on first ring
 * - 2-hop neighbors on second ring
 * - etc.
 *
 * Uses gentle physics to spread nodes evenly within each ring.
 */

import { useEffect, useRef, useMemo, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import type { AstrolabeNode as Node, AstrolabeEdge as Edge } from '@/types/graph'

export interface RadialLayoutProps {
  nodes: Node[]
  edges: Edge[]
  focusNodeId: string | null
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  /** Radius increment per hop level */
  ringSpacing?: number
  /** Whether to run gentle physics for node spreading */
  enablePhysics?: boolean
  /** Callback after layout is ready */
  onLayoutReady?: () => void
}

// Default configuration
const DEFAULT_RING_SPACING = 8
const RING_REPULSION_STRENGTH = 50
const RING_DAMPING = 0.9

/**
 * Build adjacency list for bidirectional traversal
 */
function buildAdjacencyList(edges: Edge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()

  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, new Set())
    if (!adj.has(edge.target)) adj.set(edge.target, new Set())
    adj.get(edge.source)!.add(edge.target)
    adj.get(edge.target)!.add(edge.source)
  }

  return adj
}

/**
 * Calculate hop distances from focus node using BFS
 */
function calculateHopDistances(
  focusNodeId: string,
  nodes: Node[],
  edges: Edge[]
): Map<string, number> {
  const distances = new Map<string, number>()
  const nodeIds = new Set(nodes.map(n => n.id))

  if (!nodeIds.has(focusNodeId)) {
    return distances
  }

  const adj = buildAdjacencyList(edges)

  // BFS from focus node
  distances.set(focusNodeId, 0)
  const queue: string[] = [focusNodeId]

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentDist = distances.get(current)!

    const neighbors = adj.get(current)
    if (!neighbors) continue

    for (const neighbor of neighbors) {
      if (!distances.has(neighbor) && nodeIds.has(neighbor)) {
        distances.set(neighbor, currentDist + 1)
        queue.push(neighbor)
      }
    }
  }

  return distances
}

/**
 * Calculate initial positions in concentric rings
 */
function calculateRadialPositions(
  nodes: Node[],
  hopDistances: Map<string, number>,
  focusNodeId: string,
  ringSpacing: number
): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>()

  // Group nodes by hop distance
  const nodesByHop = new Map<number, Node[]>()
  for (const node of nodes) {
    const hop = hopDistances.get(node.id) ?? -1
    if (hop < 0) continue // Skip unreachable nodes

    if (!nodesByHop.has(hop)) {
      nodesByHop.set(hop, [])
    }
    nodesByHop.get(hop)!.push(node)
  }

  // Position focus node at center
  if (focusNodeId && hopDistances.has(focusNodeId)) {
    positions.set(focusNodeId, [0, 0, 0])
  }

  // Position nodes in each ring
  for (const [hop, hopNodes] of nodesByHop) {
    if (hop === 0) continue // Focus node already placed

    const radius = hop * ringSpacing
    const count = hopNodes.length

    // Distribute nodes evenly around the ring
    // Use golden angle for better distribution in 3D
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))

    for (let i = 0; i < count; i++) {
      const node = hopNodes[i]

      // Spherical distribution with some z variation for 3D effect
      const theta = i * goldenAngle
      const phi = Math.acos(1 - 2 * ((i + 0.5) / count))

      // Flatten the sphere a bit for better visibility (scale z)
      const x = radius * Math.sin(phi) * Math.cos(theta)
      const y = radius * Math.sin(phi) * Math.sin(theta)
      const z = radius * Math.cos(phi) * 0.3 // Flatten z axis

      positions.set(node.id, [x, y, z])
    }
  }

  return positions
}

export function RadialLayout({
  nodes,
  edges,
  focusNodeId,
  positionsRef,
  ringSpacing = DEFAULT_RING_SPACING,
  enablePhysics = true,
  onLayoutReady,
}: RadialLayoutProps) {
  const velocities = useRef<Map<string, [number, number, number]>>(new Map())
  const isInitialized = useRef(false)
  const hasReportedReady = useRef(false)
  const stableFrames = useRef(0)

  // Calculate hop distances when focus or graph changes
  const hopDistances = useMemo(() => {
    if (!focusNodeId) return new Map<string, number>()
    return calculateHopDistances(focusNodeId, nodes, edges)
  }, [focusNodeId, nodes, edges])

  // Initialize positions when layout parameters change
  const initializePositions = useCallback(() => {
    if (!focusNodeId || nodes.length === 0) return

    const positions = calculateRadialPositions(nodes, hopDistances, focusNodeId, ringSpacing)

    // Update positions ref
    for (const [id, pos] of positions) {
      positionsRef.current.set(id, pos)
    }

    // Initialize velocities
    for (const node of nodes) {
      if (!velocities.current.has(node.id)) {
        velocities.current.set(node.id, [0, 0, 0])
      }
    }

    isInitialized.current = true
    stableFrames.current = 0
    hasReportedReady.current = false
  }, [focusNodeId, nodes, hopDistances, ringSpacing, positionsRef])

  // Initialize on mount and when dependencies change
  useEffect(() => {
    initializePositions()
  }, [initializePositions])

  // Run gentle physics to spread nodes within rings
  useFrame((_, delta) => {
    if (!isInitialized.current || !enablePhysics) {
      // Report ready immediately if physics disabled
      if (!hasReportedReady.current && isInitialized.current) {
        hasReportedReady.current = true
        onLayoutReady?.()
      }
      return
    }

    const positions = positionsRef.current
    if (positions.size === 0) return

    // Skip if already stable
    if (stableFrames.current > 30) {
      if (!hasReportedReady.current) {
        hasReportedReady.current = true
        onLayoutReady?.()
      }
      return
    }

    const dt = Math.min(delta, 0.05)
    const forces = new Map<string, [number, number, number]>()

    // Initialize forces
    for (const node of nodes) {
      forces.set(node.id, [0, 0, 0])
    }

    // Apply repulsion between nodes at the same hop level
    const nodesByHop = new Map<number, string[]>()
    for (const node of nodes) {
      const hop = hopDistances.get(node.id) ?? -1
      if (hop < 0) continue
      if (!nodesByHop.has(hop)) nodesByHop.set(hop, [])
      nodesByHop.get(hop)!.push(node.id)
    }

    for (const [hop, nodeIds] of nodesByHop) {
      if (hop === 0) continue // Don't move focus node

      const radius = hop * ringSpacing

      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const p1 = positions.get(nodeIds[i])
          const p2 = positions.get(nodeIds[j])
          if (!p1 || !p2) continue

          const dx = p2[0] - p1[0]
          const dy = p2[1] - p1[1]
          const dz = p2[2] - p1[2]
          const distSq = dx * dx + dy * dy + dz * dz
          const dist = Math.sqrt(distSq) || 0.1

          // Repulsion force
          const force = RING_REPULSION_STRENGTH / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          const fz = (dz / dist) * force

          const f1 = forces.get(nodeIds[i])!
          const f2 = forces.get(nodeIds[j])!
          f1[0] -= fx; f1[1] -= fy; f1[2] -= fz
          f2[0] += fx; f2[1] += fy; f2[2] += fz
        }

        // Constrain to ring radius (spring force toward ring)
        const nodeId = nodeIds[i]
        const pos = positions.get(nodeId)
        if (!pos) continue

        const currentRadius = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2])
        if (currentRadius > 0.1) {
          const radiusError = radius - currentRadius
          const constraintForce = radiusError * 0.5

          const f = forces.get(nodeId)!
          f[0] += (pos[0] / currentRadius) * constraintForce
          f[1] += (pos[1] / currentRadius) * constraintForce
          f[2] += (pos[2] / currentRadius) * constraintForce
        }
      }
    }

    // Apply forces with damping
    let totalMovement = 0
    const maxVelocity = 5

    for (const node of nodes) {
      const hop = hopDistances.get(node.id)
      if (hop === 0) continue // Don't move focus node

      const pos = positions.get(node.id)
      const vel = velocities.current.get(node.id) || [0, 0, 0]
      const force = forces.get(node.id)
      if (!pos || !force) continue

      // Update velocity
      vel[0] = (vel[0] + force[0] * dt) * RING_DAMPING
      vel[1] = (vel[1] + force[1] * dt) * RING_DAMPING
      vel[2] = (vel[2] + force[2] * dt) * RING_DAMPING

      // Limit velocity
      const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])
      if (speed > maxVelocity) {
        vel[0] *= maxVelocity / speed
        vel[1] *= maxVelocity / speed
        vel[2] *= maxVelocity / speed
      }

      velocities.current.set(node.id, vel)

      // Update position
      const newPos: [number, number, number] = [
        pos[0] + vel[0] * dt,
        pos[1] + vel[1] * dt,
        pos[2] + vel[2] * dt,
      ]
      positions.set(node.id, newPos)

      totalMovement += Math.abs(vel[0]) + Math.abs(vel[1]) + Math.abs(vel[2])
    }

    // Check for stability
    if (totalMovement < 0.1) {
      stableFrames.current++
    } else {
      stableFrames.current = 0
    }
  })

  return null
}

export default RadialLayout
