import { TorusKnot as DreiTorusKnot } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function TorusKnot3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiTorusKnot args={[size * 0.6, size * 0.2, 64, 8]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiTorusKnot>
  )
}

export function TorusKnot2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'star',
    size: size * 10,
    color: color,
  }
}
