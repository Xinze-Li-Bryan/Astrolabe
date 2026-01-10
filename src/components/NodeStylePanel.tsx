'use client'

import { useState, useCallback, useEffect } from 'react'
import { EFFECT_META } from '@/../assets'

interface NodeStylePanelProps {
    nodeId: string | null
    initialSize?: number
    initialEffect?: string
    onStyleChange: (nodeId: string, style: { effect?: string; size?: number }) => void
    compact?: boolean
}

const DEFAULT_SIZE = 1.0

// SVG Icons for effects
const EffectIcons: Record<string, React.ReactNode> = {
    'polyhedron-shell': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" />
            <line x1="12" y1="2" x2="12" y2="22" />
            <line x1="2" y1="8" x2="22" y2="16" />
            <line x1="22" y1="8" x2="2" y2="16" />
        </svg>
    ),
    'orbiting-moons': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="4" />
            <ellipse cx="12" cy="12" rx="10" ry="4" />
            <circle cx="20" cy="10" r="2" fill="currentColor" />
            <circle cx="4" cy="14" r="1.5" fill="currentColor" />
        </svg>
    ),
    'pulse-glow': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <circle cx="12" cy="12" r="6" opacity="0.6" />
            <circle cx="12" cy="12" r="9" opacity="0.3" />
        </svg>
    ),
    'saturn-ring': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="5" />
            <ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(-20 12 12)" />
        </svg>
    ),
    'sparkle-field': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <circle cx="6" cy="6" r="1.5" fill="currentColor" />
            <circle cx="18" cy="6" r="1" fill="currentColor" opacity="0.7" />
            <circle cx="5" cy="16" r="1" fill="currentColor" opacity="0.5" />
            <circle cx="19" cy="17" r="1.5" fill="currentColor" opacity="0.8" />
            <circle cx="12" cy="4" r="0.8" fill="currentColor" opacity="0.6" />
            <circle cx="12" cy="20" r="1" fill="currentColor" opacity="0.4" />
        </svg>
    ),
    'energy-field': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="6" opacity="0.6" strokeDasharray="3 2" />
            <circle cx="12" cy="12" r="9" opacity="0.3" strokeDasharray="4 2" />
        </svg>
    ),
    'double-ring': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(45 12 12)" />
            <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-45 12 12)" />
        </svg>
    ),
    'aura': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" stroke="none">
            <circle cx="12" cy="12" r="9" opacity="0.15" />
            <circle cx="12" cy="12" r="6" opacity="0.25" />
            <circle cx="12" cy="12" r="3" opacity="0.5" />
        </svg>
    ),
}

export default function NodeStylePanel({
    nodeId,
    initialSize = DEFAULT_SIZE,
    initialEffect,
    onStyleChange,
    compact = false
}: NodeStylePanelProps) {
    const [editSize, setEditSize] = useState(initialSize)
    const [editEffect, setEditEffect] = useState<string | undefined>(initialEffect)

    // Sync with external changes
    useEffect(() => {
        setEditSize(initialSize)
        setEditEffect(initialEffect)
    }, [initialSize, initialEffect, nodeId])

    // Handle effect change
    const handleEffectChange = useCallback((effectId: string | undefined) => {
        setEditEffect(effectId)
        if (nodeId) {
            onStyleChange(nodeId, {
                effect: effectId,
                size: editSize !== DEFAULT_SIZE ? editSize : undefined
            })
        }
    }, [nodeId, editSize, onStyleChange])

    // Handle size change
    const handleSizeChange = useCallback((size: number) => {
        setEditSize(size)
        if (nodeId) {
            onStyleChange(nodeId, {
                size: size !== DEFAULT_SIZE ? size : undefined,
                effect: editEffect
            })
        }
    }, [nodeId, editEffect, onStyleChange])

    // Reset to default - send empty string to signal deletion
    const handleReset = useCallback(() => {
        setEditSize(DEFAULT_SIZE)
        setEditEffect(undefined)
        if (nodeId) {
            // Send empty string to indicate deletion of these properties
            onStyleChange(nodeId, { size: -1, effect: '' })
        }
    }, [nodeId, onStyleChange])

    if (!nodeId) return null

    return (
        <div className={compact ? 'space-y-3' : 'space-y-4'}>
            {/* Effect Section - click selected effect to clear */}
            <div>
                <div className="text-xs text-white/60 mb-1.5">Effect</div>
                <div className="flex gap-1.5">
                    {EFFECT_META.map((effect) => (
                        <button
                            key={effect.id}
                            onClick={() => handleEffectChange(editEffect === effect.id ? '' : effect.id)}
                            className={`flex items-center justify-center w-9 h-9 rounded border transition-colors ${
                                editEffect === effect.id
                                    ? 'bg-pink-500/30 border-pink-400/50 text-white'
                                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                            }`}
                            title={editEffect === effect.id ? 'Click to remove effect' : effect.description}
                        >
                            {EffectIcons[effect.id] || <span className="text-sm">{effect.icon}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Size Section */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-white/60">Size</span>
                    <span className="text-xs text-white/80 font-mono">{editSize.toFixed(1)}x</span>
                </div>
                <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={editSize}
                    onChange={(e) => handleSizeChange(Number(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-4
                        [&::-webkit-slider-thumb]:h-4
                        [&::-webkit-slider-thumb]:bg-white
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-webkit-slider-thumb]:shadow-md"
                />
                <div className="flex justify-between text-[10px] text-white/30 mt-0.5">
                    <span>0.5x</span>
                    <span>2.0x</span>
                </div>
            </div>

            {/* Reset Button */}
            <div className="pt-1">
                <button
                    onClick={handleReset}
                    className="w-full px-2 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/60 hover:text-white/80 rounded transition-colors"
                >
                    Reset to Default
                </button>
            </div>
        </div>
    )
}
