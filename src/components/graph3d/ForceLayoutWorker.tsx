'use client'

/**
 * ForceLayoutWorker - 3D Force Layout with Web Worker
 *
 * Drop-in replacement for ForceLayout that uses a Web Worker
 * for physics computation, keeping the main thread free for rendering.
 *
 * Usage: Replace <ForceLayout .../> with <ForceLayoutWorker .../>
 */

import { useEffect, useRef, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Node, Edge } from '@/lib/store'
import { useForceLayout3DWorker } from '@/hooks/useForceLayout3DWorker'
import type { PhysicsParams } from './ForceLayout'

interface ForceLayoutWorkerProps {
  nodes: Node[]
  edges: Edge[]
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  draggingNodeId: string | null
  setDraggingNodeId: (id: string | null) => void
  running?: boolean
  physics?: PhysicsParams
  savedPositionCount?: number
  onStable?: () => void
  onWarmupComplete?: () => void
  controlsRef?: React.RefObject<any>
}

export function ForceLayoutWorker({
  nodes,
  edges,
  positionsRef,
  draggingNodeId,
  setDraggingNodeId,
  running = true,
  physics,
  savedPositionCount = 0,
  onStable,
  onWarmupComplete,
  controlsRef,
}: ForceLayoutWorkerProps) {
  const { camera, raycaster, gl, pointer } = useThree()
  const dragPlane = useRef(new THREE.Plane())
  const dragStartPos = useRef<[number, number, number] | null>(null)
  const prevDragging = useRef<string | null>(null)
  const draggedNodePos = useRef<{ id: string; pos: [number, number, number] } | null>(null)
  const hasCalledWarmup = useRef(false)

  // Use Worker-based layout
  const {
    positionsRef: workerPositionsRef,
    start,
    stop,
    isRunning,
    stableFrames,
    reinit,
  } = useForceLayout3DWorker(nodes, edges, {
    physics: physics
      ? {
          // Basic physics
          repulsionStrength: physics.repulsionStrength,
          springLength: physics.springLength,
          springStrength: physics.springStrength,
          centerStrength: physics.centerStrength,
          damping: physics.damping,
          // Namespace clustering
          clusteringEnabled: physics.clusteringEnabled,
          clusteringStrength: physics.clusteringStrength,
          clusterSeparation: physics.clusterSeparation,
          clusteringDepth: physics.clusteringDepth,
          // Adaptive spring length
          adaptiveSpringEnabled: physics.adaptiveSpringEnabled,
          adaptiveSpringMode: physics.adaptiveSpringMode,
          adaptiveSpringScale: physics.adaptiveSpringScale,
        }
      : undefined,
    autoStart: running,
    onStable,
    onUpdate: () => {
      // Sync worker positions to the external positionsRef
      const workerPositions = workerPositionsRef.current
      for (const [id, pos] of workerPositions.entries()) {
        positionsRef.current.set(id, pos)
      }
    },
  })

  // Call warmup complete after first positions are set
  useEffect(() => {
    if (!hasCalledWarmup.current && workerPositionsRef.current.size > 0) {
      hasCalledWarmup.current = true
      onWarmupComplete?.()
    }
  }, [workerPositionsRef.current.size, onWarmupComplete])

  // Handle running state changes
  useEffect(() => {
    if (running && !isRunning) {
      start()
    } else if (!running && isRunning) {
      stop()
    }
  }, [running, isRunning, start, stop])

  // Reinit when nodes change significantly
  useEffect(() => {
    if (nodes.length > 0) {
      reinit(nodes, edges)
    }
  }, [nodes.length])

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

  // Handle dragging (still on main thread for responsiveness)
  useFrame(() => {
    if (!running) return

    // Handle dragging
    if (draggingNodeId) {
      if (prevDragging.current !== draggingNodeId) {
        const startPos = positionsRef.current.get(draggingNodeId)
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
          draggedNodePos.current = { id: draggingNodeId, pos: newPos }
          // Update position immediately for responsive dragging
          positionsRef.current.set(draggingNodeId, newPos)
        }
      }
    } else {
      prevDragging.current = null
      dragStartPos.current = null
      draggedNodePos.current = null
    }
  })

  return null
}

export default ForceLayoutWorker
