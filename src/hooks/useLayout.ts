/**
 * useLayout - React Hook for Graph Layout Management
 *
 * Provides a unified interface for different layout algorithms:
 * - ForceAtlas2 (force-directed, good for exploration)
 * - ELK (hierarchical, good for DAGs)
 *
 * Features:
 * - Mode switching with smooth transitions
 * - Position tracking via ref (no unnecessary re-renders)
 * - Automatic cleanup on unmount
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import { ForceAtlas2Layout, ElkLayout } from '@/lib/layout'
import type { Node, Edge } from '@/lib/store'

export type LayoutMode = 'force' | 'hierarchical' | 'auto'

export interface UseLayoutOptions {
  /** Initial layout mode */
  initialMode?: LayoutMode
  /** Auto-start layout on init */
  autoStart?: boolean
  /** Callback when positions update (for force layout) */
  onPositionUpdate?: () => void
}

export interface UseLayoutResult {
  /** Current layout mode */
  mode: LayoutMode
  /** Set layout mode */
  setMode: (mode: LayoutMode) => void
  /** Ref to current positions (avoid re-renders) */
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  /** Start the layout (force mode only) */
  start: () => void
  /** Stop the layout (force mode only) */
  stop: () => void
  /** Whether force layout is currently running */
  isRunning: boolean
  /** Recompute layout with current data */
  recompute: () => Promise<void>
}

/**
 * Determine best layout mode based on graph structure
 */
function autoSelectMode(nodes: Node[], edges: Edge[]): 'force' | 'hierarchical' {
  if (nodes.length === 0) return 'force'

  // Check if graph is a DAG (no cycles) by looking at edge patterns
  // Simple heuristic: if edge count is close to node count - 1, likely a tree/DAG
  const edgeRatio = edges.length / Math.max(1, nodes.length - 1)

  // Also check if graph is relatively sparse
  const density = edges.length / Math.max(1, nodes.length * (nodes.length - 1))

  // Prefer hierarchical for sparse DAGs with clear structure
  if (edgeRatio < 3 && density < 0.1 && nodes.length < 500) {
    return 'hierarchical'
  }

  // Prefer force for dense or large graphs
  return 'force'
}

/**
 * Hook for managing graph layout
 */
export function useLayout(
  nodes: Node[],
  edges: Edge[],
  options: UseLayoutOptions = {}
): UseLayoutResult {
  const { initialMode = 'force', autoStart = true, onPositionUpdate } = options

  // Resolve 'auto' mode to actual mode
  const resolvedInitialMode =
    initialMode === 'auto' ? autoSelectMode(nodes, edges) : initialMode

  const [mode, setModeInternal] = useState<LayoutMode>(resolvedInitialMode)
  const [isRunning, setIsRunning] = useState(false)

  const positionsRef = useRef<Map<string, [number, number, number]>>(new Map())
  const forceLayoutRef = useRef<ForceAtlas2Layout | null>(null)
  const elkLayoutRef = useRef<ElkLayout | null>(null)

  // Handle position updates from force layout
  const handlePositionUpdate = useCallback(
    (positions: Map<string, [number, number, number]>) => {
      positionsRef.current = positions
      onPositionUpdate?.()
    },
    [onPositionUpdate]
  )

  // Initialize force layout
  const initForceLayout = useCallback(() => {
    if (forceLayoutRef.current) {
      forceLayoutRef.current.kill()
    }

    const layout = new ForceAtlas2Layout(handlePositionUpdate)
    layout.init(nodes, edges)
    forceLayoutRef.current = layout

    if (autoStart) {
      layout.start()
      setIsRunning(true)
    }
  }, [nodes, edges, autoStart, handlePositionUpdate])

  // Initialize ELK layout
  const initElkLayout = useCallback(async () => {
    if (!elkLayoutRef.current) {
      elkLayoutRef.current = new ElkLayout({ useModelOrder: true })
    }

    const positions = await elkLayoutRef.current.compute(nodes, edges)
    positionsRef.current = positions
    onPositionUpdate?.()
  }, [nodes, edges, onPositionUpdate])

  // Set mode with transition
  const setMode = useCallback(
    async (newMode: LayoutMode) => {
      const actualMode = newMode === 'auto' ? autoSelectMode(nodes, edges) : newMode

      // Stop force layout if switching away
      if (mode === 'force' && forceLayoutRef.current) {
        forceLayoutRef.current.stop()
        setIsRunning(false)
      }

      setModeInternal(actualMode)

      // Initialize new layout
      if (actualMode === 'force') {
        initForceLayout()
      } else {
        await initElkLayout()
      }
    },
    [mode, nodes, edges, initForceLayout, initElkLayout]
  )

  // Start force layout
  const start = useCallback(() => {
    if (mode === 'force' && forceLayoutRef.current) {
      forceLayoutRef.current.start()
      setIsRunning(true)
    }
  }, [mode])

  // Stop force layout
  const stop = useCallback(() => {
    if (forceLayoutRef.current) {
      forceLayoutRef.current.stop()
      setIsRunning(false)
    }
  }, [])

  // Recompute layout
  const recompute = useCallback(async () => {
    if (mode === 'force') {
      initForceLayout()
    } else {
      await initElkLayout()
    }
  }, [mode, initForceLayout, initElkLayout])

  // Initialize on mount and when nodes/edges change
  useEffect(() => {
    if (mode === 'force') {
      initForceLayout()
    } else {
      initElkLayout()
    }

    return () => {
      if (forceLayoutRef.current) {
        forceLayoutRef.current.kill()
        forceLayoutRef.current = null
      }
    }
  }, []) // Only on mount

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (forceLayoutRef.current) {
        forceLayoutRef.current.kill()
      }
    }
  }, [])

  return {
    mode: mode === 'auto' ? autoSelectMode(nodes, edges) : mode,
    setMode,
    positionsRef,
    start,
    stop,
    isRunning,
    recompute,
  }
}

export default useLayout
