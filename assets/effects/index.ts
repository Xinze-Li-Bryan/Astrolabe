import type { NodeEffectProps, EffectMeta } from '../types'

// Effect Components
export { PolyhedronShell } from './PolyhedronShell'
export { OrbitingMoons } from './OrbitingMoons'
export { PulseGlow } from './PulseGlow'
export { SaturnRing } from './SaturnRing'
export { SparkleField } from './SparkleField'
export { EnergyField } from './EnergyField'
export { DoubleRing } from './DoubleRing'
export { Aura } from './Aura'

import { PolyhedronShell } from './PolyhedronShell'
import { OrbitingMoons } from './OrbitingMoons'
import { PulseGlow } from './PulseGlow'
import { SaturnRing } from './SaturnRing'
import { SparkleField } from './SparkleField'
import { EnergyField } from './EnergyField'
import { DoubleRing } from './DoubleRing'
import { Aura } from './Aura'

// Effect registry
export const NODE_EFFECTS: Record<string, React.ComponentType<NodeEffectProps>> = {
  'polyhedron-shell': PolyhedronShell,
  'orbiting-moons': OrbitingMoons,
  'pulse-glow': PulseGlow,
  'saturn-ring': SaturnRing,
  'sparkle-field': SparkleField,
  'energy-field': EnergyField,
  'double-ring': DoubleRing,
  'aura': Aura,
}

// Effect metadata for UI
export const EFFECT_META: EffectMeta[] = [
  {
    id: 'polyhedron-shell',
    name: 'Polyhedron',
    icon: '⬡',
    description: 'Rotating icosahedron wireframe shell',
  },
  {
    id: 'orbiting-moons',
    name: 'Orbiting',
    icon: '🌙',
    description: 'Two moons orbiting around the node',
  },
  {
    id: 'pulse-glow',
    name: 'Pulse',
    icon: '💫',
    description: 'Pulsing glow effect',
  },
  {
    id: 'saturn-ring',
    name: 'Ring',
    icon: '🪐',
    description: 'Saturn-like tilted ring',
  },
  {
    id: 'sparkle-field',
    name: 'Sparkle',
    icon: '✨',
    description: 'Sparkling particles around the node',
  },
  {
    id: 'energy-field',
    name: 'Energy',
    icon: '◎',
    description: 'Expanding energy rings',
  },
  {
    id: 'double-ring',
    name: 'Cross',
    icon: '⊗',
    description: 'Two crossed rotating rings',
  },
  {
    id: 'aura',
    name: 'Aura',
    icon: '○',
    description: 'Soft breathing glow aura',
  },
]

// Helper function
export function getNodeEffect(effectId: string | undefined) {
  if (!effectId) return null
  return NODE_EFFECTS[effectId] || null
}
