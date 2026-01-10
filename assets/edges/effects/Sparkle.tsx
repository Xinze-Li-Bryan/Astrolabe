'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

const SPARKLE_COUNT = 8

/**
 * Sparkle Effect - stars twinkling at random positions along the edge
 */
export function Sparkle({ start, end, color, width }: EdgeEffectProps) {
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

      // Calculate position
      const t = sparkle.t
      particle.position.set(
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
        start[2] + (end[2] - start[2]) * t
      )

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
