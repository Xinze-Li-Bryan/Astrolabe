import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Graph from 'graphology'

/**
 * ForceAtlas2 Web Worker Layout Tests
 *
 * Test scenarios:
 * 1. Graph initialization with nodes and edges
 * 2. Worker lifecycle (start/stop/kill)
 * 3. Position updates callback
 * 4. inferSettings auto-parameter tuning
 * 5. Barnes-Hut optimization enabled by default
 */

// Mock graphology-layout-forceatlas2/worker since it uses real Web Workers
vi.mock('graphology-layout-forceatlas2/worker', () => {
  // Create a mock class that mimics FA2LayoutSupervisor
  class MockFA2Layout {
    graph: any
    options: any
    running: boolean = false
    intervalId: NodeJS.Timeout | null = null

    constructor(graph: any, options: any) {
      this.graph = graph
      this.options = options
      MockFA2Layout.lastInstance = this
      MockFA2Layout.instances.push(this)
    }

    start() {
      this.running = true
      // Simulate position updates
      this.intervalId = setInterval(() => {
        this.graph.forEachNode((id: string) => {
          this.graph.setNodeAttribute(id, 'x', Math.random() * 100)
          this.graph.setNodeAttribute(id, 'y', Math.random() * 100)
        })
      }, 16)
    }

    stop() {
      this.running = false
      if (this.intervalId) clearInterval(this.intervalId)
    }

    kill() {
      this.running = false
      if (this.intervalId) clearInterval(this.intervalId)
    }

    isRunning() {
      return this.running
    }

    // Static for test access
    static lastInstance: MockFA2Layout | null = null
    static instances: MockFA2Layout[] = []
    static reset() {
      MockFA2Layout.lastInstance = null
      MockFA2Layout.instances = []
    }
  }

  return {
    default: MockFA2Layout,
    __MockFA2Layout: MockFA2Layout, // Export for test access
  }
})

vi.mock('graphology-layout-forceatlas2', () => ({
  inferSettings: vi.fn((graph) => {
    const order = graph.order
    return {
      gravity: order > 100 ? 0.05 : 1,
      scalingRatio: order > 100 ? 10 : 2,
      barnesHutOptimize: order > 100,
      barnesHutTheta: 0.5,
      strongGravityMode: false,
    }
  }),
}))

describe('ForceAtlas2Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('graph initialization', () => {
    it('should create a graphology graph from nodes and edges', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')

      const nodes = [
        { id: 'a', name: 'Node A' },
        { id: 'b', name: 'Node B' },
        { id: 'c', name: 'Node C' },
      ]
      const edges = [
        { id: 'a->b', source: 'a', target: 'b' },
        { id: 'b->c', source: 'b', target: 'c' },
      ]

      const layout = new ForceAtlas2Layout()
      layout.init(nodes as any, edges as any)

      const graph = layout.getGraph()
      expect(graph.order).toBe(3) // 3 nodes
      expect(graph.size).toBe(2) // 2 edges
    })

    it('should set initial positions using Fibonacci sphere distribution', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')

      const nodes = [
        { id: 'a', name: 'Node A' },
        { id: 'b', name: 'Node B' },
      ]

      const layout = new ForceAtlas2Layout()
      layout.init(nodes as any, [])

      const graph = layout.getGraph()

      // Nodes should have initial positions
      expect(graph.getNodeAttribute('a', 'x')).toBeDefined()
      expect(graph.getNodeAttribute('a', 'y')).toBeDefined()
      expect(graph.getNodeAttribute('b', 'x')).toBeDefined()
      expect(graph.getNodeAttribute('b', 'y')).toBeDefined()

      // Positions should be different (not all at origin)
      const ax = graph.getNodeAttribute('a', 'x')
      const bx = graph.getNodeAttribute('b', 'x')
      expect(ax).not.toBe(bx)
    })

    it('should skip edges with missing nodes', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')

      const nodes = [{ id: 'a', name: 'Node A' }]
      const edges = [
        { id: 'a->b', source: 'a', target: 'b' }, // 'b' doesn't exist
      ]

      const layout = new ForceAtlas2Layout()
      layout.init(nodes as any, edges as any)

      const graph = layout.getGraph()
      expect(graph.order).toBe(1)
      expect(graph.size).toBe(0) // Edge should be skipped
    })
  })

  describe('worker lifecycle', () => {
    it('should start the layout worker', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')
      const { __MockFA2Layout } = await import('graphology-layout-forceatlas2/worker') as any

      __MockFA2Layout.reset()

      const layout = new ForceAtlas2Layout()
      layout.init([{ id: 'a', name: 'A' }] as any, [])
      layout.start()

      // Check that a mock instance was created and started
      expect(__MockFA2Layout.lastInstance).not.toBeNull()
      expect(layout.isRunning()).toBe(true)
    })

    it('should stop the layout worker', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')

      const layout = new ForceAtlas2Layout()
      layout.init([{ id: 'a', name: 'A' }] as any, [])
      layout.start()
      layout.stop()

      expect(layout.isRunning()).toBe(false)
    })

    it('should kill the layout worker and release resources', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')

      const layout = new ForceAtlas2Layout()
      layout.init([{ id: 'a', name: 'A' }] as any, [])
      layout.start()
      layout.kill()

      expect(layout.isRunning()).toBe(false)
    })
  })

  describe('position updates', () => {
    it('should call onUpdate callback with positions', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')

      const onUpdate = vi.fn()
      const layout = new ForceAtlas2Layout(onUpdate)
      layout.init(
        [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ] as any,
        []
      )

      // Manually trigger position sync
      layout.syncPositions()

      expect(onUpdate).toHaveBeenCalled()
      const positions = onUpdate.mock.calls[0][0] as Map<string, [number, number, number]>
      expect(positions.has('a')).toBe(true)
      expect(positions.has('b')).toBe(true)
    })

    it('should return 2D positions with z=0', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')

      const onUpdate = vi.fn()
      const layout = new ForceAtlas2Layout(onUpdate)
      layout.init([{ id: 'a', name: 'A' }] as any, [])
      layout.syncPositions()

      const positions = onUpdate.mock.calls[0][0] as Map<string, [number, number, number]>
      const pos = positions.get('a')!
      expect(pos.length).toBe(3)
      expect(pos[2]).toBe(0) // z should be 0 for 2D layout
    })
  })

  describe('inferSettings', () => {
    it('should use inferSettings for automatic parameter tuning', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')
      const { inferSettings } = await import('graphology-layout-forceatlas2')

      const nodes = Array.from({ length: 150 }, (_, i) => ({
        id: `node_${i}`,
        name: `Node ${i}`,
      }))

      const layout = new ForceAtlas2Layout()
      layout.init(nodes as any, [])

      const settings = layout.getInferredSettings()

      expect(inferSettings).toHaveBeenCalled()
      expect(settings.gravity).toBe(0.05) // Large graph setting
      expect(settings.barnesHutOptimize).toBe(true)
    })

    it('should allow custom settings to override inferred ones', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')

      const layout = new ForceAtlas2Layout()
      layout.init([{ id: 'a', name: 'A' }] as any, [])
      layout.start({ gravity: 5, scalingRatio: 20 })

      const settings = layout.getCurrentSettings()
      expect(settings.gravity).toBe(5)
      expect(settings.scalingRatio).toBe(20)
    })
  })

  describe('Barnes-Hut optimization', () => {
    it('should enable Barnes-Hut by default for large graphs', async () => {
      const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')
      const { __MockFA2Layout } = await import('graphology-layout-forceatlas2/worker') as any

      __MockFA2Layout.reset()

      const nodes = Array.from({ length: 200 }, (_, i) => ({
        id: `node_${i}`,
        name: `Node ${i}`,
      }))

      const layout = new ForceAtlas2Layout()
      layout.init(nodes as any, [])
      layout.start()

      // Check that FA2Layout was called with barnesHutOptimize: true
      const mockInstance = __MockFA2Layout.lastInstance
      expect(mockInstance.options.settings.barnesHutOptimize).toBe(true)
    })
  })
})

describe('integration with existing graph data', () => {
  it('should work with Node and Edge types from store', async () => {
    const { ForceAtlas2Layout } = await import('../ForceAtlas2Layout')

    // Simulate real Node/Edge data structure
    const nodes = [
      {
        id: 'Mathlib.Analysis.Calculus.Deriv',
        name: 'Mathlib.Analysis.Calculus.Deriv',
        kind: 'theorem',
        status: 'proven',
        defaultColor: '#A855F7',
        defaultSize: 1,
        defaultShape: 'sphere',
        pinned: false,
        visible: true,
      },
      {
        id: 'Mathlib.Analysis.Calculus.FDeriv',
        name: 'Mathlib.Analysis.Calculus.FDeriv',
        kind: 'definition',
        status: 'proven',
        defaultColor: '#FBBF24',
        defaultSize: 1,
        defaultShape: 'sphere',
        pinned: false,
        visible: true,
      },
    ]

    const edges = [
      {
        id: 'Deriv->FDeriv',
        source: 'Mathlib.Analysis.Calculus.Deriv',
        target: 'Mathlib.Analysis.Calculus.FDeriv',
        fromLean: true,
        defaultColor: '#2ecc71',
        defaultWidth: 1,
        defaultStyle: 'solid',
        visible: true,
      },
    ]

    const onUpdate = vi.fn()
    const layout = new ForceAtlas2Layout(onUpdate)
    layout.init(nodes as any, edges as any)

    expect(layout.getGraph().order).toBe(2)
    expect(layout.getGraph().size).toBe(1)
  })
})
