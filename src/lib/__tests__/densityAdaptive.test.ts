import { describe, it, expect } from 'vitest'
import {
  calculateNodeDegrees,
  calculateAdaptiveSpringLength,
  AdaptiveSpringMode,
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
// calculateNodeDegrees Tests
// ============================================

describe('calculateNodeDegrees', () => {
  it('should calculate in-degree and out-degree', () => {
    const nodes = [
      createNode({ id: 'A', name: 'A' }),
      createNode({ id: 'B', name: 'B' }),
      createNode({ id: 'C', name: 'C' }),
    ]
    const edges = [
      createEdge('A', 'B'),  // A: out=1, B: in=1
      createEdge('A', 'C'),  // A: out=2, C: in=1
      createEdge('B', 'C'),  // B: out=1, C: in=2
    ]

    const degrees = calculateNodeDegrees(nodes, edges)

    expect(degrees.get('A')).toEqual({ in: 0, out: 2, total: 2 })
    expect(degrees.get('B')).toEqual({ in: 1, out: 1, total: 2 })
    expect(degrees.get('C')).toEqual({ in: 2, out: 0, total: 2 })
  })

  it('should handle isolated nodes', () => {
    const nodes = [
      createNode({ id: 'A', name: 'A' }),
      createNode({ id: 'B', name: 'B' }),  // No edges
    ]
    const edges = [createEdge('A', 'A')]  // Self-loop

    const degrees = calculateNodeDegrees(nodes, edges)

    expect(degrees.get('B')).toEqual({ in: 0, out: 0, total: 0 })
  })

  it('should handle self-loops', () => {
    const nodes = [createNode({ id: 'A', name: 'A' })]
    const edges = [createEdge('A', 'A')]

    const degrees = calculateNodeDegrees(nodes, edges)

    // Self-loop counts as both in and out
    expect(degrees.get('A')).toEqual({ in: 1, out: 1, total: 2 })
  })

  it('should handle empty graph', () => {
    const degrees = calculateNodeDegrees([], [])
    expect(degrees.size).toBe(0)
  })

  it('should handle high-degree hub node', () => {
    const nodes = [
      createNode({ id: 'Hub', name: 'Hub' }),
      createNode({ id: 'A', name: 'A' }),
      createNode({ id: 'B', name: 'B' }),
      createNode({ id: 'C', name: 'C' }),
      createNode({ id: 'D', name: 'D' }),
    ]
    const edges = [
      createEdge('Hub', 'A'),
      createEdge('Hub', 'B'),
      createEdge('Hub', 'C'),
      createEdge('Hub', 'D'),
      createEdge('A', 'Hub'),
      createEdge('B', 'Hub'),
    ]

    const degrees = calculateNodeDegrees(nodes, edges)

    expect(degrees.get('Hub')).toEqual({ in: 2, out: 4, total: 6 })
  })

  it('should handle nodes not in the node list but in edges', () => {
    const nodes = [createNode({ id: 'A', name: 'A' })]
    const edges = [createEdge('A', 'B')]  // B not in nodes list

    const degrees = calculateNodeDegrees(nodes, edges)

    // Should only track degrees for nodes in the list
    expect(degrees.get('A')).toEqual({ in: 0, out: 1, total: 1 })
    expect(degrees.has('B')).toBe(false)
  })
})

// ============================================
// calculateAdaptiveSpringLength Tests
// ============================================

describe('calculateAdaptiveSpringLength', () => {
  describe('linear mode', () => {
    it('should return base length for zero-degree nodes', () => {
      const length = calculateAdaptiveSpringLength(
        { in: 0, out: 0, total: 0 },
        { in: 0, out: 0, total: 0 },
        { mode: 'linear', baseLength: 4, scaleFactor: 0.5 }
      )

      expect(length).toBe(4)
    })

    it('should increase length linearly with degree', () => {
      const length1 = calculateAdaptiveSpringLength(
        { in: 0, out: 2, total: 2 },
        { in: 2, out: 0, total: 2 },
        { mode: 'linear', baseLength: 4, scaleFactor: 0.5 }
      )

      const length2 = calculateAdaptiveSpringLength(
        { in: 0, out: 4, total: 4 },
        { in: 4, out: 0, total: 4 },
        { mode: 'linear', baseLength: 4, scaleFactor: 0.5 }
      )

      // length = baseLength + (degree1 + degree2) * scaleFactor
      // length1 = 4 + (2 + 2) * 0.5 = 6
      // length2 = 4 + (4 + 4) * 0.5 = 8
      expect(length1).toBe(6)
      expect(length2).toBe(8)
    })

    it('should respect scale factor', () => {
      const degrees = { in: 5, out: 5, total: 10 }

      const lengthWeak = calculateAdaptiveSpringLength(
        degrees, degrees,
        { mode: 'linear', baseLength: 4, scaleFactor: 0.1 }
      )

      const lengthStrong = calculateAdaptiveSpringLength(
        degrees, degrees,
        { mode: 'linear', baseLength: 4, scaleFactor: 1.0 }
      )

      // weak: 4 + 20 * 0.1 = 6
      // strong: 4 + 20 * 1.0 = 24
      expect(lengthWeak).toBe(6)
      expect(lengthStrong).toBe(24)
    })
  })

  describe('logarithmic mode', () => {
    it('should return base length for zero-degree nodes', () => {
      const length = calculateAdaptiveSpringLength(
        { in: 0, out: 0, total: 0 },
        { in: 0, out: 0, total: 0 },
        { mode: 'logarithmic', baseLength: 4, scaleFactor: 1.0 }
      )

      // log(0 + 0 + 1) = log(1) = 0
      expect(length).toBe(4)
    })

    it('should grow slower than linear for high degrees', () => {
      const highDegree = { in: 50, out: 50, total: 100 }

      const linearLength = calculateAdaptiveSpringLength(
        highDegree, highDegree,
        { mode: 'linear', baseLength: 4, scaleFactor: 0.5 }
      )

      const logLength = calculateAdaptiveSpringLength(
        highDegree, highDegree,
        { mode: 'logarithmic', baseLength: 4, scaleFactor: 0.5 }
      )

      // Linear: 4 + 200 * 0.5 = 104
      // Log: 4 * (1 + log(201) * 0.5) ≈ 4 * (1 + 5.3 * 0.5) ≈ 14.6
      expect(logLength).toBeLessThan(linearLength)
      expect(linearLength).toBe(104)
    })

    it('should provide stable results for very high degrees', () => {
      const veryHighDegree = { in: 500, out: 500, total: 1000 }

      const length = calculateAdaptiveSpringLength(
        veryHighDegree, veryHighDegree,
        { mode: 'logarithmic', baseLength: 4, scaleFactor: 1.0 }
      )

      // Should not explode to unreasonable values
      expect(length).toBeLessThan(50)
      expect(length).toBeGreaterThan(4)
    })
  })

  describe('sqrt mode', () => {
    it('should return base length for zero-degree nodes', () => {
      const length = calculateAdaptiveSpringLength(
        { in: 0, out: 0, total: 0 },
        { in: 0, out: 0, total: 0 },
        { mode: 'sqrt', baseLength: 4, scaleFactor: 1.0 }
      )

      expect(length).toBe(4)
    })

    it('should scale with square root of combined degree', () => {
      const length = calculateAdaptiveSpringLength(
        { in: 2, out: 2, total: 4 },
        { in: 2, out: 2, total: 4 },
        { mode: 'sqrt', baseLength: 4, scaleFactor: 1.0 }
      )

      // sqrt(4 + 4) * 1.0 = sqrt(8) ≈ 2.83
      // 4 + 2.83 ≈ 6.83
      expect(length).toBeCloseTo(4 + Math.sqrt(8), 2)
    })

    it('should grow slower than linear for high degrees', () => {
      const highDegree = { in: 25, out: 25, total: 50 }

      const linear = calculateAdaptiveSpringLength(
        highDegree, highDegree,
        { mode: 'linear', baseLength: 4, scaleFactor: 0.5 }
      )

      const sqrt = calculateAdaptiveSpringLength(
        highDegree, highDegree,
        { mode: 'sqrt', baseLength: 4, scaleFactor: 0.5 }
      )

      // sqrt grows slower than linear for high degrees
      // linear: 4 + 100 * 0.5 = 54
      // sqrt: 4 + sqrt(100) * 0.5 = 9
      expect(sqrt).toBeLessThan(linear)
      expect(linear).toBe(54)
      expect(sqrt).toBe(9)
    })
  })

  describe('edge cases', () => {
    it('should handle asymmetric degrees', () => {
      const highOut = { in: 0, out: 100, total: 100 }  // Hub with many dependents
      const highIn = { in: 100, out: 0, total: 100 }   // Node many depend on

      const length = calculateAdaptiveSpringLength(
        highOut, highIn,
        { mode: 'linear', baseLength: 4, scaleFactor: 0.1 }
      )

      // Uses total degree: 4 + (100 + 100) * 0.1 = 24
      expect(length).toBe(24)
    })

    it('should handle negative scale factor gracefully', () => {
      // Negative scale factor should still work (makes edges shorter with higher degree)
      const length = calculateAdaptiveSpringLength(
        { in: 5, out: 5, total: 10 },
        { in: 5, out: 5, total: 10 },
        { mode: 'linear', baseLength: 10, scaleFactor: -0.2 }
      )

      // 10 + 20 * (-0.2) = 10 - 4 = 6
      expect(length).toBe(6)
    })

    it('should clamp to minimum length', () => {
      const length = calculateAdaptiveSpringLength(
        { in: 50, out: 50, total: 100 },
        { in: 50, out: 50, total: 100 },
        { mode: 'linear', baseLength: 4, scaleFactor: -0.1, minLength: 1 }
      )

      // 4 + 200 * (-0.1) = 4 - 20 = -16, clamped to 1
      expect(length).toBe(1)
    })

    it('should clamp to maximum length', () => {
      const length = calculateAdaptiveSpringLength(
        { in: 500, out: 500, total: 1000 },
        { in: 500, out: 500, total: 1000 },
        { mode: 'linear', baseLength: 4, scaleFactor: 1.0, maxLength: 50 }
      )

      // 4 + 2000 * 1.0 = 2004, clamped to 50
      expect(length).toBe(50)
    })
  })
})

// ============================================
// Integration Tests - Realistic Scenarios
// ============================================

describe('density-adaptive integration', () => {
  it('should handle I Ching Hexagram hub pattern', () => {
    // Hexagram is a hub - many nodes depend on it
    const nodes = [
      createNode({ id: 'Hexagram', name: 'IChing.Hexagram' }),
      ...Array.from({ length: 20 }, (_, i) =>
        createNode({ id: `Dep${i}`, name: `IChing.Hexagram.dependent${i}` })
      ),
    ]

    const edges = Array.from({ length: 20 }, (_, i) =>
      createEdge(`Dep${i}`, 'Hexagram')  // All depend on Hexagram
    )

    const degrees = calculateNodeDegrees(nodes, edges)

    expect(degrees.get('Hexagram')?.in).toBe(20)
    expect(degrees.get('Hexagram')?.out).toBe(0)
    expect(degrees.get('Hexagram')?.total).toBe(20)

    // Edge from a dependent to Hexagram should be longer
    const depDegree = degrees.get('Dep0')!
    const hexDegree = degrees.get('Hexagram')!

    const adaptiveLength = calculateAdaptiveSpringLength(
      depDegree, hexDegree,
      { mode: 'sqrt', baseLength: 4, scaleFactor: 0.5 }
    )

    // sqrt(1 + 20) * 0.5 + 4 ≈ 2.29 + 4 = 6.29
    expect(adaptiveLength).toBeGreaterThan(4)
    expect(adaptiveLength).toBeLessThan(10)
  })

  it('should produce reasonable distribution of edge lengths', () => {
    // Create a realistic graph with varying degrees
    const nodes = [
      createNode({ id: 'root', name: 'Root' }),
      createNode({ id: 'hub1', name: 'Hub1' }),
      createNode({ id: 'hub2', name: 'Hub2' }),
      createNode({ id: 'leaf1', name: 'Leaf1' }),
      createNode({ id: 'leaf2', name: 'Leaf2' }),
      createNode({ id: 'leaf3', name: 'Leaf3' }),
    ]

    const edges = [
      createEdge('leaf1', 'hub1'),
      createEdge('leaf2', 'hub1'),
      createEdge('leaf3', 'hub1'),
      createEdge('hub1', 'root'),
      createEdge('hub2', 'root'),
      createEdge('leaf1', 'hub2'),
    ]

    const degrees = calculateNodeDegrees(nodes, edges)

    // Calculate lengths for each edge
    const lengths = edges.map(e => ({
      edge: `${e.source}->${e.target}`,
      length: calculateAdaptiveSpringLength(
        degrees.get(e.source)!,
        degrees.get(e.target)!,
        { mode: 'sqrt', baseLength: 4, scaleFactor: 0.5 }
      ),
    }))

    // Hub connections should be longer than leaf-to-leaf
    const hubToRoot = lengths.find(l => l.edge === 'hub1->root')!.length
    const leafToHub = lengths.find(l => l.edge === 'leaf1->hub1')!.length

    // hub1 (in:3, out:1, total:4) -> root (in:2, out:0, total:2)
    // sqrt(4+2) * 0.5 + 4 = sqrt(6) * 0.5 + 4 ≈ 5.22
    expect(hubToRoot).toBeGreaterThan(4)

    // Edges to high-degree nodes should be longer
    expect(hubToRoot).toBeGreaterThan(4)
  })
})
