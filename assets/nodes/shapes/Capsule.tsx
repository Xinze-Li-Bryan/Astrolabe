import { Capsule as DreiCapsule } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Capsule3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiCapsule args={[size * 0.5, size, 8, 16]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiCapsule>
  )
}

export function Capsule2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'circle',
    size: size * 10,
    color: color,
  }
}
