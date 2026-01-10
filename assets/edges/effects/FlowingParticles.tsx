'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

const PARTICLE_COUNT = 5

/**
 * Flowing Particles Effect - glowing particles flowing along the edge
 */
export function FlowingParticles({ start, end, color, width }: EdgeEffectProps) {
  const particlesRef = useRef<THREE.Group>(null)
  const progressRef = useRef<number[]>([])

  // Initialize particle progress (evenly distributed)
  useMemo(() => {
    progressRef.current = Array.from({ length: PARTICLE_COUNT }, (_, i) => i / PARTICLE_COUNT)
  }, [])

  // Calculate direction and length
  const { dir, length } = useMemo(() => {
    const direction = new THREE.Vector3(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2]
    )
    const len = direction.length()
    direction.normalize()
    return { dir: direction, length: len }
  }, [start, end])

  // Particle size based on line width
  const particleSize = Math.max(width * 0.15, 0.08)

  useFrame((_, delta) => {
    if (!particlesRef.current) return

    const speed = 0.3 // Flow speed

    particlesRef.current.children.forEach((particle, i) => {
      // Update progress
      progressRef.current[i] = (progressRef.current[i] + delta * speed) % 1

      const t = progressRef.current[i]

      // Calculate position
      particle.position.set(
        start[0] + dir.x * length * t,
        start[1] + dir.y * length * t,
        start[2] + dir.z * length * t
      )

      // Fade in/out effect
      const opacity = Math.sin(t * Math.PI)
      const mat = (particle as THREE.Mesh).material as THREE.MeshBasicMaterial
      mat.opacity = opacity * 0.8
    })
  })

  return (
    <group ref={particlesRef}>
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <mesh key={i} position={[start[0], start[1], start[2]]}>
          <sphereGeometry args={[particleSize, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

export default FlowingParticles
