/**
 * Undoable Lens Actions
 *
 * Wraps lens store mutations to make them undoable via Cmd+Z.
 * Import these instead of using store methods directly for user-driven changes.
 */

import { useLensStore } from '@/lib/lensStore'
import { withUndo, undoable } from './withUndo'
import type { LensOptions } from '@/lib/lenses/types'

/**
 * Change lens options (nHop, namespaceDepth, collapseThreshold, etc.)
 * Undoable and mergeable for slider interactions.
 */
export async function setLensOptionsUndoable(
  newOptions: Partial<LensOptions>,
  optionKey?: string // For merging consecutive changes to same option
): Promise<void> {
  const store = useLensStore
  const oldOptions = { ...store.getState().options }
  const label = optionKey
    ? `Change ${optionKey}`
    : 'Change lens options'

  await undoable(
    'lens',
    label,
    () => store.setState(state => ({
      options: { ...state.options, ...newOptions }
    })),
    () => store.setState({ options: oldOptions })
  )
}

/**
 * Toggle namespace group expansion (undoable)
 */
export async function toggleGroupExpandedUndoable(groupId: string): Promise<void> {
  const store = useLensStore
  const wasExpanded = store.getState().expandedGroups.has(groupId)
  const label = wasExpanded
    ? `Collapse ${groupId.replace('group:', '')}`
    : `Expand ${groupId.replace('group:', '')}`

  await undoable(
    'lens',
    label,
    () => {
      const newExpanded = new Set(store.getState().expandedGroups)
      if (wasExpanded) {
        newExpanded.delete(groupId)
      } else {
        newExpanded.add(groupId)
      }
      store.setState({ expandedGroups: newExpanded })
    },
    () => {
      const newExpanded = new Set(store.getState().expandedGroups)
      if (wasExpanded) {
        newExpanded.add(groupId)
      } else {
        newExpanded.delete(groupId)
      }
      store.setState({ expandedGroups: newExpanded })
    }
  )
}

/**
 * Set lens focus node (undoable)
 */
export async function setLensFocusNodeUndoable(nodeId: string | null): Promise<void> {
  const store = useLensStore
  const oldFocusNodeId = store.getState().lensFocusNodeId
  const oldActivationState = store.getState().activationState

  // Don't record if same
  if (nodeId === oldFocusNodeId) return

  const label = nodeId
    ? `Focus on ${nodeId.split('.').pop()}`
    : 'Clear focus'

  await undoable(
    'lens',
    label,
    () => {
      store.setState({
        lensFocusNodeId: nodeId,
        activationState: nodeId ? 'idle' : store.getState().activationState,
      })
    },
    () => {
      store.setState({
        lensFocusNodeId: oldFocusNodeId,
        activationState: oldActivationState,
      })
    }
  )
}

/**
 * Switch active lens (undoable)
 */
export async function setActiveLensUndoable(lensId: string): Promise<void> {
  const store = useLensStore
  const oldLensId = store.getState().activeLensId
  const oldActivationState = store.getState().activationState
  const oldExpandedGroups = new Set(store.getState().expandedGroups)

  // Don't record if same
  if (lensId === oldLensId) return

  await undoable(
    'lens',
    `Switch to ${lensId} lens`,
    () => store.getState().setActiveLens(lensId),
    () => {
      store.setState({
        activeLensId: oldLensId,
        activationState: oldActivationState,
        expandedGroups: oldExpandedGroups,
      })
    }
  )
}

/**
 * Collapse all namespace groups (undoable)
 */
export async function clearExpandedGroupsUndoable(): Promise<void> {
  const store = useLensStore
  const oldExpandedGroups = new Set(store.getState().expandedGroups)

  // Don't record if already empty
  if (oldExpandedGroups.size === 0) return

  await undoable(
    'lens',
    'Collapse all groups',
    () => store.setState({ expandedGroups: new Set() }),
    () => store.setState({ expandedGroups: oldExpandedGroups })
  )
}
