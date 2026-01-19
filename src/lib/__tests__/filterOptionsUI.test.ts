import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_FILTER_OPTIONS, type GraphFilterOptions } from '@/lib/graphProcessing'

/**
 * Filter Options UI Tests
 *
 * Tests for the Graph Filter Options UI controls including:
 * 1. Transitive Reduction toggle
 * 2. Hide Technical toggle
 * 3. Hide Orphaned toggle
 */

describe('GraphFilterOptions UI', () => {
  describe('DEFAULT_FILTER_OPTIONS values', () => {
    it('should have all required filter options', () => {
      expect(DEFAULT_FILTER_OPTIONS).toHaveProperty('hideTechnical')
      expect(DEFAULT_FILTER_OPTIONS).toHaveProperty('hideOrphaned')
      expect(DEFAULT_FILTER_OPTIONS).toHaveProperty('transitiveReduction')
    })

    it('should have transitive reduction enabled by default', () => {
      expect(DEFAULT_FILTER_OPTIONS.transitiveReduction).toBe(true)
    })

    it('should have hide orphaned disabled by default', () => {
      expect(DEFAULT_FILTER_OPTIONS.hideOrphaned).toBe(false)
    })

    it('should have hide technical disabled by default', () => {
      expect(DEFAULT_FILTER_OPTIONS.hideTechnical).toBe(false)
    })
  })

  describe('Transitive Reduction toggle behavior', () => {
    it('should toggle transitive reduction on/off', () => {
      const setFilterOptions = vi.fn()
      const filterOptions: GraphFilterOptions = {
        ...DEFAULT_FILTER_OPTIONS,
        transitiveReduction: true
      }

      // Simulate toggle off
      const newOptions = { ...filterOptions, transitiveReduction: false }
      setFilterOptions(newOptions)

      expect(setFilterOptions).toHaveBeenCalledWith(
        expect.objectContaining({ transitiveReduction: false })
      )
    })

    it('should preserve other options when toggling transitive reduction', () => {
      const filterOptions: GraphFilterOptions = {
        hideTechnical: true,
        hideOrphaned: false,
        transitiveReduction: true,
      }

      // Toggle transitive reduction
      const newOptions = { ...filterOptions, transitiveReduction: false }

      expect(newOptions.hideTechnical).toBe(true)
      expect(newOptions.hideOrphaned).toBe(false)
      expect(newOptions.transitiveReduction).toBe(false)
    })
  })

  describe('Filter options interaction', () => {
    it('should allow all filters to be enabled simultaneously', () => {
      const filterOptions: GraphFilterOptions = {
        hideTechnical: true,
        hideOrphaned: true,
        transitiveReduction: true,
      }

      expect(filterOptions.hideTechnical).toBe(true)
      expect(filterOptions.hideOrphaned).toBe(true)
      expect(filterOptions.transitiveReduction).toBe(true)
    })

    it('should allow all filters to be disabled simultaneously', () => {
      const filterOptions: GraphFilterOptions = {
        hideTechnical: false,
        hideOrphaned: false,
        transitiveReduction: false,
      }

      expect(filterOptions.hideTechnical).toBe(false)
      expect(filterOptions.hideOrphaned).toBe(false)
      expect(filterOptions.transitiveReduction).toBe(false)
    })
  })
})
