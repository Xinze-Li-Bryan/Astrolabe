'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NodeEffectProps } from '../types'

/**
 * Aura Effect - soft multi-layer breathing glow
 */
export function Aura({ size, color }: NodeEffectProps) {
  const innerRef = useRef<THREE.Mesh>(null)
  const middleRef = useRef<THREE.Mesh>(null)
  const outerRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()

    // Inner layer: fast breathing - brighter
    if (innerRef.current) {
      const material = innerRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.6 + Math.sin(time * 2) * 0.2
      innerRef.current.scale.setScalar(1 + Math.sin(time * 2) * 0.05)
    }

    // Middle layer: medium speed breathing, phase offset
    if (middleRef.current) {
      const material = middleRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.4 + Math.sin(time * 1.5 + 1) * 0.15
      middleRef.current.scale.setScalar(1 + Math.sin(time * 1.5 + 1) * 0.03)
    }

    // Outer layer: slow breathing
    if (outerRef.current) {
      const material = outerRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.25 + Math.sin(time + 2) * 0.1
      outerRef.current.scale.setScalar(1 + Math.sin(time + 2) * 0.02)
    }
  })

  return (
    <group>
      {/* Inner glow - brightest */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[size * 1.4, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Middle glow */}
      <mesh ref={middleRef}>
        <sphereGeometry args={[size * 1.8, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Outer glow */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[size * 2.4, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.25}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default Aura
