/**
 * useGraphData Hook
 *
 * Load Node and Edge data from Python backend
 * Adapted for backend API: loadProject/refreshProject
 *
 * Note: This version uses Python backend API instead of Tauri invoke
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { loadProject, getProject, refreshProject, checkProjectStatus, type ProjectStatus } from '@/lib/api'
import type { Node, Edge } from '@/types/node'
import type {
  AstrolabeNode,
  AstrolabeEdge,
  NodeKind,
  GraphNode,
  GraphLink,
} from '@/types/graph'
import { useFileWatch } from './useFileWatch'
import {
  processGraph,
  type GraphFilterOptions,
  DEFAULT_FILTER_OPTIONS,
} from '@/lib/graphProcessing'

// Re-export types for backward compatibility
export type { GraphNode, GraphLink } from '@/types/graph'
export type { GraphFilterOptions } from '@/lib/graphProcessing'
export { DEFAULT_FILTER_OPTIONS } from '@/lib/graphProcessing'

// Node types that require proof status halo (matches backend PROOF_REQUIRING_KINDS)
const PROOF_REQUIRING_KINDS = ['theorem', 'lemma', 'proposition', 'corollary']

export interface FilterStats {
  removedNodes: number      // Technical nodes filtered out
  virtualEdgesCreated: number  // Through-link edges created
  orphanedNodes: number     // Nodes removed because they became disconnected
  transitiveEdgesRemoved: number  // Edges removed by transitive reduction
}

export interface GraphData {
  // New types (internal use) - these are PROCESSED (filtered)
  nodes: AstrolabeNode[]
  edges: AstrolabeEdge[]

  // Raw data (unfiltered, for stats)
  rawNodeCount: number
  rawEdgeCount: number

  // Legacy compatibility (still used by page.tsx and Graph3D)
  legacyNodes: GraphNode[]
  links: GraphLink[]

  loading: boolean
  reload: () => void
  reloadMeta: () => void  // Lightweight reload for meta.json changes

  // Project status
  projectStatus: ProjectStatus | null
  needsInit: boolean
  notSupported: boolean  // Not a Lean 4 Lake project
  recheckStatus: () => Promise<ProjectStatus | null | undefined>

  // Filtering
  filterOptions: GraphFilterOptions
  setFilterOptions: (options: GraphFilterOptions) => void
  filterStats: FilterStats  // Stats from graph processing
}

/**
 * Convert backend Node to AstrolabeNode
 *
 * Node types requiring proof (theorem/lemma etc.) default to 'stated' status
 * Other types (definition/axiom etc.) are also set to 'stated'
 */
function backendNodeToAstrolabe(node: Node): AstrolabeNode {
  // All nodes default to 'stated' status (no status halo)
  const status: 'proven' | 'sorry' | 'error' | 'stated' | 'unknown' = 'stated'

  return {
    id: node.id,
    name: node.name,
    kind: node.kind as NodeKind,
    status,
    leanFile: { path: node.filePath, line: node.lineNumber },
    notes: node.meta.notes,  // User notes from backend meta.json

    // Default style (from graph.json)
    defaultColor: node.defaultColor,
    defaultSize: node.defaultSize,
    defaultShape: node.defaultShape,

    // User overrides (from meta.json)
    size: node.meta.size,
    shape: node.meta.shape,
    effect: node.meta.effect,

    // position has been moved to canvas.json, no longer read from node.meta
    pinned: node.meta.pinned ?? false,
    visible: true, // visibility is managed by canvas.json, not meta.json
  }
}

/**
 * Convert backend Edge to AstrolabeEdge
 */
function backendEdgeToAstrolabe(edge: Edge): AstrolabeEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    fromLean: edge.fromLean,

    // Default style (from graph.json)
    defaultColor: edge.defaultColor,
    defaultWidth: edge.defaultWidth,
    defaultStyle: edge.defaultStyle,

    // User overrides (from meta.json) - color and width removed
    style: edge.meta?.style,
    effect: edge.meta?.effect,

    visible: edge.visible ?? true,
  }
}

export function useGraphData(projectPath: string): GraphData {
  const [rawNodes, setRawNodes] = useState<AstrolabeNode[]>([])
  const [rawEdges, setRawEdges] = useState<AstrolabeEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null)
  const [filterOptions, setFilterOptions] = useState<GraphFilterOptions>(DEFAULT_FILTER_OPTIONS)
  const loadedRef = useRef(false)

  // Check project status
  const recheckStatus = useCallback(async () => {
    if (!projectPath) return
    try {
      const status = await checkProjectStatus(projectPath)
      setProjectStatus(status)
      return status
    } catch (err) {
      console.error('[useGraphData] Check status failed:', err)
      return null
    }
  }, [projectPath])

  const loadGraph = useCallback(async () => {
    if (!projectPath || loadedRef.current) return
    loadedRef.current = true

    setLoading(true)

    try {
      // Check status first
      const status = await recheckStatus()

      // If needs initialization or not supported, don't load project
      if (status?.needsInit || status?.notSupported) {
        console.log('[useGraphData] Project needs initialization or not supported')
        setLoading(false)
        return
      }

      // Call backend API to load project
      const response = await loadProject(projectPath)

      // Convert backend nodes to AstrolabeNode
      const astrolabeNodes = response.nodes.map(backendNodeToAstrolabe)
      const astrolabeEdges = response.edges.map(backendEdgeToAstrolabe)

      setRawNodes(astrolabeNodes)
      setRawEdges(astrolabeEdges)

      console.log(`[useGraphData] Loaded ${astrolabeNodes.length} nodes and ${astrolabeEdges.length} edges from backend`)

    } catch (err) {
      console.error('Failed to load graph from backend:', err)
    } finally {
      setLoading(false)
    }
  }, [projectPath, recheckStatus])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  const reload = useCallback(async () => {
    loadedRef.current = false
    // Don't clear nodes/edges to [] - this would trigger ForceGraph3D to clear all positions
    // Just set loading state and let the new data replace the old
    setLoading(true)

    try {
      // Call backend refresh API
      await refreshProject(projectPath)
      // Then reload the data
      const response = await loadProject(projectPath)

      const astrolabeNodes = response.nodes.map(backendNodeToAstrolabe)
      const astrolabeEdges = response.edges.map(backendEdgeToAstrolabe)

      setRawNodes(astrolabeNodes)
      setRawEdges(astrolabeEdges)

      console.log(`[useGraphData] Reloaded ${astrolabeNodes.length} nodes and ${astrolabeEdges.length} edges`)
    } catch (err) {
      console.error('Failed to reload graph:', err)
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  // Meta refresh: use getProject (GET) instead of loadProject (POST) for lighter reload
  // This avoids re-parsing the project on the backend
  const reloadMeta = useCallback(async () => {
    if (!projectPath) return
    try {
      // Use getProject (GET) instead of loadProject (POST) - much lighter
      const response = await getProject(projectPath)

      const astrolabeNodes = response.nodes.map(backendNodeToAstrolabe)
      const astrolabeEdges = response.edges.map(backendEdgeToAstrolabe)

      setRawNodes(astrolabeNodes)
      setRawEdges(astrolabeEdges)

      console.log(`[useGraphData] Meta refreshed: ${astrolabeNodes.length} nodes`)
    } catch (err) {
      console.error('Failed to reload meta:', err)
    }
  }, [projectPath])

  // WebSocket file change monitoring
  useFileWatch(projectPath, {
    onRefresh: reload,       // .ilean changes → full reload
    onMetaRefresh: reloadMeta, // meta.json changes → only refresh meta
  })

  // ============================================
  // Apply graph processing (filtering + through-links)
  // ============================================
  const { nodes, edges, stats: filterStats } = useMemo(
    () => {
      const result = processGraph(rawNodes, rawEdges, filterOptions)
      const hasChanges = result.stats.removedNodes > 0 ||
        result.stats.orphanedNodes > 0 ||
        result.stats.transitiveEdgesRemoved > 0
      if (hasChanges) {
        console.log(
          `[processGraph] Filtered ${result.stats.removedNodes} technical nodes, ` +
          `${result.stats.orphanedNodes} orphaned nodes, ` +
          `created ${result.stats.virtualEdgesCreated} virtual edges, ` +
          `removed ${result.stats.transitiveEdgesRemoved} transitive edges. ` +
          `Result: ${result.nodes.length} nodes, ${result.edges.length} edges`
        )
      }
      return result
    },
    [rawNodes, rawEdges, filterOptions]
  )

  // ============================================
  // Legacy compatibility: convert to old types
  // Priority: user overrides > defaults
  // ============================================
  const legacyNodes: GraphNode[] = nodes.map(node => ({
    id: node.id,
    name: node.name,
    type: node.kind,
    status: node.status,
    leanFilePath: node.leanFile?.path,
    leanLineNumber: node.leanFile?.line,
    notes: node.notes,  // User notes
    customColor: node.defaultColor,
    customSize: node.size ?? node.defaultSize,
    customEffect: node.effect,
    x: node.position?.x,
    y: node.position?.y,
    z: node.position?.z,
  }))

  const links: GraphLink[] = edges.map(edge => ({
    source: edge.source,
    target: edge.target,
    type: 'lean',
  }))

  return {
    nodes,
    edges,
    rawNodeCount: rawNodes.length,
    rawEdgeCount: rawEdges.length,
    legacyNodes,
    links,
    loading,
    reload,
    reloadMeta,  // Expose for manual refresh after meta updates
    projectStatus,
    needsInit: projectStatus?.needsInit ?? false,
    notSupported: projectStatus?.notSupported ?? false,
    recheckStatus,
    filterOptions,
    setFilterOptions,
    filterStats,
  }
}
