'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

/**
 * Glow Line Effect - breathing glow effect
 */
export function GlowLine({ start, end, color, width }: EdgeEffectProps) {
  const glow1Ref = useRef<THREE.Mesh>(null)
  const glow2Ref = useRef<THREE.Mesh>(null)

  // Calculate midpoint and direction
  const { midPoint, rotation, length } = useMemo(() => {
    const mid = new THREE.Vector3(
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      (start[2] + end[2]) / 2
    )

    const dir = new THREE.Vector3(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2]
    )
    const len = dir.length()

    // Calculate rotation to align capsule with edge direction
    const quaternion = new THREE.Quaternion()
    quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), // Default capsule direction
      dir.normalize()
    )
    const euler = new THREE.Euler().setFromQuaternion(quaternion)

    return {
      midPoint: [mid.x, mid.y, mid.z] as [number, number, number],
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      length: len,
    }
  }, [start, end])

  const glowWidth = Math.max(width * 0.3, 0.15)

  useFrame((state) => {
    const t = state.clock.elapsedTime

    // Inner glow breathing effect
    if (glow1Ref.current) {
      const scale = 1 + Math.sin(t * 3) * 0.2
      glow1Ref.current.scale.set(scale, 1, scale)
      const mat = glow1Ref.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.4 + Math.sin(t * 3) * 0.2
    }

    // Outer glow breathing effect (phase offset)
    if (glow2Ref.current) {
      const scale = 1 + Math.sin(t * 3 + Math.PI) * 0.15
      glow2Ref.current.scale.set(scale, 1, scale)
      const mat = glow2Ref.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.2 + Math.sin(t * 3 + Math.PI) * 0.1
    }
  })

  return (
    <>
      {/* Inner glow */}
      <mesh ref={glow1Ref} position={midPoint} rotation={rotation}>
        <capsuleGeometry args={[glowWidth, length * 0.95, 4, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Outer glow */}
      <mesh ref={glow2Ref} position={midPoint} rotation={rotation}>
        <capsuleGeometry args={[glowWidth * 2, length * 0.95, 4, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

export default GlowLine
