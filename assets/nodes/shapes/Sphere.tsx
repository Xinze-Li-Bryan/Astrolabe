import { Sphere as DreiSphere } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Sphere3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiSphere args={[size, 16, 12]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiSphere>
  )
}

export function Sphere2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'circle',
    size: size * 10,
    color: color,
  }
}
