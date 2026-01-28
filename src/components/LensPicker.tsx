'use client'

/**
 * LensPicker - Cmd+K style lens selection dialog
 *
 * A command palette for switching between graph lenses.
 * Appears when user presses Cmd+K (or Ctrl+K on Windows/Linux).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { LENSES, isLensAvailable } from '@/lib/lenses/presets'
import { useLensStore } from '@/lib/lensStore'
import type { Lens } from '@/lib/lenses/types'

// Icon mapping (using simple emoji for now, can be replaced with lucide icons)
const LENS_ICONS: Record<string, string> = {
  network: '🌐',
  boxes: '📦',
  target: '🎯',
  'arrow-down': '⬇️',
  'arrow-up': '⬆️',
}

interface LensPickerProps {
  isOpen: boolean
  onClose: () => void
  nodeCount?: number
}

export function LensPicker({ isOpen, onClose, nodeCount = 0 }: LensPickerProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const setActiveLens = useLensStore(state => state.setActiveLens)
  const activeLensId = useLensStore(state => state.activeLensId)

  // Filter lenses by query and availability
  const filteredLenses = useMemo(() => {
    const available = LENSES.filter(lens => isLensAvailable(lens.id))
    if (!query.trim()) return available

    const q = query.toLowerCase()
    return available.filter(
      lens =>
        lens.name.toLowerCase().includes(q) ||
        lens.description.toLowerCase().includes(q)
    )
  }, [query])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setQuery('')
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  const selectLens = useCallback(
    (lens: Lens) => {
      setActiveLens(lens.id)
      onClose()
    },
    [setActiveLens, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(i => Math.min(i + 1, filteredLenses.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(i => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredLenses[selectedIndex]) {
            selectLens(filteredLenses[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [filteredLenses, selectedIndex, selectLens, onClose]
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center px-4 py-3 border-b border-gray-700">
          <span className="text-gray-400 mr-3">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search lenses..."
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-lg"
          />
          <kbd className="px-2 py-1 text-xs text-gray-400 bg-gray-800 rounded">
            esc
          </kbd>
        </div>

        {/* Lens list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filteredLenses.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No lenses found
            </div>
          ) : (
            filteredLenses.map((lens, index) => {
              const isSelected = index === selectedIndex
              const isActive = lens.id === activeLensId
              const icon = LENS_ICONS[lens.icon] || '📊'

              // Check if lens is recommended for current graph size
              const isRecommended =
                nodeCount > 0 &&
                lens.recommendedWhen &&
                (lens.recommendedWhen.minNodes === undefined ||
                  nodeCount >= lens.recommendedWhen.minNodes) &&
                (lens.recommendedWhen.maxNodes === undefined ||
                  nodeCount <= lens.recommendedWhen.maxNodes)

              return (
                <button
                  key={lens.id}
                  onClick={() => selectLens(lens)}
                  className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-colors ${
                    isSelected
                      ? 'bg-purple-600/30'
                      : 'hover:bg-gray-800'
                  }`}
                >
                  {/* Icon */}
                  <span className="text-2xl">{icon}</span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{lens.name}</span>
                      {isActive && (
                        <span className="px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded">
                          Active
                        </span>
                      )}
                      {isRecommended && !isActive && (
                        <span className="px-1.5 py-0.5 text-xs bg-green-600/50 text-green-300 rounded">
                          Recommended
                        </span>
                      )}
                      {lens.requiresFocus && (
                        <span className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">
                          Needs focus
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 truncate">
                      {lens.description}
                    </p>
                  </div>

                  {/* Layout indicator */}
                  <span className="text-xs text-gray-500 uppercase">
                    {lens.layout}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded mr-1">↑↓</kbd>
            Navigate
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded mx-1 ml-3">↵</kbd>
            Select
          </span>
          <span>{nodeCount > 0 ? `${nodeCount} nodes` : ''}</span>
        </div>
      </div>
    </div>
  )
}

export default LensPicker
