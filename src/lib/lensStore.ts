/**
 * Lens Store - Manages lens state and selection
 *
 * Separate from main store to keep concerns clean.
 * Handles which lens is active, focus node for lens, and lens options.
 */

import { create } from 'zustand'
import type { LensActivationState, LensOptions } from './lenses/types'
import { DEFAULT_LENS_ID, LENSES_BY_ID, getRecommendedLens } from './lenses/presets'
import { isLensImplemented } from './lenses/pipeline'

// ============================================
// Lens Store State
// ============================================

interface LensStoreState {
  // Current lens
  activeLensId: string
  activationState: LensActivationState

  // Focus for lenses that require it
  lensFocusNodeId: string | null

  // Lens-specific options
  options: LensOptions

  // Namespace group expansion state
  expandedGroups: Set<string>

  // Actions
  setActiveLens: (lensId: string) => void
  setLensFocusNode: (nodeId: string | null) => void
  setLensOptions: (options: Partial<LensOptions>) => void
  toggleGroupExpanded: (groupId: string) => void
  clearExpandedGroups: () => void
  cancelLensActivation: () => void
  resetLens: () => void

  // Auto-select lens based on graph size
  autoSelectLens: (nodeCount: number) => void
}

// ============================================
// Store Implementation
// ============================================

export const useLensStore = create<LensStoreState>((set, get) => ({
  // Initial state
  activeLensId: DEFAULT_LENS_ID,
  activationState: 'idle',
  lensFocusNodeId: null,
  options: {
    nHop: 2,
    namespaceDepth: 2,        // Group by 2nd level (e.g., "Mathlib.Algebra")
    collapseThreshold: 3,     // Lower threshold for more grouping
  },
  expandedGroups: new Set(),

  // Set active lens
  setActiveLens: (lensId: string) => {
    const lens = LENSES_BY_ID.get(lensId)
    if (!lens) {
      console.warn(`[LensStore] Unknown lens: ${lensId}`)
      return
    }

    // Check if lens is implemented
    if (!isLensImplemented(lensId)) {
      console.warn(`[LensStore] Lens not yet implemented: ${lensId}`)
      // Still allow setting for UI purposes, but it won't do anything
    }

    // If selecting namespaces lens, auto-collapse all groups to start fresh
    if (lensId === 'namespaces') {
      set({ expandedGroups: new Set() })
      console.log(`[LensStore] Auto-collapsed groups for namespaces lens`)
    }

    // If lens requires focus but we don't have one, enter awaiting state
    if (lens.requiresFocus && !get().lensFocusNodeId) {
      set({
        activeLensId: lensId,
        activationState: 'awaiting-focus',
      })
      console.log(`[LensStore] Lens '${lensId}' awaiting focus node`)
      return
    }

    // Lens is ready to activate
    set({
      activeLensId: lensId,
      activationState: 'idle',
    })
    console.log(`[LensStore] Activated lens: ${lensId}`)
  },

  // Set focus node (for lenses that need it)
  setLensFocusNode: (nodeId: string | null) => {
    const { activeLensId, activationState } = get()

    set({ lensFocusNodeId: nodeId })

    // If we were waiting for a focus node, complete activation
    if (activationState === 'awaiting-focus' && nodeId) {
      set({ activationState: 'idle' })
      console.log(`[LensStore] Lens '${activeLensId}' now focused on: ${nodeId}`)
    }
  },

  // Update lens options
  setLensOptions: (newOptions: Partial<LensOptions>) => {
    set(state => ({
      options: { ...state.options, ...newOptions },
    }))
  },

  // Toggle namespace group expansion
  toggleGroupExpanded: (groupId: string) => {
    set(state => {
      const newExpanded = new Set(state.expandedGroups)
      if (newExpanded.has(groupId)) {
        newExpanded.delete(groupId)
      } else {
        newExpanded.add(groupId)
      }
      return { expandedGroups: newExpanded }
    })
  },

  // Clear all expanded groups (collapse all back to top-level bubbles)
  clearExpandedGroups: () => {
    set({ expandedGroups: new Set() })
    console.log('[LensStore] Collapsed all namespace groups')
  },

  // Cancel lens activation (user pressed Esc while awaiting focus)
  cancelLensActivation: () => {
    set({
      activeLensId: DEFAULT_LENS_ID,
      activationState: 'idle',
    })
    console.log('[LensStore] Lens activation cancelled, reverted to default')
  },

  // Reset to default lens
  resetLens: () => {
    set({
      activeLensId: DEFAULT_LENS_ID,
      activationState: 'idle',
      lensFocusNodeId: null,
      expandedGroups: new Set(),
    })
  },

  // Auto-select lens based on graph size
  autoSelectLens: (nodeCount: number) => {
    const recommended = getRecommendedLens(nodeCount)

    // Only auto-select if it's implemented
    if (isLensImplemented(recommended.id)) {
      set({ activeLensId: recommended.id })
      console.log(`[LensStore] Auto-selected lens '${recommended.id}' for ${nodeCount} nodes`)
    } else {
      // Fall back to 'full' if recommended isn't implemented yet
      set({ activeLensId: 'full' })
      console.log(`[LensStore] Recommended lens '${recommended.id}' not implemented, using 'full'`)
    }
  },
}))

// ============================================
// Selectors (for convenience)
// ============================================

export const selectActiveLens = (state: LensStoreState) => LENSES_BY_ID.get(state.activeLensId)
export const selectIsAwaitingFocus = (state: LensStoreState) => state.activationState === 'awaiting-focus'
export const selectLensFocusNodeId = (state: LensStoreState) => state.lensFocusNodeId
