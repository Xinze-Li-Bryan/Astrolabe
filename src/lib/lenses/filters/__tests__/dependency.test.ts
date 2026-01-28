/**
 * Tests for Dependency Filters (TDD)
 *
 * ancestors - finds all nodes that the focus node depends on (imports)
 * descendants - finds all nodes that depend on the focus node (importers)
 *
 * Edge direction: source -> target means "source depends on target"
 * - ancestors: follow edges where focus is source (focus -> ?)
 * - descendants: follow edges where focus is target (? -> focus)
 */

import { describe, it, expect } from 'vitest'
import { ancestorsFilter, descendantsFilter } from '../dependency'
import type { Node, Edge, LensFilterContext } from '../../types'

// ============================================
// Test Fixtures
// ============================================

function makeNode(id: string): Node {
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

function makeEdge(source: string, target: string): Edge {
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

function makeContext(focusNodeId: string | null, maxDepth?: number): LensFilterContext {
  return {
    focusNodeId,
    options: {
      maxDepth: maxDepth ?? 10,
    },
  }
}

// ============================================
// Test Graph
// ============================================
//
//   A ──► B ──► C ──► D
//         │         ▲
//         ▼         │
//         E ───────►F
//
// Edges: A->B, B->C, C->D, B->E, E->F, F->D
//
// From B's perspective:
// - ancestors (what B depends on): C, D, E, F (transitively)
// - descendants (what depends on B): A only

const testNodes = [
  makeNode('A'),
  makeNode('B'),
  makeNode('C'),
  makeNode('D'),
  makeNode('E'),
  makeNode('F'),
]

const testEdges = [
  makeEdge('A', 'B'),  // A depends on B
  makeEdge('B', 'C'),  // B depends on C
  makeEdge('C', 'D'),  // C depends on D
  makeEdge('B', 'E'),  // B depends on E
  makeEdge('E', 'F'),  // E depends on F
  makeEdge('F', 'D'),  // F depends on D
]

// ============================================
// ancestorsFilter Tests
// ============================================

describe('ancestorsFilter', () => {
  describe('basic traversal', () => {
    it('should find direct dependencies', () => {
      const ctx = makeContext('B', 1)
      const result = ancestorsFilter(testNodes, testEdges, ctx)

      // B directly depends on C and E
      expect(result.nodes.map(n => n.id).sort()).toEqual(['B', 'C', 'E'])
    })

    it('should find transitive dependencies', () => {
      const ctx = makeContext('B')
      const result = ancestorsFilter(testNodes, testEdges, ctx)

      // B depends on C, E; C depends on D; E depends on F; F depends on D
      // So ancestors of B = B, C, D, E, F (not A, since A depends on B)
      expect(result.nodes.map(n => n.id).sort()).toEqual(['B', 'C', 'D', 'E', 'F'])
    })

    it('should include focus node in result', () => {
      const ctx = makeContext('B')
      const result = ancestorsFilter(testNodes, testEdges, ctx)

      expect(result.nodes.some(n => n.id === 'B')).toBe(true)
    })

    it('should respect maxDepth option', () => {
      const ctx = makeContext('B', 2)
      const result = ancestorsFilter(testNodes, testEdges, ctx)

      // Depth 1: C, E
      // Depth 2: D (from C), F (from E)
      // Should include B, C, E, D, F
      expect(result.nodes.map(n => n.id).sort()).toEqual(['B', 'C', 'D', 'E', 'F'])
    })
  })

  describe('edge filtering', () => {
    it('should only include edges between result nodes', () => {
      const ctx = makeContext('B')
      const result = ancestorsFilter(testNodes, testEdges, ctx)

      // Should NOT include A->B edge since A is not in ancestors
      expect(result.edges.some(e => e.source === 'A')).toBe(false)

      // Should include B->C, B->E, C->D, E->F, F->D
      expect(result.edges.length).toBe(5)
    })
  })

  describe('edge cases', () => {
    it('should return empty when focus is null', () => {
      const ctx = makeContext(null)
      const result = ancestorsFilter(testNodes, testEdges, ctx)

      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })

    it('should return only focus node when it has no dependencies', () => {
      const ctx = makeContext('D')  // D has no outgoing edges
      const result = ancestorsFilter(testNodes, testEdges, ctx)

      expect(result.nodes.map(n => n.id)).toEqual(['D'])
      expect(result.edges).toEqual([])
    })

    it('should handle focus node not in graph', () => {
      const ctx = makeContext('nonexistent')
      const result = ancestorsFilter(testNodes, testEdges, ctx)

      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })

    it('should handle cycles gracefully', () => {
      const cyclicEdges = [
        ...testEdges,
        makeEdge('D', 'B'),  // Creates cycle: B -> C -> D -> B
      ]
      const ctx = makeContext('B')
      const result = ancestorsFilter(testNodes, cyclicEdges, ctx)

      // Should still work without infinite loop
      expect(result.nodes.length).toBeGreaterThan(0)
    })
  })
})

// ============================================
// descendantsFilter Tests
// ============================================

describe('descendantsFilter', () => {
  describe('basic traversal', () => {
    it('should find direct dependents', () => {
      const ctx = makeContext('B', 1)
      const result = descendantsFilter(testNodes, testEdges, ctx)

      // Only A directly depends on B
      expect(result.nodes.map(n => n.id).sort()).toEqual(['A', 'B'])
    })

    it('should find transitive dependents', () => {
      const ctx = makeContext('D')
      const result = descendantsFilter(testNodes, testEdges, ctx)

      // D is depended on by: C (direct), F (direct)
      // C is depended on by: B
      // F is depended on by: E
      // B is depended on by: A
      // E is depended on by: B (already counted)
      // So descendants of D = D, C, F, B, E, A (everything!)
      expect(result.nodes.map(n => n.id).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    })

    it('should include focus node in result', () => {
      const ctx = makeContext('D')
      const result = descendantsFilter(testNodes, testEdges, ctx)

      expect(result.nodes.some(n => n.id === 'D')).toBe(true)
    })

    it('should respect maxDepth option', () => {
      const ctx = makeContext('D', 1)
      const result = descendantsFilter(testNodes, testEdges, ctx)

      // Depth 1: C, F (direct dependents of D)
      expect(result.nodes.map(n => n.id).sort()).toEqual(['C', 'D', 'F'])
    })
  })

  describe('edge filtering', () => {
    it('should only include edges between result nodes', () => {
      const ctx = makeContext('D', 1)
      const result = descendantsFilter(testNodes, testEdges, ctx)

      // Should include C->D and F->D (edges pointing to D from result nodes)
      const edgeIds = result.edges.map(e => e.id).sort()
      expect(edgeIds).toEqual(['C->D', 'F->D'])
    })
  })

  describe('edge cases', () => {
    it('should return empty when focus is null', () => {
      const ctx = makeContext(null)
      const result = descendantsFilter(testNodes, testEdges, ctx)

      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })

    it('should return only focus node when nothing depends on it', () => {
      const ctx = makeContext('A')  // Nothing depends on A
      const result = descendantsFilter(testNodes, testEdges, ctx)

      expect(result.nodes.map(n => n.id)).toEqual(['A'])
      expect(result.edges).toEqual([])
    })

    it('should handle focus node not in graph', () => {
      const ctx = makeContext('nonexistent')
      const result = descendantsFilter(testNodes, testEdges, ctx)

      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })

    it('should handle cycles gracefully', () => {
      const cyclicEdges = [
        ...testEdges,
        makeEdge('D', 'B'),  // Creates cycle
      ]
      const ctx = makeContext('D')
      const result = descendantsFilter(testNodes, cyclicEdges, ctx)

      // Should still work without infinite loop
      expect(result.nodes.length).toBeGreaterThan(0)
    })
  })
})
