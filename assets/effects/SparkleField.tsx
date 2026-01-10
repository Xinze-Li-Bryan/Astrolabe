'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NodeEffectProps } from '../types'

/**
 * Sparkle Field Effect - multiple particles randomly twinkling around the node
 */
export function SparkleField({ size, color }: NodeEffectProps) {
  const groupRef = useRef<THREE.Group>(null)
  const particlesRef = useRef<THREE.Points>(null)

  // Generate particle positions
  const { positions, phases } = useMemo(() => {
    const count = 12
    const positions = new Float32Array(count * 3)
    const phases = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // Randomly distribute on a spherical shell
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = size * (1.5 + Math.random() * 0.8)

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)

      // Random phase for unsynchronized twinkling
      phases[i] = Math.random() * Math.PI * 2
    }

    return { positions, phases }
  }, [size])

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.002
    }

    if (particlesRef.current) {
      const material = particlesRef.current.material as THREE.PointsMaterial
      // Overall breathing effect
      const time = clock.getElapsedTime()
      material.opacity = 0.4 + Math.sin(time * 2) * 0.3
    }
  })

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [positions])

  return (
    <group ref={groupRef}>
      {/* Main particle layer - highlight */}
      <points ref={particlesRef} geometry={geometry}>
        <pointsMaterial
          color={color}
          size={size * 0.35}
          transparent
          opacity={1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      {/* Glow layer */}
      <points geometry={geometry}>
        <pointsMaterial
          color={color}
          size={size * 0.6}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  )
}

export default SparkleField
