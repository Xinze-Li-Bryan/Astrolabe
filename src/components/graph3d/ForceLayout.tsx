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

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Node, Edge } from '@/lib/store'

// Physics parameter types
export interface PhysicsParams {
  repulsionStrength: number  // Repulsion strength (default 100)
  springLength: number       // Spring length (default 4)
  springStrength: number     // Spring strength (default 2)
  centerStrength: number     // Center gravity (default 0.5)
  damping: number            // Damping coefficient (default 0.85)
}

// Default physics parameters
export const DEFAULT_PHYSICS: PhysicsParams = {
  repulsionStrength: 100,
  springLength: 4,
  springStrength: 2,
  centerStrength: 0.5,
  damping: 0.85,
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
  dt: number = 0.016
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

  // Attraction (Hooke's law)
  edges.forEach((edge) => {
    const p1 = positions.get(edge.source)
    const p2 = positions.get(edge.target)
    if (!p1 || !p2) return

    const dx = p2[0] - p1[0]
    const dy = p2[1] - p1[1]
    const dz = p2[2] - p1[2]
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1
    const displacement = dist - physics.springLength
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
  positions: Map<string, [number, number, number]>
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

  // 4. Scale to viewport
  const targetRadius = 8
  if (maxRadius > 0.1) {
    const scale = targetRadius / maxRadius
    if (scale < 1) {
      for (const [id, pos] of positions.entries()) {
        positions.set(id, [pos[0] * scale, pos[1] * scale, pos[2] * scale])
      }
    }
  }
}

/**
 * Warmup: Quickly run physics simulation until stable, then center and scale to appropriate size
 * Only used when there are no saved positions
 */
function warmupSimulation(
  nodes: Node[],
  edges: Edge[],
  positions: Map<string, [number, number, number]>,
  physics: PhysicsParams,
  maxIterations: number = 500,
  stabilityThreshold: number = 0.01
): void {
  const velocities = new Map<string, [number, number, number]>()
  nodes.forEach((node) => velocities.set(node.id, [0, 0, 0]))

  let stableCount = 0
  for (let i = 0; i < maxIterations; i++) {
    const movement = simulateStep(nodes, edges, positions, velocities, physics)
    if (movement < stabilityThreshold) {
      stableCount++
      if (stableCount > 10) break // Stop after 10 consecutive stable frames
    } else {
      stableCount = 0
    }
  }

  // Center and scale
  centerAndScale(positions)
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
}: ForceLayoutProps) {
  // Use ref directly, don't trigger React re-renders
  const positions = positionsRef.current
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

  // Warmup: Calculate stable positions before first render
  useEffect(() => {
    // Detect if warmup is needed (first load or large change in node count)
    const currentCount = nodes.length
    const countChange = Math.abs(currentCount - lastNodeCount.current)
    const needsWarmup = !hasWarmedUp.current || countChange > currentCount * 0.5

    if (needsWarmup && positions.size > 0) {
      // If most nodes have saved positions (>50%), only center and scale, skip physics simulation
      const savedRatio = savedPositionCount / currentCount

      if (savedRatio > 0.5) {
        console.log(`[ForceLayout] ${Math.round(savedRatio * 100)}% nodes have saved positions, skipping physics warmup`)
        centerAndScale(positions)
      } else {
        console.log(`[ForceLayout] Warming up with ${positions.size} nodes (${Math.round(savedRatio * 100)}% have saved positions)...`)
        warmupSimulation(nodes, edges, positions, physics)
      }

      hasWarmedUp.current = true
      stableFrames.current = 61 // Mark as stable, skip subsequent frames
      console.log('[ForceLayout] Initialization complete, positions stabilized')
    }

    lastNodeCount.current = currentCount
  }, [nodes, edges, physics, positions, savedPositionCount])

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
    if (positions.size === 0 || !running) return

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

    // Attraction (Hooke's law)
    const springLength = physics.springLength
    const springStrength = physics.springStrength

    edges.forEach((edge) => {
      const p1 = positions.get(edge.source)
      const p2 = positions.get(edge.target)
      if (!p1 || !p2) return

      const dx = p2[0] - p1[0]
      const dy = p2[1] - p1[1]
      const dz = p2[2] - p1[2]
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1
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
