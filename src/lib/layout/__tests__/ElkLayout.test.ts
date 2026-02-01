import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ELK Layout Tests for DAG/Dependency Graph Visualization
 *
 * Test scenarios:
 * 1. Basic layered layout computation
 * 2. Using model order strategy to reduce crossings
 * 3. Handling of various graph structures
 * 4. Position output format
 */

// Mock elkjs
vi.mock('elkjs/lib/elk.bundled', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      layout: vi.fn(async (graph: any) => {
        // Simulate ELK layout computation
        const children = graph.children?.map((child: any, index: number) => ({
          ...child,
          x: (index % 5) * 100,
          y: Math.floor(index / 5) * 80,
        })) || []

        return {
          ...graph,
          children,
        }
      }),
    })),
  }
})

describe('ElkLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('basic layout', () => {
    it('should compute positions for all nodes', async () => {
      const { ElkLayout } = await import('../ElkLayout')

      const nodes = [
        { id: 'a', name: 'Node A' },
        { id: 'b', name: 'Node B' },
        { id: 'c', name: 'Node C' },
      ]
      const edges = [
        { id: 'a->b', source: 'a', target: 'b' },
        { id: 'b->c', source: 'b', target: 'c' },
      ]

      const layout = new ElkLayout()
      const positions = await layout.compute(nodes as any, edges as any)

      expect(positions.size).toBe(3)
      expect(positions.has('a')).toBe(true)
      expect(positions.has('b')).toBe(true)
      expect(positions.has('c')).toBe(true)
    })

    it('should return positions as [x, y, z] tuples with z=0', async () => {
      const { ElkLayout } = await import('../ElkLayout')

      const nodes = [{ id: 'a', name: 'Node A' }]
      const layout = new ElkLayout()
      const positions = await layout.compute(nodes as any, [])

      const pos = positions.get('a')!
      expect(pos.length).toBe(3)
      expect(typeof pos[0]).toBe('number')
      expect(typeof pos[1]).toBe('number')
      expect(pos[2]).toBe(0) // z should be 0
    })
  })

  describe('layout options', () => {
    it('should use layered algorithm by default', async () => {
      const { ElkLayout } = await import('../ElkLayout')
      const ELK = (await import('elkjs/lib/elk.bundled')).default

      const layout = new ElkLayout()
      await layout.compute([{ id: 'a', name: 'A' }] as any, [])

      const mockElk = (ELK as any).mock.results[0].value
      const layoutCall = mockElk.layout.mock.calls[0][0]

      expect(layoutCall.layoutOptions['elk.algorithm']).toBe('layered')
    })

    it('should support custom layout options', async () => {
      const { ElkLayout } = await import('../ElkLayout')
      const ELK = (await import('elkjs/lib/elk.bundled')).default

      const layout = new ElkLayout({
        direction: 'RIGHT',
        nodeSpacing: 100,
        layerSpacing: 150,
      })
      await layout.compute([{ id: 'a', name: 'A' }] as any, [])

      const mockElk = (ELK as any).mock.results[0].value
      const layoutCall = mockElk.layout.mock.calls[0][0]

      expect(layoutCall.layoutOptions['elk.direction']).toBe('RIGHT')
    })

    it('should use model order strategy to reduce crossings', async () => {
      const { ElkLayout } = await import('../ElkLayout')
      const ELK = (await import('elkjs/lib/elk.bundled')).default

      const layout = new ElkLayout({ useModelOrder: true })
      await layout.compute([{ id: 'a', name: 'A' }] as any, [])

      const mockElk = (ELK as any).mock.results[0].value
      const layoutCall = mockElk.layout.mock.calls[0][0]

      expect(layoutCall.layoutOptions['elk.layered.considerModelOrder.strategy']).toBe(
        'NODES_AND_EDGES'
      )
    })
  })

  describe('edge handling', () => {
    it('should skip edges with missing nodes', async () => {
      const { ElkLayout } = await import('../ElkLayout')
      const ELK = (await import('elkjs/lib/elk.bundled')).default

      const nodes = [{ id: 'a', name: 'Node A' }]
      const edges = [
        { id: 'a->b', source: 'a', target: 'b' }, // 'b' doesn't exist
      ]

      const layout = new ElkLayout()
      await layout.compute(nodes as any, edges as any)

      const mockElk = (ELK as any).mock.results[0].value
      const layoutCall = mockElk.layout.mock.calls[0][0]

      expect(layoutCall.edges.length).toBe(0)
    })

    it('should include valid edges', async () => {
      const { ElkLayout } = await import('../ElkLayout')
      const ELK = (await import('elkjs/lib/elk.bundled')).default

      const nodes = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]
      const edges = [{ id: 'a->b', source: 'a', target: 'b' }]

      const layout = new ElkLayout()
      await layout.compute(nodes as any, edges as any)

      const mockElk = (ELK as any).mock.results[0].value
      const layoutCall = mockElk.layout.mock.calls[0][0]

      expect(layoutCall.edges.length).toBe(1)
      expect(layoutCall.edges[0].sources).toContain('a')
      expect(layoutCall.edges[0].targets).toContain('b')
    })
  })

  describe('centering', () => {
    it('should center the layout around origin by default', async () => {
      const { ElkLayout } = await import('../ElkLayout')

      const nodes = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]

      const layout = new ElkLayout({ centerOutput: true })
      const positions = await layout.compute(nodes as any, [])

      // Calculate center of mass
      let cx = 0,
        cy = 0
      for (const pos of positions.values()) {
        cx += pos[0]
        cy += pos[1]
      }
      cx /= positions.size
      cy /= positions.size

      // Center should be near origin (within tolerance due to layout spread)
      expect(Math.abs(cx)).toBeLessThan(1)
      expect(Math.abs(cy)).toBeLessThan(1)
    })
  })

  describe('DAG-specific features', () => {
    it('should handle deep dependency chains', async () => {
      const { ElkLayout } = await import('../ElkLayout')

      // Create a chain: a -> b -> c -> d -> e
      const nodes = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id }))
      const edges = [
        { id: 'a->b', source: 'a', target: 'b' },
        { id: 'b->c', source: 'b', target: 'c' },
        { id: 'c->d', source: 'c', target: 'd' },
        { id: 'd->e', source: 'd', target: 'e' },
      ]

      const layout = new ElkLayout()
      const positions = await layout.compute(nodes as any, edges as any)

      expect(positions.size).toBe(5)
    })

    it('should handle diamond dependencies', async () => {
      const { ElkLayout } = await import('../ElkLayout')

      // Diamond: a -> b, a -> c, b -> d, c -> d
      const nodes = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }))
      const edges = [
        { id: 'a->b', source: 'a', target: 'b' },
        { id: 'a->c', source: 'a', target: 'c' },
        { id: 'b->d', source: 'b', target: 'd' },
        { id: 'c->d', source: 'c', target: 'd' },
      ]

      const layout = new ElkLayout()
      const positions = await layout.compute(nodes as any, edges as any)

      expect(positions.size).toBe(4)
    })
  })
})

describe('ElkLayout with Lean namespace ordering', () => {
  it('should preserve namespace order when useModelOrder is true', async () => {
    const { ElkLayout } = await import('../ElkLayout')

    // Nodes ordered by namespace (as they would be from Lean)
    const nodes = [
      { id: 'Mathlib.Analysis.Calculus.Deriv', name: 'Deriv' },
      { id: 'Mathlib.Analysis.Calculus.FDeriv', name: 'FDeriv' },
      { id: 'Mathlib.Analysis.Calculus.ContDiff', name: 'ContDiff' },
      { id: 'Mathlib.Topology.Basic', name: 'Basic' },
    ]

    const layout = new ElkLayout({ useModelOrder: true })
    const positions = await layout.compute(nodes as any, [])

    // All nodes should have positions
    expect(positions.size).toBe(4)
    nodes.forEach((n) => {
      expect(positions.has(n.id)).toBe(true)
    })
  })
})
