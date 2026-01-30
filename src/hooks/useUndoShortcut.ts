/**
 * useUndoShortcut - Global keyboard handler for Cmd+Z / Cmd+Shift+Z
 *
 * Respects focus context:
 * - If Monaco editor has focus → let Monaco handle it
 * - If input/textarea/contenteditable has focus → let browser handle it
 * - Otherwise → use our HistoryManager
 */

import { useEffect, useState, useCallback } from 'react'
import { history } from '@/lib/history'
import type { HistoryState } from '@/lib/history'

/**
 * Check if the active element should handle its own undo
 */
function shouldDeferToElement(): boolean {
  const active = document.activeElement
  if (!active) return false

  // Check for Monaco editor (has specific class or data attribute)
  if (
    active.closest('.monaco-editor') ||
    active.closest('[data-monaco-editor]')
  ) {
    return true
  }

  // Check for native form elements
  const tagName = active.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea') {
    return true
  }

  // Check for contenteditable
  if (active.getAttribute('contenteditable') === 'true') {
    return true
  }

  return false
}

export function useUndoShortcut() {
  const [historyState, setHistoryState] = useState<HistoryState>(() => history.getState())

  // Subscribe to history changes
  useEffect(() => {
    return history.subscribe(setHistoryState)
  }, [])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      if (!modKey || e.key.toLowerCase() !== 'z') return

      // Let focused elements handle their own undo
      if (shouldDeferToElement()) {
        console.log('[useUndoShortcut] Deferring to focused element:', document.activeElement)
        return
      }

      e.preventDefault()

      if (e.shiftKey) {
        // Cmd+Shift+Z → Redo
        console.log('[useUndoShortcut] Cmd+Shift+Z → redo()')
        await history.redo()
      } else {
        // Cmd+Z → Undo
        console.log('[useUndoShortcut] Cmd+Z → undo()', history.getState())
        await history.undo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Also handle Ctrl+Y for redo (Windows convention)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      if (isMac) return // Mac doesn't use Ctrl+Y

      if (!e.ctrlKey || e.key.toLowerCase() !== 'y') return
      if (shouldDeferToElement()) return

      e.preventDefault()
      await history.redo()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Return state and manual triggers for UI buttons
  const undo = useCallback(() => history.undo(), [])
  const redo = useCallback(() => history.redo(), [])

  return {
    ...historyState,
    undo,
    redo,
  }
}

export default useUndoShortcut
