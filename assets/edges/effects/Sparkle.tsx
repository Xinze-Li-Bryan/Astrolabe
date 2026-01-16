'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

const SPARKLE_COUNT = 8

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
 * Sparkle Effect - stars twinkling at random positions along the edge
 * Supports curved paths via controlPoint for bidirectional edges
 */
export function Sparkle({ start, end, color, width, controlPoint }: EdgeEffectProps) {
  const groupRef = useRef<THREE.Group>(null)
  const sparklesRef = useRef<{ t: number; phase: number; lifetime: number }[]>([])

  // Initialize sparkle points
  useMemo(() => {
    sparklesRef.current = Array.from({ length: SPARKLE_COUNT }, () => ({
      t: Math.random(), // Position along the edge
      phase: Math.random() * Math.PI * 2, // Twinkle phase
      lifetime: 0.5 + Math.random() * 0.5, // Lifetime
    }))
  }, [])

  const particleSize = Math.max(width * 0.12, 0.06)

  useFrame(({ clock }) => {
    if (!groupRef.current) return

    const time = clock.getElapsedTime()

    groupRef.current.children.forEach((particle, i) => {
      const sparkle = sparklesRef.current[i]
      if (!sparkle) return

      // Calculate position - use curve if controlPoint exists
      const t = sparkle.t
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
      particle.position.set(pos[0], pos[1], pos[2])

      // Twinkle effect
      const flicker = Math.sin(time * 8 + sparkle.phase) * 0.5 + 0.5
      const mat = (particle as THREE.Mesh).material as THREE.MeshBasicMaterial
      mat.opacity = flicker * 0.9

      // Scale twinkle
      const scale = 0.8 + flicker * 0.4
      particle.scale.setScalar(scale)

      // Randomly reset position
      if (Math.random() < 0.01) {
        sparkle.t = Math.random()
        sparkle.phase = Math.random() * Math.PI * 2
      }
    })
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: SPARKLE_COUNT }).map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[particleSize, 6, 6]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

export default Sparkle
