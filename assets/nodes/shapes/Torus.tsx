import { Torus as DreiTorus } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Torus3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiTorus args={[size, size * 0.4, 12, 24]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiTorus>
  )
}

export function Torus2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'ring',
    size: size * 10,
    color: color,
  }
}
