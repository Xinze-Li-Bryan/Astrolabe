/**
 * HierarchicalLayout - Tree-like layout for dependency graphs
 *
 * Arranges nodes in vertical layers based on their depth from the focus node.
 * Used by imports/dependents lenses to show dependency trees clearly.
 */

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { AstrolabeNode, AstrolabeEdge } from '@/types/graph'

// ============================================
// Types
// ============================================

export interface HierarchicalLayoutProps {
  nodes: AstrolabeNode[]
  edges: AstrolabeEdge[]
  focusNodeId: string | null
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  direction?: 'down' | 'up'  // down = ancestors (focus at top), up = descendants (focus at bottom)
  layerSpacing?: number      // Vertical spacing between layers
  nodeSpacing?: number       // Horizontal spacing between nodes in a layer
  enablePhysics?: boolean    // Enable gentle physics for within-layer arrangement
  onLayoutReady?: () => void
}

// ============================================
// Depth Computation
// ============================================

/**
 * Compute depth of each node from the focus node using BFS
 */
function computeDepths(
  focusNodeId: string,
  nodes: AstrolabeNode[],
  edges: AstrolabeEdge[],
  direction: 'down' | 'up'
): Map<string, number> {
  const depths = new Map<string, number>()
  const nodeIds = new Set(nodes.map(n => n.id))

  // Build adjacency based on direction
  // down (ancestors): follow outgoing edges (source -> target)
  // up (descendants): follow incoming edges (target <- source)
  const adjacency = new Map<string, string[]>()

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue

    if (direction === 'down') {
      // For ancestors: from source, go to target
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, [])
      adjacency.get(edge.source)!.push(edge.target)
    } else {
      // For descendants: from target, go to source (reverse direction)
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, [])
      adjacency.get(edge.target)!.push(edge.source)
    }
  }

  // BFS from focus
  const queue: Array<{ id: string; depth: number }> = [{ id: focusNodeId, depth: 0 }]

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    if (depths.has(id)) continue
    depths.set(id, depth)

    const neighbors = adjacency.get(id) ?? []
    for (const neighbor of neighbors) {
      if (!depths.has(neighbor) && nodeIds.has(neighbor)) {
        queue.push({ id: neighbor, depth: depth + 1 })
      }
    }
  }

  // Assign depth 0 to any orphaned nodes (shouldn't happen with proper filtering)
  for (const node of nodes) {
    if (!depths.has(node.id)) {
      depths.set(node.id, 0)
    }
  }

  return depths
}

/**
 * Group nodes by their depth level
 */
function groupByDepth(nodes: AstrolabeNode[], depths: Map<string, number>): Map<number, AstrolabeNode[]> {
  const layers = new Map<number, AstrolabeNode[]>()

  for (const node of nodes) {
    const depth = depths.get(node.id) ?? 0
    if (!layers.has(depth)) layers.set(depth, [])
    layers.get(depth)!.push(node)
  }

  return layers
}

// ============================================
// Position Calculation
// ============================================

/**
 * Calculate initial positions for hierarchical layout
 */
function calculateHierarchicalPositions(
  nodes: AstrolabeNode[],
  edges: AstrolabeEdge[],
  focusNodeId: string,
  direction: 'down' | 'up',
  layerSpacing: number,
  nodeSpacing: number
): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>()

  if (nodes.length === 0 || !focusNodeId) return positions

  // Compute depths
  const depths = computeDepths(focusNodeId, nodes, edges, direction)
  const layers = groupByDepth(nodes, depths)

  // Calculate positions for each layer
  const sortedDepths = Array.from(layers.keys()).sort((a, b) => a - b)

  for (const depth of sortedDepths) {
    const layerNodes = layers.get(depth)!
    const layerWidth = (layerNodes.length - 1) * nodeSpacing
    const startX = -layerWidth / 2

    // Y position based on depth and direction
    // down: focus at top (y=0), deeper nodes go down (negative y)
    // up: focus at bottom (y=0), deeper nodes go up (positive y)
    const y = direction === 'down' ? -depth * layerSpacing : depth * layerSpacing

    // Sort nodes in layer for consistent ordering
    layerNodes.sort((a, b) => a.id.localeCompare(b.id))

    layerNodes.forEach((node, index) => {
      const x = startX + index * nodeSpacing
      const z = 0 // Flat in the Z plane
      positions.set(node.id, [x, y, z])
    })
  }

  return positions
}

// ============================================
// Component
// ============================================

export function HierarchicalLayout({
  nodes,
  edges,
  focusNodeId,
  positionsRef,
  direction = 'down',
  layerSpacing = 10,
  nodeSpacing = 6,
  enablePhysics = false,
  onLayoutReady,
}: HierarchicalLayoutProps) {
  const initialized = useRef(false)
  const frameCount = useRef(0)

  // Initialize positions on mount or when data changes
  useEffect(() => {
    if (!focusNodeId || nodes.length === 0) return

    const positions = calculateHierarchicalPositions(
      nodes,
      edges,
      focusNodeId,
      direction,
      layerSpacing,
      nodeSpacing
    )

    // Apply positions
    for (const [id, pos] of positions) {
      positionsRef.current.set(id, pos)
    }

    initialized.current = true
    frameCount.current = 0
  }, [nodes, edges, focusNodeId, direction, layerSpacing, nodeSpacing, positionsRef])

  // Optional physics for gentle within-layer repulsion
  useFrame(() => {
    if (!initialized.current) return

    frameCount.current++

    // Signal ready after a few frames
    if (frameCount.current === 3 && onLayoutReady) {
      onLayoutReady()
    }

    if (!enablePhysics) return

    // Gentle horizontal repulsion within layers
    // Group nodes by their current Y position (layer)
    const layerMap = new Map<number, string[]>()
    for (const node of nodes) {
      const pos = positionsRef.current.get(node.id)
      if (!pos) continue
      const layerY = Math.round(pos[1] / layerSpacing) * layerSpacing
      if (!layerMap.has(layerY)) layerMap.set(layerY, [])
      layerMap.get(layerY)!.push(node.id)
    }

    // Apply repulsion within each layer
    const repulsionStrength = 0.1
    const minDistance = nodeSpacing * 0.8

    for (const nodeIds of layerMap.values()) {
      if (nodeIds.length < 2) continue

      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const posA = positionsRef.current.get(nodeIds[i])!
          const posB = positionsRef.current.get(nodeIds[j])!

          const dx = posA[0] - posB[0]
          const distance = Math.abs(dx)

          if (distance < minDistance && distance > 0.01) {
            const force = (minDistance - distance) * repulsionStrength
            const sign = dx > 0 ? 1 : -1
            posA[0] += sign * force
            posB[0] -= sign * force
          }
        }
      }
    }
  })

  return null
}

export default HierarchicalLayout
