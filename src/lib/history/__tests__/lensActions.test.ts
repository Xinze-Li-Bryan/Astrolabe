import { describe, it, expect, beforeEach } from 'vitest'

describe('lensActions', () => {
  beforeEach(async () => {
    // Reset history and lens store before each test
    const { history } = await import('../index')
    const { useLensStore } = await import('../../lensStore')

    history.clear()
    useLensStore.setState({ expandedGroups: new Set() })
  })

  describe('toggleGroupExpandedUndoable', () => {
    it('should expand a group and register command in history', async () => {
      const { history } = await import('../index')
      const { useLensStore } = await import('../../lensStore')
      const { toggleGroupExpandedUndoable } = await import('../lensActions')

      // Initially not expanded
      expect(useLensStore.getState().expandedGroups.has('group:Test')).toBe(false)

      // Expand
      await toggleGroupExpandedUndoable('group:Test')

      // Should be expanded now
      expect(useLensStore.getState().expandedGroups.has('group:Test')).toBe(true)

      // Should have command in history
      const state = history.getState()
      expect(state.canUndo).toBe(true)
      expect(state.undoLabel).toContain('Expand')
    })

    it('should undo expansion (collapse)', async () => {
      const { history } = await import('../index')
      const { useLensStore } = await import('../../lensStore')
      const { toggleGroupExpandedUndoable } = await import('../lensActions')

      // Expand first
      await toggleGroupExpandedUndoable('group:Test')
      expect(useLensStore.getState().expandedGroups.has('group:Test')).toBe(true)

      // Undo should collapse
      await history.undo()
      expect(useLensStore.getState().expandedGroups.has('group:Test')).toBe(false)
    })

    it('should redo expansion', async () => {
      const { history } = await import('../index')
      const { useLensStore } = await import('../../lensStore')
      const { toggleGroupExpandedUndoable } = await import('../lensActions')

      // Expand then undo
      await toggleGroupExpandedUndoable('group:Test')
      await history.undo()
      expect(useLensStore.getState().expandedGroups.has('group:Test')).toBe(false)

      // Redo should expand again
      await history.redo()
      expect(useLensStore.getState().expandedGroups.has('group:Test')).toBe(true)
    })

    it('should collapse an expanded group', async () => {
      const { history } = await import('../index')
      const { useLensStore } = await import('../../lensStore')
      const { toggleGroupExpandedUndoable } = await import('../lensActions')

      // Start with expanded group
      useLensStore.setState({ expandedGroups: new Set(['group:Test']) })
      expect(useLensStore.getState().expandedGroups.has('group:Test')).toBe(true)

      // Toggle should collapse
      await toggleGroupExpandedUndoable('group:Test')
      expect(useLensStore.getState().expandedGroups.has('group:Test')).toBe(false)

      // History should have collapse command
      const state = history.getState()
      expect(state.canUndo).toBe(true)
      expect(state.undoLabel).toContain('Collapse')
    })

    it('should undo collapse (re-expand)', async () => {
      const { history } = await import('../index')
      const { useLensStore } = await import('../../lensStore')
      const { toggleGroupExpandedUndoable } = await import('../lensActions')

      // Start expanded, then collapse
      useLensStore.setState({ expandedGroups: new Set(['group:Test']) })
      await toggleGroupExpandedUndoable('group:Test')
      expect(useLensStore.getState().expandedGroups.has('group:Test')).toBe(false)

      // Undo should re-expand
      await history.undo()
      expect(useLensStore.getState().expandedGroups.has('group:Test')).toBe(true)
    })
  })
})
