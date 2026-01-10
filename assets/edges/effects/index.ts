import type { EdgeEffectProps, EffectMeta } from '../../types'

// Effect Components
export { FlowingParticles } from './FlowingParticles'
export { EnergyPulse } from './EnergyPulse'
export { GlowLine } from './GlowLine'
export { Lightning } from './Lightning'
export { Sparkle } from './Sparkle'
export { DataStream } from './DataStream'

import { FlowingParticles } from './FlowingParticles'
import { EnergyPulse } from './EnergyPulse'
import { GlowLine } from './GlowLine'
import { Lightning } from './Lightning'
import { Sparkle } from './Sparkle'
import { DataStream } from './DataStream'

// Effect registry
export const EDGE_EFFECTS: Record<string, React.ComponentType<EdgeEffectProps>> = {
  'flowing-particles': FlowingParticles,
  'energy-pulse': EnergyPulse,
  'glow-line': GlowLine,
  'lightning': Lightning,
  'sparkle': Sparkle,
  'data-stream': DataStream,
}

// Effect metadata for UI
export const EDGE_EFFECT_META: EffectMeta[] = [
  {
    id: 'flowing-particles',
    name: 'Flow',
    icon: '✨',
    description: 'Flowing particles along the edge',
  },
  {
    id: 'energy-pulse',
    name: 'Pulse',
    icon: '⚡',
    description: 'Energy pulse traveling along the edge',
  },
  {
    id: 'glow-line',
    name: 'Glow',
    icon: '💡',
    description: 'Breathing glow effect',
  },
  {
    id: 'lightning',
    name: 'Lightning',
    icon: '⚡',
    description: 'Electric arc flickering effect',
  },
  {
    id: 'sparkle',
    name: 'Sparkle',
    icon: '✦',
    description: 'Sparkling stars along the edge',
  },
  {
    id: 'data-stream',
    name: 'Data',
    icon: '▣',
    description: 'Digital data blocks flowing',
  },
]

// Helper function
export function getEdgeEffect(effectId: string | undefined) {
  if (!effectId) return null
  return EDGE_EFFECTS[effectId] || null
}
