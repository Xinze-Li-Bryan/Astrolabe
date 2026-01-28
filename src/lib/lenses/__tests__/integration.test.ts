/**
 * Integration Tests for Lens System
 *
 * Tests the end-to-end behavior of the lens system,
 * including UX flows and edge cases.
 */

import { describe, it, expect } from 'vitest'
import { applyLens, isLensImplemented } from '../pipeline'
import { LENSES_BY_ID } from '../presets'
import type { Node, Edge, LensOptions } from '../types'

// ============================================
// Test Fixtures - Realistic Data
// ============================================

function makeNode(id: string, name?: string): Node {
  return {
    id,
    name: name ?? id,
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

// Realistic namespace-style nodes (like Lean/Mathlib)
const mathlibNodes: Node[] = [
  makeNode('Mathlib.Algebra.Group.Basic.add_comm'),
  makeNode('Mathlib.Algebra.Group.Basic.mul_comm'),
  makeNode('Mathlib.Algebra.Group.Defs.Group'),
  makeNode('Mathlib.Algebra.Ring.Basic.ring_add'),
  makeNode('Mathlib.Algebra.Ring.Basic.ring_mul'),
  makeNode('Mathlib.Topology.Basic.open_set'),
  makeNode('Mathlib.Topology.Basic.closed_set'),
  makeNode('Mathlib.Topology.Continuous.continuous_def'),
]

const mathlibEdges: Edge[] = [
  makeEdge('Mathlib.Algebra.Group.Basic.add_comm', 'Mathlib.Algebra.Group.Defs.Group'),
  makeEdge('Mathlib.Algebra.Group.Basic.mul_comm', 'Mathlib.Algebra.Group.Defs.Group'),
  makeEdge('Mathlib.Algebra.Ring.Basic.ring_add', 'Mathlib.Algebra.Group.Basic.add_comm'),
  makeEdge('Mathlib.Topology.Continuous.continuous_def', 'Mathlib.Topology.Basic.open_set'),
]

// Simple nodes without namespaces (common case)
const simpleNodes: Node[] = [
  makeNode('theorem1'),
  makeNode('theorem2'),
  makeNode('lemma1'),
  makeNode('definition1'),
  makeNode('axiom1'),
]

const simpleEdges: Edge[] = [
  makeEdge('theorem1', 'lemma1'),
  makeEdge('theorem2', 'lemma1'),
  makeEdge('lemma1', 'definition1'),
]

// ============================================
// Full Lens Tests
// ============================================

describe('Full Lens Integration', () => {
  it('should show all nodes with namespace-style names', () => {
    const result = applyLens('full', mathlibNodes, mathlibEdges, null)

    expect(result.nodes.length).toBe(mathlibNodes.length)
    expect(result.edges.length).toBe(mathlibEdges.length)
    expect(result.groups).toEqual([])
    expect(result.layout).toBe('force')
  })

  it('should show all nodes with simple names', () => {
    const result = applyLens('full', simpleNodes, simpleEdges, null)

    expect(result.nodes.length).toBe(simpleNodes.length)
    expect(result.edges.length).toBe(simpleEdges.length)
  })
})

// ============================================
// Namespaces Lens Tests
// ============================================

describe('Namespaces Lens Integration', () => {
  it('should group namespace-style nodes into bubbles', () => {
    const options: LensOptions = { namespaceDepth: 2, collapseThreshold: 2 }
    const result = applyLens('namespaces', mathlibNodes, mathlibEdges, null, options)

    // Should have groups for Mathlib.Algebra and Mathlib.Topology
    expect(result.groups.length).toBeGreaterThan(0)

    // Groups should have meaningful labels
    const groupLabels = result.groups.map(g => g.label)
    expect(groupLabels).toContain('Algebra')
    expect(groupLabels).toContain('Topology')
  })

  it('should NOT create groups for simple-named nodes (no namespaces)', () => {
    const options: LensOptions = { namespaceDepth: 2, collapseThreshold: 2 }
    const result = applyLens('namespaces', simpleNodes, simpleEdges, null, options)

    // Simple nodes like "theorem1" have no namespace hierarchy
    // Each becomes its own "namespace", none meet threshold
    expect(result.groups.length).toBe(0)
    // All nodes should pass through unchanged
    expect(result.nodes.length).toBe(simpleNodes.length)
  })

  it('should handle empty graph', () => {
    const result = applyLens('namespaces', [], [], null)

    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    expect(result.groups).toEqual([])
  })
})

// ============================================
// Ego Lens Tests - Awaiting Focus State
// ============================================

describe('Ego Lens Integration', () => {
  describe('awaiting focus state (no focusNodeId)', () => {
    it('should return empty result when no focus is provided', () => {
      const result = applyLens('ego', mathlibNodes, mathlibEdges, null)

      // This is the CURRENT behavior - returns empty
      // The UI should handle this by showing all nodes for selection
      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
      expect(result.layout).toBe('radial')
    })

    it('should indicate that lens requires focus', () => {
      const lens = LENSES_BY_ID.get('ego')
      expect(lens?.requiresFocus).toBe(true)
    })
  })

  describe('with focus node', () => {
    it('should filter to N-hop neighborhood', () => {
      const focusId = 'Mathlib.Algebra.Ring.Basic.ring_add'
      const options: LensOptions = { nHop: 1 }
      const result = applyLens('ego', mathlibNodes, mathlibEdges, focusId, options)

      // ring_add depends on add_comm, so 1-hop should include both
      expect(result.nodes.length).toBeGreaterThan(0)
      expect(result.nodes.some(n => n.id === focusId)).toBe(true)
      expect(result.nodes.some(n => n.id === 'Mathlib.Algebra.Group.Basic.add_comm')).toBe(true)
    })

    it('should use radial layout', () => {
      const focusId = 'Mathlib.Algebra.Ring.Basic.ring_add'
      const result = applyLens('ego', mathlibNodes, mathlibEdges, focusId)

      expect(result.layout).toBe('radial')
    })
  })
})

// ============================================
// Imports/Dependents Lens Tests
// ============================================

describe('Imports Lens Integration', () => {
  describe('awaiting focus state', () => {
    it('should return empty result when no focus is provided', () => {
      const result = applyLens('imports', mathlibNodes, mathlibEdges, null)

      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })
  })

  describe('with focus node', () => {
    it('should find ancestors (what focus depends on)', () => {
      const focusId = 'Mathlib.Algebra.Ring.Basic.ring_add'
      const result = applyLens('imports', mathlibNodes, mathlibEdges, focusId)

      // ring_add -> add_comm -> Group (ancestors chain)
      expect(result.nodes.some(n => n.id === focusId)).toBe(true)
      expect(result.nodes.some(n => n.id === 'Mathlib.Algebra.Group.Basic.add_comm')).toBe(true)
    })

    it('should use hierarchical layout', () => {
      const focusId = 'Mathlib.Algebra.Ring.Basic.ring_add'
      const result = applyLens('imports', mathlibNodes, mathlibEdges, focusId)

      expect(result.layout).toBe('hierarchical')
    })
  })
})

describe('Dependents Lens Integration', () => {
  describe('with focus node', () => {
    it('should find descendants (what depends on focus)', () => {
      const focusId = 'Mathlib.Algebra.Group.Basic.add_comm'
      const result = applyLens('dependents', mathlibNodes, mathlibEdges, focusId)

      // add_comm is depended on by ring_add
      expect(result.nodes.some(n => n.id === focusId)).toBe(true)
      expect(result.nodes.some(n => n.id === 'Mathlib.Algebra.Ring.Basic.ring_add')).toBe(true)
    })
  })
})

// ============================================
// Lens Availability Tests
// ============================================

describe('Lens Availability', () => {
  it('all lenses should be implemented', () => {
    expect(isLensImplemented('full')).toBe(true)
    expect(isLensImplemented('namespaces')).toBe(true)
    expect(isLensImplemented('ego')).toBe(true)
    expect(isLensImplemented('imports')).toBe(true)
    expect(isLensImplemented('dependents')).toBe(true)
  })
})
