import { Line } from '@react-three/drei'
import type { EdgeStyle3DProps, EdgeStyle2DConfig } from '../types'

export function Dashed3D({ start, end, color, width }: EdgeStyle3DProps) {
  return (
    <Line
      points={[start, end]}
      color={color}
      lineWidth={width}
      dashed
      dashSize={0.5}
      gapSize={0.3}
    />
  )
}

export function Dashed2D({ color, width }: { color: string; width: number }): EdgeStyle2DConfig {
  return {
    type: 'dashed',
    color: color,
    size: width,
  }
}
