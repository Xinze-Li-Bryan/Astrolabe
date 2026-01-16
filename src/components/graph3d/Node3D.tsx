'use client'

/**
 * Node3D - 3D Node Rendering Component
 *
 * Directly uses backend data (Node from types/node.ts) and assets components
 * Color/shape priority: meta override > default value
 */

import { useRef, useMemo, memo } from 'react'
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber'
import { Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { Node } from '@/types/node'
import { getNodeShape3D, getNodeEffect } from '@/../assets'
import { StatusRing } from './effects/StatusRing'
import type { ProofStatusType } from '@/lib/proofStatus'
import { getNodeColor } from '@/lib/store'

// Unicode subscript/superscript to ASCII mapping
const UNICODE_TO_ASCII: Record<string, string> = {
  // Subscripts
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j',
  'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o',
  'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't', 'ᵤ': 'u',
  'ᵥ': 'v', 'ₓ': 'x',
  // Superscripts
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  'ᵃ': 'a', 'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e',
  'ᶠ': 'f', 'ᵍ': 'g', 'ʰ': 'h', 'ⁱ': 'i', 'ʲ': 'j',
  'ᵏ': 'k', 'ˡ': 'l', 'ᵐ': 'm', 'ⁿ': 'n', 'ᵒ': 'o',
  'ᵖ': 'p', 'ʳ': 'r', 'ˢ': 's', 'ᵗ': 't', 'ᵘ': 'u',
  'ᵛ': 'v', 'ʷ': 'w', 'ˣ': 'x', 'ʸ': 'y', 'ᶻ': 'z',
  // Common math symbols
  '′': "'", '″': '"', '‴': "'''",
  '∞': 'inf', '≠': '!=', '≤': '<=', '≥': '>=',
  '±': '+/-', '×': 'x', '÷': '/',
}

// Convert Unicode special characters to ASCII for 3D text rendering
function normalizeForDisplay(text: string): string {
  let result = text
  for (const [unicode, ascii] of Object.entries(UNICODE_TO_ASCII)) {
    result = result.replaceAll(unicode, ascii)
  }
  return result
}

interface Node3DProps {
  node: Node
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  isSelected: boolean
  isHovered: boolean
  isDimmed?: boolean
  isClickable?: boolean  // Add edge mode, clickable hint for non-selected nodes
  isRemovable?: boolean  // Remove mode, removable hint for nodes (red pulse)
  onSelect: () => void
  onHover: (hovered: boolean) => void
  onDragStart: () => void
  onDragEnd: () => void
  isDragging: boolean
  showLabel?: boolean
}

// Red color in remove mode
const REMOVE_COLOR = '#ff4444'

// Node types that require status ring (consistent with backend PROOF_REQUIRING_KINDS)
const PROOF_REQUIRING_KINDS = ['theorem', 'lemma', 'proposition', 'corollary']

export const Node3D = memo(function Node3D({
  node,
  positionsRef,
  isSelected,
  isHovered,
  isDimmed = false,
  isClickable = false,
  isRemovable = false,
  onSelect,
  onHover,
  onDragStart,
  onDragEnd,
  isDragging,
  showLabel = true,
}: Node3DProps) {
  const groupRef = useRef<THREE.Group>(null)
  const clickableGlowRef = useRef<THREE.Group>(null)
  const removableGlowRef = useRef<THREE.Group>(null)
  const { gl } = useThree()

  // Get initial position
  const initialPos = positionsRef.current.get(node.id) || [0, 0, 0]
  const targetPos = useRef(new THREE.Vector3(...initialPos))

  // Color: use getNodeColor which handles fallback to KIND_COLORS
  const color = getNodeColor(node)

  // Size: meta override > default value, then scale to appropriate size
  const size = (node.meta?.size ?? node.defaultSize) * 0.5

  // Shape: meta override > default value
  const shapeId = node.meta?.shape ?? node.defaultShape

  // Label: meta.label > node.name
  // Split by "." for line breaks and convert Unicode special characters to ASCII
  const rawLabel = node.meta?.label || node.name
  const normalizedLabel = normalizeForDisplay(rawLabel)
  const displayLabel = normalizedLabel.includes('.') ? normalizedLabel.split('.').join('.\n') : normalizedLabel

  // Get shape component
  const ShapeComponent = useMemo(() => getNodeShape3D(shapeId), [shapeId])

  // Get effect component
  const effectId = node.meta?.effect
  const EffectComponent = useMemo(() => getNodeEffect(effectId), [effectId])

  // Scale animation
  const targetScale = isSelected ? 1.3 : isHovered ? 1.15 : 1.0

  // Animation time accumulator - use ref to avoid recreation
  const animTimeRef = useRef(0)

  // Update position each frame - use delta instead of Date.now() for better performance
  useFrame((_, delta) => {
    const position = positionsRef.current.get(node.id)
    if (!position || !groupRef.current) return

    if (isDragging) {
      groupRef.current.position.set(...position)
    } else {
      targetPos.current.set(...position)
      groupRef.current.position.lerp(targetPos.current, 0.15)
    }

    // Scale animation
    const currentScale = groupRef.current.scale.x
    const newScale = currentScale + (targetScale - currentScale) * 0.1
    groupRef.current.scale.setScalar(newScale)

    // Only accumulate time when animation is needed
    const needsAnimation = (isClickable && clickableGlowRef.current) || (isRemovable && removableGlowRef.current)
    if (needsAnimation) {
      animTimeRef.current += delta
    }

    // Clickable state pulse animation - multi-layer glow synchronized breathing
    if (isClickable && clickableGlowRef.current) {
      const pulse = 0.5 + Math.sin(animTimeRef.current * 1.5) * 0.3  // 0.2 to 0.8 breathing coefficient
      const children = clickableGlowRef.current.children
      for (let i = 0; i < children.length; i++) {
        const material = (children[i] as THREE.Mesh).material as THREE.MeshBasicMaterial
        // Inner layer brighter, outer layer fainter
        const baseOpacity = i === 0 ? 0.4 : i === 1 ? 0.25 : 0.12
        material.opacity = baseOpacity * pulse
      }
    }

    // Removable state red pulse animation
    if (isRemovable && removableGlowRef.current) {
      const pulse = 0.5 + Math.sin(animTimeRef.current * 2) * 0.4  // 0.1 to 0.9 more intense breathing
      const children = removableGlowRef.current.children
      for (let i = 0; i < children.length; i++) {
        const material = (children[i] as THREE.Mesh).material as THREE.MeshBasicMaterial
        const baseOpacity = i === 0 ? 0.5 : i === 1 ? 0.3 : 0.15
        material.opacity = baseOpacity * pulse
      }
    }
  })

  // Dragging state
  const dragStartTime = useRef<number>(0)
  const wasDragging = useRef<boolean>(false)

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    dragStartTime.current = Date.now()
    wasDragging.current = false
    onDragStart()
    gl.domElement.style.cursor = 'grabbing'
  }

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (Date.now() - dragStartTime.current > 150) {
      wasDragging.current = true
    }
    onDragEnd()
    gl.domElement.style.cursor = 'grab'
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!wasDragging.current) {
      onSelect()
    }
    wasDragging.current = false
  }

  return (
    <group
      ref={groupRef}
      position={initialPos}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerOver={(e) => {
        e.stopPropagation()
        onHover(true)
        gl.domElement.style.cursor = 'grab'
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        onHover(false)
        gl.domElement.style.cursor = 'auto'
      }}
    >
      {/* Selection effect - use point light to illuminate surroundings */}
      {isSelected && (
        <pointLight color={color} intensity={5} distance={size * 15} decay={2} />
      )}

      {/* Clickable state pulse glow - hint user to click in add edge mode, multi-layer gradient */}
      {isClickable && !isSelected && (
        <group ref={clickableGlowRef}>
          {/* Inner glow - brightest */}
          <mesh>
            <sphereGeometry args={[size * 1.8, 32, 32]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.4}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* Middle glow */}
          <mesh>
            <sphereGeometry args={[size * 2.8, 32, 32]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.25}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* Outer glow - faintest */}
          <mesh>
            <sphereGeometry args={[size * 4, 32, 32]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.12}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* Removable state pulse glow - hint user to click to remove in remove mode, red warning */}
      {isRemovable && !isSelected && (
        <group ref={removableGlowRef}>
          {/* Inner glow - brightest */}
          <mesh>
            <sphereGeometry args={[size * 1.8, 32, 32]} />
            <meshBasicMaterial
              color={REMOVE_COLOR}
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* Middle glow */}
          <mesh>
            <sphereGeometry args={[size * 2.8, 32, 32]} />
            <meshBasicMaterial
              color={REMOVE_COLOR}
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* Outer glow - faintest */}
          <mesh>
            <sphereGeometry args={[size * 4, 32, 32]} />
            <meshBasicMaterial
              color={REMOVE_COLOR}
              transparent
              opacity={0.15}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* Invisible collision sphere - solves clicking difficulty for hollow shapes like torus */}
      <mesh visible={false}>
        <sphereGeometry args={[size * 1.2, 16, 16]} />
        <meshBasicMaterial />
      </mesh>

      {/* Node shape - use assets component, render above glow layer */}
      <ShapeComponent size={size} color={isDimmed ? '#333333' : color} isSelected={isSelected} />

      {/* Proof status ring - only render for proof-requiring types (loading shows rotating half-ring) */}
      {!isDimmed &&
       PROOF_REQUIRING_KINDS.includes(node.kind || '') &&
       node.status &&
       node.status !== 'unknown' &&
       node.status !== 'stated' && (
        <StatusRing
          status={node.status as ProofStatusType}
          size={size}
          isSelected={isSelected}
        />
      )}

      {/* Node effect - get from meta.effect */}
      {EffectComponent && !isDimmed && (
        <EffectComponent size={size} color={color} />
      )}

      {/* Label: prioritize meta.label, split by "." for line breaks */}
      {showLabel && !isDimmed && (
        <Billboard>
          <Text
            position={[0, size * 2, 0]}
            fontSize={size * 0.7}
            color="#ffffff"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.02}
            outlineColor="#000000"
            textAlign="center"
            lineHeight={1.2}
          >
            {displayLabel}
          </Text>
        </Billboard>
      )}
    </group>
  )
})

export default Node3D
