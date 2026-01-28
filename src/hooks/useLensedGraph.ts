/**
 * useLensedGraph Hook
 *
 * Applies the active lens transformation to graph data.
 * This hook sits between raw data and ForceGraph3D, transforming
 * nodes and edges according to the active lens.
 *
 * Usage:
 *   const { nodes, edges, groups, layout } = useLensedGraph(rawNodes, rawEdges)
 *   // Pass transformed nodes/edges to ForceGraph3D
 */

import { useMemo } from 'react'
import type { AstrolabeNode as Node, AstrolabeEdge as Edge } from '@/types/graph'
import { useLensStore } from '@/lib/lensStore'
import { applyLens } from '@/lib/lenses/pipeline'
import type { LensPipelineResult, NamespaceGroup, LensLayout } from '@/lib/lenses/types'

export interface UseLensedGraphResult {
  // Transformed data
  nodes: Node[]
  edges: Edge[]
  groups: NamespaceGroup[]
  layout: LensLayout

  // Lens state (for UI)
  activeLensId: string
  isAwaitingFocus: boolean
  lensFocusNodeId: string | null
}

/**
 * Hook that applies lens transformation to graph data
 *
 * @param rawNodes - Raw nodes from the graph
 * @param rawEdges - Raw edges from the graph
 * @returns Transformed graph data and lens state
 */
export function useLensedGraph(
  rawNodes: Node[],
  rawEdges: Edge[]
): UseLensedGraphResult {
  // Get lens state
  const activeLensId = useLensStore(state => state.activeLensId)
  const activationState = useLensStore(state => state.activationState)
  const lensFocusNodeId = useLensStore(state => state.lensFocusNodeId)
  const options = useLensStore(state => state.options)
  const expandedGroups = useLensStore(state => state.expandedGroups)

  // Apply lens transformation (memoized for performance)
  const pipelineResult = useMemo<LensPipelineResult>(() => {
    return applyLens(
      activeLensId,
      rawNodes,
      rawEdges,
      lensFocusNodeId,
      options,
      expandedGroups
    )
  }, [activeLensId, rawNodes, rawEdges, lensFocusNodeId, options, expandedGroups])

  return {
    // Transformed data
    nodes: pipelineResult.nodes,
    edges: pipelineResult.edges,
    groups: pipelineResult.groups,
    layout: pipelineResult.layout,

    // Lens state
    activeLensId,
    isAwaitingFocus: activationState === 'awaiting-focus',
    lensFocusNodeId,
  }
}

/**
 * Hook to get lens actions (for UI components)
 */
export function useLensActions() {
  const setActiveLens = useLensStore(state => state.setActiveLens)
  const setLensFocusNode = useLensStore(state => state.setLensFocusNode)
  const cancelLensActivation = useLensStore(state => state.cancelLensActivation)
  const toggleGroupExpanded = useLensStore(state => state.toggleGroupExpanded)
  const autoSelectLens = useLensStore(state => state.autoSelectLens)
  const resetLens = useLensStore(state => state.resetLens)

  return {
    setActiveLens,
    setLensFocusNode,
    cancelLensActivation,
    toggleGroupExpanded,
    autoSelectLens,
    resetLens,
  }
}

export default useLensedGraph
