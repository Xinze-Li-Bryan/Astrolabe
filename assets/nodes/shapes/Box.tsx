import { Box as DreiBox } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Box3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiBox args={[size, size, size]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiBox>
  )
}

export function Box2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'square',
    size: size * 10,
    color: color,
  }
}
