'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

const PARTICLE_COUNT = 5

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
 * Flowing Particles Effect - glowing particles flowing along the edge
 * Supports curved paths via controlPoint for bidirectional edges
 */
export function FlowingParticles({ start, end, color, width, controlPoint }: EdgeEffectProps) {
  const particlesRef = useRef<THREE.Group>(null)
  const progressRef = useRef<number[]>([])

  // Initialize particle progress (evenly distributed)
  useMemo(() => {
    progressRef.current = Array.from({ length: PARTICLE_COUNT }, (_, i) => i / PARTICLE_COUNT)
  }, [])

  // Particle size based on line width
  const particleSize = Math.max(width * 0.15, 0.08)

  useFrame((_, delta) => {
    if (!particlesRef.current) return

    const speed = 0.3 // Flow speed

    particlesRef.current.children.forEach((particle, i) => {
      // Update progress
      progressRef.current[i] = (progressRef.current[i] + delta * speed) % 1

      const t = progressRef.current[i]

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
      particle.position.set(pos[0], pos[1], pos[2])

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
