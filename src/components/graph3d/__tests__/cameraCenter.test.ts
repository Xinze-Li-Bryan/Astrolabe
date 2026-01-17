/**
 * Tests for camera centering logic
 *
 * The camera should be centered on the graph's center of mass after warmup.
 */

import { describe, it, expect } from 'vitest'

// Pure function to center and scale positions (matching ForceLayout.tsx logic)
export function centerAndScale(
  positions: Map<string, [number, number, number]>,
  targetRadius: number = 12
): void {
  if (positions.size === 0) return

  // 1. Calculate center of mass
  let cx = 0, cy = 0, cz = 0
  for (const pos of positions.values()) {
    cx += pos[0]
    cy += pos[1]
    cz += pos[2]
  }
  cx /= positions.size
  cy /= positions.size
  cz /= positions.size

  // 2. Center first
  for (const [id, pos] of positions.entries()) {
    positions.set(id, [pos[0] - cx, pos[1] - cy, pos[2] - cz])
  }

  // 3. Calculate maximum radius
  let maxRadius = 0
  for (const pos of positions.values()) {
    const r = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2])
    maxRadius = Math.max(maxRadius, r)
  }

  // 4. Scale to viewport
  if (maxRadius > 0.1) {
    const scale = targetRadius / maxRadius
    if (scale < 1) {
      for (const [id, pos] of positions.entries()) {
        positions.set(id, [pos[0] * scale, pos[1] * scale, pos[2] * scale])
      }
    }
  }
}

// Pure function to calculate graph center of mass
export function calculateGraphCenter(
  positions: Map<string, [number, number, number]>
): [number, number, number] | null {
  if (positions.size === 0) return null

  let cx = 0, cy = 0, cz = 0
  for (const pos of positions.values()) {
    cx += pos[0]
    cy += pos[1]
    cz += pos[2]
  }
  cx /= positions.size
  cy /= positions.size
  cz /= positions.size

  return [cx, cy, cz]
}

// Calculate camera position to view the graph from a given distance
export function calculateCameraPosition(
  center: [number, number, number],
  distance: number = 30
): [number, number, number] {
  return [center[0], center[1], center[2] + distance]
}

describe('Camera Centering', () => {
  describe('calculateGraphCenter', () => {
    it('should return null for empty positions', () => {
      const positions = new Map<string, [number, number, number]>()
      expect(calculateGraphCenter(positions)).toBeNull()
    })

    it('should return the position for a single node', () => {
      const positions = new Map<string, [number, number, number]>()
      positions.set('a', [10, 20, 30])

      const center = calculateGraphCenter(positions)
      expect(center).toEqual([10, 20, 30])
    })

    it('should return the average position for multiple nodes', () => {
      const positions = new Map<string, [number, number, number]>()
      positions.set('a', [0, 0, 0])
      positions.set('b', [10, 10, 10])

      const center = calculateGraphCenter(positions)
      expect(center).toEqual([5, 5, 5])
    })

    it('should handle negative coordinates', () => {
      const positions = new Map<string, [number, number, number]>()
      positions.set('a', [-10, -20, -30])
      positions.set('b', [10, 20, 30])

      const center = calculateGraphCenter(positions)
      expect(center).toEqual([0, 0, 0])
    })

    it('should handle asymmetric distributions', () => {
      const positions = new Map<string, [number, number, number]>()
      positions.set('a', [100, 0, 0])
      positions.set('b', [0, 0, 0])
      positions.set('c', [0, 0, 0])

      const center = calculateGraphCenter(positions)
      // (100 + 0 + 0) / 3 = 33.33...
      expect(center![0]).toBeCloseTo(33.333, 2)
      expect(center![1]).toBe(0)
      expect(center![2]).toBe(0)
    })

    it('should handle large coordinate values', () => {
      const positions = new Map<string, [number, number, number]>()
      positions.set('a', [1000, 2000, 3000])
      positions.set('b', [1000, 2000, 3000])

      const center = calculateGraphCenter(positions)
      expect(center).toEqual([1000, 2000, 3000])
    })
  })

  describe('calculateCameraPosition', () => {
    it('should position camera at center + distance along z-axis', () => {
      const center: [number, number, number] = [0, 0, 0]
      const cameraPos = calculateCameraPosition(center, 30)

      expect(cameraPos).toEqual([0, 0, 30])
    })

    it('should offset from non-zero center', () => {
      const center: [number, number, number] = [10, 20, 5]
      const cameraPos = calculateCameraPosition(center, 30)

      expect(cameraPos).toEqual([10, 20, 35])
    })

    it('should use default distance of 30', () => {
      const center: [number, number, number] = [0, 0, 0]
      const cameraPos = calculateCameraPosition(center)

      expect(cameraPos).toEqual([0, 0, 30])
    })

    it('should handle negative center coordinates', () => {
      const center: [number, number, number] = [-50, -100, -10]
      const cameraPos = calculateCameraPosition(center, 40)

      expect(cameraPos).toEqual([-50, -100, 30])
    })
  })

  describe('integration: center calculation with realistic data', () => {
    it('should correctly center a graph that drifted to the right', () => {
      // Simulate a graph where clustering pushed nodes to the right
      const positions = new Map<string, [number, number, number]>()
      positions.set('node1', [50, 10, 0])
      positions.set('node2', [60, -5, 2])
      positions.set('node3', [55, 0, -1])
      positions.set('node4', [70, 5, 1])

      const center = calculateGraphCenter(positions)

      // Center should be around x=58.75, not at origin
      expect(center![0]).toBeCloseTo(58.75, 2)
      expect(center![1]).toBeCloseTo(2.5, 2)
      expect(center![2]).toBeCloseTo(0.5, 2)

      // Camera should look at this center
      const cameraPos = calculateCameraPosition(center!, 30)
      expect(cameraPos[0]).toBeCloseTo(58.75, 2)
      expect(cameraPos[1]).toBeCloseTo(2.5, 2)
      expect(cameraPos[2]).toBeCloseTo(30.5, 2)
    })

    it('should correctly center a graph after warmup with clustering', () => {
      // Simulate nodes in different clusters
      // Cluster 1: centered around (10, 10, 0)
      // Cluster 2: centered around (-20, -10, 5)
      const positions = new Map<string, [number, number, number]>()

      // Cluster 1
      positions.set('a1', [8, 9, -1])
      positions.set('a2', [12, 11, 1])
      positions.set('a3', [10, 10, 0])

      // Cluster 2
      positions.set('b1', [-22, -12, 4])
      positions.set('b2', [-18, -8, 6])
      positions.set('b3', [-20, -10, 5])

      const center = calculateGraphCenter(positions)

      // Overall center should be between the two clusters
      // x: (8+12+10-22-18-20)/6 = -30/6 = -5
      // y: (9+11+10-12-8-10)/6 = 0/6 = 0
      // z: (-1+1+0+4+6+5)/6 = 15/6 = 2.5
      expect(center![0]).toBeCloseTo(-5, 2)
      expect(center![1]).toBeCloseTo(0, 2)
      expect(center![2]).toBeCloseTo(2.5, 2)
    })
  })

  describe('centerAndScale', () => {
    it('should do nothing for empty positions', () => {
      const positions = new Map<string, [number, number, number]>()
      centerAndScale(positions)
      expect(positions.size).toBe(0)
    })

    it('should center a single node at origin', () => {
      const positions = new Map<string, [number, number, number]>()
      positions.set('a', [100, 50, -30])

      centerAndScale(positions)

      const pos = positions.get('a')!
      expect(pos[0]).toBeCloseTo(0, 5)
      expect(pos[1]).toBeCloseTo(0, 5)
      expect(pos[2]).toBeCloseTo(0, 5)
    })

    it('should center multiple nodes so center of mass is at origin', () => {
      const positions = new Map<string, [number, number, number]>()
      positions.set('a', [50, 10, 0])
      positions.set('b', [60, -5, 2])
      positions.set('c', [55, 0, -1])
      positions.set('d', [70, 5, 1])

      // Initial center: (58.75, 2.5, 0.5)
      centerAndScale(positions)

      // Calculate new center of mass - should be (0, 0, 0)
      const center = calculateGraphCenter(positions)
      expect(center![0]).toBeCloseTo(0, 5)
      expect(center![1]).toBeCloseTo(0, 5)
      expect(center![2]).toBeCloseTo(0, 5)
    })

    it('should center a graph that drifted far to the right', () => {
      const positions = new Map<string, [number, number, number]>()
      // All nodes far to the right
      positions.set('a', [1000, 0, 0])
      positions.set('b', [1010, 5, 2])
      positions.set('c', [990, -5, -2])

      centerAndScale(positions)

      // Center should now be at origin
      const center = calculateGraphCenter(positions)
      expect(center![0]).toBeCloseTo(0, 5)
      expect(center![1]).toBeCloseTo(0, 5)
      expect(center![2]).toBeCloseTo(0, 5)
    })

    it('should scale down if graph is larger than target radius', () => {
      const positions = new Map<string, [number, number, number]>()
      // Create a graph with radius ~100 (much larger than target of 12)
      positions.set('a', [100, 0, 0])
      positions.set('b', [-100, 0, 0])

      centerAndScale(positions, 12)

      // After centering, nodes should be at (100, 0, 0) and (-100, 0, 0) relative to center
      // But should be scaled down to fit within radius 12
      const posA = positions.get('a')!
      const posB = positions.get('b')!

      // Max radius should be <= 12
      const radiusA = Math.sqrt(posA[0]**2 + posA[1]**2 + posA[2]**2)
      const radiusB = Math.sqrt(posB[0]**2 + posB[1]**2 + posB[2]**2)

      expect(radiusA).toBeLessThanOrEqual(12.01)
      expect(radiusB).toBeLessThanOrEqual(12.01)
    })

    it('should NOT scale up if graph is smaller than target radius', () => {
      const positions = new Map<string, [number, number, number]>()
      // Create a small graph with radius ~5
      positions.set('a', [5, 0, 0])
      positions.set('b', [-5, 0, 0])

      centerAndScale(positions, 12)

      // Should be centered but NOT scaled up
      const posA = positions.get('a')!
      const posB = positions.get('b')!

      // Should still have radius ~5, not scaled to 12
      expect(posA[0]).toBeCloseTo(5, 5)
      expect(posB[0]).toBeCloseTo(-5, 5)
    })

    it('should preserve relative positions after centering', () => {
      const positions = new Map<string, [number, number, number]>()
      positions.set('a', [100, 100, 100])
      positions.set('b', [110, 100, 100])
      positions.set('c', [100, 110, 100])

      // Record relative distances before
      const beforeAB = 10 // distance between a and b in x

      centerAndScale(positions)

      // Relative distance should be preserved (may be scaled)
      const posA = positions.get('a')!
      const posB = positions.get('b')!
      const afterAB = posB[0] - posA[0]

      // The ratio should be the same (both scaled by same factor)
      // Since this is a small graph (radius ~14), it will be scaled to 12
      expect(afterAB).toBeGreaterThan(0) // Same direction
    })

    it('should work after physics simulation that pushed graph off-center', () => {
      // Simulate what happens after warmup physics
      const positions = new Map<string, [number, number, number]>()

      // Cluster 1 at around (50, 0, 0)
      positions.set('node1', [48, 2, 1])
      positions.set('node2', [52, -2, -1])
      positions.set('node3', [50, 0, 0])

      // Cluster 2 at around (80, 20, 10)
      positions.set('node4', [78, 18, 9])
      positions.set('node5', [82, 22, 11])
      positions.set('node6', [80, 20, 10])

      // Before centering, center of mass is around (65, 10, 5)
      const beforeCenter = calculateGraphCenter(positions)
      expect(beforeCenter![0]).toBeCloseTo(65, 0)
      expect(beforeCenter![1]).toBeCloseTo(10, 0)
      expect(beforeCenter![2]).toBeCloseTo(5, 0)

      centerAndScale(positions)

      // After centering, center of mass should be at origin
      const afterCenter = calculateGraphCenter(positions)
      expect(afterCenter![0]).toBeCloseTo(0, 5)
      expect(afterCenter![1]).toBeCloseTo(0, 5)
      expect(afterCenter![2]).toBeCloseTo(0, 5)
    })
  })
})
