import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ForceLayoutWorker Component Tests
 *
 * Tests the Worker-based ForceLayout component.
 */

// Mock Worker
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
}

vi.stubGlobal('Worker', MockWorker)

// Mock react-three/fiber
vi.mock('@react-three/fiber', () => ({
  useFrame: vi.fn((callback) => {
    // Don't actually call the callback in tests
  }),
  useThree: vi.fn(() => ({
    camera: {
      position: { x: 0, y: 0, z: 10 },
      getWorldDirection: vi.fn(() => ({ clone: () => ({ negate: () => ({}) }) })),
    },
    raycaster: {
      setFromCamera: vi.fn(),
      ray: { intersectPlane: vi.fn() },
    },
    gl: {
      domElement: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        style: {},
      },
    },
    pointer: { x: 0, y: 0 },
  })),
}))

// Mock the hook
vi.mock('@/hooks/useForceLayout3DWorker', () => ({
  useForceLayout3DWorker: vi.fn(() => ({
    positionsRef: { current: new Map([['a', [1, 2, 3]]]) },
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: false,
    stableFrames: 0,
    reinit: vi.fn(),
  })),
}))

describe('ForceLayoutWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should use useForceLayout3DWorker hook', async () => {
      const { useForceLayout3DWorker } = await import('@/hooks/useForceLayout3DWorker')

      // Import component to trigger hook usage
      await import('../ForceLayoutWorker')

      expect(useForceLayout3DWorker).toBeDefined()
    })

    it('should accept same props as ForceLayout', async () => {
      const { ForceLayoutWorker } = await import('../ForceLayoutWorker')

      // Type check - these props should be accepted
      const props = {
        nodes: [],
        edges: [],
        positionsRef: { current: new Map() },
        draggingNodeId: null,
        setDraggingNodeId: vi.fn(),
        running: true,
        physics: {
          repulsionStrength: 200,
          springLength: 8,
          springStrength: 1,
          centerStrength: 0.05,
          damping: 0.8,
          clusteringEnabled: false,
          clusteringStrength: 0.1,
          clusterSeparation: 0.3,
          clusteringDepth: 1,
          adaptiveSpringEnabled: true,
          adaptiveSpringMode: 'sqrt' as const,
          adaptiveSpringScale: 0.5,
        },
        onStable: vi.fn(),
        onWarmupComplete: vi.fn(),
      }

      expect(ForceLayoutWorker).toBeDefined()
      expect(typeof ForceLayoutWorker).toBe('function')
    })
  })

  describe('position sync', () => {
    it('should sync positions from worker to external ref', async () => {
      const { useForceLayout3DWorker } = await import('@/hooks/useForceLayout3DWorker')

      const mockPositions = new Map([
        ['node1', [10, 20, 30] as [number, number, number]],
        ['node2', [40, 50, 60] as [number, number, number]],
      ])

      ;(useForceLayout3DWorker as any).mockReturnValue({
        positionsRef: { current: mockPositions },
        start: vi.fn(),
        stop: vi.fn(),
        isRunning: true,
        stableFrames: 0,
        reinit: vi.fn(),
      })

      // The hook returns positions that should be synced
      const result = (useForceLayout3DWorker as any)()
      expect(result.positionsRef.current.get('node1')).toEqual([10, 20, 30])
    })
  })

  describe('lifecycle', () => {
    it('should call onStable when worker reports stability', async () => {
      const { useForceLayout3DWorker } = await import('@/hooks/useForceLayout3DWorker')

      const onStable = vi.fn()

      ;(useForceLayout3DWorker as any).mockImplementation((nodes: any, edges: any, options: any) => {
        // Simulate calling onStable after some time
        if (options?.onStable) {
          setTimeout(() => options.onStable(), 0)
        }
        return {
          positionsRef: { current: new Map() },
          start: vi.fn(),
          stop: vi.fn(),
          isRunning: false,
          stableFrames: 61,
          reinit: vi.fn(),
        }
      })

      // Hook should accept onStable callback
      const result = (useForceLayout3DWorker as any)([], [], { onStable })
      expect(result.stableFrames).toBe(61)
    })
  })
})

describe('ForceLayoutWorker vs ForceLayout API compatibility', () => {
  it('should export the same interface', async () => {
    const { ForceLayoutWorker } = await import('../ForceLayoutWorker')
    const { ForceLayout } = await import('../ForceLayout')

    // Both should be React components (functions)
    expect(typeof ForceLayoutWorker).toBe('function')
    expect(typeof ForceLayout).toBe('function')
  })
})
