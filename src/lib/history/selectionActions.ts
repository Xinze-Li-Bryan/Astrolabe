/**
 * Undoable Selection Actions
 *
 * Wraps selection store mutations to make them undoable via Cmd+Z.
 * - Node selection: undoable
 * - Edge selection: undoable
 * - Namespace highlight: undoable
 */

import { useSelectionStore, type NamespaceHighlight } from '@/lib/selectionStore'
import { undoable } from './withUndo'

/**
 * Select a node (undoable)
 *
 * @param nodeId - Node ID to select, or null to clear selection
 */
export async function selectNodeUndoable(nodeId: string | null): Promise<void> {
  const store = useSelectionStore
  const oldNodeId = store.getState().selectedNodeId

  // Don't record if same selection
  if (nodeId === oldNodeId) return

  const nodeName = nodeId ? nodeId.split('.').pop() || nodeId : null
  const label = nodeId ? `Select: ${nodeName}` : 'Clear selection'

  await undoable(
    'ui',
    label,
    () => {
      store.getState().selectNode(nodeId)
    },
    () => {
      store.getState().selectNode(oldNodeId)
    }
  )
}

/**
 * Select an edge (undoable)
 *
 * @param edgeId - Edge ID to select, or null to clear selection
 */
export async function selectEdgeUndoable(edgeId: string | null): Promise<void> {
  const store = useSelectionStore
  const oldEdgeId = store.getState().selectedEdgeId

  // Don't record if same selection
  if (edgeId === oldEdgeId) return

  const label = edgeId ? `Select edge` : 'Clear edge selection'

  await undoable(
    'ui',
    label,
    () => {
      store.getState().selectEdge(edgeId)
    },
    () => {
      store.getState().selectEdge(oldEdgeId)
    }
  )
}

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
