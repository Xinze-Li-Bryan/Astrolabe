import { Cone as DreiCone } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Cone3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiCone args={[size, size * 1.5, 32]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiCone>
  )
}

export function Cone2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'triangle',
    size: size * 10,
    color: color,
  }
}
