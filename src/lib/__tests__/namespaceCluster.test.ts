import { describe, it, expect } from 'vitest'
import {
  extractNamespace,
  groupNodesByNamespace,
  computeClusterCentroids,
  calculateClusterForce,
} from '../graphProcessing'
import type { AstrolabeNode } from '@/types/graph'

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

// ============================================
// extractNamespace Tests
// ============================================

describe('extractNamespace', () => {
  describe('basic extraction', () => {
    it('should extract immediate parent namespace (depth=1)', () => {
      expect(extractNamespace('IChing.Hexagram.complement')).toBe('IChing.Hexagram')
    })

    it('should extract grandparent namespace (depth=2)', () => {
      expect(extractNamespace('IChing.Hexagram.complement', 2)).toBe('IChing')
    })

    it('should handle root-level names', () => {
      expect(extractNamespace('Nat')).toBe('')
    })

    it('should handle single-level namespace', () => {
      expect(extractNamespace('Mathlib.add')).toBe('Mathlib')
    })

    it('should handle deep namespaces', () => {
      expect(extractNamespace('Mathlib.Algebra.Group.Basic.add_comm', 1)).toBe('Mathlib.Algebra.Group.Basic')
      expect(extractNamespace('Mathlib.Algebra.Group.Basic.add_comm', 2)).toBe('Mathlib.Algebra.Group')
      expect(extractNamespace('Mathlib.Algebra.Group.Basic.add_comm', 3)).toBe('Mathlib.Algebra')
    })

    it('should return empty string when depth exceeds namespace levels', () => {
      expect(extractNamespace('IChing.Hexagram', 5)).toBe('')
    })

    it('should handle empty string', () => {
      expect(extractNamespace('')).toBe('')
    })
  })

  describe('edge cases', () => {
    it('should handle names with leading dots', () => {
      expect(extractNamespace('.hidden.name')).toBe('.hidden')
    })

    it('should handle names ending with dots (treats trailing dot as empty segment)', () => {
      // 'IChing.Hexagram.' splits to ['IChing', 'Hexagram', '']
      // After filtering empty (except first): ['IChing', 'Hexagram']
      // depth=1: removes last, so 'IChing'
      expect(extractNamespace('IChing.Hexagram.')).toBe('IChing')
    })

    it('should handle consecutive dots (treats as empty segment)', () => {
      // 'IChing..Hexagram' splits to ['IChing', '', 'Hexagram']
      // After filtering empty (except first): ['IChing', 'Hexagram']
      // depth=1: 'IChing'
      expect(extractNamespace('IChing..Hexagram')).toBe('IChing')
    })
  })
})

// ============================================
// groupNodesByNamespace Tests
// ============================================

describe('groupNodesByNamespace', () => {
  it('should group nodes by namespace', () => {
    const nodes = [
      createNode({ id: '1', name: 'IChing.Hexagram.complement' }),
      createNode({ id: '2', name: 'IChing.Hexagram.reverse' }),
      createNode({ id: '3', name: 'IChing.Trigram.upper' }),
      createNode({ id: '4', name: 'IChing.Trigram.lower' }),
    ]

    const groups = groupNodesByNamespace(nodes)

    expect(groups.get('IChing.Hexagram')).toHaveLength(2)
    expect(groups.get('IChing.Trigram')).toHaveLength(2)
    expect(groups.get('IChing.Hexagram')?.map(n => n.id)).toContain('1')
    expect(groups.get('IChing.Hexagram')?.map(n => n.id)).toContain('2')
  })

  it('should handle depth parameter', () => {
    const nodes = [
      createNode({ id: '1', name: 'IChing.Hexagram.complement' }),
      createNode({ id: '2', name: 'IChing.Trigram.upper' }),
      createNode({ id: '3', name: 'Mathlib.Algebra.Group' }),
    ]

    const groups = groupNodesByNamespace(nodes, 2)  // Group by grandparent

    expect(groups.get('IChing')).toHaveLength(2)
    expect(groups.get('Mathlib')).toHaveLength(1)
  })

  it('should handle empty nodes array', () => {
    const groups = groupNodesByNamespace([])
    expect(groups.size).toBe(0)
  })

  it('should handle nodes with no namespace', () => {
    const nodes = [
      createNode({ id: '1', name: 'Nat' }),
      createNode({ id: '2', name: 'Int' }),
      createNode({ id: '3', name: 'IChing.Hexagram' }),
    ]

    const groups = groupNodesByNamespace(nodes)

    // Root-level nodes get grouped under empty string
    expect(groups.get('')).toHaveLength(2)
    expect(groups.get('IChing')).toHaveLength(1)
  })

  it('should return nodeId to namespace mapping', () => {
    const nodes = [
      createNode({ id: '1', name: 'IChing.Hexagram.complement' }),
      createNode({ id: '2', name: 'IChing.Trigram.upper' }),
    ]

    const groups = groupNodesByNamespace(nodes)
    const namespaceMap = groups.nodeNamespaceMap

    expect(namespaceMap?.get('1')).toBe('IChing.Hexagram')
    expect(namespaceMap?.get('2')).toBe('IChing.Trigram')
  })
})

// ============================================
// computeClusterCentroids Tests
// ============================================

describe('computeClusterCentroids', () => {
  it('should compute centroid for single-node cluster', () => {
    const nodes = [createNode({ id: '1', name: 'IChing.Hex', position: { x: 10, y: 20, z: 30 } })]
    const positions = new Map([['1', { x: 10, y: 20, z: 30 }]])
    const groups = groupNodesByNamespace(nodes)

    const centroids = computeClusterCentroids(groups, positions)

    expect(centroids.get('IChing')).toEqual({ x: 10, y: 20, z: 30 })
  })

  it('should compute average centroid for multi-node cluster', () => {
    const nodes = [
      createNode({ id: '1', name: 'IChing.Hex1' }),
      createNode({ id: '2', name: 'IChing.Hex2' }),
    ]
    const positions = new Map([
      ['1', { x: 0, y: 0, z: 0 }],
      ['2', { x: 10, y: 10, z: 10 }],
    ])
    const groups = groupNodesByNamespace(nodes)

    const centroids = computeClusterCentroids(groups, positions)

    expect(centroids.get('IChing')).toEqual({ x: 5, y: 5, z: 5 })
  })

  it('should handle missing positions gracefully', () => {
    const nodes = [
      createNode({ id: '1', name: 'IChing.Hex1' }),
      createNode({ id: '2', name: 'IChing.Hex2' }),
    ]
    const positions = new Map([['1', { x: 10, y: 10, z: 10 }]])  // Missing node 2
    const groups = groupNodesByNamespace(nodes)

    const centroids = computeClusterCentroids(groups, positions)

    // Should compute with available positions only
    expect(centroids.get('IChing')).toEqual({ x: 10, y: 10, z: 10 })
  })

  it('should compute centroids for multiple clusters', () => {
    const nodes = [
      createNode({ id: '1', name: 'IChing.Hex' }),
      createNode({ id: '2', name: 'Mathlib.Algebra' }),
    ]
    const positions = new Map([
      ['1', { x: 0, y: 0, z: 0 }],
      ['2', { x: 100, y: 100, z: 100 }],
    ])
    const groups = groupNodesByNamespace(nodes)

    const centroids = computeClusterCentroids(groups, positions)

    expect(centroids.get('IChing')).toEqual({ x: 0, y: 0, z: 0 })
    expect(centroids.get('Mathlib')).toEqual({ x: 100, y: 100, z: 100 })
  })
})

// ============================================
// calculateClusterForce Tests
// ============================================

describe('calculateClusterForce', () => {
  it('should attract nodes toward their cluster centroid', () => {
    const nodePosition = { x: 0, y: 0, z: 0 }
    const clusterCentroid = { x: 10, y: 0, z: 0 }
    const strength = 1.0

    const force = calculateClusterForce(nodePosition, clusterCentroid, strength)

    // Force should point toward centroid
    expect(force.x).toBeGreaterThan(0)
    expect(force.y).toBe(0)
    expect(force.z).toBe(0)
  })

  it('should return zero force when node is at centroid', () => {
    const position = { x: 5, y: 5, z: 5 }
    const force = calculateClusterForce(position, position, 1.0)

    expect(force.x).toBe(0)
    expect(force.y).toBe(0)
    expect(force.z).toBe(0)
  })

  it('should scale force with strength parameter', () => {
    const nodePosition = { x: 0, y: 0, z: 0 }
    const clusterCentroid = { x: 10, y: 0, z: 0 }

    const forceWeak = calculateClusterForce(nodePosition, clusterCentroid, 0.5)
    const forceStrong = calculateClusterForce(nodePosition, clusterCentroid, 1.0)

    expect(forceStrong.x).toBeGreaterThan(forceWeak.x)
    expect(forceStrong.x / forceWeak.x).toBeCloseTo(2, 1)
  })

  it('should handle negative coordinates', () => {
    const nodePosition = { x: -5, y: -5, z: -5 }
    const clusterCentroid = { x: 5, y: 5, z: 5 }
    const strength = 1.0

    const force = calculateClusterForce(nodePosition, clusterCentroid, strength)

    // All components should be positive (toward the centroid)
    expect(force.x).toBeGreaterThan(0)
    expect(force.y).toBeGreaterThan(0)
    expect(force.z).toBeGreaterThan(0)
  })

  it('should produce equal magnitude forces in all directions', () => {
    const nodePosition = { x: 0, y: 0, z: 0 }
    const centroid1 = { x: 10, y: 0, z: 0 }
    const centroid2 = { x: 0, y: 10, z: 0 }
    const centroid3 = { x: 0, y: 0, z: 10 }
    const strength = 1.0

    const force1 = calculateClusterForce(nodePosition, centroid1, strength)
    const force2 = calculateClusterForce(nodePosition, centroid2, strength)
    const force3 = calculateClusterForce(nodePosition, centroid3, strength)

    const mag1 = Math.sqrt(force1.x ** 2 + force1.y ** 2 + force1.z ** 2)
    const mag2 = Math.sqrt(force2.x ** 2 + force2.y ** 2 + force2.z ** 2)
    const mag3 = Math.sqrt(force3.x ** 2 + force3.y ** 2 + force3.z ** 2)

    expect(mag1).toBeCloseTo(mag2, 5)
    expect(mag2).toBeCloseTo(mag3, 5)
  })
})

// ============================================
// Integration Tests
// ============================================

describe('namespace clustering integration', () => {
  it('should cluster I Ching hexagram-related nodes together', () => {
    const nodes = [
      createNode({ id: '1', name: 'IChing.Hexagram.complement' }),
      createNode({ id: '2', name: 'IChing.Hexagram.reverse' }),
      createNode({ id: '3', name: 'IChing.Hexagram.nuclear' }),
      createNode({ id: '4', name: 'IChing.Trigram.upper' }),
      createNode({ id: '5', name: 'IChing.Trigram.lower' }),
      createNode({ id: '6', name: 'IChing.Line.yang' }),
    ]

    const groups = groupNodesByNamespace(nodes)

    expect(groups.get('IChing.Hexagram')).toHaveLength(3)
    expect(groups.get('IChing.Trigram')).toHaveLength(2)
    expect(groups.get('IChing.Line')).toHaveLength(1)
  })

  it('should provide consistent namespace assignments', () => {
    const nodes = [
      createNode({ id: '1', name: 'A.B.C.d' }),
      createNode({ id: '2', name: 'A.B.C.e' }),
      createNode({ id: '3', name: 'A.B.D.f' }),
    ]

    const groups1 = groupNodesByNamespace(nodes, 1)
    const groups2 = groupNodesByNamespace(nodes, 2)

    // At depth 1, A.B.C.d and A.B.C.e should be in same cluster
    expect(groups1.get('A.B.C')?.map(n => n.id).sort()).toEqual(['1', '2'])

    // At depth 2, all three should be in same cluster (A.B)
    expect(groups2.get('A.B')?.map(n => n.id).sort()).toEqual(['1', '2', '3'])
  })
})
