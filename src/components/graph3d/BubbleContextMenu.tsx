'use client'

/**
 * BubbleContextMenu - Right-click context menu for namespace bubble nodes
 *
 * Provides actions for expanding, collapsing, focusing, and showing all nodes
 * in a namespace group. Includes performance warnings for large groups.
 */

import { useCallback } from 'react'
import { useLensStore } from '@/lib/lensStore'

export interface BubbleContextMenuProps {
  // Position
  x: number
  y: number

  // Group info
  groupId: string
  namespace: string
  nodeCount: number
  isExpanded: boolean

  // Callbacks
  onClose: () => void
}

// Warning threshold for "Show All" action
const SHOW_ALL_WARNING_THRESHOLD = 100

export function BubbleContextMenu({
  x,
  y,
  groupId,
  namespace,
  nodeCount,
  isExpanded,
  onClose,
}: BubbleContextMenuProps) {
  const toggleGroupExpanded = useLensStore(state => state.toggleGroupExpanded)
  const clearExpandedGroups = useLensStore(state => state.clearExpandedGroups)
  const setLensFocusNode = useLensStore(state => state.setLensFocusNode)
  const setActiveLens = useLensStore(state => state.setActiveLens)

  // Expand this group (shows sub-namespace bubbles)
  const handleExpand = useCallback(() => {
    toggleGroupExpanded(groupId)
    onClose()
  }, [groupId, toggleGroupExpanded, onClose])

  // Collapse this group
  const handleCollapse = useCallback(() => {
    toggleGroupExpanded(groupId)
    onClose()
  }, [groupId, toggleGroupExpanded, onClose])

  // Focus on this namespace (switch to ego lens centered on a representative node)
  const handleFocus = useCallback(() => {
    // For now, just close - we'll need the actual node IDs to implement this properly
    // TODO: Pass in a representative nodeId from the group
    onClose()
  }, [onClose])

  // Show all nodes (with warning for large groups)
  const handleShowAll = useCallback(() => {
    if (nodeCount > SHOW_ALL_WARNING_THRESHOLD) {
      const confirmed = window.confirm(
        `This namespace contains ${nodeCount} nodes. Showing all may cause performance issues. Continue?`
      )
      if (!confirmed) {
        onClose()
        return
      }
    }
    // Switch to full lens to show everything
    setActiveLens('full')
    onClose()
  }, [nodeCount, setActiveLens, onClose])

  // Collapse all - reset to top-level namespace bubbles
  const handleCollapseAll = useCallback(() => {
    clearExpandedGroups()
    onClose()
  }, [clearExpandedGroups, onClose])

  // Get last segment of namespace for display
  const shortName = namespace.split('.').pop() || namespace

  return (
    <div
      className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700">
        <div className="text-sm font-medium text-white truncate max-w-[200px]">
          {shortName}
        </div>
        <div className="text-xs text-gray-400">
          {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
        </div>
      </div>

      {/* Actions */}
      <div className="py-1">
        {!isExpanded ? (
          <button
            onClick={handleExpand}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-2"
          >
            <span className="text-gray-500">▶</span>
            Expand
          </button>
        ) : (
          <button
            onClick={handleCollapse}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-2"
          >
            <span className="text-gray-500">▼</span>
            Collapse
          </button>
        )}

        <button
          onClick={handleFocus}
          className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-2"
          disabled
          title="Coming soon"
        >
          <span className="text-gray-500">🎯</span>
          <span className="text-gray-500">Focus (coming soon)</span>
        </button>

        <div className="border-t border-gray-700 my-1" />

        <button
          onClick={handleCollapseAll}
          className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-2"
        >
          <span className="text-gray-500">⏪</span>
          Collapse All
        </button>

        <button
          onClick={handleShowAll}
          className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-2"
        >
          <span className="text-gray-500">👁</span>
          Show All
          {nodeCount > SHOW_ALL_WARNING_THRESHOLD && (
            <span className="ml-auto text-xs text-yellow-500">⚠️</span>
          )}
        </button>
      </div>
    </div>
  )
}

export default BubbleContextMenu
