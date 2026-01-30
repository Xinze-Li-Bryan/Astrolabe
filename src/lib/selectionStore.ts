/**
 * Selection Store
 *
 * Centralized state management for selection:
 * - Node selection (ephemeral, not undoable)
 * - Edge selection (ephemeral, not undoable)
 * - Namespace highlight (undoable via selectionActions)
 *
 * Node/edge selection are mutually exclusive - selecting one clears the other.
 */

import { create } from 'zustand'

export interface NamespaceHighlight {
  namespace: string
  nodeIds: Set<string>
}

export interface SelectionState {
  // Ephemeral selection (not undoable)
  selectedNodeId: string | null
  selectedEdgeId: string | null

  // Namespace highlight (undoable via selectionActions)
  highlightedNamespace: NamespaceHighlight | null

  // Actions
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  setHighlightedNamespace: (highlight: NamespaceHighlight | null) => void
  clearHighlight: () => void
  clearAll: () => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  highlightedNamespace: null,

  selectNode: (id) =>
    set((state) => ({
      selectedNodeId: id,
      // Clear edge selection when selecting a node (not when clearing)
      selectedEdgeId: id !== null ? null : state.selectedEdgeId,
    })),

  selectEdge: (id) =>
    set((state) => ({
      selectedEdgeId: id,
      // Clear node selection when selecting an edge (not when clearing)
      selectedNodeId: id !== null ? null : state.selectedNodeId,
    })),

  setHighlightedNamespace: (highlight) =>
    set({ highlightedNamespace: highlight }),

  clearHighlight: () =>
    set({ highlightedNamespace: null }),

  clearAll: () =>
    set({
      selectedNodeId: null,
      selectedEdgeId: null,
      highlightedNamespace: null,
    }),
}))
