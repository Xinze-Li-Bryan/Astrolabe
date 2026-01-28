/**
 * useLensPickerShortcut - Keyboard shortcut hook for lens picker
 *
 * Listens for Cmd+K (Mac) or Ctrl+K (Windows/Linux) to toggle the lens picker.
 */

import { useEffect, useCallback, useState } from 'react'

export function useLensPickerShortcut() {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K on Mac, Ctrl+K on Windows/Linux
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggle()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggle])

  return { isOpen, open, close, toggle }
}

export default useLensPickerShortcut
