import { describe, it, expect } from 'vitest'
import { nHopFilter } from '../filters/nHop'
import type { Node, Edge, LensFilterContext } from '../types'

// ============================================
// Test Helpers
// ============================================

function createNode(id: string, name?: string): Node {
  return {
    id,
    name: name || id,
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

function createContext(focusNodeId: string | null, nHop: number = 2): LensFilterContext {
  return {
    focusNodeId,
    options: { nHop },
  }
}

// ============================================
// Test Graphs
// ============================================

/**
 * Linear graph: A → B → C → D → E
 */
function createLinearGraph() {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(id => createNode(id))
  const edges = [
    createEdge('a', 'b'),
    createEdge('b', 'c'),
    createEdge('c', 'd'),
    createEdge('d', 'e'),
  ]
  return { nodes, edges }
}

/**
 * Star graph: Center connected to all others
 *       B
 *       |
 *   A - C - D
 *       |
 *       E
 */
function createStarGraph() {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(id => createNode(id))
  const edges = [
    createEdge('c', 'a'),
    createEdge('c', 'b'),
    createEdge('c', 'd'),
    createEdge('c', 'e'),
  ]
  return { nodes, edges }
}

/**
 * Diamond graph:
 *       A
 *      / \
 *     B   C
 *      \ /
 *       D
 */
function createDiamondGraph() {
  const nodes = ['a', 'b', 'c', 'd'].map(id => createNode(id))
  const edges = [
    createEdge('a', 'b'),
    createEdge('a', 'c'),
    createEdge('b', 'd'),
    createEdge('c', 'd'),
  ]
  return { nodes, edges }
}

/**
 * Disconnected graph: A → B    C → D (two components)
 */
function createDisconnectedGraph() {
  const nodes = ['a', 'b', 'c', 'd'].map(id => createNode(id))
  const edges = [
    createEdge('a', 'b'),
    createEdge('c', 'd'),
  ]
  return { nodes, edges }
}

// ============================================
// nHop Filter Tests
// ============================================

describe('nHop Filter', () => {
  describe('basic functionality', () => {
    it('should return only the focus node with nHop=0', () => {
      const { nodes, edges } = createLinearGraph()
      const context = createContext('c', 0)

      const result = nHopFilter(nodes, edges, context)

      expect(result.nodes.map(n => n.id)).toEqual(['c'])
      expect(result.edges).toHaveLength(0)
    })

    it('should return focus + immediate neighbors with nHop=1', () => {
      const { nodes, edges } = createLinearGraph()
      const context = createContext('c', 1)

      const result = nHopFilter(nodes, edges, context)

      // c's neighbors are b (incoming) and d (outgoing)
      expect(result.nodes.map(n => n.id).sort()).toEqual(['b', 'c', 'd'])
      // Edges: b→c and c→d
      expect(result.edges).toHaveLength(2)
    })

    it('should return 2-hop neighborhood with nHop=2', () => {
      const { nodes, edges } = createLinearGraph()
      const context = createContext('c', 2)

      const result = nHopFilter(nodes, edges, context)

      // 2 hops from c: a←b←c→d→e
      expect(result.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
      expect(result.edges).toHaveLength(4)
    })
  })

  describe('edge cases', () => {
    it('should return empty result when focusNodeId is null', () => {
      const { nodes, edges } = createLinearGraph()
      const context = createContext(null, 2)

      const result = nHopFilter(nodes, edges, context)

      expect(result.nodes).toHaveLength(0)
      expect(result.edges).toHaveLength(0)
    })

    it('should return empty result when focus node does not exist', () => {
      const { nodes, edges } = createLinearGraph()
      const context = createContext('nonexistent', 2)

      const result = nHopFilter(nodes, edges, context)

      expect(result.nodes).toHaveLength(0)
      expect(result.edges).toHaveLength(0)
    })

    it('should handle empty graph', () => {
      const context = createContext('a', 2)

      const result = nHopFilter([], [], context)

      expect(result.nodes).toHaveLength(0)
      expect(result.edges).toHaveLength(0)
    })

    it('should handle isolated node (no edges)', () => {
      const nodes = [createNode('a'), createNode('b'), createNode('c')]
      const edges: Edge[] = []
      const context = createContext('b', 2)

      const result = nHopFilter(nodes, edges, context)

      expect(result.nodes.map(n => n.id)).toEqual(['b'])
      expect(result.edges).toHaveLength(0)
    })
  })

  describe('bidirectional traversal', () => {
    it('should traverse both incoming and outgoing edges', () => {
      const { nodes, edges } = createStarGraph()
      const context = createContext('a', 1)

      const result = nHopFilter(nodes, edges, context)

      // a is connected to c via c→a edge
      expect(result.nodes.map(n => n.id).sort()).toEqual(['a', 'c'])
    })

    it('should find all nodes from center of star', () => {
      const { nodes, edges } = createStarGraph()
      const context = createContext('c', 1)

      const result = nHopFilter(nodes, edges, context)

      // c connects to all others
      expect(result.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
      expect(result.edges).toHaveLength(4)
    })
  })

  describe('complex graphs', () => {
    it('should handle diamond graph correctly', () => {
      const { nodes, edges } = createDiamondGraph()
      const context = createContext('a', 1)

      const result = nHopFilter(nodes, edges, context)

      // a connects to b and c
      expect(result.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c'])
      expect(result.edges).toHaveLength(2)
    })

    it('should not cross disconnected components', () => {
      const { nodes, edges } = createDisconnectedGraph()
      const context = createContext('a', 10)  // Even with high nHop

      const result = nHopFilter(nodes, edges, context)

      // Should only find a and b, not c and d
      expect(result.nodes.map(n => n.id).sort()).toEqual(['a', 'b'])
      expect(result.edges).toHaveLength(1)
    })
  })

  describe('edge filtering', () => {
    it('should only include edges between included nodes', () => {
      const { nodes, edges } = createLinearGraph()
      const context = createContext('b', 1)

      const result = nHopFilter(nodes, edges, context)

      // b's 1-hop: a, b, c
      // Valid edges: a→b, b→c
      expect(result.edges.map(e => e.id).sort()).toEqual(['a->b', 'b->c'])
    })

    it('should exclude edges outside the neighborhood', () => {
      const { nodes, edges } = createLinearGraph()
      const context = createContext('a', 1)

      const result = nHopFilter(nodes, edges, context)

      // a's 1-hop: a, b
      // Valid edges: a→b only (b→c is outside)
      expect(result.edges.map(e => e.id)).toEqual(['a->b'])
    })
  })

  describe('default nHop value', () => {
    it('should default to 2 hops when not specified', () => {
      const { nodes, edges } = createLinearGraph()
      const context: LensFilterContext = {
        focusNodeId: 'c',
        options: {},  // no nHop specified
      }

      const result = nHopFilter(nodes, edges, context)

      // Default should be 2 hops
      expect(result.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    })
  })
})
