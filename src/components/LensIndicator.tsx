'use client'

/**
 * LensIndicator - Status bar indicator showing active lens
 *
 * Shows the currently active lens with a click-to-change interaction.
 * Also shows focus node for lenses that require one.
 */

import { useLensStore, selectActiveLens, selectIsAwaitingFocus } from '@/lib/lensStore'
import { LENSES_BY_ID } from '@/lib/lenses/presets'

// Icon mapping
const LENS_ICONS: Record<string, string> = {
  network: '🌐',
  boxes: '📦',
  target: '🎯',
  'arrow-down': '⬇️',
  'arrow-up': '⬆️',
}

interface LensIndicatorProps {
  onClick?: () => void
  className?: string
}

export function LensIndicator({ onClick, className = '' }: LensIndicatorProps) {
  const activeLensId = useLensStore(state => state.activeLensId)
  const isAwaitingFocus = useLensStore(selectIsAwaitingFocus)
  const lensFocusNodeId = useLensStore(state => state.lensFocusNodeId)

  const lens = LENSES_BY_ID.get(activeLensId)
  if (!lens) return null

  const icon = LENS_ICONS[lens.icon] || '📊'

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 bg-gray-800/80 hover:bg-gray-700/80 rounded-lg border border-gray-700 transition-colors ${className}`}
      title="Change lens (Cmd+K)"
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

      <kbd className="px-1.5 py-0.5 text-xs text-gray-400 bg-gray-900 rounded ml-1">
        ⌘K
      </kbd>
    </button>
  )
}

export default LensIndicator
