/**
 * Undoable Selection Actions
 *
 * Wraps selection store mutations to make namespace highlight undoable via Cmd+Z.
 * Node/edge selection remain ephemeral (not undoable).
 */

import { useSelectionStore, type NamespaceHighlight } from '@/lib/selectionStore'
import { undoable } from './withUndo'

/**
 * Highlight a namespace (undoable)
 *
 * @param namespace - The namespace name to highlight
 * @param nodeIds - Set of node IDs belonging to this namespace
 */
export async function highlightNamespaceUndoable(
  namespace: string,
  nodeIds: Set<string>
): Promise<void> {
  const store = useSelectionStore
  const oldHighlight = store.getState().highlightedNamespace

  // Clone old highlight for undo (Set is reference type)
  const previousHighlight: NamespaceHighlight | null = oldHighlight
    ? { namespace: oldHighlight.namespace, nodeIds: new Set(oldHighlight.nodeIds) }
    : null

  // Use short namespace name for label (last segment)
  const shortName = namespace.split('.').pop() || namespace
  const label = `Highlight: ${shortName}`

  await undoable(
    'ui',
    label,
    () => {
      store.getState().setHighlightedNamespace({ namespace, nodeIds: new Set(nodeIds) })
    },
    () => {
      store.getState().setHighlightedNamespace(previousHighlight)
    }
  )
}

/**
 * Clear namespace highlight (undoable)
 *
 * Only adds to undo stack if there was actually a highlight to clear.
 */
export async function clearHighlightUndoable(): Promise<void> {
  const store = useSelectionStore
  const oldHighlight = store.getState().highlightedNamespace

  // Don't add to history if already no highlight
  if (!oldHighlight) return

  // Clone for undo
  const previousHighlight: NamespaceHighlight = {
    namespace: oldHighlight.namespace,
    nodeIds: new Set(oldHighlight.nodeIds),
  }

  await undoable(
    'ui',
    'Clear highlight',
    () => {
      store.getState().clearHighlight()
    },
    () => {
      store.getState().setHighlightedNamespace(previousHighlight)
    }
  )
}
