import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Selection Store Tests
 *
 * Tests for centralized selection state management:
 * - Node/edge selection (ephemeral)
 * - Namespace highlight (undoable)
 */

describe('selectionStore', () => {
  beforeEach(async () => {
    // Reset store state before each test
    const { useSelectionStore } = await import('../selectionStore')
    useSelectionStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      highlightedNamespace: null,
    })
  })

  describe('node selection', () => {
    it('should start with no node selected', async () => {
      const { useSelectionStore } = await import('../selectionStore')
      const state = useSelectionStore.getState()

      expect(state.selectedNodeId).toBeNull()
    })

    it('should select a node', async () => {
      const { useSelectionStore } = await import('../selectionStore')

      useSelectionStore.getState().selectNode('node-123')

      expect(useSelectionStore.getState().selectedNodeId).toBe('node-123')
    })

    it('should clear node selection', async () => {
      const { useSelectionStore } = await import('../selectionStore')

      useSelectionStore.getState().selectNode('node-123')
      useSelectionStore.getState().selectNode(null)

      expect(useSelectionStore.getState().selectedNodeId).toBeNull()
    })

    it('should replace previous node selection', async () => {
      const { useSelectionStore } = await import('../selectionStore')

      useSelectionStore.getState().selectNode('node-1')
      useSelectionStore.getState().selectNode('node-2')

      expect(useSelectionStore.getState().selectedNodeId).toBe('node-2')
    })
  })

  describe('edge selection', () => {
    it('should start with no edge selected', async () => {
      const { useSelectionStore } = await import('../selectionStore')
      const state = useSelectionStore.getState()

      expect(state.selectedEdgeId).toBeNull()
    })

    it('should select an edge', async () => {
      const { useSelectionStore } = await import('../selectionStore')

      useSelectionStore.getState().selectEdge('edge-456')

      expect(useSelectionStore.getState().selectedEdgeId).toBe('edge-456')
    })

    it('should clear node selection when selecting edge', async () => {
      const { useSelectionStore } = await import('../selectionStore')

      useSelectionStore.getState().selectNode('node-123')
      useSelectionStore.getState().selectEdge('edge-456')

      expect(useSelectionStore.getState().selectedNodeId).toBeNull()
      expect(useSelectionStore.getState().selectedEdgeId).toBe('edge-456')
    })

    it('should clear edge selection when selecting node', async () => {
      const { useSelectionStore } = await import('../selectionStore')

      useSelectionStore.getState().selectEdge('edge-456')
      useSelectionStore.getState().selectNode('node-123')

      expect(useSelectionStore.getState().selectedNodeId).toBe('node-123')
      expect(useSelectionStore.getState().selectedEdgeId).toBeNull()
    })
  })

  describe('namespace highlight', () => {
    it('should start with no namespace highlighted', async () => {
      const { useSelectionStore } = await import('../selectionStore')
      const state = useSelectionStore.getState()

      expect(state.highlightedNamespace).toBeNull()
    })

    it('should highlight a namespace with node IDs', async () => {
      const { useSelectionStore } = await import('../selectionStore')
      const nodeIds = new Set(['node-1', 'node-2', 'node-3'])

      useSelectionStore.getState().setHighlightedNamespace({
        namespace: 'Mathlib.Algebra',
        nodeIds,
      })

      const state = useSelectionStore.getState()
      expect(state.highlightedNamespace?.namespace).toBe('Mathlib.Algebra')
      expect(state.highlightedNamespace?.nodeIds.has('node-1')).toBe(true)
      expect(state.highlightedNamespace?.nodeIds.has('node-2')).toBe(true)
      expect(state.highlightedNamespace?.nodeIds.size).toBe(3)
    })

    it('should clear namespace highlight', async () => {
      const { useSelectionStore } = await import('../selectionStore')

      useSelectionStore.getState().setHighlightedNamespace({
        namespace: 'Mathlib.Algebra',
        nodeIds: new Set(['node-1']),
      })
      useSelectionStore.getState().clearHighlight()

      expect(useSelectionStore.getState().highlightedNamespace).toBeNull()
    })

    it('should replace previous highlight', async () => {
      const { useSelectionStore } = await import('../selectionStore')

      useSelectionStore.getState().setHighlightedNamespace({
        namespace: 'Mathlib.Algebra',
        nodeIds: new Set(['node-1']),
      })
      useSelectionStore.getState().setHighlightedNamespace({
        namespace: 'Mathlib.Topology',
        nodeIds: new Set(['node-2', 'node-3']),
      })

      const state = useSelectionStore.getState()
      expect(state.highlightedNamespace?.namespace).toBe('Mathlib.Topology')
      expect(state.highlightedNamespace?.nodeIds.size).toBe(2)
    })
  })

  describe('clearAll', () => {
    it('should clear all selection state', async () => {
      const { useSelectionStore } = await import('../selectionStore')

      // Set everything
      useSelectionStore.getState().selectNode('node-1')
      useSelectionStore.getState().setHighlightedNamespace({
        namespace: 'Test',
        nodeIds: new Set(['node-1']),
      })

      // Clear all
      useSelectionStore.getState().clearAll()

      const state = useSelectionStore.getState()
      expect(state.selectedNodeId).toBeNull()
      expect(state.selectedEdgeId).toBeNull()
      expect(state.highlightedNamespace).toBeNull()
    })
  })
})
