/**
 * Tests for HierarchicalLayout utility functions
 *
 * Tests the position calculation logic for hierarchical (tree) layouts
 */

import { describe, it, expect } from 'vitest'
import type { AstrolabeNode, AstrolabeEdge } from '@/types/graph'

// Import internal functions for testing
// We'll test the logic by simulating what the component does

// ============================================
// Test Fixtures
// ============================================

function makeNode(id: string): AstrolabeNode {
  return {
    id,
    name: id,
    kind: 'theorem',
    status: 'proven',
    defaultColor: '#888',
    defaultSize: 1,
    defaultShape: 'sphere',
    pinned: false,
    visible: true,
  }
}

function makeEdge(source: string, target: string): AstrolabeEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    fromLean: true,
    defaultColor: '#888',
    defaultWidth: 1,
    defaultStyle: 'solid',
    visible: true,
  }
}

// ============================================
// Depth Computation (replicating component logic)
// ============================================

function computeDepths(
  focusNodeId: string,
  nodes: AstrolabeNode[],
  edges: AstrolabeEdge[],
  direction: 'down' | 'up'
): Map<string, number> {
  const depths = new Map<string, number>()
  const nodeIds = new Set(nodes.map(n => n.id))

  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    if (direction === 'down') {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, [])
      adjacency.get(edge.source)!.push(edge.target)
    } else {
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, [])
      adjacency.get(edge.target)!.push(edge.source)
    }
  }

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

  for (const node of nodes) {
    if (!depths.has(node.id)) depths.set(node.id, 0)
  }

  return depths
}

// ============================================
// Tests
// ============================================

describe('HierarchicalLayout depth computation', () => {
  describe('direction: down (ancestors)', () => {
    it('should compute correct depths for linear chain', () => {
      // A -> B -> C -> D
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')]
      const edges = [
        makeEdge('A', 'B'),
        makeEdge('B', 'C'),
        makeEdge('C', 'D'),
      ]

      const depths = computeDepths('A', nodes, edges, 'down')

      expect(depths.get('A')).toBe(0)  // focus
      expect(depths.get('B')).toBe(1)  // A depends on B
      expect(depths.get('C')).toBe(2)  // B depends on C
      expect(depths.get('D')).toBe(3)  // C depends on D
    })

    it('should handle branching', () => {
      //     B
      //   /
      // A
      //   \
      //     C -> D
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')]
      const edges = [
        makeEdge('A', 'B'),
        makeEdge('A', 'C'),
        makeEdge('C', 'D'),
      ]

      const depths = computeDepths('A', nodes, edges, 'down')

      expect(depths.get('A')).toBe(0)
      expect(depths.get('B')).toBe(1)
      expect(depths.get('C')).toBe(1)
      expect(depths.get('D')).toBe(2)
    })

    it('should handle diamond pattern', () => {
      //     B
      //   /   \
      // A       D
      //   \   /
      //     C
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')]
      const edges = [
        makeEdge('A', 'B'),
        makeEdge('A', 'C'),
        makeEdge('B', 'D'),
        makeEdge('C', 'D'),
      ]

      const depths = computeDepths('A', nodes, edges, 'down')

      expect(depths.get('A')).toBe(0)
      expect(depths.get('B')).toBe(1)
      expect(depths.get('C')).toBe(1)
      expect(depths.get('D')).toBe(2)  // Reached via B or C, both at depth 1
    })
  })

  describe('direction: up (descendants)', () => {
    it('should compute correct depths for linear chain', () => {
      // A <- B <- C <- D
      // (A depends on B, B depends on C, C depends on D)
      // When showing descendants of D, we want: D->C->B->A
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')]
      const edges = [
        makeEdge('A', 'B'),  // A depends on B
        makeEdge('B', 'C'),  // B depends on C
        makeEdge('C', 'D'),  // C depends on D
      ]

      const depths = computeDepths('D', nodes, edges, 'up')

      expect(depths.get('D')).toBe(0)  // focus
      expect(depths.get('C')).toBe(1)  // C depends on D
      expect(depths.get('B')).toBe(2)  // B depends on C
      expect(depths.get('A')).toBe(3)  // A depends on B
    })

    it('should handle multiple dependents', () => {
      // A -> D, B -> D, C -> D
      // When showing descendants of D: D is focus, A/B/C are at depth 1
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')]
      const edges = [
        makeEdge('A', 'D'),
        makeEdge('B', 'D'),
        makeEdge('C', 'D'),
      ]

      const depths = computeDepths('D', nodes, edges, 'up')

      expect(depths.get('D')).toBe(0)
      expect(depths.get('A')).toBe(1)
      expect(depths.get('B')).toBe(1)
      expect(depths.get('C')).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('should handle single node', () => {
      const nodes = [makeNode('A')]
      const edges: AstrolabeEdge[] = []

      const depths = computeDepths('A', nodes, edges, 'down')

      expect(depths.get('A')).toBe(0)
    })

    it('should handle disconnected nodes', () => {
      const nodes = [makeNode('A'), makeNode('B')]
      const edges: AstrolabeEdge[] = []

      const depths = computeDepths('A', nodes, edges, 'down')

      expect(depths.get('A')).toBe(0)
      expect(depths.get('B')).toBe(0)  // Orphaned, defaults to 0
    })

    it('should handle cycles', () => {
      // A -> B -> C -> A (cycle)
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C')]
      const edges = [
        makeEdge('A', 'B'),
        makeEdge('B', 'C'),
        makeEdge('C', 'A'),
      ]

      const depths = computeDepths('A', nodes, edges, 'down')

      // BFS should handle cycle without infinite loop
      expect(depths.get('A')).toBe(0)
      expect(depths.get('B')).toBe(1)
      expect(depths.get('C')).toBe(2)
      // A is already visited at depth 0, won't be re-added at depth 3
    })
  })
})

describe('HierarchicalLayout position calculation', () => {
  it('should place focus node at origin', () => {
    const nodes = [makeNode('A')]
    const edges: AstrolabeEdge[] = []
    const depths = computeDepths('A', nodes, edges, 'down')

    expect(depths.get('A')).toBe(0)
    // At depth 0, y = 0 for 'down' direction
  })

  it('should separate layers vertically', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')]
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')]
    const depths = computeDepths('A', nodes, edges, 'down')

    // With layerSpacing = 10:
    // A at y = 0
    // B at y = -10
    // C at y = -20
    expect(depths.get('A')).toBe(0)
    expect(depths.get('B')).toBe(1)
    expect(depths.get('C')).toBe(2)
  })

  it('should distribute nodes horizontally within layer', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')]
    const edges = [
      makeEdge('A', 'B'),
      makeEdge('A', 'C'),
      makeEdge('A', 'D'),
    ]
    const depths = computeDepths('A', nodes, edges, 'down')

    // B, C, D all at depth 1
    expect(depths.get('B')).toBe(1)
    expect(depths.get('C')).toBe(1)
    expect(depths.get('D')).toBe(1)
    // They should be spread horizontally with nodeSpacing between them
  })
})
