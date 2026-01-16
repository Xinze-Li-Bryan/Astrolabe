import { describe, it, expect } from 'vitest'
import {
  computeTransitiveReduction,
  buildAdjacencyList,
  hasPath,
} from '../graphProcessing'
import type { AstrolabeNode, AstrolabeEdge } from '@/types/graph'

// ============================================
// Test Helpers
// ============================================

function createNode(overrides: Partial<AstrolabeNode> & { id: string; name: string }): AstrolabeNode {
  return {
    kind: 'theorem',
    status: 'proven',
    defaultColor: '#A855F7',
    defaultSize: 1.0,
    defaultShape: 'sphere',
    pinned: false,
    visible: true,
    ...overrides,
  }
}

function createEdge(source: string, target: string, id?: string): AstrolabeEdge {
  return {
    id: id || `${source}->${target}`,
    source,
    target,
    fromLean: true,
    defaultColor: '#2ecc71',
    defaultWidth: 1.0,
    defaultStyle: 'solid',
    visible: true,
  }
}

// ============================================
// buildAdjacencyList Tests
// ============================================

describe('buildAdjacencyList', () => {
  it('should build adjacency list from edges', () => {
    const edges = [
      createEdge('A', 'B'),
      createEdge('B', 'C'),
      createEdge('A', 'C'),
    ]

    const adj = buildAdjacencyList(edges)

    expect(adj.get('A')).toEqual(new Set(['B', 'C']))
    expect(adj.get('B')).toEqual(new Set(['C']))
    expect(adj.has('C')).toBe(false) // C has no outgoing edges
  })

  it('should handle empty edges', () => {
    const adj = buildAdjacencyList([])
    expect(adj.size).toBe(0)
  })

  it('should handle multiple edges from same source', () => {
    const edges = [
      createEdge('A', 'B'),
      createEdge('A', 'C'),
      createEdge('A', 'D'),
    ]

    const adj = buildAdjacencyList(edges)
    expect(adj.get('A')).toEqual(new Set(['B', 'C', 'D']))
  })
})

// ============================================
// hasPath Tests
// ============================================

describe('hasPath', () => {
  it('should find direct path', () => {
    const adj = new Map([
      ['A', new Set(['B'])],
      ['B', new Set(['C'])],
    ])

    expect(hasPath('A', 'B', adj)).toBe(true)
  })

  it('should find indirect path through intermediate node', () => {
    const adj = new Map([
      ['A', new Set(['B'])],
      ['B', new Set(['C'])],
    ])

    expect(hasPath('A', 'C', adj)).toBe(true)
  })

  it('should not find path that does not exist', () => {
    const adj = new Map([
      ['A', new Set(['B'])],
      ['C', new Set(['D'])],
    ])

    expect(hasPath('A', 'D', adj)).toBe(false)
  })

  it('should handle self-loops correctly', () => {
    const adj = new Map([
      ['A', new Set(['A'])],
    ])

    expect(hasPath('A', 'A', adj)).toBe(true)
  })

  it('should handle cycles without infinite loop', () => {
    const adj = new Map([
      ['A', new Set(['B'])],
      ['B', new Set(['C'])],
      ['C', new Set(['A'])],  // Cycle back to A
    ])

    expect(hasPath('A', 'C', adj)).toBe(true)
    expect(hasPath('B', 'A', adj)).toBe(true)
  })

  it('should exclude direct edge when checking for alternate path', () => {
    // When checking if A->C is redundant, we need to check if A can reach C
    // through paths that DON'T use the direct A->C edge
    const adj = new Map([
      ['A', new Set(['B', 'C'])],
      ['B', new Set(['C'])],
    ])

    // hasPath should find path A->B->C even though A->C exists directly
    expect(hasPath('A', 'C', adj, 'C')).toBe(true)  // Excluding direct edge to C
  })
})

// ============================================
// computeTransitiveReduction Tests
// ============================================

describe('computeTransitiveReduction', () => {
  describe('simple cases', () => {
    it('should remove redundant edge in simple chain (A->B->C with A->C)', () => {
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
        createNode({ id: 'C', name: 'C' }),
      ]
      const edges = [
        createEdge('A', 'B'),
        createEdge('B', 'C'),
        createEdge('A', 'C'),  // This is redundant
      ]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.edges).toHaveLength(2)
      expect(result.edges.map(e => `${e.source}->${e.target}`)).toContain('A->B')
      expect(result.edges.map(e => `${e.source}->${e.target}`)).toContain('B->C')
      expect(result.edges.map(e => `${e.source}->${e.target}`)).not.toContain('A->C')
      expect(result.stats.removedEdges).toBe(1)
    })

    it('should not remove edges that are not redundant', () => {
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
        createNode({ id: 'C', name: 'C' }),
      ]
      const edges = [
        createEdge('A', 'B'),
        createEdge('B', 'C'),
        // No A->C edge, so nothing to remove
      ]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.edges).toHaveLength(2)
      expect(result.stats.removedEdges).toBe(0)
    })

    it('should handle empty graph', () => {
      const result = computeTransitiveReduction([], [])

      expect(result.edges).toHaveLength(0)
      expect(result.nodes).toHaveLength(0)
      expect(result.stats.removedEdges).toBe(0)
    })

    it('should handle graph with no edges', () => {
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
      ]

      const result = computeTransitiveReduction(nodes, [])

      expect(result.edges).toHaveLength(0)
      expect(result.nodes).toHaveLength(2)
    })
  })

  describe('diamond pattern', () => {
    it('should remove redundant edge in diamond (A->B, A->C, B->D, C->D, A->D)', () => {
      //     A
      //    /|\
      //   B | C
      //    \|/
      //     D
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
        createNode({ id: 'C', name: 'C' }),
        createNode({ id: 'D', name: 'D' }),
      ]
      const edges = [
        createEdge('A', 'B'),
        createEdge('A', 'C'),
        createEdge('B', 'D'),
        createEdge('C', 'D'),
        createEdge('A', 'D'),  // Redundant: A can reach D via B or C
      ]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.edges.map(e => `${e.source}->${e.target}`)).not.toContain('A->D')
      expect(result.edges).toHaveLength(4)
      expect(result.stats.removedEdges).toBe(1)
    })
  })

  describe('longer chains', () => {
    it('should remove redundant edges in longer chain (A->B->C->D with A->D)', () => {
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
        createNode({ id: 'C', name: 'C' }),
        createNode({ id: 'D', name: 'D' }),
      ]
      const edges = [
        createEdge('A', 'B'),
        createEdge('B', 'C'),
        createEdge('C', 'D'),
        createEdge('A', 'D'),  // Redundant: A->B->C->D exists
      ]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.edges.map(e => `${e.source}->${e.target}`)).not.toContain('A->D')
      expect(result.stats.removedEdges).toBe(1)
    })

    it('should remove multiple redundant edges', () => {
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
        createNode({ id: 'C', name: 'C' }),
        createNode({ id: 'D', name: 'D' }),
      ]
      const edges = [
        createEdge('A', 'B'),
        createEdge('B', 'C'),
        createEdge('C', 'D'),
        createEdge('A', 'C'),  // Redundant: A->B->C
        createEdge('A', 'D'),  // Redundant: A->B->C->D
        createEdge('B', 'D'),  // Redundant: B->C->D
      ]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.edges).toHaveLength(3)  // Only A->B, B->C, C->D remain
      expect(result.stats.removedEdges).toBe(3)
    })
  })

  describe('complex DAG patterns', () => {
    it('should handle multiple independent chains', () => {
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
        createNode({ id: 'C', name: 'C' }),
        createNode({ id: 'X', name: 'X' }),
        createNode({ id: 'Y', name: 'Y' }),
        createNode({ id: 'Z', name: 'Z' }),
      ]
      const edges = [
        // Chain 1: A->B->C
        createEdge('A', 'B'),
        createEdge('B', 'C'),
        createEdge('A', 'C'),  // Redundant
        // Chain 2: X->Y->Z
        createEdge('X', 'Y'),
        createEdge('Y', 'Z'),
        createEdge('X', 'Z'),  // Redundant
      ]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.edges).toHaveLength(4)
      expect(result.stats.removedEdges).toBe(2)
    })

    it('should handle converging paths to common sink', () => {
      //   A   B
      //   |\ /|
      //   | X |
      //   |/ \|
      //   C   D
      //    \ /
      //     E
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
        createNode({ id: 'C', name: 'C' }),
        createNode({ id: 'D', name: 'D' }),
        createNode({ id: 'E', name: 'E' }),
      ]
      const edges = [
        createEdge('A', 'C'),
        createEdge('A', 'D'),
        createEdge('B', 'C'),
        createEdge('B', 'D'),
        createEdge('C', 'E'),
        createEdge('D', 'E'),
        createEdge('A', 'E'),  // Redundant: A->C->E or A->D->E
        createEdge('B', 'E'),  // Redundant: B->C->E or B->D->E
      ]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.edges.map(e => `${e.source}->${e.target}`)).not.toContain('A->E')
      expect(result.edges.map(e => `${e.source}->${e.target}`)).not.toContain('B->E')
      expect(result.stats.removedEdges).toBe(2)
    })
  })

  describe('edge cases', () => {
    it('should preserve edges when no alternate path exists', () => {
      //   A -> B
      //   |
      //   v
      //   C (A->C has no alternate path)
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
        createNode({ id: 'C', name: 'C' }),
      ]
      const edges = [
        createEdge('A', 'B'),
        createEdge('A', 'C'),  // Not redundant - no path A->?->C
      ]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.edges).toHaveLength(2)
      expect(result.stats.removedEdges).toBe(0)
    })

    it('should handle single-edge graph', () => {
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
      ]
      const edges = [createEdge('A', 'B')]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.edges).toHaveLength(1)
      expect(result.stats.removedEdges).toBe(0)
    })

    it('should handle nodes with high in-degree', () => {
      // Multiple nodes all pointing to same target
      const nodes = [
        createNode({ id: 'A', name: 'A' }),
        createNode({ id: 'B', name: 'B' }),
        createNode({ id: 'C', name: 'C' }),
        createNode({ id: 'D', name: 'D' }),
        createNode({ id: 'Target', name: 'Target' }),
      ]
      const edges = [
        createEdge('A', 'B'),
        createEdge('B', 'Target'),
        createEdge('A', 'Target'),  // Redundant
        createEdge('C', 'D'),
        createEdge('D', 'Target'),
        createEdge('C', 'Target'),  // Redundant
      ]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.stats.removedEdges).toBe(2)
    })
  })

  describe('integration with realistic Lean patterns', () => {
    it('should handle theorem dependency chain', () => {
      // IChing.Hexagram -> IChing.Trigram -> IChing.Line
      // And direct IChing.Hexagram -> IChing.Line should be removed
      const nodes = [
        createNode({ id: '1', name: 'IChing.Hexagram', kind: 'definition' }),
        createNode({ id: '2', name: 'IChing.Trigram', kind: 'definition' }),
        createNode({ id: '3', name: 'IChing.Line', kind: 'inductive' }),
      ]
      const edges = [
        createEdge('1', '2'),  // Hexagram depends on Trigram
        createEdge('2', '3'),  // Trigram depends on Line
        createEdge('1', '3'),  // Hexagram directly depends on Line (redundant)
      ]

      const result = computeTransitiveReduction(nodes, edges)

      expect(result.edges).toHaveLength(2)
      expect(result.edges.map(e => `${e.source}->${e.target}`)).not.toContain('1->3')
    })
  })
})
