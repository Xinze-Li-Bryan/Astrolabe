'use client'

/**
 * FlowPulse - Flow pulse effect when edges are highlighted
 *
 * Multiple bright short line segments flow along edges to indicate data flow direction
 * Gaps are not rendered (transparent) to create a flowing effect
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import type { Line2 } from 'three-stdlib'

// Number of light bands displayed simultaneously
const PULSE_COUNT = 5
// Length of each light band (as a proportion of edge length)
const PULSE_LENGTH = 0.12
// Gap between light bands (as a proportion of edge length)
const GAP_LENGTH = 0.08

interface FlowPulseProps {
  start: [number, number, number]
  end: [number, number, number]
  color: string
  width: number
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  sourceId: string
  targetId: string
}

export function FlowPulse({
  start,
  end,
  color,
  width,
  positionsRef,
  sourceId,
  targetId,
}: FlowPulseProps) {
  const linesRef = useRef<(Line2 | null)[]>([])
  const offsetRef = useRef(0)

  useFrame((_, delta) => {
    // Get real-time positions
    const currentStart = positionsRef.current.get(sourceId) || start
    const currentEnd = positionsRef.current.get(targetId) || end

    const speed = 0.2  // Flow speed
    offsetRef.current = (offsetRef.current + delta * speed) % 1

    const segmentLength = PULSE_LENGTH + GAP_LENGTH

    // Update each pulse
    for (let i = 0; i < PULSE_COUNT; i++) {
      const line = linesRef.current[i]
      if (!line) continue

      // Calculate position of this pulse (with global offset)
      let progress = (i * segmentLength + offsetRef.current) % 1

      // Calculate start and end points of the light band
      const t1 = progress
      const t2 = Math.min(1, progress + PULSE_LENGTH)

      // If segment exceeds boundaries, shorten it
      if (t1 >= 1) {
        // Completely out of bounds, hide it
        line.geometry.setPositions(new Float32Array([0, 0, 0, 0, 0, 0]))
        continue
      }

      const p1: [number, number, number] = [
        currentStart[0] + (currentEnd[0] - currentStart[0]) * t1,
        currentStart[1] + (currentEnd[1] - currentStart[1]) * t1,
        currentStart[2] + (currentEnd[2] - currentStart[2]) * t1,
      ]
      const p2: [number, number, number] = [
        currentStart[0] + (currentEnd[0] - currentStart[0]) * t2,
        currentStart[1] + (currentEnd[1] - currentStart[1]) * t2,
        currentStart[2] + (currentEnd[2] - currentStart[2]) * t2,
      ]

      // Update line segment position
      line.geometry.setPositions(new Float32Array([...p1, ...p2]))
    }
  })

  return (
    <group>
      {Array.from({ length: PULSE_COUNT }).map((_, i) => (
        <Line
          key={i}
          ref={(el) => { linesRef.current[i] = el as Line2 | null }}
          points={[start, start]}
          color={color}
          lineWidth={width}
          transparent
          opacity={1}
        />
      ))}
    </group>
  )
}

export default FlowPulse
