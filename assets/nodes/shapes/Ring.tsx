import { Ring as DreiRing } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Ring3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiRing args={[size * 0.5, size, 24]}>
      <meshStandardMaterial
        color={color}
        side={2}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiRing>
  )
}

export function Ring2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'ring',
    size: size * 10,
    color: color,
  }
}
