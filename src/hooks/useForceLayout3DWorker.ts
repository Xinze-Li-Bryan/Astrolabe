/**
 * useForceLayout3DWorker - 3D Force Layout with Web Worker
 *
 * Offloads physics computation to a Web Worker for smooth rendering.
 * Falls back to main thread if Worker is not available.
 */

import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import type { Node, Edge } from '@/lib/store'
import { WorkerMessageType } from '@/lib/layout/ForceLayout3DWorker'
import type { PhysicsConfig } from '@/lib/layout/ForceLayout3DWorker'

/**
 * Extract namespace from node name at specified depth
 */
function extractNamespace(name: string, depth: number): string {
  const parts = name.split('.')
  return parts.slice(0, depth).join('.')
}

/**
 * Group nodes by namespace (simplified version for worker)
 */
function groupNodesByNamespace(
  nodes: Node[],
  depth: number
): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const node of nodes) {
    const namespace = extractNamespace(node.name, depth)
    if (!groups.has(namespace)) {
      groups.set(namespace, [])
    }
    groups.get(namespace)!.push(node.id)
  }
  return groups
}

export interface UseForceLayout3DWorkerOptions {
  /** Physics parameters */
  physics?: Partial<PhysicsConfig>
  /** Auto-start on init */
  autoStart?: boolean
  /** Callback when simulation stabilizes */
  onStable?: () => void
  /** Callback on each position update */
  onUpdate?: () => void
  /** Use worker (default true, set false to use main thread) */
  useWorker?: boolean
}

const DEFAULT_PHYSICS: PhysicsConfig = {
  repulsionStrength: 200,
  springLength: 8,
  springStrength: 1.0,
  centerStrength: 0.05,
  damping: 0.8,
}

export interface UseForceLayout3DWorkerResult {
  /** Ref to current positions */
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  /** Start simulation */
  start: () => void
  /** Stop simulation */
  stop: () => void
  /** Whether simulation is running */
  isRunning: boolean
  /** Number of stable frames */
  stableFrames: number
  /** Re-initialize with new data */
  reinit: (nodes: Node[], edges: Edge[]) => void
}

export function useForceLayout3DWorker(
  nodes: Node[],
  edges: Edge[],
  options: UseForceLayout3DWorkerOptions = {}
): UseForceLayout3DWorkerResult {
  const {
    physics = {},
    autoStart = true,
    onStable,
    onUpdate,
    useWorker = true,
  } = options

  const positionsRef = useRef<Map<string, [number, number, number]>>(new Map())
  const velocitiesRef = useRef<Map<string, [number, number, number]>>(new Map())
  const workerRef = useRef<Worker | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [stableFrames, setStableFrames] = useState(0)

  const onStableRef = useRef(onStable)
  const onUpdateRef = useRef(onUpdate)
  onStableRef.current = onStable
  onUpdateRef.current = onUpdate

  const mergedPhysics: PhysicsConfig = { ...DEFAULT_PHYSICS, ...physics }

  // Initialize positions
  const initPositions = useCallback((nodeList: Node[]) => {
    const positions = new Map<string, [number, number, number]>()
    const velocities = new Map<string, [number, number, number]>()

    // Fibonacci sphere distribution
    const n = nodeList.length
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    const radius = Math.sqrt(n) * mergedPhysics.springLength * 0.5

    nodeList.forEach((node, i) => {
      const theta = i * goldenAngle
      const phi = Math.acos(1 - (2 * (i + 0.5)) / n)

      positions.set(node.id, [
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
      ])
      velocities.set(node.id, [0, 0, 0])
    })

    positionsRef.current = positions
    velocitiesRef.current = velocities
  }, [mergedPhysics.springLength])

  // Initialize worker
  const initWorker = useCallback(() => {
    if (!useWorker || typeof Worker === 'undefined') return null

    try {
      const worker = new Worker(
        new URL('../workers/forceLayout3D.worker.ts', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = (e) => {
        const { type, positions, stableFrames: sf } = e.data

        if (type === WorkerMessageType.POSITIONS && positions) {
          // Update positions from worker
          const posMap = new Map<string, [number, number, number]>(positions)
          positionsRef.current = posMap
          setStableFrames(sf || 0)
          onUpdateRef.current?.()
        } else if (type === WorkerMessageType.STABLE) {
          onStableRef.current?.()
        }
      }

      worker.onerror = (err) => {
        console.error('[ForceLayout3DWorker] Worker error:', err)
      }

      return worker
    } catch (err) {
      console.warn('[ForceLayout3DWorker] Failed to create worker, using main thread:', err)
      return null
    }
  }, [useWorker])

  // Compute namespace groups for clustering (if enabled)
  const namespaceGroups = useMemo(() => {
    if (!mergedPhysics.clusteringEnabled) return null
    const depth = mergedPhysics.clusteringDepth || 1
    return groupNodesByNamespace(nodes, depth)
  }, [nodes, mergedPhysics.clusteringEnabled, mergedPhysics.clusteringDepth])

  // Start simulation
  const start = useCallback(() => {
    if (positionsRef.current.size === 0) return

    setIsRunning(true)
    setStableFrames(0)

    if (workerRef.current) {
      // Send init to worker
      workerRef.current.postMessage({
        type: WorkerMessageType.INIT,
        data: {
          positions: Array.from(positionsRef.current.entries()),
          velocities: Array.from(velocitiesRef.current.entries()),
          edges: edges.map((e) => ({ source: e.source, target: e.target })),
          physics: mergedPhysics,
          // Pass namespace groups for clustering
          namespaceGroups: namespaceGroups ? Array.from(namespaceGroups.entries()) : null,
        },
      })

      // Request steps at 60fps
      const requestStep = () => {
        if (!workerRef.current) return
        workerRef.current.postMessage({ type: WorkerMessageType.STEP })
        animationFrameRef.current = requestAnimationFrame(requestStep)
      }
      requestStep()
    }
  }, [edges, mergedPhysics, namespaceGroups])

  // Stop simulation
  const stop = useCallback(() => {
    setIsRunning(false)

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (workerRef.current) {
      workerRef.current.postMessage({ type: WorkerMessageType.STOP })
    }
  }, [])

  // Reinitialize with new data
  const reinit = useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      stop()
      initPositions(newNodes)

      if (workerRef.current && autoStart) {
        // Small delay to ensure positions are set
        setTimeout(() => start(), 0)
      }
    },
    [stop, initPositions, autoStart, start]
  )

  // Setup on mount
  useEffect(() => {
    initPositions(nodes)
    workerRef.current = initWorker()

    if (autoStart && workerRef.current) {
      // Small delay to ensure positions are initialized
      const timer = setTimeout(() => start(), 50)
      return () => clearTimeout(timer)
    }
  }, []) // Only on mount

  // Track previous physics to detect changes
  const prevPhysicsRef = useRef<string>('')

  // Update worker when physics changes
  useEffect(() => {
    const physicsKey = JSON.stringify(mergedPhysics)
    if (prevPhysicsRef.current && prevPhysicsRef.current !== physicsKey && workerRef.current && isRunning) {
      // Physics changed, send update to worker
      workerRef.current.postMessage({
        type: WorkerMessageType.UPDATE_PHYSICS,
        data: {
          physics: mergedPhysics,
          namespaceGroups: namespaceGroups ? Array.from(namespaceGroups.entries()) : null,
        },
      })
      console.log('[ForceLayout3DWorker] Physics updated:', mergedPhysics)
    }
    prevPhysicsRef.current = physicsKey
  }, [mergedPhysics, namespaceGroups, isRunning])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [stop])

  return {
    positionsRef,
    start,
    stop,
    isRunning,
    stableFrames,
    reinit,
  }
}

export default useForceLayout3DWorker
