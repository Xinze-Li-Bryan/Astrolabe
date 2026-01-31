/**
 * Tests for undoable viewport actions (filter options)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { history } from '../HistoryManager'

// Mock the API
vi.mock('@/lib/api', () => ({
  updateViewport: vi.fn().mockResolvedValue({ status: 'ok', viewport: {} }),
}))

// Mock callback for filter options changes
const mockSetFilterOptions = vi.fn()

// Import after mocking
import { updateFilterOptionsUndoable } from '../viewportActions'

describe('viewportActions', () => {
  beforeEach(() => {
    history.clear()
    mockSetFilterOptions.mockClear()
  })

  describe('updateFilterOptionsUndoable', () => {
    it('should update filter options and register command in history', async () => {
      const projectPath = '/test/project'
      const oldOptions = { hideTechnical: false, hideOrphaned: false, transitiveReduction: true as boolean | undefined }
      const newOptions = { hideTechnical: true, hideOrphaned: false, transitiveReduction: true as boolean | undefined }

      await updateFilterOptionsUndoable(
        projectPath,
        newOptions,
        oldOptions,
        mockSetFilterOptions
      )

      // Callback should be called with new options
      expect(mockSetFilterOptions).toHaveBeenCalledWith(newOptions)

      // History should have the command
      const state = history.getState()
      expect(state.canUndo).toBe(true)
      expect(state.undoLabel).toContain('Hide Technical')
    })

    it('should undo filter options change', async () => {
      const projectPath = '/test/project'
      const oldOptions = { hideTechnical: false, hideOrphaned: false, transitiveReduction: true }
      const newOptions = { hideTechnical: true, hideOrphaned: false, transitiveReduction: true }

      await updateFilterOptionsUndoable(
        projectPath,
        newOptions,
        oldOptions,
        mockSetFilterOptions
      )

      // Clear mock to check undo call
      mockSetFilterOptions.mockClear()

      // Undo
      await history.undo()

      // Callback should be called with old options
      expect(mockSetFilterOptions).toHaveBeenCalledWith(oldOptions)
    })

    it('should redo filter options change', async () => {
      const projectPath = '/test/project'
      const oldOptions = { hideTechnical: false, hideOrphaned: false, transitiveReduction: true }
      const newOptions = { hideTechnical: true, hideOrphaned: false, transitiveReduction: true }

      await updateFilterOptionsUndoable(
        projectPath,
        newOptions,
        oldOptions,
        mockSetFilterOptions
      )

      await history.undo()
      mockSetFilterOptions.mockClear()

      // Redo
      await history.redo()

      // Callback should be called with new options again
      expect(mockSetFilterOptions).toHaveBeenCalledWith(newOptions)
    })

    it('should generate correct label for hideOrphaned change', async () => {
      const projectPath = '/test/project'
      const oldOptions = { hideTechnical: false, hideOrphaned: false, transitiveReduction: true }
      const newOptions = { hideTechnical: false, hideOrphaned: true, transitiveReduction: true }

      await updateFilterOptionsUndoable(
        projectPath,
        newOptions,
        oldOptions,
        mockSetFilterOptions
      )

      const state = history.getState()
      expect(state.undoLabel).toContain('Hide Orphaned')
    })

    it('should generate correct label for transitiveReduction change', async () => {
      const projectPath = '/test/project'
      const oldOptions = { hideTechnical: false, hideOrphaned: false, transitiveReduction: true }
      const newOptions = { hideTechnical: false, hideOrphaned: false, transitiveReduction: false }

      await updateFilterOptionsUndoable(
        projectPath,
        newOptions,
        oldOptions,
        mockSetFilterOptions
      )

      const state = history.getState()
      expect(state.undoLabel).toContain('Transitive Reduction')
    })

    it('should generate correct label for multiple changes', async () => {
      const projectPath = '/test/project'
      const oldOptions = { hideTechnical: false, hideOrphaned: false, transitiveReduction: true }
      const newOptions = { hideTechnical: true, hideOrphaned: true, transitiveReduction: false }

      await updateFilterOptionsUndoable(
        projectPath,
        newOptions,
        oldOptions,
        mockSetFilterOptions
      )

      const state = history.getState()
      expect(state.undoLabel).toContain('filter')
    })
  })
})
