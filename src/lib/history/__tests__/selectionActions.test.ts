import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Selection Actions Tests (Undoable)
 *
 * Tests for undoable selection actions:
 * - Namespace highlight with undo/redo
 */

describe('selectionActions', () => {
  beforeEach(async () => {
    // Reset stores before each test
    const { useSelectionStore } = await import('../../selectionStore')
    const { history } = await import('../index')

    useSelectionStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      highlightedNamespace: null,
    })
    history.clear()
  })

  describe('highlightNamespaceUndoable', () => {
    it('should highlight a namespace', async () => {
      const { useSelectionStore } = await import('../../selectionStore')
      const { highlightNamespaceUndoable } = await import('../selectionActions')

      await highlightNamespaceUndoable('Mathlib.Algebra', new Set(['node-1', 'node-2']))

      const state = useSelectionStore.getState()
      expect(state.highlightedNamespace?.namespace).toBe('Mathlib.Algebra')
      expect(state.highlightedNamespace?.nodeIds.size).toBe(2)
    })

    it('should add command to undo stack', async () => {
      const { history } = await import('../index')
      const { highlightNamespaceUndoable } = await import('../selectionActions')

      await highlightNamespaceUndoable('Mathlib.Algebra', new Set(['node-1']))

      const historyState = history.getState()
      expect(historyState.canUndo).toBe(true)
      expect(historyState.undoLabel).toContain('Algebra')
    })

    it('should undo highlight (restore to no highlight)', async () => {
      const { useSelectionStore } = await import('../../selectionStore')
      const { history } = await import('../index')
      const { highlightNamespaceUndoable } = await import('../selectionActions')

      // Start with no highlight
      expect(useSelectionStore.getState().highlightedNamespace).toBeNull()

      // Highlight
      await highlightNamespaceUndoable('Mathlib.Algebra', new Set(['node-1']))
      expect(useSelectionStore.getState().highlightedNamespace?.namespace).toBe('Mathlib.Algebra')

      // Undo
      await history.undo()
      expect(useSelectionStore.getState().highlightedNamespace).toBeNull()
    })

    it('should undo highlight (restore to previous highlight)', async () => {
      const { useSelectionStore } = await import('../../selectionStore')
      const { history } = await import('../index')
      const { highlightNamespaceUndoable } = await import('../selectionActions')

      // First highlight
      await highlightNamespaceUndoable('Mathlib.Algebra', new Set(['node-1']))
      expect(useSelectionStore.getState().highlightedNamespace?.namespace).toBe('Mathlib.Algebra')

      // Second highlight
      await highlightNamespaceUndoable('Mathlib.Topology', new Set(['node-2']))
      expect(useSelectionStore.getState().highlightedNamespace?.namespace).toBe('Mathlib.Topology')

      // Undo second highlight
      await history.undo()
      expect(useSelectionStore.getState().highlightedNamespace?.namespace).toBe('Mathlib.Algebra')

      // Undo first highlight
      await history.undo()
      expect(useSelectionStore.getState().highlightedNamespace).toBeNull()
    })

    it('should redo highlight', async () => {
      const { useSelectionStore } = await import('../../selectionStore')
      const { history } = await import('../index')
      const { highlightNamespaceUndoable } = await import('../selectionActions')

      // Highlight
      await highlightNamespaceUndoable('Mathlib.Algebra', new Set(['node-1']))

      // Undo
      await history.undo()
      expect(useSelectionStore.getState().highlightedNamespace).toBeNull()

      // Redo
      await history.redo()
      expect(useSelectionStore.getState().highlightedNamespace?.namespace).toBe('Mathlib.Algebra')
    })
  })

  describe('clearHighlightUndoable', () => {
    it('should clear namespace highlight', async () => {
      const { useSelectionStore } = await import('../../selectionStore')
      const { clearHighlightUndoable, highlightNamespaceUndoable } = await import('../selectionActions')

      // Set highlight first
      await highlightNamespaceUndoable('Mathlib.Algebra', new Set(['node-1']))
      expect(useSelectionStore.getState().highlightedNamespace).not.toBeNull()

      // Clear highlight
      await clearHighlightUndoable()
      expect(useSelectionStore.getState().highlightedNamespace).toBeNull()
    })

    it('should undo clear (restore highlight)', async () => {
      const { useSelectionStore } = await import('../../selectionStore')
      const { history } = await import('../index')
      const { clearHighlightUndoable, highlightNamespaceUndoable } = await import('../selectionActions')

      // Set highlight
      await highlightNamespaceUndoable('Mathlib.Algebra', new Set(['node-1']))

      // Clear highlight
      await clearHighlightUndoable()
      expect(useSelectionStore.getState().highlightedNamespace).toBeNull()

      // Undo clear
      await history.undo()
      expect(useSelectionStore.getState().highlightedNamespace?.namespace).toBe('Mathlib.Algebra')
    })

    it('should not add command if already no highlight', async () => {
      const { useSelectionStore } = await import('../../selectionStore')
      const { history } = await import('../index')
      const { clearHighlightUndoable } = await import('../selectionActions')

      // No highlight to begin with
      expect(useSelectionStore.getState().highlightedNamespace).toBeNull()

      // Clear (no-op)
      await clearHighlightUndoable()

      // Should not add to history
      expect(history.getState().canUndo).toBe(false)
    })
  })
})
