import { describe, it, expect } from 'vitest'
import {
  LENSES,
  LENSES_BY_ID,
  DEFAULT_LENS_ID,
  getRecommendedLens,
  isLensAvailable,
} from '../presets'

describe('Lens Presets', () => {
  describe('LENSES array', () => {
    it('should contain at least the full lens', () => {
      expect(LENSES.length).toBeGreaterThanOrEqual(1)
      expect(LENSES.some(l => l.id === 'full')).toBe(true)
    })

    it('should have unique IDs', () => {
      const ids = LENSES.map(l => l.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should have all required properties', () => {
      for (const lens of LENSES) {
        expect(lens.id).toBeDefined()
        expect(lens.name).toBeDefined()
        expect(lens.description).toBeDefined()
        expect(lens.icon).toBeDefined()
        expect(typeof lens.requiresFocus).toBe('boolean')
        expect(['force', 'radial', 'hierarchical']).toContain(lens.layout)
      }
    })
  })

  describe('LENSES_BY_ID', () => {
    it('should contain all lenses', () => {
      expect(LENSES_BY_ID.size).toBe(LENSES.length)
    })

    it('should allow lookup by id', () => {
      const fullLens = LENSES_BY_ID.get('full')
      expect(fullLens).toBeDefined()
      expect(fullLens?.name).toBe('Full Graph')
    })
  })

  describe('DEFAULT_LENS_ID', () => {
    it('should be a valid lens id', () => {
      expect(LENSES_BY_ID.has(DEFAULT_LENS_ID)).toBe(true)
    })

    it('should be "full"', () => {
      expect(DEFAULT_LENS_ID).toBe('full')
    })
  })

  describe('getRecommendedLens', () => {
    it('should recommend "full" for small graphs', () => {
      const lens = getRecommendedLens(50)
      expect(lens.id).toBe('full')
    })

    it('should recommend "full" for graphs under 300 nodes', () => {
      const lens = getRecommendedLens(299)
      expect(lens.id).toBe('full')
    })

    it('should recommend "namespaces" for large graphs', () => {
      const lens = getRecommendedLens(500)
      expect(lens.id).toBe('namespaces')
    })

    it('should recommend "namespaces" for very large graphs', () => {
      const lens = getRecommendedLens(5000)
      expect(lens.id).toBe('namespaces')
    })
  })

  describe('isLensAvailable', () => {
    it('should return true for "full" lens', () => {
      expect(isLensAvailable('full')).toBe(true)
    })

    it('should return true for "ego" lens (Phase 2)', () => {
      expect(isLensAvailable('ego')).toBe(true)
    })

    it('should return true for "namespaces" lens (Phase 3)', () => {
      expect(isLensAvailable('namespaces')).toBe(true)
    })

    it('should return true for "imports" lens (Phase 4)', () => {
      expect(isLensAvailable('imports')).toBe(true)
    })

    it('should return true for "dependents" lens (Phase 4)', () => {
      expect(isLensAvailable('dependents')).toBe(true)
    })

    it('should return false for unknown lens', () => {
      expect(isLensAvailable('nonexistent')).toBe(false)
    })
  })

  describe('Lens definitions', () => {
    describe('full lens', () => {
      const full = LENSES_BY_ID.get('full')!

      it('should not require focus', () => {
        expect(full.requiresFocus).toBe(false)
      })

      it('should use force layout', () => {
        expect(full.layout).toBe('force')
      })

      it('should have no filter or aggregate', () => {
        expect(full.filterId).toBeNull()
        expect(full.aggregateId).toBeNull()
      })

      it('should be recommended for small graphs', () => {
        expect(full.recommendedWhen?.maxNodes).toBe(300)
      })
    })

    describe('ego lens', () => {
      const ego = LENSES_BY_ID.get('ego')!

      it('should require focus', () => {
        expect(ego.requiresFocus).toBe(true)
      })

      it('should use radial layout', () => {
        expect(ego.layout).toBe('radial')
      })

      it('should use nHop filter', () => {
        expect(ego.filterId).toBe('nHop')
      })
    })

    describe('namespaces lens', () => {
      const namespaces = LENSES_BY_ID.get('namespaces')!

      it('should not require focus', () => {
        expect(namespaces.requiresFocus).toBe(false)
      })

      it('should use byNamespace aggregation', () => {
        expect(namespaces.aggregateId).toBe('byNamespace')
      })

      it('should be recommended for large graphs', () => {
        expect(namespaces.recommendedWhen?.minNodes).toBe(300)
      })
    })
  })
})
