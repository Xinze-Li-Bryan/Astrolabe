'use client'

/**
 * BatchedEdges - High-performance edge rendering using a single draw call
 *
 * Instead of rendering 15k separate Line components (15k draw calls),
 * this renders all edges in a single lineSegments geometry (1 draw call).
 *
 * Trade-offs:
 * - No individual edge hover/click (would need raycasting)
 * - No per-edge styling variations (all same width)
 * - But: 60fps instead of 1fps
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Edge } from '@/types/node'

interface BatchedEdgesProps {
  edges: Edge[]
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  defaultColor?: string
  dimmedColor?: string
  highlightedEdgeIds?: Set<string>
  highlightColor?: string
  dimmedEdgeIds?: Set<string>
}

export function BatchedEdges({
  edges,
  positionsRef,
  defaultColor = '#666666',
  dimmedColor = '#333333',
  highlightColor = '#ffffff',
  highlightedEdgeIds,
  dimmedEdgeIds,
}: BatchedEdgesProps) {
  const lineRef = useRef<THREE.LineSegments>(null)
  const geometryRef = useRef<THREE.BufferGeometry>(null)

  // Create geometry with position and color attributes
  const { geometry, positionAttr, colorAttr } = useMemo(() => {
    const geo = new THREE.BufferGeometry()

    // 2 vertices per edge (start and end)
    const positions = new Float32Array(edges.length * 2 * 3)
    const colors = new Float32Array(edges.length * 2 * 3)

    // Initialize with zeros (will be updated in useFrame)
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    return {
      geometry: geo,
      positionAttr: geo.getAttribute('position') as THREE.BufferAttribute,
      colorAttr: geo.getAttribute('color') as THREE.BufferAttribute,
    }
  }, [edges.length])

  // Parse colors once
  const defaultColorVec = useMemo(() => new THREE.Color(defaultColor), [defaultColor])
  const dimmedColorVec = useMemo(() => new THREE.Color(dimmedColor), [dimmedColor])
  const highlightColorVec = useMemo(() => new THREE.Color(highlightColor), [highlightColor])

  // Build edge index map for O(1) lookup
  const edgeIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    edges.forEach((edge, i) => {
      map.set(`${edge.source}->${edge.target}`, i)
    })
    return map
  }, [edges])

  // Update positions and colors every frame
  useFrame(() => {
    if (!positionAttr || !colorAttr || edges.length === 0) return

    const positions = positionsRef.current
    if (positions.size === 0) return

    const posArray = positionAttr.array as Float32Array
    const colorArray = colorAttr.array as Float32Array

    let hasValidPositions = false

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i]
      const startPos = positions.get(edge.source)
      const endPos = positions.get(edge.target)

      const baseIdx = i * 6 // 2 vertices * 3 components

      if (startPos && endPos) {
        hasValidPositions = true
        // Start vertex
        posArray[baseIdx] = startPos[0]
        posArray[baseIdx + 1] = startPos[1]
        posArray[baseIdx + 2] = startPos[2]

        // End vertex
        posArray[baseIdx + 3] = endPos[0]
        posArray[baseIdx + 4] = endPos[1]
        posArray[baseIdx + 5] = endPos[2]
      }

      // Determine color
      const edgeKey = `${edge.source}->${edge.target}`
      let color = defaultColorVec

      if (dimmedEdgeIds?.has(edgeKey)) {
        color = dimmedColorVec
      } else if (highlightedEdgeIds?.has(edgeKey)) {
        color = highlightColorVec
      }

      // Start vertex color
      colorArray[baseIdx] = color.r
      colorArray[baseIdx + 1] = color.g
      colorArray[baseIdx + 2] = color.b

      // End vertex color
      colorArray[baseIdx + 3] = color.r
      colorArray[baseIdx + 4] = color.g
      colorArray[baseIdx + 5] = color.b
    }

    positionAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    // Note: frustumCulled={false} so no need to computeBoundingSphere()
  })

  // Cleanup
  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  // Don't render if no edges
  if (edges.length === 0) return null

  return (
    <lineSegments ref={lineRef} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.8}
      />
    </lineSegments>
  )
}

export default BatchedEdges
