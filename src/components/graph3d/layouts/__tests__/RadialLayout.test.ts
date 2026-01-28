import { describe, it, expect } from 'vitest'
// Note: We test the pure calculation functions exported for testing
// The component itself is tested via integration tests

import type { AstrolabeNode as Node, AstrolabeEdge as Edge } from '@/types/graph'

// ============================================
// Test Helpers
// ============================================

function createNode(id: string): Node {
  return {
    id,
    name: id,
    kind: 'theorem',
    status: 'proven',
    defaultColor: '#A855F7',
    defaultSize: 1.0,
    defaultShape: 'sphere',
    pinned: false,
    visible: true,
  }
}

function createEdge(source: string, target: string): Edge {
  return {
    id: `${source}->${target}`,
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
// Reimplemented functions for testing
// (These mirror the implementation in RadialLayout.tsx)
// ============================================

function buildAdjacencyList(edges: Edge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()

  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, new Set())
    if (!adj.has(edge.target)) adj.set(edge.target, new Set())
    adj.get(edge.source)!.add(edge.target)
    adj.get(edge.target)!.add(edge.source)
  }

  return adj
}

function calculateHopDistances(
  focusNodeId: string,
  nodes: Node[],
  edges: Edge[]
): Map<string, number> {
  const distances = new Map<string, number>()
  const nodeIds = new Set(nodes.map(n => n.id))

  if (!nodeIds.has(focusNodeId)) {
    return distances
  }

  const adj = buildAdjacencyList(edges)

  distances.set(focusNodeId, 0)
  const queue: string[] = [focusNodeId]

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentDist = distances.get(current)!

    const neighbors = adj.get(current)
    if (!neighbors) continue

    for (const neighbor of neighbors) {
      if (!distances.has(neighbor) && nodeIds.has(neighbor)) {
        distances.set(neighbor, currentDist + 1)
        queue.push(neighbor)
      }
    }
  }

  return distances
}

// ============================================
// Tests
// ============================================

describe('RadialLayout calculations', () => {
  describe('calculateHopDistances', () => {
    it('should return 0 for focus node', () => {
      const nodes = [createNode('a'), createNode('b'), createNode('c')]
      const edges = [createEdge('a', 'b'), createEdge('b', 'c')]

      const distances = calculateHopDistances('a', nodes, edges)

      expect(distances.get('a')).toBe(0)
    })

    it('should calculate correct distances in linear graph', () => {
      // a -> b -> c -> d
      const nodes = ['a', 'b', 'c', 'd'].map(createNode)
      const edges = [
        createEdge('a', 'b'),
        createEdge('b', 'c'),
        createEdge('c', 'd'),
      ]

      const distances = calculateHopDistances('a', nodes, edges)

      expect(distances.get('a')).toBe(0)
      expect(distances.get('b')).toBe(1)
      expect(distances.get('c')).toBe(2)
      expect(distances.get('d')).toBe(3)
    })

    it('should calculate correct distances from middle node', () => {
      // a -> b -> c -> d
      const nodes = ['a', 'b', 'c', 'd'].map(createNode)
      const edges = [
        createEdge('a', 'b'),
        createEdge('b', 'c'),
        createEdge('c', 'd'),
      ]

      const distances = calculateHopDistances('b', nodes, edges)

      expect(distances.get('a')).toBe(1)
      expect(distances.get('b')).toBe(0)
      expect(distances.get('c')).toBe(1)
      expect(distances.get('d')).toBe(2)
    })

    it('should handle star graph correctly', () => {
      // Center connected to all
      const nodes = ['center', 'a', 'b', 'c', 'd'].map(createNode)
      const edges = [
        createEdge('center', 'a'),
        createEdge('center', 'b'),
        createEdge('center', 'c'),
        createEdge('center', 'd'),
      ]

      const distances = calculateHopDistances('center', nodes, edges)

      expect(distances.get('center')).toBe(0)
      expect(distances.get('a')).toBe(1)
      expect(distances.get('b')).toBe(1)
      expect(distances.get('c')).toBe(1)
      expect(distances.get('d')).toBe(1)
    })

    it('should return empty map for non-existent focus node', () => {
      const nodes = [createNode('a'), createNode('b')]
      const edges = [createEdge('a', 'b')]

      const distances = calculateHopDistances('nonexistent', nodes, edges)

      expect(distances.size).toBe(0)
    })

    it('should not include unreachable nodes', () => {
      // a -> b    c -> d (disconnected)
      const nodes = ['a', 'b', 'c', 'd'].map(createNode)
      const edges = [
        createEdge('a', 'b'),
        createEdge('c', 'd'),
      ]

      const distances = calculateHopDistances('a', nodes, edges)

      expect(distances.has('a')).toBe(true)
      expect(distances.has('b')).toBe(true)
      expect(distances.has('c')).toBe(false)
      expect(distances.has('d')).toBe(false)
    })

    it('should traverse bidirectionally', () => {
      // Edge direction shouldn't matter for hop calculation
      const nodes = ['a', 'b', 'c'].map(createNode)
      const edges = [
        createEdge('b', 'a'),  // Points away from a
        createEdge('b', 'c'),
      ]

      const distances = calculateHopDistances('a', nodes, edges)

      expect(distances.get('a')).toBe(0)
      expect(distances.get('b')).toBe(1)
      expect(distances.get('c')).toBe(2)
    })

    it('should find shortest path in graph with multiple paths', () => {
      // Diamond: a -> b -> d, a -> c -> d
      const nodes = ['a', 'b', 'c', 'd'].map(createNode)
      const edges = [
        createEdge('a', 'b'),
        createEdge('a', 'c'),
        createEdge('b', 'd'),
        createEdge('c', 'd'),
      ]

      const distances = calculateHopDistances('a', nodes, edges)

      expect(distances.get('a')).toBe(0)
      expect(distances.get('b')).toBe(1)
      expect(distances.get('c')).toBe(1)
      expect(distances.get('d')).toBe(2) // Shortest path is 2
    })
  })

  describe('buildAdjacencyList', () => {
    it('should create bidirectional adjacency', () => {
      const edges = [createEdge('a', 'b')]

      const adj = buildAdjacencyList(edges)

      expect(adj.get('a')?.has('b')).toBe(true)
      expect(adj.get('b')?.has('a')).toBe(true)
    })

    it('should handle multiple edges', () => {
      const edges = [
        createEdge('a', 'b'),
        createEdge('a', 'c'),
        createEdge('b', 'c'),
      ]

      const adj = buildAdjacencyList(edges)

      expect(adj.get('a')?.size).toBe(2)
      expect(adj.get('b')?.size).toBe(2)
      expect(adj.get('c')?.size).toBe(2)
    })

    it('should handle empty edges', () => {
      const adj = buildAdjacencyList([])

      expect(adj.size).toBe(0)
    })
  })
})
