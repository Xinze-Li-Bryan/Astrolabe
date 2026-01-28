'use client'

/**
 * LensIndicator - Status bar indicator showing active lens
 *
 * Shows the currently active lens with a click-to-open-settings interaction.
 * Also shows focus node for lenses that require one.
 * Click to open LensSettingsPanel popover with lens-specific options.
 */

import { useState, useRef } from 'react'
import { useLensStore, selectActiveLens, selectIsAwaitingFocus } from '@/lib/lensStore'
import { LensSettingsPanel } from './LensSettingsPanel'

// Icon mapping
const LENS_ICONS: Record<string, string> = {
  network: '🌐',
  boxes: '📦',
  target: '🎯',
  'arrow-down': '⬇️',
  'arrow-up': '⬆️',
}

interface LensIndicatorProps {
  onOpenLensPicker?: () => void
  className?: string
}

export function LensIndicator({ onOpenLensPicker, className = '' }: LensIndicatorProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const activeLensId = useLensStore(state => state.activeLensId)
  const isAwaitingFocus = useLensStore(selectIsAwaitingFocus)
  const lensFocusNodeId = useLensStore(state => state.lensFocusNodeId)
  const lens = useLensStore(selectActiveLens)

  if (!lens) return null

  const icon = LENS_ICONS[lens.icon] || '📊'

  const handleClick = () => {
    if (isAwaitingFocus) {
      // If awaiting focus, don't open settings - user should click a node
      return
    }
    setIsSettingsOpen(!isSettingsOpen)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`flex items-center gap-2 px-3 py-1.5 bg-gray-800/80 hover:bg-gray-700/80 rounded-lg border border-gray-700 transition-colors ${
          isSettingsOpen ? 'bg-gray-700/80 border-purple-500/50' : ''
        } ${className}`}
        title={isAwaitingFocus ? 'Click a node to set focus' : 'Lens settings'}
      >
        <span className="text-sm">{icon}</span>
        <span className="text-sm text-white font-medium">{lens.name}</span>

        {isAwaitingFocus && (
          <span className="px-1.5 py-0.5 text-xs bg-purple-600/50 text-purple-300 rounded animate-pulse">
            Select node...
          </span>
        )}

        {!isAwaitingFocus && lens.requiresFocus && lensFocusNodeId && (
          <span className="text-xs text-gray-400 max-w-[120px] truncate">
            @ {lensFocusNodeId.split('.').pop()}
          </span>
        )}

        {!isAwaitingFocus && (
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform ${isSettingsOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      <LensSettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenLensPicker={() => {
          setIsSettingsOpen(false)
          onOpenLensPicker?.()
        }}
        anchorRef={buttonRef as React.RefObject<HTMLElement>}
      />
    </div>
  )
}

export default LensIndicator
