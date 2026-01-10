import { Octahedron as DreiOctahedron } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Octahedron3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiOctahedron args={[size]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiOctahedron>
  )
}

export function Octahedron2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'diamond',
    size: size * 10,
    color: color,
  }
}
