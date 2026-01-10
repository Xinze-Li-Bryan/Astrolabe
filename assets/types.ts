export type ViewType = '3d' | '2d'

// 3D Node Component Props
export interface NodeShape3DProps {
  size: number
  color: string
  isSelected?: boolean  // glow when selected
}

// 2D Node Config (Sigma.js)
export interface NodeShape2DConfig {
  type: string
  size: number
  color: string
}

// 3D Edge Component Props
export interface EdgeStyle3DProps {
  start: [number, number, number]
  end: [number, number, number]
  color: string
  width: number
  // Optional: for dynamic position updates
  positionsRef?: React.MutableRefObject<Map<string, [number, number, number]>>
  source?: string
  target?: string
}

// 2D Edge Config (Sigma.js)
export interface EdgeStyle2DConfig {
  type: string
  color: string
  size: number
}

// Node Effect Props
export interface NodeEffectProps {
  size: number      // node size
  color: string     // primary color
}

// Edge Effect Props
export interface EdgeEffectProps {
  start: [number, number, number]   // start position
  end: [number, number, number]     // end position
  color: string                     // color
  width: number                     // line width
}

// Effect metadata (for UI display)
export interface EffectMeta {
  id: string
  name: string
  icon: string      // emoji or icon name
  description: string
}
