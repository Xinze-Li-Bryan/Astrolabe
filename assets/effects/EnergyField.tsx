'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NodeEffectProps } from '../types'

/**
 * Energy Field Effect - multiple concentric rings expanding outward
 */
export function EnergyField({ size, color }: NodeEffectProps) {
  const ring1Ref = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)
  const ring3Ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()

    // Three rings expanding outward at different phases
    const rings = [ring1Ref, ring2Ref, ring3Ref]
    rings.forEach((ref, i) => {
      if (ref.current) {
        // Cyclic expansion: from 1.2 to 2.5 and back to 1.2
        const phase = (time * 0.8 + i * 0.33 * Math.PI * 2) % (Math.PI * 2)
        const scale = 1.2 + (Math.sin(phase - Math.PI / 2) + 1) * 0.65
        ref.current.scale.setScalar(scale)

        // Opacity changes with expansion
        const material = ref.current.material as THREE.MeshBasicMaterial
        material.opacity = 0.5 - (scale - 1.2) * 0.35
      }
    })
  })

  return (
    <group>
      {/* Three concentric rings - brighter */}
      <mesh ref={ring1Ref} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 1.3, size * 1.5, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring2Ref} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 1.3, size * 1.5, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring3Ref} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 1.3, size * 1.5, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default EnergyField
