/**
 * ForceLayout3DWorker - Pure functions for 3D force-directed layout
 *
 * These functions can run in a Web Worker to offload physics
 * computation from the main thread.
 *
 * Based on the existing ForceLayout.tsx implementation.
 */

// ============================================
// Message Types
// ============================================

export const WorkerMessageType = {
  INIT: 'init',
  STEP: 'step',
  POSITIONS: 'positions',
  STOP: 'stop',
  STABLE: 'stable',
  UPDATE_PHYSICS: 'updatePhysics',
} as const

export type AdaptiveSpringMode = 'linear' | 'sqrt' | 'logarithmic'

export interface PhysicsConfig {
  repulsionStrength: number
  springLength: number
  springStrength: number
  centerStrength: number
  damping: number
  // Namespace clustering
  clusteringEnabled?: boolean
  clusteringStrength?: number
  clusterSeparation?: number
  clusteringDepth?: number
  // Adaptive spring length
  adaptiveSpringEnabled?: boolean
  adaptiveSpringMode?: AdaptiveSpringMode
  adaptiveSpringScale?: number
}

export interface NodeDegree {
  in: number
  out: number
  total: number
}

export interface SimulationState {
  positions: Map<string, [number, number, number]>
  velocities: Map<string, [number, number, number]>
  edges: Array<{ source: string; target: string }>
  physics: PhysicsConfig
  // Optional: for clustering
  namespaceGroups?: Map<string, string[]>
  // Optional: for adaptive springs (computed from edges if not provided)
  nodeDegrees?: Map<string, NodeDegree>
}

// ============================================
// Repulsion Forces (Coulomb's Law)
// ============================================

/**
 * Compute repulsion forces between all pairs of nodes
 * O(n²) for small graphs, should use Barnes-Hut for large graphs
 */
export function computeRepulsionForces(
  positions: [number, number, number][],
  forces: [number, number, number][],
  repulsionStrength: number,
  minDistance: number = 0.1
): void {
  const n = positions.length

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = positions[j][0] - positions[i][0]
      const dy = positions[j][1] - positions[i][1]
      const dz = positions[j][2] - positions[i][2]

      const distSq = dx * dx + dy * dy + dz * dz
      const dist = Math.max(Math.sqrt(distSq), minDistance)

      // Coulomb repulsion: F = k / r²
      const force = repulsionStrength / (dist * dist)

      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      const fz = (dz / dist) * force

      // Apply equal and opposite forces
      forces[i][0] -= fx
      forces[i][1] -= fy
      forces[i][2] -= fz
      forces[j][0] += fx
      forces[j][1] += fy
      forces[j][2] += fz
    }
  }
}

/**
 * Decide whether to use Barnes-Hut approximation
 */
export function shouldUseBarnesHut(nodeCount: number, threshold: number = 100): boolean {
  return nodeCount > threshold
}

// ============================================
// Spring Forces (Hooke's Law)
// ============================================

export interface SpringConfig {
  springLength: number
  springStrength: number
}

/**
 * Compute spring forces for connected nodes
 */
export function computeSpringForces(
  positions: Map<string, [number, number, number]>,
  edges: Array<{ source: string; target: string }>,
  forces: Map<string, [number, number, number]>,
  config: SpringConfig
): void {
  const { springLength, springStrength } = config

  for (const edge of edges) {
    const p1 = positions.get(edge.source)
    const p2 = positions.get(edge.target)
    if (!p1 || !p2) continue

    const f1 = forces.get(edge.source)
    const f2 = forces.get(edge.target)
    if (!f1 || !f2) continue

    const dx = p2[0] - p1[0]
    const dy = p2[1] - p1[1]
    const dz = p2[2] - p1[2]

    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1
    const displacement = dist - springLength
    const force = springStrength * displacement

    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    const fz = (dz / dist) * force

    // Source pulled towards target
    f1[0] += fx
    f1[1] += fy
    f1[2] += fz

    // Target pulled towards source
    f2[0] -= fx
    f2[1] -= fy
    f2[2] -= fz
  }
}

// ============================================
// Namespace Clustering
// ============================================

/**
 * Compute centroid for each namespace cluster
 */
export function computeClusterCentroids(
  namespaceGroups: Map<string, string[]>,
  positions: Map<string, [number, number, number]>
): Map<string, [number, number, number]> {
  const centroids = new Map<string, [number, number, number]>()

  for (const [namespace, nodeIds] of namespaceGroups.entries()) {
    let cx = 0, cy = 0, cz = 0
    let count = 0

    for (const id of nodeIds) {
      const pos = positions.get(id)
      if (pos) {
        cx += pos[0]
        cy += pos[1]
        cz += pos[2]
        count++
      }
    }

    if (count > 0) {
      centroids.set(namespace, [cx / count, cy / count, cz / count])
    }
  }

  return centroids
}

/**
 * Compute clustering forces (attraction to own centroid + repulsion from other centroids)
 */
export function computeClusteringForces(
  namespaceGroups: Map<string, string[]>,
  positions: Map<string, [number, number, number]>,
  forces: Map<string, [number, number, number]>,
  config: { clusteringStrength: number; clusterSeparation: number }
): void {
  const { clusteringStrength, clusterSeparation } = config
  const centroids = computeClusterCentroids(namespaceGroups, positions)

  for (const [namespace, nodeIds] of namespaceGroups.entries()) {
    const centroid = centroids.get(namespace)
    if (!centroid) continue

    for (const nodeId of nodeIds) {
      const pos = positions.get(nodeId)
      const f = forces.get(nodeId)
      if (!pos || !f) continue

      // Attraction to own cluster centroid
      if (clusteringStrength > 0) {
        const dx = centroid[0] - pos[0]
        const dy = centroid[1] - pos[1]
        const dz = centroid[2] - pos[2]
        f[0] += dx * clusteringStrength
        f[1] += dy * clusteringStrength
        f[2] += dz * clusteringStrength
      }

      // Repulsion from other cluster centroids
      if (clusterSeparation > 0) {
        for (const [otherNs, otherCentroid] of centroids.entries()) {
          if (otherNs === namespace) continue

          const dx = pos[0] - otherCentroid[0]
          const dy = pos[1] - otherCentroid[1]
          const dz = pos[2] - otherCentroid[2]
          const distSq = dx * dx + dy * dy + dz * dz
          const dist = Math.sqrt(distSq) || 0.1

          // Repulsion force: F = k / r²
          const force = clusterSeparation / (dist * dist)
          f[0] += (dx / dist) * force
          f[1] += (dy / dist) * force
          f[2] += (dz / dist) * force
        }
      }
    }
  }
}

// ============================================
// Adaptive Spring Length
// ============================================

/**
 * Compute in/out degrees for each node
 */
export function computeNodeDegrees(
  edges: Array<{ source: string; target: string }>
): Map<string, NodeDegree> {
  const degrees = new Map<string, NodeDegree>()

  const getOrCreate = (id: string): NodeDegree => {
    let deg = degrees.get(id)
    if (!deg) {
      deg = { in: 0, out: 0, total: 0 }
      degrees.set(id, deg)
    }
    return deg
  }

  for (const edge of edges) {
    const srcDeg = getOrCreate(edge.source)
    const tgtDeg = getOrCreate(edge.target)
    srcDeg.out++
    srcDeg.total++
    tgtDeg.in++
    tgtDeg.total++
  }

  return degrees
}

export interface AdaptiveSpringConfig {
  baseLength: number
  mode: AdaptiveSpringMode
  scaleFactor: number
  minLength: number
  maxLength: number
}

/**
 * Calculate adaptive spring length based on node degrees
 * Higher degree nodes get longer springs to spread out
 */
export function calculateAdaptiveSpringLength(
  deg1: NodeDegree,
  deg2: NodeDegree,
  config: AdaptiveSpringConfig
): number {
  const { baseLength, mode, scaleFactor, minLength, maxLength } = config

  // Use max degree of the two endpoints
  const maxDegree = Math.max(deg1.total, deg2.total)

  let multiplier: number
  switch (mode) {
    case 'linear':
      multiplier = 1 + maxDegree * scaleFactor
      break
    case 'sqrt':
      multiplier = 1 + Math.sqrt(maxDegree) * scaleFactor
      break
    case 'logarithmic':
      multiplier = 1 + Math.log(maxDegree + 1) * scaleFactor
      break
    default:
      multiplier = 1
  }

  const length = baseLength * multiplier
  return Math.max(minLength, Math.min(maxLength, length))
}

// ============================================
// Center Gravity
// ============================================

/**
 * Apply center gravity to prevent graph from drifting
 */
export function computeCenterGravity(
  positions: Map<string, [number, number, number]>,
  forces: Map<string, [number, number, number]>,
  strength: number
): void {
  for (const [id, pos] of positions.entries()) {
    const f = forces.get(id)
    if (!f) continue

    f[0] -= pos[0] * strength
    f[1] -= pos[1] * strength
    f[2] -= pos[2] * strength
  }
}

// ============================================
// Velocity & Integration
// ============================================

/**
 * Apply damping to velocities
 */
export function applyDamping(
  velocities: Map<string, [number, number, number]>,
  damping: number
): void {
  for (const [id, vel] of velocities.entries()) {
    velocities.set(id, [vel[0] * damping, vel[1] * damping, vel[2] * damping])
  }
}

/**
 * Limit velocity magnitude
 */
export function limitVelocity(
  vel: [number, number, number],
  maxVelocity: number
): [number, number, number] {
  const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])
  if (speed > maxVelocity) {
    const scale = maxVelocity / speed
    return [vel[0] * scale, vel[1] * scale, vel[2] * scale]
  }
  return vel
}

/**
 * Check if simulation is stable
 */
export function isStable(totalMovement: number, threshold: number = 0.01): boolean {
  return totalMovement < threshold
}

// ============================================
// Full Simulation Step
// ============================================

/**
 * Execute one physics simulation step
 * Returns total movement (for stability detection)
 */
export function simulateStep(state: SimulationState, dt: number = 0.016): number {
  const { positions, velocities, edges, physics, namespaceGroups } = state
  const nodeIds = Array.from(positions.keys())
  const nodeCount = nodeIds.length

  if (nodeCount === 0) return 0

  // Initialize forces
  const forces = new Map<string, [number, number, number]>()
  for (const id of nodeIds) {
    forces.set(id, [0, 0, 0])
  }

  // Compute repulsion (use array format for performance)
  const posArray: [number, number, number][] = []
  const forceArray: [number, number, number][] = []
  for (const id of nodeIds) {
    posArray.push([...positions.get(id)!])
    forceArray.push([0, 0, 0])
  }

  computeRepulsionForces(posArray, forceArray, physics.repulsionStrength)

  // Copy back to map
  for (let i = 0; i < nodeIds.length; i++) {
    const f = forces.get(nodeIds[i])!
    f[0] += forceArray[i][0]
    f[1] += forceArray[i][1]
    f[2] += forceArray[i][2]
  }

  // Compute spring forces (with optional adaptive length)
  const nodeDegrees = state.nodeDegrees || (physics.adaptiveSpringEnabled ? computeNodeDegrees(edges) : null)

  if (physics.adaptiveSpringEnabled && nodeDegrees) {
    // Adaptive spring: compute per-edge spring length
    const baseLength = physics.springLength
    const config: AdaptiveSpringConfig = {
      baseLength,
      mode: physics.adaptiveSpringMode || 'sqrt',
      scaleFactor: physics.adaptiveSpringScale || 0.5,
      minLength: baseLength * 0.5,
      maxLength: baseLength * 5,
    }

    for (const edge of edges) {
      const p1 = positions.get(edge.source)
      const p2 = positions.get(edge.target)
      if (!p1 || !p2) continue

      const f1 = forces.get(edge.source)
      const f2 = forces.get(edge.target)
      if (!f1 || !f2) continue

      const deg1 = nodeDegrees.get(edge.source) || { in: 0, out: 0, total: 0 }
      const deg2 = nodeDegrees.get(edge.target) || { in: 0, out: 0, total: 0 }
      const springLength = calculateAdaptiveSpringLength(deg1, deg2, config)

      const dx = p2[0] - p1[0]
      const dy = p2[1] - p1[1]
      const dz = p2[2] - p1[2]
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1
      const displacement = dist - springLength
      const force = physics.springStrength * displacement

      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      const fz = (dz / dist) * force

      f1[0] += fx; f1[1] += fy; f1[2] += fz
      f2[0] -= fx; f2[1] -= fy; f2[2] -= fz
    }
  } else {
    // Fixed spring length
    computeSpringForces(positions, edges, forces, {
      springLength: physics.springLength,
      springStrength: physics.springStrength,
    })
  }

  // Compute center gravity
  computeCenterGravity(positions, forces, physics.centerStrength)

  // Compute clustering forces (if enabled)
  if (physics.clusteringEnabled && namespaceGroups && namespaceGroups.size > 0) {
    computeClusteringForces(namespaceGroups, positions, forces, {
      clusteringStrength: physics.clusteringStrength || 0.3,
      clusterSeparation: physics.clusterSeparation || 0.5,
    })
  }

  // Apply forces and update positions
  const maxVelocity = 10
  let totalMovement = 0

  for (const id of nodeIds) {
    const pos = positions.get(id)!
    let vel = velocities.get(id) || [0, 0, 0]
    const force = forces.get(id)!

    // Update velocity: v = (v + F * dt) * damping
    vel = [
      (vel[0] + force[0] * dt) * physics.damping,
      (vel[1] + force[1] * dt) * physics.damping,
      (vel[2] + force[2] * dt) * physics.damping,
    ]

    // Limit velocity
    vel = limitVelocity(vel, maxVelocity)
    velocities.set(id, vel)

    // Update position: p = p + v * dt
    positions.set(id, [pos[0] + vel[0] * dt, pos[1] + vel[1] * dt, pos[2] + vel[2] * dt])

    totalMovement += Math.abs(vel[0]) + Math.abs(vel[1]) + Math.abs(vel[2])
  }

  return totalMovement
}

// ============================================
// Worker Entry Point (for actual worker file)
// ============================================

/**
 * Create worker message handler
 * Use this in the actual worker file:
 *
 * ```ts
 * import { createWorkerHandler } from './ForceLayout3DWorker'
 * self.onmessage = createWorkerHandler()
 * ```
 */
export function createWorkerHandler() {
  let state: SimulationState | null = null
  let running = false
  let stableFrames = 0

  return (e: MessageEvent) => {
    const { type, data } = e.data

    switch (type) {
      case WorkerMessageType.INIT:
        state = {
          positions: new Map(data.positions),
          velocities: new Map(data.velocities || []),
          edges: data.edges,
          physics: data.physics,
          // Parse namespace groups if provided
          namespaceGroups: data.namespaceGroups ? new Map(data.namespaceGroups) : undefined,
        }
        // Initialize velocities if not provided
        for (const id of state.positions.keys()) {
          if (!state.velocities.has(id)) {
            state.velocities.set(id, [0, 0, 0])
          }
        }
        running = true
        stableFrames = 0
        break

      case WorkerMessageType.STEP:
        if (!state || !running) return

        const movement = simulateStep(state, data?.dt || 0.016)

        // Check stability
        if (isStable(movement)) {
          stableFrames++
          if (stableFrames > 60) {
            self.postMessage({ type: WorkerMessageType.STABLE })
          }
        } else {
          stableFrames = 0
        }

        // Send positions back
        self.postMessage({
          type: WorkerMessageType.POSITIONS,
          positions: Array.from(state.positions.entries()),
          movement,
          stableFrames,
        })
        break

      case WorkerMessageType.STOP:
        running = false
        break

      case WorkerMessageType.UPDATE_PHYSICS:
        if (!state) return
        // Update physics config and namespace groups
        state.physics = { ...state.physics, ...data.physics }
        if (data.namespaceGroups !== undefined) {
          state.namespaceGroups = data.namespaceGroups ? new Map(data.namespaceGroups) : undefined
        }
        // Reset stability counter when physics changes
        stableFrames = 0
        break
    }
  }
}
