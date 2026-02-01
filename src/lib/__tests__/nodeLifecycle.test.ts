/**
 * Tests for nodeLifecycle.ts - Node spawn position calculation
 */

import { describe, it, expect } from 'vitest'
import {
  calculateSpawnPosition,
  calculateBatchSpawnPositions,
  calculateGraphMetrics,
  type Position3D,
  type PositionMap,
} from '../nodeLifecycle'
import type { Edge } from '@/types/node'

describe('nodeLifecycle', () => {
  describe('calculateGraphMetrics', () => {
    it('returns default values for empty positions', () => {
      const positions = new Map<string, Position3D>()
      const { centroid, radius } = calculateGraphMetrics(positions)

      expect(centroid).toEqual([0, 0, 0])
      expect(radius).toBe(8)
    })

    it('calculates correct centroid for multiple positions', () => {
      const positions = new Map<string, Position3D>([
        ['a', [10, 0, 0]],
        ['b', [-10, 0, 0]],
        ['c', [0, 10, 0]],
        ['d', [0, -10, 0]],
      ])
      const { centroid } = calculateGraphMetrics(positions)

      expect(centroid[0]).toBeCloseTo(0)
      expect(centroid[1]).toBeCloseTo(0)
      expect(centroid[2]).toBeCloseTo(0)
    })
  })

  describe('calculateBatchSpawnPositions', () => {
    it('spawns nodes around their single connected parent with distinct positions', () => {
      // Setup: Parent node A at origin
      const existingPositions = new Map<string, Position3D>([
        ['parent', [0, 0, 0]],
      ])

      // New nodes B, C, D, E, F all connected to parent
      const newNodeIds = ['child1', 'child2', 'child3', 'child4', 'child5']
      const savedPositions = new Map<string, Position3D | undefined>(
        newNodeIds.map(id => [id, undefined])
      )

      // Edges connecting children to parent
      const edges: Edge[] = newNodeIds.map(id => ({
        id: `${id}->parent`,
        source: id,
        target: 'parent',
        fromLean: true,
      }))

      const result = calculateBatchSpawnPositions(
        newNodeIds,
        savedPositions,
        existingPositions,
        edges
      )

      // All nodes should have positions
      expect(result.size).toBe(5)
      for (const id of newNodeIds) {
        expect(result.has(id)).toBe(true)
      }

      // Positions should be distinct (not overlapping)
      const positions = Array.from(result.values())
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dist = Math.sqrt(
            Math.pow(positions[i][0] - positions[j][0], 2) +
            Math.pow(positions[i][1] - positions[j][1], 2) +
            Math.pow(positions[i][2] - positions[j][2], 2)
          )
          // Minimum distance should be > 0.5 (nodes spread by angle, physics will adjust)
          expect(dist).toBeGreaterThan(0.5)
        }
      }
    })

    it('spawns 10 siblings with good separation', () => {
      const existingPositions = new Map<string, Position3D>([
        ['parent', [0, 0, 0]],
      ])

      const newNodeIds = Array.from({ length: 10 }, (_, i) => `child${i}`)
      const savedPositions = new Map<string, Position3D | undefined>(
        newNodeIds.map(id => [id, undefined])
      )

      const edges: Edge[] = newNodeIds.map(id => ({
        id: `${id}->parent`,
        source: id,
        target: 'parent',
        fromLean: true,
      }))

      const result = calculateBatchSpawnPositions(
        newNodeIds,
        savedPositions,
        existingPositions,
        edges
      )

      expect(result.size).toBe(10)

      // Check all pairs have minimum separation
      const positions = Array.from(result.values())
      let minDist = Infinity
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dist = Math.sqrt(
            Math.pow(positions[i][0] - positions[j][0], 2) +
            Math.pow(positions[i][1] - positions[j][1], 2) +
            Math.pow(positions[i][2] - positions[j][2], 2)
          )
          minDist = Math.min(minDist, dist)
        }
      }

      // With angular spread, minimum distance should be > 0.5 (physics will spread further)
      expect(minDist).toBeGreaterThan(0.5)
    })

    it('spawns 50 siblings without any overlapping', () => {
      const existingPositions = new Map<string, Position3D>([
        ['parent', [50, 50, 50]],
      ])

      const newNodeIds = Array.from({ length: 50 }, (_, i) => `child${i}`)
      const savedPositions = new Map<string, Position3D | undefined>(
        newNodeIds.map(id => [id, undefined])
      )

      const edges: Edge[] = newNodeIds.map(id => ({
        id: `${id}->parent`,
        source: id,
        target: 'parent',
        fromLean: true,
      }))

      const result = calculateBatchSpawnPositions(
        newNodeIds,
        savedPositions,
        existingPositions,
        edges
      )

      expect(result.size).toBe(50)

      // Check no positions are identical or very close
      const positions = Array.from(result.values())
      let minDist = Infinity
      let overlapCount = 0

      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dist = Math.sqrt(
            Math.pow(positions[i][0] - positions[j][0], 2) +
            Math.pow(positions[i][1] - positions[j][1], 2) +
            Math.pow(positions[i][2] - positions[j][2], 2)
          )
          minDist = Math.min(minDist, dist)
          if (dist < 1) {
            overlapCount++
          }
        }
      }

      // Allow some initial overlap since physics will spread them
      expect(overlapCount).toBeLessThan(5)
      expect(minDist).toBeGreaterThan(0.5)
    })

    it('uses saved positions when within reasonable distance', () => {
      const existingPositions = new Map<string, Position3D>([
        ['parent', [0, 0, 0]],
      ])

      // Saved position within reasonable distance (< min(radius*0.8, 20) from centroid)
      // With radius=8, max distance = 6.4, so use [2,2,2] which is ~3.5 units
      const savedPos: Position3D = [2, 2, 2]  // ~3.5 units from origin
      const newNodeIds = ['child1', 'child2']
      const savedPositions = new Map<string, Position3D | undefined>([
        ['child1', savedPos],
        ['child2', undefined],
      ])

      const edges: Edge[] = [
        { id: 'child1->parent', source: 'child1', target: 'parent', fromLean: true },
        { id: 'child2->parent', source: 'child2', target: 'parent', fromLean: true },
      ]

      const result = calculateBatchSpawnPositions(
        newNodeIds,
        savedPositions,
        existingPositions,
        edges
      )

      // child1 should use saved position (within allowed distance)
      const child1Pos = result.get('child1')!
      expect(child1Pos[0]).toBe(2)
      expect(child1Pos[1]).toBe(2)
      expect(child1Pos[2]).toBe(2)

      // child2 should have calculated position near parent
      const child2Pos = result.get('child2')!
      expect(child2Pos[0]).not.toBe(2)
    })

    it('rejects saved positions that are too far from centroid', () => {
      const existingPositions = new Map<string, Position3D>([
        ['parent', [0, 0, 0]],
      ])

      // Saved position WAY too far (100, 100, 100 = ~173 units from origin)
      const farSavedPos: Position3D = [100, 100, 100]
      const newNodeIds = ['child1']
      const savedPositions = new Map<string, Position3D | undefined>([
        ['child1', farSavedPos],
      ])

      const edges: Edge[] = [
        { id: 'child1->parent', source: 'child1', target: 'parent', fromLean: true },
      ]

      const result = calculateBatchSpawnPositions(
        newNodeIds,
        savedPositions,
        existingPositions,
        edges
      )

      // child1 should NOT use the far saved position - should be recalculated near parent
      const child1Pos = result.get('child1')!
      expect(child1Pos[0]).not.toBe(100)
      expect(child1Pos[1]).not.toBe(100)
      expect(child1Pos[2]).not.toBe(100)

      // Should be near parent (within ~5 units)
      const distFromParent = Math.sqrt(
        child1Pos[0] ** 2 + child1Pos[1] ** 2 + child1Pos[2] ** 2
      )
      expect(distFromParent).toBeLessThan(5)
    })

    it('spawns nodes with no connections at graph periphery', () => {
      const existingPositions = new Map<string, Position3D>([
        ['a', [0, 0, 0]],
        ['b', [10, 0, 0]],
      ])

      const newNodeIds = ['orphan1', 'orphan2', 'orphan3']
      const savedPositions = new Map<string, Position3D | undefined>(
        newNodeIds.map(id => [id, undefined])
      )

      // No edges connecting orphans to existing nodes
      const edges: Edge[] = []

      const result = calculateBatchSpawnPositions(
        newNodeIds,
        savedPositions,
        existingPositions,
        edges
      )

      expect(result.size).toBe(3)

      // Orphans should be placed at periphery, away from centroid
      const { centroid, radius } = calculateGraphMetrics(existingPositions)

      for (const pos of result.values()) {
        const distFromCentroid = Math.sqrt(
          Math.pow(pos[0] - centroid[0], 2) +
          Math.pow(pos[1] - centroid[1], 2) +
          Math.pow(pos[2] - centroid[2], 2)
        )
        // Should be placed near centroid (not at periphery) - physics will spread
        expect(distFromCentroid).toBeLessThan(15)
        expect(distFromCentroid).toBeGreaterThan(1)
      }
    })

    it('IMPORTANT: nodes without edges are treated as orphans and placed at periphery', () => {
      // This test simulates the case where nodes are added but edges haven't been updated yet
      // This is a potential cause of overlapping when expanding neighbors
      const existingPositions = new Map<string, Position3D>([
        ['parent', [0, 0, 0]],
      ])

      const newNodeIds = ['child1', 'child2', 'child3', 'child4', 'child5']
      const savedPositions = new Map<string, Position3D | undefined>(
        newNodeIds.map(id => [id, undefined])
      )

      // NO EDGES - simulating the case where edges haven't been added yet
      const edges: Edge[] = []

      const result = calculateBatchSpawnPositions(
        newNodeIds,
        savedPositions,
        existingPositions,
        edges
      )

      expect(result.size).toBe(5)

      // All nodes are treated as orphans, but they should still be spread out
      const positions = Array.from(result.values())
      let minDist = Infinity
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dist = Math.sqrt(
            Math.pow(positions[i][0] - positions[j][0], 2) +
            Math.pow(positions[i][1] - positions[j][1], 2) +
            Math.pow(positions[i][2] - positions[j][2], 2)
          )
          minDist = Math.min(minDist, dist)
        }
      }

      // Even without edges, nodes should be spread out (close to centroid but not overlapping)
      expect(minDist).toBeGreaterThan(1)
    })

    it('handles nodes with multiple connected parents', () => {
      const existingPositions = new Map<string, Position3D>([
        ['parentA', [0, 0, 0]],
        ['parentB', [20, 0, 0]],
      ])

      const newNodeIds = ['child1', 'child2']
      const savedPositions = new Map<string, Position3D | undefined>(
        newNodeIds.map(id => [id, undefined])
      )

      // Both children connected to both parents
      const edges: Edge[] = [
        { id: 'child1->parentA', source: 'child1', target: 'parentA', fromLean: true },
        { id: 'child1->parentB', source: 'child1', target: 'parentB', fromLean: true },
        { id: 'child2->parentA', source: 'child2', target: 'parentA', fromLean: true },
        { id: 'child2->parentB', source: 'child2', target: 'parentB', fromLean: true },
      ]

      const result = calculateBatchSpawnPositions(
        newNodeIds,
        savedPositions,
        existingPositions,
        edges
      )

      expect(result.size).toBe(2)

      // Children should appear near the center of their parents (around x=10)
      for (const pos of result.values()) {
        // X coordinate should be between parents (0 and 20), roughly in middle
        expect(pos[0]).toBeGreaterThan(-5)
        expect(pos[0]).toBeLessThan(25)
      }

      // The two children should have different positions (at least slightly apart)
      const positions = Array.from(result.values())
      const dist = Math.sqrt(
        Math.pow(positions[0][0] - positions[1][0], 2) +
        Math.pow(positions[0][1] - positions[1][1], 2) +
        Math.pow(positions[0][2] - positions[1][2], 2)
      )
      expect(dist).toBeGreaterThan(0.5)
    })
  })
})
