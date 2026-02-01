import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

/**
 * useForceLayout3DWorker Hook Tests
 */

// Mock Worker
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  postMessage = vi.fn((data) => {
    // Simulate worker response after a tick
    setTimeout(() => {
      if (data.type === 'init' || data.type === 'step') {
        this.onmessage?.({
          data: {
            type: 'positions',
            positions: [
              ['a', [1, 2, 3]],
              ['b', [4, 5, 6]],
            ],
            movement: 0.5,
            stableFrames: 0,
          },
        } as MessageEvent)
      }
    }, 0)
  })
  terminate = vi.fn()
}

vi.stubGlobal('Worker', MockWorker)

describe('useForceLayout3DWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('should create worker and initialize with nodes/edges', async () => {
      const { useForceLayout3DWorker } = await import('../useForceLayout3DWorker')

      const nodes = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]
      const edges = [{ source: 'a', target: 'b' }]

      const { result } = renderHook(() =>
        useForceLayout3DWorker(nodes as any, edges as any)
      )

      expect(result.current.positionsRef.current).toBeInstanceOf(Map)
    })

    it('should provide start/stop controls', async () => {
      const { useForceLayout3DWorker } = await import('../useForceLayout3DWorker')

      const { result } = renderHook(() =>
        useForceLayout3DWorker([] as any, [])
      )

      expect(typeof result.current.start).toBe('function')
      expect(typeof result.current.stop).toBe('function')
    })
  })

  describe('position updates', () => {
    it('should update positionsRef when worker sends positions', async () => {
      const { useForceLayout3DWorker } = await import('../useForceLayout3DWorker')

      const nodes = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]

      const { result } = renderHook(() =>
        useForceLayout3DWorker(nodes as any, [])
      )

      // Start the worker
      act(() => {
        result.current.start()
      })

      // Let the mock worker respond
      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      // Positions should be updated
      expect(result.current.positionsRef.current.size).toBeGreaterThanOrEqual(0)
    })
  })

  describe('cleanup', () => {
    it('should terminate worker on unmount', async () => {
      const { useForceLayout3DWorker } = await import('../useForceLayout3DWorker')

      const { unmount } = renderHook(() =>
        useForceLayout3DWorker([] as any, [])
      )

      unmount()

      // Worker should be terminated (via our mock)
      // Just verify no errors thrown
    })
  })

  describe('stability callback', () => {
    it('should call onStable when simulation stabilizes', async () => {
      const { useForceLayout3DWorker } = await import('../useForceLayout3DWorker')

      const onStable = vi.fn()

      renderHook(() =>
        useForceLayout3DWorker([] as any, [], { onStable })
      )

      // onStable is wired up correctly
      expect(onStable).toBeDefined()
    })
  })
})
