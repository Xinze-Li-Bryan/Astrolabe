import { describe, it, expect } from 'vitest'
import {
  applyLens,
  isLensImplemented,
  getImplementedLenses,
} from '../pipeline'
import type { Node, Edge } from '../types'

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

// ============================================
// Pipeline Tests
// ============================================

describe('Lens Pipeline', () => {
  describe('applyLens', () => {
    const nodes = [
      createNode('a', 'Module.A'),
      createNode('b', 'Module.B'),
      createNode('c', 'Module.C'),
    ]
    const edges = [
      createEdge('a', 'b'),
      createEdge('b', 'c'),
    ]

    describe('with "full" lens', () => {
      it('should return all nodes unchanged', () => {
        const result = applyLens('full', nodes, edges, null, {})
        expect(result.nodes).toHaveLength(3)
        expect(result.nodes.map(n => n.id)).toEqual(['a', 'b', 'c'])
      })

      it('should return all edges unchanged', () => {
        const result = applyLens('full', nodes, edges, null, {})
        expect(result.edges).toHaveLength(2)
      })

      it('should return empty groups', () => {
        const result = applyLens('full', nodes, edges, null, {})
        expect(result.groups).toHaveLength(0)
      })

      it('should return force layout', () => {
        const result = applyLens('full', nodes, edges, null, {})
        expect(result.layout).toBe('force')
      })
    })

    describe('with unknown lens', () => {
      it('should fallback to "full" lens', () => {
        const result = applyLens('nonexistent', nodes, edges, null, {})
        expect(result.nodes).toHaveLength(3)
        expect(result.edges).toHaveLength(2)
        expect(result.layout).toBe('force')
      })
    })

    describe('with focus-required lens but no focus', () => {
      it('should return empty result for ego lens without focus', () => {
        const result = applyLens('ego', nodes, edges, null, {})
        expect(result.nodes).toHaveLength(0)
        expect(result.edges).toHaveLength(0)
      })
    })

    describe('with "ego" lens and focus', () => {
      it('should filter to N-hop neighborhood', () => {
        // With focus on 'b' and nHop=1, should get a, b, c
        const result = applyLens('ego', nodes, edges, 'b', { nHop: 1 })
        expect(result.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c'])
        expect(result.edges).toHaveLength(2)
      })

      it('should use radial layout', () => {
        const result = applyLens('ego', nodes, edges, 'b', { nHop: 1 })
        expect(result.layout).toBe('radial')
      })

      it('should respect nHop option', () => {
        // With nHop=0, should only get the focus node
        const result = applyLens('ego', nodes, edges, 'b', { nHop: 0 })
        expect(result.nodes.map(n => n.id)).toEqual(['b'])
        expect(result.edges).toHaveLength(0)
      })
    })

    describe('with empty graph', () => {
      it('should handle empty nodes', () => {
        const result = applyLens('full', [], [], null, {})
        expect(result.nodes).toHaveLength(0)
        expect(result.edges).toHaveLength(0)
        expect(result.groups).toHaveLength(0)
      })
    })
  })

  describe('isLensImplemented', () => {
    it('should return true for "full" lens', () => {
      expect(isLensImplemented('full')).toBe(true)
    })

    it('should return true for "ego" lens (Phase 2)', () => {
      // ego uses nHop filter which is now implemented
      expect(isLensImplemented('ego')).toBe(true)
    })

    it('should return true for "namespaces" lens (Phase 3)', () => {
      // namespaces uses byNamespace aggregator which is now implemented
      expect(isLensImplemented('namespaces')).toBe(true)
    })

    it('should return true for "imports" lens (Phase 4)', () => {
      // imports uses ancestors filter which is now implemented
      expect(isLensImplemented('imports')).toBe(true)
    })

    it('should return true for "dependents" lens (Phase 4)', () => {
      // dependents uses descendants filter which is now implemented
      expect(isLensImplemented('dependents')).toBe(true)
    })

    it('should return false for unknown lens', () => {
      expect(isLensImplemented('nonexistent')).toBe(false)
    })
  })

  describe('getImplementedLenses', () => {
    it('should include "full" lens', () => {
      const implemented = getImplementedLenses()
      expect(implemented).toContain('full')
    })

    it('should only return implemented lenses', () => {
      const implemented = getImplementedLenses()
      for (const id of implemented) {
        expect(isLensImplemented(id)).toBe(true)
      }
    })
  })
})
