import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Canvas Store 3D Position Tests
 *
 * Test scenarios:
 * 1. Position type should be 3D {x, y, z}
 * 2. Load 3D positions from API
 * 3. Save 3D positions to API
 */

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('canvasStore', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('positions type', () => {
    it('should define Position3D type with x, y, z fields', async () => {
      // This test verifies type definition
      // Actual type checking is done by TypeScript compiler
      // Here we verify structure by creating objects

      type Position3D = { x: number; y: number; z: number }

      const position: Position3D = { x: 10, y: 20, z: 30 }

      expect(position.x).toBe(10)
      expect(position.y).toBe(20)
      expect(position.z).toBe(30)
    })

    it('should store positions as 3D objects in canvasStore', async () => {
      // Import store and verify positions structure
      const { useCanvasStore } = await import('../canvasStore')

      // Set mock API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          visible_nodes: ['node_1'],
          positions: {
            node_1: { x: 1.0, y: 2.0, z: 3.0 },
          },
        }),
      })
      // Mock for user-nodes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nodes: [] }),
      })
      // Mock for user-edges
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ edges: [] }),
      })

      const store = useCanvasStore.getState()
      store.setProjectPath('/test/project')
      await store.loadCanvas()

      const positions = useCanvasStore.getState().positions

      // Position should contain z coordinate
      expect(positions['node_1']).toHaveProperty('z')
      expect(positions['node_1'].z).toBe(3.0)
    })
  })

  describe('loadCanvas', () => {
    it('should load 3D positions from API', async () => {
      const { useCanvasStore } = await import('../canvasStore')

      // Mock API response with 3D positions
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          visible_nodes: ['node_1', 'node_2'],
          positions: {
            node_1: { x: 10.0, y: 20.0, z: 30.0 },
            node_2: { x: 40.0, y: 50.0, z: 60.0 },
          },
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nodes: [] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ edges: [] }),
      })

      const store = useCanvasStore.getState()
      store.setProjectPath('/test/project')
      await store.loadCanvas()

      const state = useCanvasStore.getState()

      expect(state.positions['node_1']).toEqual({ x: 10.0, y: 20.0, z: 30.0 })
      expect(state.positions['node_2']).toEqual({ x: 40.0, y: 50.0, z: 60.0 })
    })
  })

  describe('updatePositions', () => {
    it('should save 3D positions to API', async () => {
      const { useCanvasStore } = await import('../canvasStore')

      // Mock API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', updated: 1 }),
      })

      const store = useCanvasStore.getState()
      store.setProjectPath('/test/project')

      // Update 3D positions
      await store.updatePositions({
        node_1: { x: 100.0, y: 200.0, z: 300.0 },
      })

      // Verify API call includes z coordinate
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8765/api/canvas/positions',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"z":300'),
        })
      )
    })

    it('should update local state with 3D positions', async () => {
      const { useCanvasStore } = await import('../canvasStore')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      })

      const store = useCanvasStore.getState()
      store.setProjectPath('/test/project')

      await store.updatePositions({
        node_1: { x: 10.0, y: 20.0, z: 30.0 },
      })

      const state = useCanvasStore.getState()
      expect(state.positions['node_1']).toEqual({ x: 10.0, y: 20.0, z: 30.0 })
    })
  })

  describe('updatePosition (single node)', () => {
    it('should accept z coordinate parameter', async () => {
      const { useCanvasStore } = await import('../canvasStore')

      const store = useCanvasStore.getState()

      // updatePosition should accept 3 coordinate parameters
      // Current signature: updatePosition(nodeId, x, y)
      // Expected signature: updatePosition(nodeId, x, y, z)
      store.updatePosition('node_1', 10.0, 20.0, 30.0)

      const state = useCanvasStore.getState()
      expect(state.positions['node_1']).toEqual({ x: 10.0, y: 20.0, z: 30.0 })
    })
  })
})
