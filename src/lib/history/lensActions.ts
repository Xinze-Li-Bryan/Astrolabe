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
 *
 * @param newOptions - Partial options to merge
 * @param optionKey - Key for merging consecutive changes (e.g., 'nHop')
 */
export async function setLensOptionsUndoable(
  newOptions: Partial<LensOptions>,
  optionKey?: string // For merging consecutive changes to same option
): Promise<void> {
  const store = useLensStore
  const label = optionKey
    ? `Change ${optionKey}`
    : 'Change lens options'

  // Use withUndo with merge support for high-frequency slider interactions
  const update = withUndo(store, 'lens', label, {
    tryMerge: !!optionKey, // Only merge if optionKey specified
    mergeKey: 'lensOption',
    mergeValue: optionKey,
  })

  await update(draft => {
    Object.assign(draft.options, newOptions)
  })
}

/**
 * Toggle namespace group expansion (undoable)
 */
export async function toggleGroupExpandedUndoable(groupId: string): Promise<void> {
  const store = useLensStore
  const wasExpanded = store.getState().expandedGroups.has(groupId)
  const groupName = groupId.replace('group:', '').split('.').pop() || groupId
  const label = wasExpanded
    ? `Collapse: ${groupName}`
    : `Expand: ${groupName}`

  console.log(`[toggleGroupExpandedUndoable] called: ${groupId}, wasExpanded=${wasExpanded}`)

  await undoable(
    'lens',
    label,
    () => {
      const current = store.getState().expandedGroups
      const newExpanded = new Set(current)
      console.log(`[toggleGroupExpanded] do(): wasExpanded=${wasExpanded}, current.has=${current.has(groupId)}`)
      if (wasExpanded) {
        newExpanded.delete(groupId)
      } else {
        newExpanded.add(groupId)
      }
      store.setState({ expandedGroups: newExpanded })
      console.log(`[toggleGroupExpanded] do() done: newExpanded.has=${newExpanded.has(groupId)}`)
    },
    () => {
      const current = store.getState().expandedGroups
      const newExpanded = new Set(current)
      console.log(`[toggleGroupExpanded] undo(): wasExpanded=${wasExpanded}, current.has=${current.has(groupId)}`)
      if (wasExpanded) {
        newExpanded.add(groupId)
      } else {
        newExpanded.delete(groupId)
      }
      store.setState({ expandedGroups: newExpanded })
      console.log(`[toggleGroupExpanded] undo() done: newExpanded.has=${newExpanded.has(groupId)}`)
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
