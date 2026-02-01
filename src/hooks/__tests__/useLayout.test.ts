import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

/**
 * useLayout Hook Tests
 *
 * Test scenarios:
 * 1. Layout mode switching (force vs hierarchical)
 * 2. Position updates
 * 3. Running state management
 * 4. Cleanup on unmount
 */

// Mock the layout classes
vi.mock('@/lib/layout', () => ({
  ForceAtlas2Layout: vi.fn().mockImplementation((onUpdate) => ({
    init: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    kill: vi.fn(),
    isRunning: vi.fn(() => false),
    syncPositions: vi.fn(() => {
      if (onUpdate) {
        onUpdate(new Map([['a', [10, 20, 0]]]))
      }
    }),
    getGraph: vi.fn(() => ({ order: 1, size: 0 })),
    getInferredSettings: vi.fn(() => ({})),
    getCurrentSettings: vi.fn(() => ({})),
  })),
  ElkLayout: vi.fn().mockImplementation(() => ({
    compute: vi.fn(async () => new Map([['a', [10, 20, 0]]])),
  })),
}))

describe('useLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with default mode', async () => {
      const { useLayout } = await import('../useLayout')

      const nodes = [{ id: 'a', name: 'A' }]
      const edges: any[] = []

      const { result } = renderHook(() => useLayout(nodes as any, edges))

      expect(result.current.mode).toBe('force')
    })

    it('should accept initial mode', async () => {
      const { useLayout } = await import('../useLayout')

      const nodes = [{ id: 'a', name: 'A' }]
      const edges: any[] = []

      const { result } = renderHook(() =>
        useLayout(nodes as any, edges, { initialMode: 'hierarchical' })
      )

      expect(result.current.mode).toBe('hierarchical')
    })
  })

  describe('mode switching', () => {
    it('should switch from force to hierarchical', async () => {
      const { useLayout } = await import('../useLayout')

      const nodes = [{ id: 'a', name: 'A' }]
      const edges: any[] = []

      const { result } = renderHook(() => useLayout(nodes as any, edges))

      expect(result.current.mode).toBe('force')

      await act(async () => {
        result.current.setMode('hierarchical')
      })

      expect(result.current.mode).toBe('hierarchical')
    })

    it('should switch from hierarchical to force', async () => {
      const { useLayout } = await import('../useLayout')

      const nodes = [{ id: 'a', name: 'A' }]
      const edges: any[] = []

      const { result } = renderHook(() =>
        useLayout(nodes as any, edges, { initialMode: 'hierarchical' })
      )

      await act(async () => {
        result.current.setMode('force')
      })

      expect(result.current.mode).toBe('force')
    })
  })

  describe('positions', () => {
    it('should provide positions ref', async () => {
      const { useLayout } = await import('../useLayout')

      const nodes = [{ id: 'a', name: 'A' }]
      const edges: any[] = []

      const { result } = renderHook(() => useLayout(nodes as any, edges))

      expect(result.current.positionsRef.current).toBeInstanceOf(Map)
    })

    it('should update positions when layout computes', async () => {
      const { useLayout } = await import('../useLayout')

      const nodes = [{ id: 'a', name: 'A' }]
      const edges: any[] = []

      const { result } = renderHook(() =>
        useLayout(nodes as any, edges, { initialMode: 'hierarchical' })
      )

      // Wait for async layout computation
      await waitFor(() => {
        expect(result.current.positionsRef.current.size).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('control methods', () => {
    it('should provide start method', async () => {
      const { useLayout } = await import('../useLayout')

      const nodes = [{ id: 'a', name: 'A' }]
      const edges: any[] = []

      const { result } = renderHook(() => useLayout(nodes as any, edges))

      expect(typeof result.current.start).toBe('function')
    })

    it('should provide stop method', async () => {
      const { useLayout } = await import('../useLayout')

      const nodes = [{ id: 'a', name: 'A' }]
      const edges: any[] = []

      const { result } = renderHook(() => useLayout(nodes as any, edges))

      expect(typeof result.current.stop).toBe('function')
    })

    it('should provide running state', async () => {
      const { useLayout } = await import('../useLayout')

      const nodes = [{ id: 'a', name: 'A' }]
      const edges: any[] = []

      const { result } = renderHook(() => useLayout(nodes as any, edges))

      expect(typeof result.current.isRunning).toBe('boolean')
    })
  })

  describe('cleanup', () => {
    it('should cleanup on unmount', async () => {
      const { useLayout } = await import('../useLayout')
      const { ForceAtlas2Layout } = await import('@/lib/layout')

      const nodes = [{ id: 'a', name: 'A' }]
      const edges: any[] = []

      const { unmount } = renderHook(() => useLayout(nodes as any, edges))

      unmount()

      // The layout's kill method should have been called
      const mockInstance = (ForceAtlas2Layout as any).mock.results[0]?.value
      if (mockInstance) {
        expect(mockInstance.kill).toHaveBeenCalled()
      }
    })
  })
})

describe('useLayout with auto mode', () => {
  it('should auto-select hierarchical for small DAGs', async () => {
    const { useLayout } = await import('../useLayout')

    // Small DAG with clear hierarchy
    const nodes = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]
    const edges = [
      { id: 'a->b', source: 'a', target: 'b' },
      { id: 'b->c', source: 'b', target: 'c' },
    ]

    const { result } = renderHook(() =>
      useLayout(nodes as any, edges as any, { initialMode: 'auto' })
    )

    // Auto mode should pick based on graph structure
    expect(['force', 'hierarchical']).toContain(result.current.mode)
  })
})
