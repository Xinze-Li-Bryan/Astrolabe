/**
 * Tests for byNamespace Aggregator (TDD)
 *
 * The byNamespace aggregator groups nodes by their namespace prefix,
 * creating "bubble" nodes for collapsed groups.
 */

import { describe, it, expect } from 'vitest'
import { byNamespaceAggregator, extractNamespace } from '../byNamespace'
import type { Node, Edge, LensAggregateContext } from '../../types'

// ============================================
// Test Fixtures
// ============================================

function makeNode(id: string, name: string): Node {
  return {
    id,
    name,
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

function makeContext(options: Partial<LensAggregateContext['options']> = {}): LensAggregateContext {
  return {
    focusNodeId: null,
    options: {
      namespaceDepth: 1,
      collapseThreshold: 3,
      ...options,
    },
  }
}

// ============================================
// extractNamespace Tests
// ============================================

describe('extractNamespace', () => {
  it('should extract namespace at depth 1', () => {
    expect(extractNamespace('Mathlib.Algebra.Group.Basic.add_comm', 1)).toBe('Mathlib')
    expect(extractNamespace('Mathlib.Algebra.Group.Basic.add_comm', 2)).toBe('Mathlib.Algebra')
    expect(extractNamespace('Mathlib.Algebra.Group.Basic.add_comm', 3)).toBe('Mathlib.Algebra.Group')
  })

  it('should handle names shorter than depth', () => {
    expect(extractNamespace('Mathlib.foo', 5)).toBe('Mathlib.foo')
    expect(extractNamespace('foo', 2)).toBe('foo')
  })

  it('should handle depth 0 (full name)', () => {
    expect(extractNamespace('Mathlib.Algebra.Group', 0)).toBe('Mathlib.Algebra.Group')
  })

  it('should handle empty/null gracefully', () => {
    expect(extractNamespace('', 1)).toBe('')
  })
})

// ============================================
// byNamespaceAggregator Tests
// ============================================

describe('byNamespaceAggregator', () => {
  describe('basic grouping', () => {
    it('should group nodes by namespace prefix', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.add', 'Mathlib.Algebra.add'),
        makeNode('Mathlib.Algebra.mul', 'Mathlib.Algebra.mul'),
        makeNode('Mathlib.Algebra.inv', 'Mathlib.Algebra.inv'),
        makeNode('Mathlib.Topology.open', 'Mathlib.Topology.open'),
      ]
      const edges: Edge[] = []
      const ctx = makeContext({ namespaceDepth: 1, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // Should have 1 group for Mathlib (since all nodes start with Mathlib at depth 1)
      expect(result.groups.length).toBe(1)
      expect(result.groups[0].namespace).toBe('Mathlib')
      expect(result.groups[0].nodeCount).toBe(4)
    })

    it('should respect namespace depth', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.add', 'Mathlib.Algebra.add'),
        makeNode('Mathlib.Algebra.mul', 'Mathlib.Algebra.mul'),
        makeNode('Mathlib.Topology.open', 'Mathlib.Topology.open'),
        makeNode('Mathlib.Topology.closed', 'Mathlib.Topology.closed'),
      ]
      const edges: Edge[] = []
      const ctx = makeContext({ namespaceDepth: 2, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // At depth 2: Mathlib.Algebra (2 nodes), Mathlib.Topology (2 nodes)
      expect(result.groups.length).toBe(2)
      const namespaces = result.groups.map(g => g.namespace).sort()
      expect(namespaces).toEqual(['Mathlib.Algebra', 'Mathlib.Topology'])
    })

    it('should only create groups meeting collapse threshold', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.add', 'Mathlib.Algebra.add'),
        makeNode('Mathlib.Algebra.mul', 'Mathlib.Algebra.mul'),
        makeNode('Mathlib.Algebra.inv', 'Mathlib.Algebra.inv'),
        makeNode('Mathlib.Topology.open', 'Mathlib.Topology.open'), // only 1 node
      ]
      const edges: Edge[] = []
      const ctx = makeContext({ namespaceDepth: 2, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // Only Mathlib.Algebra should be a group (3 >= 2)
      // Mathlib.Topology has only 1 node, below threshold
      expect(result.groups.length).toBe(1)
      expect(result.groups[0].namespace).toBe('Mathlib.Algebra')
      expect(result.groups[0].nodeCount).toBe(3)
    })
  })

  describe('bubble nodes', () => {
    it('should create synthetic bubble node for collapsed groups', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.add', 'Mathlib.Algebra.add'),
        makeNode('Mathlib.Algebra.mul', 'Mathlib.Algebra.mul'),
        makeNode('Mathlib.Algebra.inv', 'Mathlib.Algebra.inv'),
      ]
      const edges: Edge[] = []
      const ctx = makeContext({ namespaceDepth: 2, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // Should have 1 bubble node instead of 3 individual nodes
      expect(result.nodes.length).toBe(1)
      expect(result.nodes[0].id).toBe('group:Mathlib.Algebra')
      expect(result.nodes[0].kind).toBe('custom') // bubble nodes are custom kind
    })

    it('should keep ungrouped nodes as-is', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.add', 'Mathlib.Algebra.add'),
        makeNode('Mathlib.Algebra.mul', 'Mathlib.Algebra.mul'),
        makeNode('Other.standalone', 'Other.standalone'), // below threshold
      ]
      const edges: Edge[] = []
      const ctx = makeContext({ namespaceDepth: 2, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // 1 bubble for Mathlib.Algebra + 1 standalone node
      expect(result.nodes.length).toBe(2)
      const nodeIds = result.nodes.map(n => n.id).sort()
      expect(nodeIds).toEqual(['Other.standalone', 'group:Mathlib.Algebra'])
    })
  })

  describe('edge handling', () => {
    it('should redirect edges to bubble nodes', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.add', 'Mathlib.Algebra.add'),
        makeNode('Mathlib.Algebra.mul', 'Mathlib.Algebra.mul'),
        makeNode('Other.standalone', 'Other.standalone'),
      ]
      const edges = [
        makeEdge('Other.standalone', 'Mathlib.Algebra.add'),
      ]
      const ctx = makeContext({ namespaceDepth: 2, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // Edge should now point to the bubble
      expect(result.edges.length).toBe(1)
      expect(result.edges[0].source).toBe('Other.standalone')
      expect(result.edges[0].target).toBe('group:Mathlib.Algebra')
    })

    it('should collapse internal edges within a group', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.add', 'Mathlib.Algebra.add'),
        makeNode('Mathlib.Algebra.mul', 'Mathlib.Algebra.mul'),
      ]
      const edges = [
        makeEdge('Mathlib.Algebra.add', 'Mathlib.Algebra.mul'), // internal edge
      ]
      const ctx = makeContext({ namespaceDepth: 2, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // Internal edges should be removed (both nodes in same bubble)
      expect(result.edges.length).toBe(0)
    })

    it('should deduplicate edges between bubbles', () => {
      const nodes = [
        makeNode('A.one', 'A.one'),
        makeNode('A.two', 'A.two'),
        makeNode('B.one', 'B.one'),
        makeNode('B.two', 'B.two'),
      ]
      const edges = [
        makeEdge('A.one', 'B.one'),
        makeEdge('A.two', 'B.two'), // same bubbles, should dedupe
      ]
      const ctx = makeContext({ namespaceDepth: 1, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // Should have only 1 edge between bubble A and bubble B
      expect(result.edges.length).toBe(1)
      expect(result.edges[0].source).toBe('group:A')
      expect(result.edges[0].target).toBe('group:B')
    })
  })

  describe('group metadata', () => {
    it('should include nodeIds in group metadata', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.add', 'Mathlib.Algebra.add'),
        makeNode('Mathlib.Algebra.mul', 'Mathlib.Algebra.mul'),
      ]
      const ctx = makeContext({ namespaceDepth: 2, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, [], ctx)

      expect(result.groups[0].nodeIds).toContain('Mathlib.Algebra.add')
      expect(result.groups[0].nodeIds).toContain('Mathlib.Algebra.mul')
      expect(result.groups[0].nodeIds.length).toBe(2)
    })

    it('should set expanded to false by default', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.add', 'Mathlib.Algebra.add'),
        makeNode('Mathlib.Algebra.mul', 'Mathlib.Algebra.mul'),
      ]
      const ctx = makeContext({ namespaceDepth: 2, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, [], ctx)

      expect(result.groups[0].expanded).toBe(false)
    })

    it('should generate meaningful labels', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.Group.Basic.add', 'Mathlib.Algebra.Group.Basic.add'),
        makeNode('Mathlib.Algebra.Group.Basic.mul', 'Mathlib.Algebra.Group.Basic.mul'),
      ]
      const ctx = makeContext({ namespaceDepth: 3, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, [], ctx)

      // Label should be the last segment of the namespace
      expect(result.groups[0].label).toBe('Group')
    })
  })

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const result = byNamespaceAggregator([], [], makeContext())

      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
      expect(result.groups).toEqual([])
    })

    it('should handle nodes without namespaces (simple names)', () => {
      const nodes = [
        makeNode('foo', 'foo'),
        makeNode('bar', 'bar'),
        makeNode('baz', 'baz'),
      ]
      const ctx = makeContext({ namespaceDepth: 1, collapseThreshold: 2 })

      const result = byNamespaceAggregator(nodes, [], ctx)

      // All 3 nodes have different "namespaces" (just their names)
      // None meet threshold of 2, so no groups
      expect(result.groups.length).toBe(0)
      expect(result.nodes.length).toBe(3)
    })

    it('should handle all nodes in threshold', () => {
      const nodes = [
        makeNode('Same.a', 'Same.a'),
        makeNode('Same.b', 'Same.b'),
      ]
      const ctx = makeContext({ namespaceDepth: 1, collapseThreshold: 3 })

      const result = byNamespaceAggregator(nodes, [], ctx)

      // 2 nodes < threshold of 3, so no group
      expect(result.groups.length).toBe(0)
      expect(result.nodes.length).toBe(2)
    })
  })

  describe('recursive expansion', () => {
    function makeContextWithExpanded(
      options: Partial<LensAggregateContext['options']> = {},
      expandedGroups: Set<string> = new Set()
    ): LensAggregateContext & { expandedGroups: Set<string> } {
      return {
        focusNodeId: null,
        options: {
          namespaceDepth: 2,
          collapseThreshold: 2,
          ...options,
        },
        expandedGroups,
      }
    }

    it('should show sub-namespace bubbles when a group is expanded', () => {
      // Deep namespace structure
      const nodes = [
        makeNode('Mathlib.Algebra.Group.add', 'Mathlib.Algebra.Group.add'),
        makeNode('Mathlib.Algebra.Group.mul', 'Mathlib.Algebra.Group.mul'),
        makeNode('Mathlib.Algebra.Ring.ring_add', 'Mathlib.Algebra.Ring.ring_add'),
        makeNode('Mathlib.Algebra.Ring.ring_mul', 'Mathlib.Algebra.Ring.ring_mul'),
      ]
      const edges: Edge[] = []

      // Expand the Mathlib.Algebra group
      const expandedGroups = new Set(['group:Mathlib.Algebra'])
      const ctx = makeContextWithExpanded({ namespaceDepth: 2, collapseThreshold: 2 }, expandedGroups)

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // Should now have 2 sub-namespace bubbles: Mathlib.Algebra.Group and Mathlib.Algebra.Ring
      const bubbleNodes = result.nodes.filter(n => n.id.startsWith('group:'))
      expect(bubbleNodes.length).toBe(2)
      expect(bubbleNodes.some(n => n.id === 'group:Mathlib.Algebra.Group')).toBe(true)
      expect(bubbleNodes.some(n => n.id === 'group:Mathlib.Algebra.Ring')).toBe(true)
    })

    it('should show individual nodes when expanded group cannot go deeper', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.add', 'Mathlib.Algebra.add'),
        makeNode('Mathlib.Algebra.mul', 'Mathlib.Algebra.mul'),
      ]
      const edges: Edge[] = []

      // Expand the Mathlib.Algebra group (which is already at max depth)
      const expandedGroups = new Set(['group:Mathlib.Algebra'])
      const ctx = makeContextWithExpanded({ namespaceDepth: 2, collapseThreshold: 2 }, expandedGroups)

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // Should show individual nodes since we can't go deeper
      expect(result.nodes.length).toBe(2)
      expect(result.nodes.every(n => !n.id.startsWith('group:'))).toBe(true)
      expect(result.nodes.some(n => n.id === 'Mathlib.Algebra.add')).toBe(true)
      expect(result.nodes.some(n => n.id === 'Mathlib.Algebra.mul')).toBe(true)
    })

    it('should keep collapsed groups as bubbles', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.Group.add', 'Mathlib.Algebra.Group.add'),
        makeNode('Mathlib.Algebra.Group.mul', 'Mathlib.Algebra.Group.mul'),
        makeNode('Mathlib.Topology.open', 'Mathlib.Topology.open'),
        makeNode('Mathlib.Topology.closed', 'Mathlib.Topology.closed'),
      ]
      const edges: Edge[] = []

      // Don't expand anything
      const ctx = makeContextWithExpanded({ namespaceDepth: 2, collapseThreshold: 2 }, new Set())

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // Should have 2 collapsed bubbles
      expect(result.nodes.length).toBe(2)
      expect(result.nodes.every(n => n.id.startsWith('group:'))).toBe(true)
    })

    it('should track expanded groups in groups array', () => {
      const nodes = [
        makeNode('Mathlib.Algebra.Group.add', 'Mathlib.Algebra.Group.add'),
        makeNode('Mathlib.Algebra.Group.mul', 'Mathlib.Algebra.Group.mul'),
      ]
      const edges: Edge[] = []

      // Expand the Mathlib.Algebra group
      const expandedGroups = new Set(['group:Mathlib.Algebra'])
      const ctx = makeContextWithExpanded({ namespaceDepth: 2, collapseThreshold: 2 }, expandedGroups)

      const result = byNamespaceAggregator(nodes, edges, ctx)

      // Should include the parent expanded group in groups array
      const parentGroup = result.groups.find(g => g.id === 'group:Mathlib.Algebra')
      expect(parentGroup).toBeDefined()
      expect(parentGroup?.expanded).toBe(true)
    })
  })
})
