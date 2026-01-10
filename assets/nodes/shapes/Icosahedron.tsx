import { Icosahedron as DreiIcosahedron } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Icosahedron3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiIcosahedron args={[size]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiIcosahedron>
  )
}

export function Icosahedron2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'hexagon',
    size: size * 10,
    color: color,
  }
}
