import { Line } from '@react-three/drei'
import type { EdgeStyle3DProps, EdgeStyle2DConfig } from '../types'

export function Dotted3D({ start, end, color, width }: EdgeStyle3DProps) {
  return (
    <Line
      points={[start, end]}
      color={color}
      lineWidth={width}
      dashed
      dashSize={0.15}
      gapSize={0.25}
    />
  )
}

export function Dotted2D({ color, width }: { color: string; width: number }): EdgeStyle2DConfig {
  return {
    type: 'dotted',
    color: color,
    size: width,
  }
}
