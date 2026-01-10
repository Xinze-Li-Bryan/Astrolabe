'use client'

import { useState, useCallback, useEffect } from 'react'
import { EDGE_STYLE_META, EDGE_EFFECT_META } from '@/../assets'

interface EdgeStylePanelProps {
    edgeId: string | null
    sourceNode?: string
    targetNode?: string
    initialWidth?: number
    initialStyle?: string
    initialEffect?: string
    defaultStyle?: string  // 该边的默认样式（custom edge 为 'dashed'，普通边为 'solid'）
    onStyleChange: (edgeId: string, style: { effect?: string; width?: number; style?: string }) => void
    compact?: boolean
}

const DEFAULT_WIDTH = 1.0

// SVG Icons for edge styles
const StyleIcons: Record<string, React.ReactNode> = {
    'solid': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="12" x2="20" y2="12" />
        </svg>
    ),
    'dashed': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2">
            <line x1="4" y1="12" x2="20" y2="12" />
        </svg>
    ),
    'dotted': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="1 3" strokeLinecap="round">
            <line x1="4" y1="12" x2="20" y2="12" />
        </svg>
    ),
    'wavy': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12 Q7 8, 10 12 T16 12 T22 12" />
        </svg>
    ),
    'zigzag': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4,12 7,8 10,14 13,8 16,14 19,8 22,12" />
        </svg>
    ),
    'spring': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12 C6 8, 8 16, 10 12 C12 8, 14 16, 16 12 C18 8, 20 16, 22 12" />
        </svg>
    ),
}

// SVG Icons for edge effects
const EffectIcons: Record<string, React.ReactNode> = {
    'flowing-particles': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="4" y1="12" x2="20" y2="12" opacity="0.3" />
            <circle cx="7" cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.7" />
            <circle cx="17" cy="12" r="1.5" fill="currentColor" opacity="0.4" />
        </svg>
    ),
    'energy-pulse': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="4" y1="12" x2="20" y2="12" opacity="0.3" />
            <circle cx="10" cy="12" r="3" opacity="0.6" />
            <circle cx="10" cy="12" r="1.5" fill="currentColor" />
        </svg>
    ),
    'glow-line': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="4" y1="12" x2="20" y2="12" strokeWidth="4" opacity="0.2" />
            <line x1="4" y1="12" x2="20" y2="12" strokeWidth="2" opacity="0.5" />
            <line x1="4" y1="12" x2="20" y2="12" strokeWidth="1" />
        </svg>
    ),
    'lightning': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="4,12 7,10 9,13 11,10 13,13 15,10 17,13 20,12" />
            <polyline points="4,12 7,10 9,13 11,10 13,13 15,10 17,13 20,12" opacity="0.4" strokeWidth="3" />
        </svg>
    ),
    'sparkle': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="4" y1="12" x2="20" y2="12" opacity="0.3" />
            <circle cx="6" cy="12" r="1" fill="currentColor" />
            <circle cx="10" cy="11" r="0.8" fill="currentColor" opacity="0.6" />
            <circle cx="14" cy="13" r="1.2" fill="currentColor" opacity="0.8" />
            <circle cx="18" cy="12" r="0.8" fill="currentColor" opacity="0.5" />
        </svg>
    ),
    'data-stream': (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="4" y1="12" x2="20" y2="12" opacity="0.3" />
            <rect x="5" y="10" width="3" height="3" fill="currentColor" rx="0.5" />
            <rect x="10" y="10" width="3" height="3" fill="currentColor" rx="0.5" opacity="0.7" />
            <rect x="15" y="10" width="3" height="3" fill="currentColor" rx="0.5" opacity="0.4" />
        </svg>
    ),
}

export default function EdgeStylePanel({
    edgeId,
    sourceNode,
    targetNode,
    initialWidth = DEFAULT_WIDTH,
    initialStyle = 'solid',
    initialEffect,
    defaultStyle = 'solid',
    onStyleChange,
    compact = false
}: EdgeStylePanelProps) {
    const [editWidth, setEditWidth] = useState(initialWidth)
    const [editStyle, setEditStyle] = useState(initialStyle)
    const [editEffect, setEditEffect] = useState<string | undefined>(initialEffect)

    // Sync with external changes
    useEffect(() => {
        setEditWidth(initialWidth)
        setEditStyle(initialStyle)
        setEditEffect(initialEffect)
    }, [initialWidth, initialStyle, initialEffect, edgeId])

    // Handle style change
    const handleStyleChange = useCallback((styleId: string) => {
        setEditStyle(styleId)
        if (edgeId) {
            onStyleChange(edgeId, {
                style: styleId,
                width: editWidth !== DEFAULT_WIDTH ? editWidth : undefined,
                effect: editEffect
            })
        }
    }, [edgeId, editWidth, editEffect, onStyleChange])

    // Handle effect change
    const handleEffectChange = useCallback((effectId: string | undefined) => {
        setEditEffect(effectId)
        if (edgeId) {
            onStyleChange(edgeId, {
                // Send empty string to delete effect, undefined is ignored
                effect: effectId === undefined ? '' : effectId,
                width: editWidth !== DEFAULT_WIDTH ? editWidth : undefined,
                style: editStyle !== defaultStyle ? editStyle : undefined
            })
        }
    }, [edgeId, editWidth, editStyle, defaultStyle, onStyleChange])

    // Handle width change
    const handleWidthChange = useCallback((width: number) => {
        setEditWidth(width)
        if (edgeId) {
            onStyleChange(edgeId, {
                width: width !== DEFAULT_WIDTH ? width : undefined,
                style: editStyle !== defaultStyle ? editStyle : undefined,
                effect: editEffect
            })
        }
    }, [edgeId, editStyle, editEffect, defaultStyle, onStyleChange])

    // Reset to default - send empty string/sentinel to signal deletion
    // Also reset UI button state to this edge's default style
    const handleReset = useCallback(() => {
        setEditWidth(DEFAULT_WIDTH)
        setEditStyle(defaultStyle)  // Use this edge's default style (custom edge is 'dashed')
        setEditEffect(undefined)
        if (edgeId) {
            // Send empty string or -1 to indicate deletion of these properties
            onStyleChange(edgeId, { width: -1, style: '', effect: '' })
        }
    }, [edgeId, defaultStyle, onStyleChange])

    if (!edgeId) return null

    return (
        <div className={`space-y-${compact ? '3' : '4'}`}>
            {/* Style Section */}
            <div>
                <div className="text-xs text-white/60 mb-1.5">Style</div>
                <div className="flex gap-1.5">
                    {EDGE_STYLE_META.map((style) => (
                        <button
                            key={style.id}
                            onClick={() => handleStyleChange(style.id)}
                            className={`flex items-center justify-center w-9 h-9 rounded border transition-colors ${
                                editStyle === style.id
                                    ? 'bg-cyan-500/30 border-cyan-400/50 text-white'
                                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                            }`}
                            title={style.name}
                        >
                            {StyleIcons[style.id] || <span className="text-sm">{style.icon}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Effect Section - click selected effect to clear */}
            <div>
                <div className="text-xs text-white/60 mb-1.5">Effect</div>
                <div className="flex gap-1.5">
                    {EDGE_EFFECT_META.map((effect) => (
                        <button
                            key={effect.id}
                            onClick={() => handleEffectChange(editEffect === effect.id ? undefined : effect.id)}
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
