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
  groupNodesByNamespace,
  computeClusterCentroids,
  calculateClusterForce,
  calculateInterClusterRepulsion,
  calculateNodeDegrees,
  calculateAdaptiveSpringLength,
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
}

// Default physics parameters
export const DEFAULT_PHYSICS: PhysicsParams = {
  repulsionStrength: 150,    // Increased from 100 for better initial spacing
  springLength: 6,           // Increased from 4 for less cluttered layout
  springStrength: 1.5,       // Slightly reduced for more relaxed springs
  centerStrength: 0.3,       // Reduced to allow more spread
  damping: 0.7,
  // Namespace clustering defaults
  clusteringEnabled: true,
  clusteringStrength: 0.2,   // Reduced from 0.3 for less tight clusters
  clusterSeparation: 0.5,    // Push different clusters apart
  clusteringDepth: 1,
  // Density-adaptive defaults
  adaptiveSpringEnabled: true,
  adaptiveSpringMode: 'sqrt',
  adaptiveSpringScale: 0.5,  // Increased from 0.3 for longer edges on hubs
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
  nodeDegrees?: Map<string, NodeDegree> | null
): number {
  if (positions.size === 0) return 0

  // Calculate forces
  const forces = new Map<string, [number, number, number]>()
  nodes.forEach((n) => forces.set(n.id, [0, 0, 0]))

  // Repulsion (Coulomb's law)
  const repulsionCutoff = 30
  const repulsionCutoffSq = repulsionCutoff * repulsionCutoff
  const baseForce = physics.repulsionStrength

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const p1 = positions.get(nodes[i].id)
      const p2 = positions.get(nodes[j].id)
      if (!p1 || !p2) continue

      const dx = p2[0] - p1[0]
      const dy = p2[1] - p1[1]
      const dz = p2[2] - p1[2]
      const distSq = dx * dx + dy * dy + dz * dz

      if (distSq > repulsionCutoffSq) continue

      const dist = Math.sqrt(distSq) || 0.1
      const minDist = 2
      const effectiveDist = Math.max(dist, minDist)
      const force = baseForce / (effectiveDist * effectiveDist)

      const f1 = forces.get(nodes[i].id)!
      const f2 = forces.get(nodes[j].id)!
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      const fz = (dz / dist) * force

      f1[0] -= fx; f1[1] -= fy; f1[2] -= fz
      f2[0] += fx; f2[1] += fy; f2[2] += fz
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
  allowScaleUp: boolean = false
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
    const movement = simulateStep(nodes, edges, positions, velocities, physics, 0.016, namespaceGroups, nodeDegrees)
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

    const baseRadius = 12
    const dynamicRadius = Math.sqrt(currentCount) * physics.springLength * 0.5
    const targetRadius = Math.min(24, Math.max(baseRadius, dynamicRadius))

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

    const baseIterations = Math.min(1600, 300 + currentCount * 10)
    const warmupIterations = looksDense ? baseIterations : Math.min(800, baseIterations)
    const stabilityThreshold = looksDense ? 0.002 : 0.01

    if (savedRatio > 0.5 && !looksDense) {
      console.log(`[ForceLayout] ${Math.round(savedRatio * 100)}% nodes have saved positions, skipping physics warmup`)
      centerAndScale(positions, targetRadius, allowScaleUp)
    } else {
      console.log(`[ForceLayout] Warming up with ${positions.size} nodes (${Math.round(savedRatio * 100)}% have saved positions)...`)
      warmupSimulation(nodes, edges, positions, physics, warmupIterations, stabilityThreshold, targetRadius, allowScaleUp)
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
  }, [nodes, edges, physics, savedPositionCount, onStable, onWarmupComplete])

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
    if (pendingWarmup.current && positionsRef.current.size > 0) {
      runWarmupIfNeeded('pending')
    }

    const positions = positionsRef.current
    if (!positions || positions.size === 0 || !running) return

    // Skip frames after stable to reduce CPU usage
    if (!draggingNodeId && stableFrames.current > 60) {
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
    const dt = Math.min(delta, 0.05)
    const newPositions = new Map(positions)

    // Apply dragging position
    if (draggedNodePos.current) {
      newPositions.set(draggedNodePos.current.id, draggedNodePos.current.pos)
    }

    // Calculate forces
    const forces = new Map<string, [number, number, number]>()
    nodes.forEach((n) => forces.set(n.id, [0, 0, 0]))

    // Repulsion (Coulomb's law)
    const repulsionCutoff = 30
    const repulsionCutoffSq = repulsionCutoff * repulsionCutoff
    const baseForce = physics.repulsionStrength

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const p1 = positions.get(nodes[i].id)
        const p2 = positions.get(nodes[j].id)
        if (!p1 || !p2) continue

        const dx = p2[0] - p1[0]
        const dy = p2[1] - p1[1]
        const dz = p2[2] - p1[2]
        const distSq = dx * dx + dy * dy + dz * dz

        if (distSq > repulsionCutoffSq) continue

        const dist = Math.sqrt(distSq) || 0.1
        const minDist = 2
        const effectiveDist = Math.max(dist, minDist)
        const force = baseForce / (effectiveDist * effectiveDist)

        const f1 = forces.get(nodes[i].id)!
        const f2 = forces.get(nodes[j].id)!
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        const fz = (dz / dist) * force

        f1[0] -= fx
        f1[1] -= fy
        f1[2] -= fz
        f2[0] += fx
        f2[1] += fy
        f2[2] += fz
      }
    }

    // Attraction (Hooke's law) with optional adaptive spring length
    const baseSpringLength = physics.springLength
    const springStrength = physics.springStrength

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
      newPositions.set(node.id, newPos)

      totalMovement += Math.abs(vel[0]) + Math.abs(vel[1]) + Math.abs(vel[2])
    })

    // Update ref directly (don't trigger React re-renders)
    if (totalMovement > 0.01 || draggingNodeId) {
      // Modify Map contents directly instead of replacing entire Map (avoid flashing)
      newPositions.forEach((pos, id) => {
        positionsRef.current.set(id, pos)
      })
      stableFrames.current = 0
      hasTriggeredStable.current = false  // Reset stable trigger flag
    } else {
      stableFrames.current++
      // Trigger onStable callback when first reaching stable threshold (60 frames)
      if (stableFrames.current === 60 && !hasTriggeredStable.current && onStable) {
        hasTriggeredStable.current = true
        onStable()
      }
    }
  })

  return null
}

export default ForceLayout
