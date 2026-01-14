'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

// Calculate position on quadratic Bezier curve
function getQuadraticBezierPoint(
  start: [number, number, number],
  control: [number, number, number],
  end: [number, number, number],
  t: number
): [number, number, number] {
  const t1 = 1 - t
  return [
    t1 * t1 * start[0] + 2 * t1 * t * control[0] + t * t * end[0],
    t1 * t1 * start[1] + 2 * t1 * t * control[1] + t * t * end[1],
    t1 * t1 * start[2] + 2 * t1 * t * control[2] + t * t * end[2],
  ]
}

/**
 * Energy Pulse Effect - energy wave propagating along the edge
 * Supports curved paths via controlPoint for bidirectional edges
 */
export function EnergyPulse({ start, end, color, width, controlPoint }: EdgeEffectProps) {
  const pulse1Ref = useRef<THREE.Mesh>(null)
  const pulse2Ref = useRef<THREE.Mesh>(null)
  const progress1Ref = useRef(0)
  const progress2Ref = useRef(0.5) // Second pulse offset

  // Calculate initial midpoint for rendering
  const initialMidPoint = useMemo((): [number, number, number] => {
    if (controlPoint) {
      return getQuadraticBezierPoint(start, controlPoint, end, 0.5)
    }
    return [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      (start[2] + end[2]) / 2,
    ]
  }, [start, end, controlPoint])

  const pulseSize = Math.max(width * 0.2, 0.1)

  useFrame((_, delta) => {
    const speed = 0.5

    // Update first pulse
    if (pulse1Ref.current) {
      progress1Ref.current = (progress1Ref.current + delta * speed) % 1
      const t = progress1Ref.current

      // Calculate position - use curve if controlPoint exists
      let pos: [number, number, number]
      if (controlPoint) {
        pos = getQuadraticBezierPoint(start, controlPoint, end, t)
      } else {
        pos = [
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
          start[2] + (end[2] - start[2]) * t,
        ]
      }
      pulse1Ref.current.position.set(pos[0], pos[1], pos[2])

      // Pulse scaling effect
      const scale = 1 + Math.sin(t * Math.PI) * 0.5
      pulse1Ref.current.scale.setScalar(scale)

      const mat = pulse1Ref.current.material as THREE.MeshBasicMaterial
      mat.opacity = Math.sin(t * Math.PI) * 0.7
    }

    // Update second pulse
    if (pulse2Ref.current) {
      progress2Ref.current = (progress2Ref.current + delta * speed) % 1
      const t = progress2Ref.current

      // Calculate position - use curve if controlPoint exists
      let pos: [number, number, number]
      if (controlPoint) {
        pos = getQuadraticBezierPoint(start, controlPoint, end, t)
      } else {
        pos = [
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
          start[2] + (end[2] - start[2]) * t,
        ]
      }
      pulse2Ref.current.position.set(pos[0], pos[1], pos[2])

      const scale = 1 + Math.sin(t * Math.PI) * 0.5
      pulse2Ref.current.scale.setScalar(scale)

      const mat = pulse2Ref.current.material as THREE.MeshBasicMaterial
      mat.opacity = Math.sin(t * Math.PI) * 0.7
    }
  })

  return (
    <>
      {/* Pulse 1 */}
      <mesh ref={pulse1Ref} position={start}>
        <sphereGeometry args={[pulseSize, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Pulse 2 */}
      <mesh ref={pulse2Ref} position={initialMidPoint}>
        <sphereGeometry args={[pulseSize * 0.8, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

export default EnergyPulse
