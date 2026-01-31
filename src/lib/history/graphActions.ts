/**
 * Undoable Graph Actions
 *
 * Wraps graph mutations (node/edge meta, canvas add/remove) to make them undoable.
 * These actions handle both local state updates and backend persistence.
 *
 * Usage:
 *   import { graphActions } from '@/lib/history/graphActions'
 *
 *   // Instead of: await updateNodeMeta(path, nodeId, { notes: 'hello' })
 *   // Use:        await graphActions.updateNodeMeta(path, nodeId, { notes: 'hello' }, oldMeta)
 */

import { undoable, transaction } from './withUndo'
import { history } from './HistoryManager'
import {
  updateNodeMeta as apiUpdateNodeMeta,
  updateEdgeMeta as apiUpdateEdgeMeta,
} from '@/lib/api'
import { useCanvasStore } from '@/lib/canvasStore'
import type { NodeMeta, EdgeMeta } from '@/types/node'

/**
 * Get the canvas store instance (for accessing actions)
 */
function getCanvasStore() {
  return useCanvasStore.getState()
}

/**
 * Undoable node meta update
 *
 * @param path - Project path
 * @param nodeId - Node ID to update
 * @param newMeta - New meta values to apply
 * @param oldMeta - Previous meta values (for undo)
 * @param label - Optional custom label for undo stack
 */
export async function updateNodeMetaUndoable(
  path: string,
  nodeId: string,
  newMeta: Partial<NodeMeta>,
  oldMeta: Partial<NodeMeta>,
  label?: string
): Promise<void> {
  // Determine what's being changed for the label
  const changedFields = Object.keys(newMeta)
  const nodeName = nodeId.split('.').pop() || nodeId
  const defaultLabel = changedFields.length === 1
    ? `Edit ${changedFields[0]}: ${nodeName}`
    : `Edit ${nodeName} meta`

  await undoable(
    'graph',
    label || defaultLabel,
    // Do: apply new meta
    async () => {
      await apiUpdateNodeMeta(path, nodeId, newMeta)
      // Trigger local refresh (canvasStore or main store will handle this)
    },
    // Undo: restore old meta
    async () => {
      // For undo, we need to restore the old values
      // Empty string or -1 are "delete" sentinels in the backend
      const restoreMeta: Partial<NodeMeta> = {}
      for (const key of changedFields) {
        const oldValue = oldMeta[key as keyof NodeMeta]
        if (oldValue !== undefined) {
          restoreMeta[key as keyof NodeMeta] = oldValue as any
        } else {
          // If old value was undefined, we need to "delete" by sending sentinel
          // For strings: empty string, for numbers: -1
          if (key === 'notes' || key === 'label' || key === 'effect' || key === 'shape') {
            restoreMeta[key as keyof NodeMeta] = '' as any
          } else if (key === 'size') {
            restoreMeta[key as keyof NodeMeta] = -1 as any
          }
        }
      }
      await apiUpdateNodeMeta(path, nodeId, restoreMeta)
    }
  )
}

/**
 * Undoable edge meta update
 */
export async function updateEdgeMetaUndoable(
  path: string,
  edgeId: string,
  newMeta: Partial<EdgeMeta>,
  oldMeta: Partial<EdgeMeta>,
  label?: string
): Promise<void> {
  const changedFields = Object.keys(newMeta)
  // Try to extract meaningful edge name from ID (format: source->target)
  const edgeName = edgeId.includes('->') ? edgeId.split('->').map(s => s.split('.').pop()).join('→') : edgeId
  const defaultLabel = changedFields.length === 1
    ? `Edit edge ${changedFields[0]}: ${edgeName}`
    : `Edit edge: ${edgeName}`

  await undoable(
    'graph',
    label || defaultLabel,
    async () => {
      await apiUpdateEdgeMeta(path, edgeId, newMeta)
    },
    async () => {
      const restoreMeta: Partial<EdgeMeta> = {}
      for (const key of changedFields) {
        const oldValue = oldMeta[key as keyof EdgeMeta]
        if (oldValue !== undefined) {
          restoreMeta[key as keyof EdgeMeta] = oldValue as any
        } else {
          if (key === 'notes' || key === 'effect' || key === 'style') {
            restoreMeta[key as keyof EdgeMeta] = '' as any
          }
        }
      }
      await apiUpdateEdgeMeta(path, edgeId, restoreMeta)
    }
  )
}

/**
 * Undoable add node to canvas
 */
export async function addNodeToCanvasUndoable(nodeId: string): Promise<void> {
  const store = getCanvasStore()
  const nodeName = nodeId.split('.').pop() || nodeId

  await undoable(
    'canvas',
    `Add ${nodeName} to canvas`,
    async () => {
      await store.addNode(nodeId)
    },
    async () => {
      await store.removeNode(nodeId)
    }
  )
}

/**
 * Undoable remove node from canvas
 */
export async function removeNodeFromCanvasUndoable(nodeId: string): Promise<void> {
  const store = getCanvasStore()
  const nodeName = nodeId.split('.').pop() || nodeId

  // Capture current position for undo (so we can restore it)
  const oldPosition = store.positions[nodeId]

  await undoable(
    'canvas',
    `Remove ${nodeName} from canvas`,
    async () => {
      await store.removeNode(nodeId)
    },
    async () => {
      await store.addNode(nodeId)
      // Restore position if we had one
      if (oldPosition) {
        store.updatePosition(nodeId, oldPosition.x, oldPosition.y, oldPosition.z)
      }
    }
  )
}

/**
 * Undoable batch add nodes to canvas
 */
export async function addNodesToCanvasUndoable(nodeIds: string[]): Promise<void> {
  if (nodeIds.length === 0) return

  const store = getCanvasStore()

  await undoable(
    'canvas',
    `Add ${nodeIds.length} nodes to canvas`,
    async () => {
      await store.addNodes(nodeIds)
    },
    async () => {
      // Remove each node individually (no batch remove API)
      for (const nodeId of nodeIds) {
        await store.removeNode(nodeId)
      }
    }
  )
}

/**
 * Undoable create custom node
 */
export async function createCustomNodeUndoable(
  id: string,
  name: string
): Promise<void> {
  const store = getCanvasStore()

  await undoable(
    'canvas',
    `Create node "${name}"`,
    async () => {
      await store.addCustomNode(id, name)
    },
    async () => {
      await store.removeCustomNode(id)
    }
  )
}

/**
 * Undoable update custom node (e.g., rename)
 */
export async function updateCustomNodeUndoable(
  nodeId: string,
  newName: string,
  oldName: string
): Promise<void> {
  const store = getCanvasStore()

  await undoable(
    'canvas',
    `Rename "${oldName}" → "${newName}"`,
    async () => {
      await store.updateCustomNode(nodeId, { name: newName })
    },
    async () => {
      await store.updateCustomNode(nodeId, { name: oldName })
    }
  )
}

/**
 * Undoable delete custom node
 *
 * Note: This captures the node data for undo, but edge restoration
 * may not be complete if the node had edges.
 */
export async function deleteCustomNodeUndoable(
  nodeId: string,
  nodeName: string
): Promise<void> {
  const store = getCanvasStore()

  // Capture node data for undo
  const customNode = store.customNodes.find(n => n.id === nodeId)
  if (!customNode) {
    console.warn('[graphActions] Custom node not found for undo capture:', nodeId)
  }

  await undoable(
    'canvas',
    `Delete node "${nodeName}"`,
    async () => {
      await store.removeCustomNode(nodeId)
    },
    async () => {
      // Recreate the custom node
      // Note: This won't restore edges - that would require more complex undo
      if (customNode) {
        await store.addCustomNode(customNode.id, customNode.name)
      }
    }
  )
}

/**
 * Undoable create custom edge
 *
 * The edge is created inside do() so redo works correctly.
 * Edge ID is stored in closure and updated on each redo.
 * Returns same format as store.addCustomEdge for UI compatibility.
 */
export async function createCustomEdgeUndoable(
  source: string,
  target: string,
  existingEdges: Array<{ source: string; target: string }>
): Promise<{ edge: { id: string; source: string; target: string } | null; error?: string }> {
  const store = getCanvasStore()
  const sourceName = source.split('.').pop() || source
  const targetName = target.split('.').pop() || target

  // First check if it would create a cycle (before recording undo)
  // We do a dry-run check here to return error without polluting undo stack
  const testResult = await store.addCustomEdge(source, target, existingEdges)
  if (testResult.error) {
    // Don't record in undo - just return the error
    return { edge: null, error: testResult.error }
  }
  // Remove the test edge immediately
  if (testResult.edge) {
    await store.removeCustomEdge(testResult.edge.id)
  }

  // Mutable closure to track the current edge
  let currentEdge: { id: string; source: string; target: string } | null = null

  const command = {
    id: `create-edge-${Date.now()}`,
    label: `Create edge: ${sourceName}→${targetName}`,
    scope: 'canvas' as const,
    timestamp: Date.now(),
    do: async () => {
      const result = await store.addCustomEdge(source, target, existingEdges)
      if (result.edge) {
        currentEdge = { id: result.edge.id, source: result.edge.source, target: result.edge.target }
      }
    },
    undo: async () => {
      if (currentEdge) {
        await store.removeCustomEdge(currentEdge.id)
      }
    },
  }

  // Execute through history (this calls do() and records for undo)
  await history.execute(command)

  return { edge: currentEdge }
}

/**
 * Undoable delete custom edge
 */
export async function deleteCustomEdgeUndoable(
  edgeId: string,
  source: string,
  target: string,
  existingEdges: Array<{ source: string; target: string }>
): Promise<void> {
  const store = getCanvasStore()
  const sourceName = source.split('.').pop() || source
  const targetName = target.split('.').pop() || target

  await undoable(
    'canvas',
    `Delete edge: ${sourceName}→${targetName}`,
    async () => {
      await store.removeCustomEdge(edgeId)
    },
    async () => {
      // Recreate the edge
      await store.addCustomEdge(source, target, existingEdges)
    }
  )
}

/**
 * Undoable clear canvas
 * Captures all visible nodes and positions for undo
 */
export async function clearCanvasUndoable(): Promise<void> {
  const store = getCanvasStore()

  // Capture current state for undo
  const oldVisibleNodes = [...store.visibleNodes]
  const oldPositions = { ...store.positions }

  if (oldVisibleNodes.length === 0) return

  await undoable(
    'canvas',
    `Clear canvas (${oldVisibleNodes.length} nodes)`,
    async () => {
      await store.clearCanvas()
    },
    async () => {
      // Restore all nodes
      await store.addNodes(oldVisibleNodes)
      // Restore positions
      await store.updatePositions(oldPositions)
    }
  )
}

/**
 * Undoable delete node with meta
 * Note: This is a destructive operation - undo will recreate the node but
 * may not restore all meta perfectly for custom nodes with edges
 */
export async function deleteNodeWithMetaUndoable(
  nodeId: string,
  nodeName: string,
  isCustomNode: boolean,
  customNodeData?: { id: string; name: string; notes?: string; effect?: string; size?: number }
): Promise<void> {
  const store = getCanvasStore()

  // Capture position for restore
  const oldPosition = store.positions[nodeId]

  await undoable(
    'canvas',
    `Delete node "${nodeName}"`,
    async () => {
      await store.deleteNodeWithMeta(nodeId)
    },
    async () => {
      if (isCustomNode && customNodeData) {
        // Recreate custom node
        await store.addCustomNode(customNodeData.id, customNodeData.name)
        // Note: edges are not restored - would need more complex tracking
      } else {
        // For non-custom nodes, just add back to canvas
        await store.addNode(nodeId)
      }
      // Restore position
      if (oldPosition) {
        store.updatePosition(nodeId, oldPosition.x, oldPosition.y, oldPosition.z)
      }
    }
  )
}

/**
 * Graph actions namespace for easy importing
 */
export const graphActions = {
  updateNodeMeta: updateNodeMetaUndoable,
  updateEdgeMeta: updateEdgeMetaUndoable,
  addNodeToCanvas: addNodeToCanvasUndoable,
  removeNodeFromCanvas: removeNodeFromCanvasUndoable,
  addNodesToCanvas: addNodesToCanvasUndoable,
  createCustomNode: createCustomNodeUndoable,
  updateCustomNode: updateCustomNodeUndoable,
  deleteCustomNode: deleteCustomNodeUndoable,
  createCustomEdge: createCustomEdgeUndoable,
  deleteCustomEdge: deleteCustomEdgeUndoable,
  clearCanvas: clearCanvasUndoable,
  deleteNodeWithMeta: deleteNodeWithMetaUndoable,
}

export default graphActions
