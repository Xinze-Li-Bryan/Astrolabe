'use client'

/**
 * ForceLayout - 3D Force-Directed Layout Physics Simulation
 *
 * Based on astrolabe-desktop implementation, simplified version
 * - Coulomb repulsion (nodes repel each other)
 * - Hooke attraction (connected nodes attract each other)
 * - Center gravity (prevent dispersion)
 * - Verlet integration + damping
 */

import { useEffect, useRef, useMemo, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Node, Edge } from '@/lib/store'
import {
  isDevMode,
  recordFrameStart,
  recordPhysicsTime,
  recordFrameEnd,
  updateNodeEdgeCount,
  updateStableFrames,
  updateRendererInfo,
} from '@/lib/devMode'
import {
  groupNodesByNamespace,
  computeClusterCentroids,
  calculateClusterForce,
  calculateInterClusterRepulsion,
  calculateNodeDegrees,
  calculateAdaptiveSpringLength,
  calculateBarnesHutRepulsion,
  type NamespaceGroups,
  type NodeDegree,
  type AdaptiveSpringMode,
  type Vec3,
} from '@/lib/graphProcessing'

// Physics parameter types
export interface PhysicsParams {
  repulsionStrength: number  // Repulsion strength (default 100)
  springLength: number       // Spring length (default 4)
  springStrength: number     // Spring strength (default 2)
  centerStrength: number     // Center gravity (default 0.5)
  damping: number            // Damping coefficient (default 0.85)
  // Namespace clustering
  clusteringEnabled: boolean        // Enable namespace-based clustering (default false)
  clusteringStrength: number        // Force pulling nodes toward cluster centroid (default 0.3)
  clusterSeparation: number         // Force pushing different clusters apart (default 0.5)
  clusteringDepth: number           // Namespace depth for clustering (default 1)
  // Density-adaptive edge length
  adaptiveSpringEnabled: boolean    // Enable density-adaptive spring length (default false)
  adaptiveSpringMode: AdaptiveSpringMode  // 'linear' | 'logarithmic' | 'sqrt' (default 'sqrt')
  adaptiveSpringScale: number       // Scale factor for degree-based adjustment (default 0.3)
  // Community-aware layout
  communityAwareLayout: boolean     // Adjust edge lengths based on community (default false)
  communitySameMultiplier: number   // Edge length multiplier for same community (default 0.5)
  communityCrossMultiplier: number  // Edge length multiplier for cross community (default 2.0)
  // Community clustering (direct forces, like namespace clustering)
  communityClusteringStrength: number  // Force pulling nodes toward community centroid (default 0.3)
  communitySeparation: number          // Force pushing different communities apart (default 0.5)
  // Boundary constraint
  boundaryRadius: number               // Maximum distance from center (default 50)
  boundaryStrength: number             // Force pushing nodes back inside boundary (default 2.0)
}

// Default physics parameters
export const DEFAULT_PHYSICS: PhysicsParams = {
  repulsionStrength: 200,    // Strong repulsion to prevent collapse
  springLength: 8,           // Longer springs for more spread
  springStrength: 1.0,       // Moderate springs
  centerStrength: 0.05,      // VERY weak center gravity - was 0.3, major collapse culprit
  damping: 0.8,              // Slightly higher damping for stability
  // Namespace clustering defaults - DISABLED until base layout is robust
  clusteringEnabled: false,  // Was true - clustering can cause collapse
  clusteringStrength: 0.1,   // Reduced from 0.2
  clusterSeparation: 0.3,    // Reduced from 0.5
  clusteringDepth: 1,
  // Density-adaptive defaults
  adaptiveSpringEnabled: true,
  adaptiveSpringMode: 'sqrt',
  adaptiveSpringScale: 0.5,
  // Community-aware layout defaults
  communityAwareLayout: false,
  communitySameMultiplier: 0.3,
  communityCrossMultiplier: 3.5,
  // Community clustering (direct forces)
  communityClusteringStrength: 0.3,
  communitySeparation: 0.5,
  // Boundary constraint
  boundaryRadius: 50,
  boundaryStrength: 2.0,
}

interface ForceLayoutProps {
  nodes: Node[]
  edges: Edge[]
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  draggingNodeId: string | null
  setDraggingNodeId: (id: string | null) => void
  running?: boolean
  physics?: PhysicsParams
  /** Number of nodes with saved positions (to decide whether to skip physics simulation) */
  savedPositionCount?: number
  /** Callback after physics simulation stabilizes */
  onStable?: () => void
  /** Callback after warmup finishes and layout is ready to render */
  onWarmupComplete?: () => void
  /** OrbitControls ref for camera centering after warmup */
  controlsRef?: React.RefObject<any>
  /** Node community assignments for community-aware layout */
  nodeCommunities?: Map<string, number> | null
}

/**
 * Execute one physics simulation step (pure calculation, no React dependency)
 * Used for warmup phase to quickly calculate stable positions
 */
function simulateStep(
  nodes: Node[],
  edges: Edge[],
  positions: Map<string, [number, number, number]>,
  velocities: Map<string, [number, number, number]>,
  physics: PhysicsParams,
  dt: number = 0.016,
  namespaceGroups?: NamespaceGroups | null,
  nodeDegrees?: Map<string, NodeDegree> | null,
  nodeCommunities?: Map<string, number> | null
): number {
  if (positions.size === 0) return 0

  // Calculate forces
  const forces = new Map<string, [number, number, number]>()
  nodes.forEach((n) => forces.set(n.id, [0, 0, 0]))

  // Repulsion using Barnes-Hut O(n log n) approximation
  // Convert to arrays for Barnes-Hut calculation
  const posArray: [number, number, number][] = []
  const forceArray: [number, number, number][] = []
  const nodeOrder: string[] = []

  for (const node of nodes) {
    const pos = positions.get(node.id)
    if (pos) {
      posArray.push([...pos] as [number, number, number])
      forceArray.push([0, 0, 0])
      nodeOrder.push(node.id)
    }
  }

  calculateBarnesHutRepulsion(posArray, forceArray, physics.repulsionStrength, 0.7)

  // Copy forces back to the forces map
  for (let i = 0; i < nodeOrder.length; i++) {
    const f = forces.get(nodeOrder[i])
    if (f) {
      f[0] += forceArray[i][0]
      f[1] += forceArray[i][1]
      f[2] += forceArray[i][2]
    }
  }

  // Attraction (Hooke's law) with optional adaptive spring length
  const baseSpringLength = physics.springLength
  edges.forEach((edge) => {
    const p1 = positions.get(edge.source)
    const p2 = positions.get(edge.target)
    if (!p1 || !p2) return

    const dx = p2[0] - p1[0]
    const dy = p2[1] - p1[1]
    const dz = p2[2] - p1[2]
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1

    // Calculate spring length (adaptive or fixed)
    let springLength = baseSpringLength
    if (physics.adaptiveSpringEnabled && nodeDegrees) {
      const deg1 = nodeDegrees.get(edge.source)
      const deg2 = nodeDegrees.get(edge.target)
      if (deg1 && deg2) {
        springLength = calculateAdaptiveSpringLength(deg1, deg2, {
          mode: physics.adaptiveSpringMode,
          baseLength: baseSpringLength,
          scaleFactor: physics.adaptiveSpringScale,
          minLength: baseSpringLength * 0.5,
          maxLength: baseSpringLength * 5,
        })
      }
    }

    // Apply community-aware layout adjustment
    if (physics.communityAwareLayout && nodeCommunities) {
      const comm1 = nodeCommunities.get(edge.source)
      const comm2 = nodeCommunities.get(edge.target)
      if (comm1 !== undefined && comm2 !== undefined) {
        if (comm1 === comm2) {
          // Same community: shorter edges (pull together)
          springLength *= physics.communitySameMultiplier
        } else {
          // Different communities: longer edges (push apart)
          springLength *= physics.communityCrossMultiplier
        }
      }
    }

    const displacement = dist - springLength
    const force = physics.springStrength * displacement

    const f1 = forces.get(edge.source)
    const f2 = forces.get(edge.target)
    if (f1 && f2) {
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      const fz = (dz / dist) * force
      f1[0] += fx; f1[1] += fy; f1[2] += fz
      f2[0] -= fx; f2[1] -= fy; f2[2] -= fz
    }
  })

  // Center gravity
  nodes.forEach((node) => {
    const pos = positions.get(node.id)
    if (!pos) return
    const f = forces.get(node.id)!
    f[0] -= pos[0] * physics.centerStrength
    f[1] -= pos[1] * physics.centerStrength
    f[2] -= pos[2] * physics.centerStrength
  })

  // Namespace clustering force (optional)
  if (physics.clusteringEnabled && namespaceGroups) {
    // Convert positions to Vec3 format for centroid calculation
    const positionsVec3 = new Map<string, Vec3>()
    for (const [id, pos] of positions.entries()) {
      positionsVec3.set(id, { x: pos[0], y: pos[1], z: pos[2] })
    }

    // Compute cluster centroids
    const centroids = computeClusterCentroids(namespaceGroups, positionsVec3)

    // Apply clustering force to each node
    // Note: namespaceGroups values are AstrolabeNode[], not string[]
    for (const [namespace, clusterNodes] of namespaceGroups.entries()) {
      const centroid = centroids.get(namespace)
      if (!centroid) continue

      for (const node of clusterNodes) {
        const pos = positions.get(node.id)  // Use node.id to get the string key
        const f = forces.get(node.id)
        if (!pos || !f) continue

        const nodePos: Vec3 = { x: pos[0], y: pos[1], z: pos[2] }

        // Attraction to own cluster centroid
        const clusterForce = calculateClusterForce(
          nodePos,
          centroid,
          physics.clusteringStrength
        )
        f[0] += clusterForce.x
        f[1] += clusterForce.y
        f[2] += clusterForce.z

        // Repulsion from other cluster centroids
        if ((physics.clusterSeparation ?? 0) > 0) {
          const separationForce = calculateInterClusterRepulsion(
            nodePos,
            namespace,
            centroids,
            physics.clusterSeparation ?? 0.5
          )
          f[0] += separationForce.x
          f[1] += separationForce.y
          f[2] += separationForce.z
        }
      }
    }
  }

  // Boundary constraint - push nodes back if they exceed the boundary radius
  const boundaryRadius = physics.boundaryRadius ?? 50
  const boundaryStrength = physics.boundaryStrength ?? 2.0
  if (boundaryRadius > 0 && boundaryStrength > 0) {
    nodes.forEach((node) => {
      const pos = positions.get(node.id)
      const f = forces.get(node.id)
      if (!pos || !f) return

      const dist = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2])
      if (dist > boundaryRadius) {
        const overshoot = dist - boundaryRadius
        const pushStrength = boundaryStrength * overshoot
        f[0] -= (pos[0] / dist) * pushStrength
        f[1] -= (pos[1] / dist) * pushStrength
        f[2] -= (pos[2] / dist) * pushStrength
      }
    })
  }

  // Apply forces
  const maxVelocity = 10
  let totalMovement = 0

  nodes.forEach((node) => {
    const pos = positions.get(node.id)
    const vel = velocities.get(node.id) || [0, 0, 0]
    const force = forces.get(node.id)
    if (!pos || !force) return

    vel[0] = (vel[0] + force[0] * dt) * physics.damping
    vel[1] = (vel[1] + force[1] * dt) * physics.damping
    vel[2] = (vel[2] + force[2] * dt) * physics.damping

    const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])
    if (speed > maxVelocity) {
      vel[0] *= maxVelocity / speed
      vel[1] *= maxVelocity / speed
      vel[2] *= maxVelocity / speed
    }

    velocities.set(node.id, vel)

    positions.set(node.id, [
      pos[0] + vel[0] * dt,
      pos[1] + vel[1] * dt,
      pos[2] + vel[2] * dt,
    ])

    totalMovement += Math.abs(vel[0]) + Math.abs(vel[1]) + Math.abs(vel[2])
  })

  return totalMovement
}

/**
 * Only center and scale, don't run physics simulation
 * Used when saved positions already exist
 */
function centerAndScale(
  positions: Map<string, [number, number, number]>,
  targetRadius: number = 12,
  allowScaleUp: boolean = false
): void {
  if (positions.size === 0) return

  // 1. Calculate center of mass
  let cx = 0, cy = 0, cz = 0
  for (const pos of positions.values()) {
    cx += pos[0]
    cy += pos[1]
    cz += pos[2]
  }
  cx /= positions.size
  cy /= positions.size
  cz /= positions.size

  // 2. Center first
  for (const [id, pos] of positions.entries()) {
    positions.set(id, [pos[0] - cx, pos[1] - cy, pos[2] - cz])
  }

  // 3. Calculate maximum radius
  let maxRadius = 0
  for (const pos of positions.values()) {
    const r = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2])
    maxRadius = Math.max(maxRadius, r)
  }

  // 4. Scale to viewport (increased from 8 to accommodate clustering/adaptive springs spread)
  if (maxRadius > 0.1) {
    const scale = targetRadius / maxRadius
    if (allowScaleUp) {
      if (scale > 1) {
        for (const [id, pos] of positions.entries()) {
          positions.set(id, [pos[0] * scale, pos[1] * scale, pos[2] * scale])
        }
      }
    } else if (scale < 1) {
      for (const [id, pos] of positions.entries()) {
        positions.set(id, [pos[0] * scale, pos[1] * scale, pos[2] * scale])
      }
    }
  }
}

/**
 * Warmup: Quickly run physics simulation until stable, then center and scale to appropriate size
 * Only used when there are no saved positions
 * Now includes clustering and adaptive springs for consistent layout
 */
function warmupSimulation(
  nodes: Node[],
  edges: Edge[],
  positions: Map<string, [number, number, number]>,
  physics: PhysicsParams,
  maxIterations: number = 500,
  stabilityThreshold: number = 0.01,
  targetRadius: number = 12,
  allowScaleUp: boolean = false,
  nodeCommunities?: Map<string, number> | null
): void {
  const velocities = new Map<string, [number, number, number]>()
  nodes.forEach((node) => velocities.set(node.id, [0, 0, 0]))

  // Pre-compute namespace groups for clustering (if enabled)
  let namespaceGroups: NamespaceGroups | null = null
  if (physics.clusteringEnabled) {
    const astrolabeNodes = nodes.map(n => ({ ...n, name: n.name || n.id }))
    namespaceGroups = groupNodesByNamespace(astrolabeNodes as any, physics.clusteringDepth)
  }

  // Pre-compute node degrees for adaptive springs (if enabled)
  let nodeDegrees: Map<string, NodeDegree> | null = null
  if (physics.adaptiveSpringEnabled) {
    const astrolabeNodes = nodes.map(n => ({ ...n, name: n.name || n.id }))
    const astrolabeEdges = edges.map(e => ({ ...e }))
    nodeDegrees = calculateNodeDegrees(astrolabeNodes as any, astrolabeEdges as any)
  }

  let stableCount = 0
  for (let i = 0; i < maxIterations; i++) {
    const movement = simulateStep(nodes, edges, positions, velocities, physics, 0.016, namespaceGroups, nodeDegrees, nodeCommunities)
    if (movement < stabilityThreshold) {
      stableCount++
      if (stableCount > 10) break // Stop after 10 consecutive stable frames
    } else {
      stableCount = 0
    }
  }

  // Center and scale
  centerAndScale(positions, targetRadius, allowScaleUp)
}

export function ForceLayout({
  nodes,
  edges,
  positionsRef,
  draggingNodeId,
  setDraggingNodeId,
  running = true,
  physics = DEFAULT_PHYSICS,
  savedPositionCount = 0,
  onStable,
  onWarmupComplete,
  controlsRef,
  nodeCommunities,
}: ForceLayoutProps) {
  // Access positionsRef.current directly in callbacks to always get latest Map
  const velocities = useRef<Map<string, [number, number, number]>>(new Map())
  const { camera, raycaster, gl, pointer } = useThree()
  const dragPlane = useRef(new THREE.Plane())
  const dragStartPos = useRef<[number, number, number] | null>(null)
  const prevDragging = useRef<string | null>(null)
  const draggedNodePos = useRef<{ id: string; pos: [number, number, number] } | null>(null)
  const stableFrames = useRef(0)
  const hasWarmedUp = useRef(false)
  const lastNodeCount = useRef(0)
  const hasTriggeredStable = useRef(false)
  const pendingWarmup = useRef(false)
  const hasReportedWarmup = useRef(false)

  // Pre-compute namespace groups for clustering
  const namespaceGroups = useMemo(() => {
    if (!physics.clusteringEnabled) return null
    // Convert Node[] to format expected by groupNodesByNamespace
    const astrolabeNodes = nodes.map(n => ({ ...n, name: n.name || n.id }))
    return groupNodesByNamespace(astrolabeNodes as any, physics.clusteringDepth)
  }, [nodes, physics.clusteringEnabled, physics.clusteringDepth])

  // Pre-compute node degrees for adaptive spring length
  const nodeDegrees = useMemo(() => {
    if (!physics.adaptiveSpringEnabled) return null
    const astrolabeNodes = nodes.map(n => ({ ...n, name: n.name || n.id }))
    const astrolabeEdges = edges.map(e => ({ ...e }))
    return calculateNodeDegrees(astrolabeNodes as any, astrolabeEdges as any)
  }, [nodes, edges, physics.adaptiveSpringEnabled])

  // Track previous community layout state to detect changes
  const prevCommunityLayoutRef = useRef(physics.communityAwareLayout)

  // When community-aware layout is toggled, give nodes a velocity boost
  useEffect(() => {
    if (physics.communityAwareLayout !== prevCommunityLayoutRef.current) {
      prevCommunityLayoutRef.current = physics.communityAwareLayout
      console.log(`[ForceLayout] Community-aware layout ${physics.communityAwareLayout ? 'enabled' : 'disabled'}, boosting velocities`)

      // Give all nodes a random velocity boost to kick-start the re-layout
      const vels = velocities.current
      for (const [_nodeId, vel] of vels) {
        // Add random velocity in range [-2, 2] for each axis
        vel[0] += (Math.random() - 0.5) * 4
        vel[1] += (Math.random() - 0.5) * 4
        vel[2] += (Math.random() - 0.5) * 4
      }

      // Reset stable frames to allow simulation to run
      stableFrames.current = 0
      hasTriggeredStable.current = false
    }
  }, [physics.communityAwareLayout])

  const runWarmupIfNeeded = useCallback((source: string) => {
    const positions = positionsRef.current
    // Detect if warmup is needed (first load or large change in node count)
    const currentCount = nodes.length
    const countChange = Math.abs(currentCount - lastNodeCount.current)
    const needsWarmup = !hasWarmedUp.current || countChange > currentCount * 0.5

    console.log(`[ForceLayout] Warmup check (${source}): nodes=${currentCount}, positions=${positions.size}, needsWarmup=${needsWarmup}, hasWarmedUp=${hasWarmedUp.current}`)

    if (currentCount === 0 || !needsWarmup) {
      pendingWarmup.current = false
      lastNodeCount.current = currentCount
      if (!hasReportedWarmup.current && positions.size > 0) {
        hasReportedWarmup.current = true
        onWarmupComplete?.()
      }
      return
    }

    if (positions.size === 0) {
      pendingWarmup.current = true
      lastNodeCount.current = currentCount
      hasReportedWarmup.current = false
      return
    }

    pendingWarmup.current = false
    hasReportedWarmup.current = false

    // If most nodes have saved positions (>50%), only center and scale, skip physics simulation
    const savedRatio = savedPositionCount / currentCount

    // Scale target radius based on node count - larger graphs need more spread
    // But always respect the boundary constraint
    const edgeCount = edges.length
    const baseRadius = 12
    const dynamicRadius = Math.sqrt(currentCount) * physics.springLength * 0.5
    const maxRadius = edgeCount > 5000 ? 80 : edgeCount > 1000 ? 50 : 24
    const boundaryRadius = physics.boundaryRadius ?? 50
    // Target radius should not exceed boundary radius (with 10% margin for visual comfort)
    const targetRadius = Math.min(boundaryRadius * 0.9, maxRadius, Math.max(baseRadius, dynamicRadius))

    // Calculate center of mass and max radius to detect dense graphs
    let cx = 0, cy = 0, cz = 0
    for (const pos of positions.values()) {
      cx += pos[0]
      cy += pos[1]
      cz += pos[2]
    }
    cx /= positions.size
    cy /= positions.size
    cz /= positions.size

    let maxRadiusBefore = 0
    for (const pos of positions.values()) {
      const dx = pos[0] - cx
      const dy = pos[1] - cy
      const dz = pos[2] - cz
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      maxRadiusBefore = Math.max(maxRadiusBefore, dist)
    }
    const denseNodeCountThreshold = 20
    const denseRadiusThreshold = targetRadius * 0.8
    const looksDense = positions.size >= denseNodeCountThreshold && maxRadiusBefore < denseRadiusThreshold
    const allowScaleUp = positions.size >= denseNodeCountThreshold

    // Scale iterations based on graph size - but cap to avoid blocking main thread
    // For very large graphs, rely more on pre-spread + physics at runtime
    const baseIterations = Math.min(800, 200 + currentCount * 2)
    const warmupIterations = looksDense ? baseIterations : Math.min(500, baseIterations)
    const stabilityThreshold = looksDense ? 0.01 : 0.05
    console.log(`[ForceLayout] Graph size: ${currentCount} nodes, ${edgeCount} edges, warmup=${warmupIterations} iterations, targetRadius=${targetRadius}`)

    // For very large graphs, skip synchronous warmup entirely to avoid freezing
    const skipWarmup = edgeCount > 1000 || currentCount > 500

    // Helper: check if a position is "bad" (at origin or very clustered)
    const isPositionBad = (pos: [number, number, number]): boolean => {
      const dist = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2])
      return dist < 1 // Position is at/near origin
    }

    // Count how many positions are already well-distributed (not at origin)
    let goodPositionCount = 0
    for (const pos of positions.values()) {
      if (!isPositionBad(pos)) {
        goodPositionCount++
      }
    }
    const goodRatio = goodPositionCount / currentCount

    if (savedRatio > 0.5) {
      console.log(`[ForceLayout] ${Math.round(savedRatio * 100)}% nodes have saved positions, skipping warmup`)
      // Don't run warmup - preserve user's saved layout
      hasWarmedUp.current = true
      lastNodeCount.current = currentCount
      if (!hasReportedWarmup.current) {
        hasReportedWarmup.current = true
        onWarmupComplete?.()
      }
      return
    } else if (goodRatio > 0.7) {
      // Most nodes already have good positions (from nodeLifecycle), skip warmup entirely
      // This preserves spawn positions near parent nodes
      console.log(`[ForceLayout] ${Math.round(goodRatio * 100)}% nodes have good positions, skipping warmup`)
      hasWarmedUp.current = true
      lastNodeCount.current = currentCount
      if (!hasReportedWarmup.current) {
        hasReportedWarmup.current = true
        onWarmupComplete?.()
      }
      return
    } else if (skipWarmup) {
      // Large graph: pre-spread ONLY nodes with bad positions
      const spreadRadius = targetRadius * 1.2
      const badPositionIds: string[] = []
      for (const [id, pos] of positions.entries()) {
        if (isPositionBad(pos)) {
          badPositionIds.push(id)
        }
      }

      if (badPositionIds.length > 0) {
        console.log(`[ForceLayout] Large graph - pre-spreading ${badPositionIds.length}/${currentCount} nodes with bad positions...`)
        badPositionIds.forEach((id, i) => {
          const goldenAngle = Math.PI * (3 - Math.sqrt(5))
          const theta = i * goldenAngle
          const phi = Math.acos(1 - 2 * (i + 0.5) / badPositionIds.length)
          const r = spreadRadius * (0.3 + 0.7 * Math.cbrt((i + 1) / badPositionIds.length))
          positions.set(id, [
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi),
          ])
        })
      } else {
        console.log(`[ForceLayout] Large graph - all ${currentCount} nodes have good positions, preserving them`)
      }
    } else {
      // Small graph: can do synchronous warmup
      // Only pre-spread if many nodes have bad positions
      if (goodRatio < 0.5 && currentCount > 100) {
        const spreadRadius = targetRadius * 1.5
        const badPositionIds: string[] = []
        for (const [id, pos] of positions.entries()) {
          if (isPositionBad(pos)) {
            badPositionIds.push(id)
          }
        }

        if (badPositionIds.length > 0) {
          console.log(`[ForceLayout] Pre-spreading ${badPositionIds.length}/${currentCount} nodes with bad positions...`)
          badPositionIds.forEach((id, i) => {
            const goldenAngle = Math.PI * (3 - Math.sqrt(5))
            const theta = i * goldenAngle
            const phi = Math.acos(1 - 2 * (i + 0.5) / badPositionIds.length)
            const r = spreadRadius * (0.5 + 0.5 * Math.cbrt((i + 1) / badPositionIds.length))
            positions.set(id, [
              r * Math.sin(phi) * Math.cos(theta),
              r * Math.sin(phi) * Math.sin(theta),
              r * Math.cos(phi),
            ])
          })
        }
      }
      console.log(`[ForceLayout] Warming up with ${positions.size} nodes (${Math.round(goodRatio * 100)}% have good positions)...`)
      warmupSimulation(nodes, edges, positions, physics, warmupIterations, stabilityThreshold, targetRadius, allowScaleUp, nodeCommunities)
    }

    // Pre-bake layout: mark stable and save once before first render
    stableFrames.current = 61
    if (onStable && !hasTriggeredStable.current) {
      hasTriggeredStable.current = true
      onStable()
    }
    if (!hasReportedWarmup.current) {
      hasReportedWarmup.current = true
      onWarmupComplete?.()
    }

    hasWarmedUp.current = true
    lastNodeCount.current = currentCount
    console.log('[ForceLayout] Initialization complete')
  }, [nodes, edges, physics, savedPositionCount, onStable, onWarmupComplete, nodeCommunities])

  // Warmup: Calculate stable positions before first render
  useEffect(() => {
    runWarmupIfNeeded('effect')
  }, [runWarmupIfNeeded])

  // Initialize velocities
  useEffect(() => {
    nodes.forEach((node) => {
      if (!velocities.current.has(node.id)) {
        velocities.current.set(node.id, [0, 0, 0])
      }
    })
  }, [nodes])

  // Global mouse release handling
  useEffect(() => {
    const handlePointerUp = () => {
      if (draggingNodeId) {
        setDraggingNodeId(null)
        gl.domElement.style.cursor = 'auto'
      }
    }
    gl.domElement.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      gl.domElement.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggingNodeId, setDraggingNodeId, gl.domElement])

  useFrame((_, delta) => {
    const devMode = isDevMode()
    const frameStart = devMode ? recordFrameStart() : 0

    if (pendingWarmup.current && positionsRef.current.size > 0) {
      runWarmupIfNeeded('pending')
    }

    const positions = positionsRef.current
    if (!positions || positions.size === 0 || !running) {
      if (devMode) {
        // Still update node/edge count even when not simulating
        updateNodeEdgeCount(nodes.length, edges.length)
        recordFrameEnd(frameStart)
      }
      return
    }

    // Skip frames after stable to reduce CPU usage
    if (!draggingNodeId && stableFrames.current > 90) {
      if (devMode) {
        updateNodeEdgeCount(nodes.length, edges.length)
        updateStableFrames(stableFrames.current)
        recordFrameEnd(frameStart)
      }
      return
    }

    // Handle dragging
    if (draggingNodeId) {
      if (prevDragging.current !== draggingNodeId) {
        const startPos = positions.get(draggingNodeId)
        if (startPos) {
          dragStartPos.current = [...startPos] as [number, number, number]
          const cameraDir = new THREE.Vector3()
          camera.getWorldDirection(cameraDir)
          dragPlane.current.setFromNormalAndCoplanarPoint(
            cameraDir.clone().negate(),
            new THREE.Vector3(...startPos)
          )
        }
        prevDragging.current = draggingNodeId
      }

      if (dragStartPos.current) {
        raycaster.setFromCamera(pointer, camera)
        const intersectPoint = new THREE.Vector3()
        const hit = raycaster.ray.intersectPlane(dragPlane.current, intersectPoint)
        if (hit) {
          const newPos: [number, number, number] = [
            intersectPoint.x,
            intersectPoint.y,
            intersectPoint.z,
          ]
          velocities.current.set(draggingNodeId, [0, 0, 0])
          draggedNodePos.current = { id: draggingNodeId, pos: newPos }
        }
      }
    } else {
      prevDragging.current = null
      dragStartPos.current = null
      draggedNodePos.current = null
    }

    // Physics simulation
    const physicsStart = devMode ? performance.now() : 0
    const dt = Math.min(delta, 0.05)
    const newPositions = new Map(positions)

    // Apply dragging position
    if (draggedNodePos.current) {
      newPositions.set(draggedNodePos.current.id, draggedNodePos.current.pos)
    }

    // Calculate forces
    const forces = new Map<string, [number, number, number]>()
    nodes.forEach((n) => forces.set(n.id, [0, 0, 0]))

    // Repulsion using Barnes-Hut O(n log n) approximation
    const posArray: [number, number, number][] = []
    const forceArray: [number, number, number][] = []
    const nodeOrder: string[] = []

    for (const node of nodes) {
      const pos = positions.get(node.id)
      if (pos) {
        posArray.push([...pos] as [number, number, number])
        forceArray.push([0, 0, 0])
        nodeOrder.push(node.id)
      }
    }

    calculateBarnesHutRepulsion(posArray, forceArray, physics.repulsionStrength, 0.7)

    // Copy forces back to the forces map
    for (let i = 0; i < nodeOrder.length; i++) {
      const f = forces.get(nodeOrder[i])
      if (f) {
        f[0] += forceArray[i][0]
        f[1] += forceArray[i][1]
        f[2] += forceArray[i][2]
      }
    }

    // Attraction (Hooke's law) with optional adaptive spring length
    const baseSpringLength = physics.springLength
    const springStrength = physics.springStrength

    edges.forEach((edge) => {
      // Skip spring forces for bubble nodes - they should only have repulsion
      // This prevents bubbles from being pulled together by edges
      const isBubbleEdge = edge.source.startsWith('group:') || edge.target.startsWith('group:')
      if (isBubbleEdge) return

      const p1 = positions.get(edge.source)
      const p2 = positions.get(edge.target)
      if (!p1 || !p2) return

      const dx = p2[0] - p1[0]
      const dy = p2[1] - p1[1]
      const dz = p2[2] - p1[2]
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1

      // Calculate spring length (adaptive or fixed)
      let springLength = baseSpringLength
      if (physics.adaptiveSpringEnabled && nodeDegrees) {
        const deg1 = nodeDegrees.get(edge.source)
        const deg2 = nodeDegrees.get(edge.target)
        if (deg1 && deg2) {
          springLength = calculateAdaptiveSpringLength(deg1, deg2, {
            mode: physics.adaptiveSpringMode,
            baseLength: baseSpringLength,
            scaleFactor: physics.adaptiveSpringScale,
            minLength: baseSpringLength * 0.5,
            maxLength: baseSpringLength * 5,
          })
        }
      }

      // Apply community-aware layout adjustment
      if (physics.communityAwareLayout && nodeCommunities) {
        const comm1 = nodeCommunities.get(edge.source)
        const comm2 = nodeCommunities.get(edge.target)
        if (comm1 !== undefined && comm2 !== undefined) {
          if (comm1 === comm2) {
            // Same community: shorter edges (pull together)
            springLength *= physics.communitySameMultiplier
          } else {
            // Different communities: longer edges (push apart)
            springLength *= physics.communityCrossMultiplier
          }
        }
      }

      const displacement = dist - springLength
      const force = springStrength * displacement

      const f1 = forces.get(edge.source)
      const f2 = forces.get(edge.target)
      if (f1 && f2) {
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        const fz = (dz / dist) * force
        f1[0] += fx
        f1[1] += fy
        f1[2] += fz
        f2[0] -= fx
        f2[1] -= fy
        f2[2] -= fz
      }
    })

    // Center gravity
    const centerStrength = physics.centerStrength
    nodes.forEach((node) => {
      const pos = positions.get(node.id)
      if (!pos) return
      const f = forces.get(node.id)!
      f[0] -= pos[0] * centerStrength
      f[1] -= pos[1] * centerStrength
      f[2] -= pos[2] * centerStrength
    })

    // Bubble-to-bubble repulsion (bubbles are synthetic nodes not in the main nodes array)
    // This ensures namespace bubbles spread out rather than clustering together
    const bubbleIds = Array.from(positions.keys()).filter(id => id.startsWith('group:'))

    // Apply center gravity to bubbles too (so they don't fly off)
    bubbleIds.forEach((bubbleId) => {
      const pos = positions.get(bubbleId)
      if (!pos) return
      if (!forces.has(bubbleId)) forces.set(bubbleId, [0, 0, 0])
      const f = forces.get(bubbleId)!
      f[0] -= pos[0] * centerStrength * 0.5 // Weaker center pull for bubbles
      f[1] -= pos[1] * centerStrength * 0.5
      f[2] -= pos[2] * centerStrength * 0.5
    })

    if (bubbleIds.length > 1) {
      // Much stronger repulsion for bubbles - they need to spread out
      const bubbleRepulsionStrength = physics.repulsionStrength * 5
      const minBubbleDist = 8 // Minimum distance to avoid division issues

      for (let i = 0; i < bubbleIds.length; i++) {
        for (let j = i + 1; j < bubbleIds.length; j++) {
          const pos1 = positions.get(bubbleIds[i])
          const pos2 = positions.get(bubbleIds[j])
          if (!pos1 || !pos2) continue

          const dx = pos2[0] - pos1[0]
          const dy = pos2[1] - pos1[1]
          const dz = pos2[2] - pos1[2]
          const distSq = dx * dx + dy * dy + dz * dz
          const dist = Math.sqrt(distSq) || 0.1

          // Always apply repulsion (no distance threshold)
          const effectiveDist = Math.max(dist, minBubbleDist)
          const force = bubbleRepulsionStrength / (effectiveDist * effectiveDist)

          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          const fz = (dz / dist) * force

          // Ensure forces exist for bubbles
          if (!forces.has(bubbleIds[i])) forces.set(bubbleIds[i], [0, 0, 0])
          if (!forces.has(bubbleIds[j])) forces.set(bubbleIds[j], [0, 0, 0])

          const f1 = forces.get(bubbleIds[i])!
          const f2 = forces.get(bubbleIds[j])!
          f1[0] -= fx; f1[1] -= fy; f1[2] -= fz
          f2[0] += fx; f2[1] += fy; f2[2] += fz
        }
      }
    }

    // Namespace clustering force
    if (physics.clusteringEnabled && namespaceGroups) {
      // Convert positions to Vec3 format for centroid calculation
      const positionsVec3 = new Map<string, Vec3>()
      for (const [id, pos] of positions.entries()) {
        positionsVec3.set(id, { x: pos[0], y: pos[1], z: pos[2] })
      }

      // Compute cluster centroids
      const centroids = computeClusterCentroids(namespaceGroups, positionsVec3)

      // Apply clustering force to each node by iterating over groups
      for (const [namespace, clusterNodes] of namespaceGroups.entries()) {
        const centroid = centroids.get(namespace)
        if (!centroid) continue

        for (const node of clusterNodes) {
          const pos = positions.get(node.id)
          const f = forces.get(node.id)
          if (!pos || !f) continue

          const nodePos: Vec3 = { x: pos[0], y: pos[1], z: pos[2] }

          // Attraction to own cluster centroid
          const clusterForce = calculateClusterForce(
            nodePos,
            centroid,
            physics.clusteringStrength
          )
          f[0] += clusterForce.x
          f[1] += clusterForce.y
          f[2] += clusterForce.z

          // Repulsion from other cluster centroids
          if ((physics.clusterSeparation ?? 0) > 0) {
            const separationForce = calculateInterClusterRepulsion(
              nodePos,
              namespace,
              centroids,
              physics.clusterSeparation
            )
            f[0] += separationForce.x
            f[1] += separationForce.y
            f[2] += separationForce.z
          }
        }
      }
    }

    // Community clustering force (direct forces like namespace clustering)
    if (physics.communityAwareLayout && nodeCommunities && nodeCommunities.size > 0) {
      // Group nodes by community ID
      const communityGroups = new Map<number, string[]>()
      for (const [nodeId, communityId] of nodeCommunities.entries()) {
        if (!communityGroups.has(communityId)) {
          communityGroups.set(communityId, [])
        }
        communityGroups.get(communityId)!.push(nodeId)
      }

      // Compute community centroids
      const communityCentroids = new Map<number, Vec3>()
      for (const [communityId, nodeIds] of communityGroups.entries()) {
        let cx = 0, cy = 0, cz = 0
        let count = 0
        for (const nodeId of nodeIds) {
          const pos = positions.get(nodeId)
          if (pos) {
            cx += pos[0]
            cy += pos[1]
            cz += pos[2]
            count++
          }
        }
        if (count > 0) {
          communityCentroids.set(communityId, {
            x: cx / count,
            y: cy / count,
            z: cz / count,
          })
        }
      }

      // Apply community clustering force to each node
      for (const [communityId, nodeIds] of communityGroups.entries()) {
        const centroid = communityCentroids.get(communityId)
        if (!centroid) continue

        for (const nodeId of nodeIds) {
          const pos = positions.get(nodeId)
          const f = forces.get(nodeId)
          if (!pos || !f) continue

          const nodePos: Vec3 = { x: pos[0], y: pos[1], z: pos[2] }

          // Attraction to own community centroid
          const clusterForce = calculateClusterForce(
            nodePos,
            centroid,
            physics.communityClusteringStrength
          )
          f[0] += clusterForce.x
          f[1] += clusterForce.y
          f[2] += clusterForce.z

          // Repulsion from other community centroids
          if ((physics.communitySeparation ?? 0) > 0) {
            for (const [otherCommunityId, otherCentroid] of communityCentroids.entries()) {
              if (otherCommunityId === communityId) continue

              // Calculate repulsion force from other community centroid
              const dx = nodePos.x - otherCentroid.x
              const dy = nodePos.y - otherCentroid.y
              const dz = nodePos.z - otherCentroid.z
              const distSq = dx * dx + dy * dy + dz * dz
              const dist = Math.sqrt(distSq)

              if (dist < 0.1) continue  // Skip if too close

              // Inverse square falloff - decays quickly with distance (same as namespace clustering)
              const force = physics.communitySeparation / (distSq + 1)
              f[0] += (dx / dist) * force
              f[1] += (dy / dist) * force
              f[2] += (dz / dist) * force
            }
          }
        }
      }
    }

    // Boundary constraint - push nodes back if they exceed the boundary radius
    const boundaryRadius = physics.boundaryRadius ?? 50
    const boundaryStrength = physics.boundaryStrength ?? 2.0
    if (boundaryRadius > 0 && boundaryStrength > 0) {
      nodes.forEach((node) => {
        const pos = positions.get(node.id)
        const f = forces.get(node.id)
        if (!pos || !f) return

        const dist = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2])
        if (dist > boundaryRadius) {
          // Push back toward center with force proportional to how far outside the boundary
          const overshoot = dist - boundaryRadius
          const pushStrength = boundaryStrength * overshoot
          f[0] -= (pos[0] / dist) * pushStrength
          f[1] -= (pos[1] / dist) * pushStrength
          f[2] -= (pos[2] / dist) * pushStrength
        }
      })
    }

    // Apply forces (Verlet integration)
    const damping = physics.damping
    const maxVelocity = 10
    let totalMovement = 0

    nodes.forEach((node) => {
      if (node.id === draggingNodeId) return

      const pos = positions.get(node.id)
      const vel = velocities.current.get(node.id) || [0, 0, 0]
      const force = forces.get(node.id)
      if (!pos || !force) return

      // Update velocity
      vel[0] = (vel[0] + force[0] * dt) * damping
      vel[1] = (vel[1] + force[1] * dt) * damping
      vel[2] = (vel[2] + force[2] * dt) * damping

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

      // Guard against NaN - reset to origin if position becomes invalid
      if (Number.isNaN(newPos[0]) || Number.isNaN(newPos[1]) || Number.isNaN(newPos[2])) {
        newPositions.set(node.id, [0, 0, 0])
        velocities.current.set(node.id, [0, 0, 0])
        return
      }

      newPositions.set(node.id, newPos)

      totalMovement += Math.abs(vel[0]) + Math.abs(vel[1]) + Math.abs(vel[2])
    })

    // Apply forces to bubble nodes (not in main nodes array)
    bubbleIds.forEach((bubbleId) => {
      const pos = positions.get(bubbleId)
      const force = forces.get(bubbleId)
      if (!pos || !force) return

      const vel = velocities.current.get(bubbleId) || [0, 0, 0]

      // Update velocity
      vel[0] = (vel[0] + force[0] * dt) * damping
      vel[1] = (vel[1] + force[1] * dt) * damping
      vel[2] = (vel[2] + force[2] * dt) * damping

      // Limit velocity
      const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])
      if (speed > maxVelocity) {
        vel[0] *= maxVelocity / speed
        vel[1] *= maxVelocity / speed
        vel[2] *= maxVelocity / speed
      }

      velocities.current.set(bubbleId, vel)

      // Update position
      const newPos: [number, number, number] = [
        pos[0] + vel[0] * dt,
        pos[1] + vel[1] * dt,
        pos[2] + vel[2] * dt,
      ]

      // Guard against NaN - reset to origin if position becomes invalid
      if (Number.isNaN(newPos[0]) || Number.isNaN(newPos[1]) || Number.isNaN(newPos[2])) {
        newPositions.set(bubbleId, [0, 0, 0])
        velocities.current.set(bubbleId, [0, 0, 0])
        return
      }

      newPositions.set(bubbleId, newPos)

      totalMovement += Math.abs(vel[0]) + Math.abs(vel[1]) + Math.abs(vel[2])
    })

    // Update ref directly (don't trigger React re-renders)
    // Use higher threshold to avoid freezing layouts that are still expanding
    const movementThreshold = 0.05
    if (totalMovement > movementThreshold || draggingNodeId) {
      // Modify Map contents directly instead of replacing entire Map (avoid flashing)
      newPositions.forEach((pos, id) => {
        positionsRef.current.set(id, pos)
      })
      stableFrames.current = 0
      hasTriggeredStable.current = false  // Reset stable trigger flag
    } else {
      // Before declaring stable, check that the layout has reasonable spread
      // Calculate max radius from center to detect collapsed layouts
      let maxRadius = 0
      let cx = 0, cy = 0, cz = 0
      for (const pos of newPositions.values()) {
        cx += pos[0]; cy += pos[1]; cz += pos[2]
      }
      const n = newPositions.size || 1
      cx /= n; cy /= n; cz /= n
      for (const pos of newPositions.values()) {
        const r = Math.sqrt((pos[0]-cx)**2 + (pos[1]-cy)**2 + (pos[2]-cz)**2)
        maxRadius = Math.max(maxRadius, r)
      }

      // Minimum spread: at least 3 units per sqrt(nodes), minimum 5
      const minSpread = Math.max(5, Math.sqrt(nodes.length) * 3)
      const hasGoodSpread = maxRadius >= minSpread

      if (hasGoodSpread) {
        stableFrames.current++
        // Trigger onStable callback when reaching stable threshold (90 frames)
        if (stableFrames.current === 90 && !hasTriggeredStable.current && onStable) {
          hasTriggeredStable.current = true
          onStable()
        }
      } else {
        // Layout is collapsed - don't count as stable, keep simulating
        stableFrames.current = 0
      }
    }

    // Dev mode metrics
    if (devMode) {
      recordPhysicsTime(physicsStart)
      updateNodeEdgeCount(nodes.length, edges.length)
      updateStableFrames(stableFrames.current)
      // Three.js renderer stats
      const info = gl.info
      updateRendererInfo({
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      })
      recordFrameEnd(frameStart)
    }
  })

  return null
}

export default ForceLayout
