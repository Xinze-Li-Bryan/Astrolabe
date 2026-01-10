'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NodeEffectProps } from '../types'

/**
 * Saturn Ring Effect - tilted ring orbiting the node
 */
export function SaturnRing({ size, color }: NodeEffectProps) {
  const ringRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.15
    }
  })

  const innerRadius = size * 1.5
  const outerRadius = size * 2.2

  return (
    <group ref={ringRef} rotation={[Math.PI * 0.4, 0, 0]}>
      {/* Main ring - solid highlight */}
      <mesh>
        <ringGeometry args={[innerRadius, outerRadius, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Inner edge glow */}
      <mesh>
        <ringGeometry args={[innerRadius * 0.95, innerRadius, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Outer edge glow */}
      <mesh>
        <ringGeometry args={[outerRadius, outerRadius * 1.1, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default SaturnRing
