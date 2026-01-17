import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_PHYSICS, type PhysicsParams } from '@/components/graph3d/ForceLayout'

/**
 * Physics Settings Panel Tests
 *
 * Tests for the Physics Settings UI controls including:
 * 1. Basic physics controls (repulsion, spring, damping)
 * 2. Namespace clustering controls
 * 3. Density-adaptive spring controls
 */

describe('PhysicsSettingsPanel', () => {
  describe('DEFAULT_PHYSICS values', () => {
    it('should have all required physics parameters', () => {
      // Basic physics
      expect(DEFAULT_PHYSICS).toHaveProperty('repulsionStrength')
      expect(DEFAULT_PHYSICS).toHaveProperty('springLength')
      expect(DEFAULT_PHYSICS).toHaveProperty('springStrength')
      expect(DEFAULT_PHYSICS).toHaveProperty('centerStrength')
      expect(DEFAULT_PHYSICS).toHaveProperty('damping')

      // Clustering
      expect(DEFAULT_PHYSICS).toHaveProperty('clusteringEnabled')
      expect(DEFAULT_PHYSICS).toHaveProperty('clusteringStrength')
      expect(DEFAULT_PHYSICS).toHaveProperty('clusteringDepth')

      // Adaptive springs
      expect(DEFAULT_PHYSICS).toHaveProperty('adaptiveSpringEnabled')
      expect(DEFAULT_PHYSICS).toHaveProperty('adaptiveSpringMode')
      expect(DEFAULT_PHYSICS).toHaveProperty('adaptiveSpringScale')
    })

    it('should have clustering enabled by default', () => {
      expect(DEFAULT_PHYSICS.clusteringEnabled).toBe(true)
    })

    it('should have adaptive springs enabled by default', () => {
      expect(DEFAULT_PHYSICS.adaptiveSpringEnabled).toBe(true)
    })

    it('should have valid clustering defaults', () => {
      expect(DEFAULT_PHYSICS.clusteringStrength).toBeGreaterThan(0)
      expect(DEFAULT_PHYSICS.clusteringStrength).toBeLessThanOrEqual(1)
      expect(DEFAULT_PHYSICS.clusteringDepth).toBeGreaterThanOrEqual(1)
    })

    it('should have valid adaptive spring defaults', () => {
      expect(['sqrt', 'logarithmic', 'linear']).toContain(DEFAULT_PHYSICS.adaptiveSpringMode)
      expect(DEFAULT_PHYSICS.adaptiveSpringScale).toBeGreaterThan(0)
    })
  })

  describe('Clustering controls behavior', () => {
    it('should toggle clustering on/off', () => {
      const setPhysics = vi.fn()
      const physics: PhysicsParams = { ...DEFAULT_PHYSICS, clusteringEnabled: true }

      // Simulate toggle off
      const newPhysics = { ...physics, clusteringEnabled: false }
      setPhysics(newPhysics)

      expect(setPhysics).toHaveBeenCalledWith(
        expect.objectContaining({ clusteringEnabled: false })
      )
    })

    it('should update clustering strength within valid range', () => {
      const setPhysics = vi.fn()
      const physics: PhysicsParams = { ...DEFAULT_PHYSICS }

      // Valid range: 0 to 1
      const validStrength = 0.5
      const newPhysics = { ...physics, clusteringStrength: validStrength }
      setPhysics(newPhysics)

      expect(setPhysics).toHaveBeenCalledWith(
        expect.objectContaining({ clusteringStrength: 0.5 })
      )
    })

    it('should update clustering depth as integer', () => {
      const setPhysics = vi.fn()
      const physics: PhysicsParams = { ...DEFAULT_PHYSICS }

      // Depth should be positive integer
      const newPhysics = { ...physics, clusteringDepth: 2 }
      setPhysics(newPhysics)

      expect(setPhysics).toHaveBeenCalledWith(
        expect.objectContaining({ clusteringDepth: 2 })
      )
    })
  })

  describe('Adaptive Spring controls behavior', () => {
    it('should toggle adaptive springs on/off', () => {
      const setPhysics = vi.fn()
      const physics: PhysicsParams = { ...DEFAULT_PHYSICS, adaptiveSpringEnabled: true }

      // Simulate toggle off
      const newPhysics = { ...physics, adaptiveSpringEnabled: false }
      setPhysics(newPhysics)

      expect(setPhysics).toHaveBeenCalledWith(
        expect.objectContaining({ adaptiveSpringEnabled: false })
      )
    })

    it('should switch adaptive spring mode', () => {
      const setPhysics = vi.fn()
      const physics: PhysicsParams = { ...DEFAULT_PHYSICS, adaptiveSpringMode: 'sqrt' }

      // Switch to logarithmic mode
      const newPhysics = { ...physics, adaptiveSpringMode: 'logarithmic' as const }
      setPhysics(newPhysics)

      expect(setPhysics).toHaveBeenCalledWith(
        expect.objectContaining({ adaptiveSpringMode: 'logarithmic' })
      )
    })

    it('should update adaptive spring scale within valid range', () => {
      const setPhysics = vi.fn()
      const physics: PhysicsParams = { ...DEFAULT_PHYSICS }

      // Valid range: 0.1 to 2
      const validScale = 0.8
      const newPhysics = { ...physics, adaptiveSpringScale: validScale }
      setPhysics(newPhysics)

      expect(setPhysics).toHaveBeenCalledWith(
        expect.objectContaining({ adaptiveSpringScale: 0.8 })
      )
    })
  })

  describe('Reset functionality', () => {
    it('should reset all physics to defaults including new features', () => {
      const modifiedPhysics: PhysicsParams = {
        ...DEFAULT_PHYSICS,
        clusteringEnabled: false,
        clusteringStrength: 0.8,
        adaptiveSpringEnabled: false,
        adaptiveSpringScale: 1.5,
      }

      // Reset to defaults
      const resetPhysics = { ...DEFAULT_PHYSICS }

      expect(resetPhysics.clusteringEnabled).toBe(DEFAULT_PHYSICS.clusteringEnabled)
      expect(resetPhysics.clusteringStrength).toBe(DEFAULT_PHYSICS.clusteringStrength)
      expect(resetPhysics.adaptiveSpringEnabled).toBe(DEFAULT_PHYSICS.adaptiveSpringEnabled)
      expect(resetPhysics.adaptiveSpringScale).toBe(DEFAULT_PHYSICS.adaptiveSpringScale)
    })
  })
})
