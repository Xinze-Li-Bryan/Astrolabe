'use client'

/**
 * LensSettingsPanel - Generic settings panel for active lens
 *
 * Renders lens-specific settings based on the lens definition's settings schema.
 * Also handles focus node display and re-selection for lenses that require focus.
 */

import { useRef, useEffect } from 'react'
import { useLensStore, selectActiveLens } from '@/lib/lensStore'
import type { LensSetting, LensOptions } from '@/lib/lenses/types'

// Icon mapping (same as LensIndicator)
const LENS_ICONS: Record<string, string> = {
  network: '🌐',
  boxes: '📦',
  target: '🎯',
  'arrow-down': '⬇️',
  'arrow-up': '⬆️',
}

interface LensSettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  onOpenLensPicker: () => void
  anchorRef?: React.RefObject<HTMLElement>
}

export function LensSettingsPanel({
  isOpen,
  onClose,
  onOpenLensPicker,
  anchorRef,
}: LensSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const lens = useLensStore(selectActiveLens)
  const options = useLensStore(state => state.options)
  const setLensOptions = useLensStore(state => state.setLensOptions)
  const lensFocusNodeId = useLensStore(state => state.lensFocusNodeId)
  const setActivationState = useLensStore(state => state.setActiveLens)

  // Request focus change - re-enter awaiting-focus mode
  const requestFocusChange = () => {
    if (lens?.requiresFocus) {
      // Clear focus and re-enter awaiting state
      useLensStore.setState({
        lensFocusNodeId: null,
        activationState: 'awaiting-focus'
      })
      onClose()
    }
  }

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose()
      }
    }

    // Delay to avoid immediate close from the click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose, anchorRef])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen || !lens) return null

  const icon = LENS_ICONS[lens.icon] || '📊'
  const hasSettings = lens.settings && lens.settings.length > 0
  const hasFocus = lens.requiresFocus

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-0 mt-2 z-50 min-w-[240px] bg-gray-900/95 backdrop-blur-sm rounded-lg border border-gray-700 shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-sm font-medium text-white">{lens.name}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Focus Node Section (for lenses that require focus) */}
      {hasFocus && (
        <div className="px-3 py-2 border-b border-gray-700/50">
          <div className="text-xs text-gray-400 mb-1.5">Focus Node</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 text-sm text-white truncate font-mono">
              {lensFocusNodeId ? (
                lensFocusNodeId.split('.').slice(-2).join('.')
              ) : (
                <span className="text-gray-500 italic">None selected</span>
              )}
            </div>
            <button
              onClick={requestFocusChange}
              className="px-2 py-1 text-xs bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded transition-colors"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {/* Settings Section */}
      {hasSettings && (
        <div className="px-3 py-2 space-y-3">
          {lens.settings!.map(setting => (
            <SettingControl
              key={setting.key}
              setting={setting}
              value={options[setting.key]}
              onChange={(value) => setLensOptions({ [setting.key]: value })}
            />
          ))}
        </div>
      )}

      {/* No settings message */}
      {!hasSettings && !hasFocus && (
        <div className="px-3 py-3 text-sm text-gray-400 text-center">
          No settings for this lens
        </div>
      )}

      {/* Footer - Switch lens */}
      <div className="px-3 py-2 border-t border-gray-700/50">
        <button
          onClick={() => {
            onClose()
            onOpenLensPicker()
          }}
          className="w-full flex items-center justify-between px-2 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-800/50 rounded transition-colors"
        >
          <span>Switch lens...</span>
          <kbd className="px-1.5 py-0.5 text-xs text-gray-500 bg-gray-800 rounded">
            ⌘K
          </kbd>
        </button>
      </div>
    </div>
  )
}

// Individual setting control renderer
interface SettingControlProps {
  setting: LensSetting
  value: unknown
  onChange: (value: unknown) => void
}

function SettingControl({ setting, value, onChange }: SettingControlProps) {
  const { label, type, min = 1, max = 10, step = 1, options: selectOptions } = setting
  const currentValue = (value as number) ?? min

  if (type === 'slider') {
    const range = max - min
    const percentage = ((currentValue - min) / range) * 100

    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">{label}</span>
          <span className="text-xs text-white font-mono">{currentValue}</span>
        </div>
        {/* Button row for discrete values */}
        <div className="flex gap-1">
          {Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => {
            const btnValue = min + i * step
            return (
              <button
                key={btnValue}
                onClick={() => onChange(btnValue)}
                className={`flex-1 py-1 text-xs rounded transition-colors ${
                  currentValue === btnValue
                    ? 'bg-purple-500/40 text-purple-200'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {btnValue}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (type === 'select' && selectOptions) {
    return (
      <div>
        <div className="text-xs text-gray-400 mb-1.5">{label}</div>
        <div className="flex gap-1 flex-wrap">
          {selectOptions.map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => onChange(opt.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                value === opt.value
                  ? 'bg-purple-500/40 text-purple-200'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'toggle') {
    const isOn = Boolean(value)
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{label}</span>
        <button
          onClick={() => onChange(!isOn)}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            isOn ? 'bg-purple-500' : 'bg-gray-700'
          }`}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              isOn ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    )
  }

  return null
}

export default LensSettingsPanel
