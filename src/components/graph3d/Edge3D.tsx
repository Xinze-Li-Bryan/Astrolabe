'use client'

/**
 * Edge3D - 3D Edge Rendering Component
 *
 * Directly uses backend data (Edge from types/node.ts)
 * Color/style priority: meta override > default value
 * Uses Line2 to implement per-frame position updates
 * Supports dashed style for custom edges
 * Supports curved bidirectional edges (using manually calculated Bezier curves)
 */

import { useMemo, useRef, memo, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2 } from 'three-stdlib'
import type { Edge } from '@/types/node'
import { getEdgeEffect, Wavy3D, Zigzag3D, Spring3D } from '@/../assets'
import { getEdgeColorByNodeStatus, type ProofStatusType } from '@/lib/proofStatus'
import { FlowPulse } from './effects/FlowPulse'

// Highlight colors
const HIGHLIGHT_COLORS = {
  selected: '#ffffff',
  input: '#00d4ff',
  output: '#ff6b35',
}

// Bidirectional edge curve offset
const CURVE_OFFSET = 2.0

// Bezier curve segment count (higher = smoother)
const CURVE_SEGMENTS = 20

// Edge default color
const DEFAULT_EDGE_COLOR = '#666666'

interface Edge3DProps {
  edge: Edge
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  isHighlighted?: boolean
  highlightType?: 'input' | 'output' | 'selected' | 'none'
  isDimmed?: boolean
  isBidirectional?: boolean  // Whether reverse edge exists
  onClick?: () => void
  // Node status map for calculating edge colors
  nodeStatusMap?: Map<string, ProofStatusType>
}

// Calculate points on quadratic Bezier curve
function getQuadraticBezierPoints(
  start: [number, number, number],
  control: [number, number, number],
  end: [number, number, number],
  segments: number
): Float32Array {
  const points = new Float32Array((segments + 1) * 3)

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const t1 = 1 - t

    // B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
    points[i * 3] = t1 * t1 * start[0] + 2 * t1 * t * control[0] + t * t * end[0]
    points[i * 3 + 1] = t1 * t1 * start[1] + 2 * t1 * t * control[1] + t * t * end[1]
    points[i * 3 + 2] = t1 * t1 * start[2] + 2 * t1 * t * control[2] + t * t * end[2]
  }

  return points
}

export const Edge3D = memo(function Edge3D({
  edge,
  positionsRef,
  isHighlighted = false,
  highlightType = 'none',
  isDimmed = false,
  isBidirectional = false,
  onClick,
  nodeStatusMap,
}: Edge3DProps) {
  const lineRef = useRef<Line2>(null)
  const curveLineRef = useRef<Line2>(null)

  // Edge style
  const edgeStyle = edge.meta?.style ?? edge.defaultStyle
  const isDashed = edgeStyle === 'dashed'
  const isDotted = edgeStyle === 'dotted'
  const isWavy = edgeStyle === 'wavy'
  const isZigzag = edgeStyle === 'zigzag'
  const isSpring = edgeStyle === 'spring'

  // Get effect component
  const effectId = edge.meta?.effect
  const EffectComponent = useMemo(() => getEdgeEffect(effectId), [effectId])

  // Edge color: highlight > dimmed > node status color > default gray
  const color = useMemo(() => {
    if (isHighlighted) {
      if (highlightType === 'selected') return HIGHLIGHT_COLORS.selected
      if (highlightType === 'input') return HIGHLIGHT_COLORS.input
      if (highlightType === 'output') return HIGHLIGHT_COLORS.output
    }
    if (isDimmed) return '#333333'

    // 根据节点状态计算颜色（仅 fromLean 边）
    if (nodeStatusMap) {
      const sourceStatus = nodeStatusMap.get(edge.source)
      const targetStatus = nodeStatusMap.get(edge.target)
      const statusColor = getEdgeColorByNodeStatus(sourceStatus, targetStatus, edge.fromLean)
      if (statusColor) return statusColor
    }

    return DEFAULT_EDGE_COLOR
  }, [isHighlighted, highlightType, isDimmed, edge.source, edge.target, edge.fromLean, nodeStatusMap])

  // 宽度 (always use default, no user override)
  const width = useMemo(() => {
    if (highlightType === 'selected') return 4
    if (isHighlighted) return 3
    return edge.defaultWidth
  }, [isHighlighted, highlightType, edge.defaultWidth])

  // Get initial positions
  const startPos = positionsRef.current.get(edge.source) || [0, 0, 0]
  const endPos = positionsRef.current.get(edge.target) || [0, 0, 0]

  // Position tracking for effects (must be defined after startPos/endPos)
  const currentStartRef = useRef<[number, number, number]>(startPos as [number, number, number])
  const currentEndRef = useRef<[number, number, number]>(endPos as [number, number, number])

  // Calculate curve midpoint (offset perpendicular to line direction)
  const getMidPoint = useCallback((start: [number, number, number], end: [number, number, number]): [number, number, number] => {
    if (!isBidirectional) {
      // Straight line: midpoint is simply the midpoint of the two points
      return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]
    }

    // Curve: calculate perpendicular offset
    const mid: [number, number, number] = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      (start[2] + end[2]) / 2,
    ]

    // Calculate line direction vector
    const dir = new THREE.Vector3(end[0] - start[0], end[1] - start[1], end[2] - start[2])
    const length = dir.length()
    if (length < 0.001) return mid

    // Find a vector perpendicular to the line (using cross product)
    const up = new THREE.Vector3(0, 1, 0)
    const perp = new THREE.Vector3().crossVectors(dir, up).normalize()

    // If dir and up are parallel, use another vector
    if (perp.length() < 0.001) {
      perp.crossVectors(dir, new THREE.Vector3(1, 0, 0)).normalize()
    }

    // Offset amount proportional to edge length, but with min/max limits
    const offset = Math.min(Math.max(length * 0.2, 1), CURVE_OFFSET)

    return [
      mid[0] + perp.x * offset,
      mid[1] + perp.y * offset,
      mid[2] + perp.z * offset,
    ]
  }, [isBidirectional])

  // State: curve points
  const midPointRef = useRef<[number, number, number]>(getMidPoint(startPos, endPos))


  // Calculate initial curve points (for rendering)
  const initialCurvePoints = useMemo(() => {
    if (!isBidirectional) return null
    const mid = getMidPoint(startPos, endPos)
    const points: [number, number, number][] = []
    for (let i = 0; i <= CURVE_SEGMENTS; i++) {
      const t = i / CURVE_SEGMENTS
      const t1 = 1 - t
      points.push([
        t1 * t1 * startPos[0] + 2 * t1 * t * mid[0] + t * t * endPos[0],
        t1 * t1 * startPos[1] + 2 * t1 * t * mid[1] + t * t * endPos[1],
        t1 * t1 * startPos[2] + 2 * t1 * t * mid[2] + t * t * endPos[2],
      ])
    }
    return points
  }, [isBidirectional, startPos, endPos, getMidPoint])

  // Update Line geometry each frame
  useFrame(() => {
    const start = positionsRef.current.get(edge.source)
    const end = positionsRef.current.get(edge.target)
    if (!start || !end) return

    // Update position tracking for effects
    currentStartRef.current = start
    currentEndRef.current = end

    // Update curve midpoint
    midPointRef.current = getMidPoint(start, end)

    if (isBidirectional && curveLineRef.current) {
      // Update all points of the curve
      const curvePoints = getQuadraticBezierPoints(start, midPointRef.current, end, CURVE_SEGMENTS)
      curveLineRef.current.geometry.setPositions(curvePoints)
    } else if (!isBidirectional && lineRef.current) {
      // Update straight line geometry (both solid and dashed use Line component)
      const positions = new Float32Array([
        start[0], start[1], start[2],
        end[0], end[1], end[2]
      ])
      lineRef.current.geometry.setPositions(positions)
    }
  })

  // Calculate dashed/dotted parameters
  const getDashParams = () => {
    if (isDashed) return { dashed: true, dashSize: 0.5, gapSize: 0.3 }
    if (isDotted) return { dashed: true, dashSize: 0.15, gapSize: 0.25 }
    return { dashed: false, dashSize: undefined, gapSize: undefined }
  }
  const dashParams = getDashParams()

  // Show flow pulse when input/output is highlighted
  const showFlowPulse = isHighlighted && (highlightType === 'input' || highlightType === 'output')

  // Render bidirectional edge (curved, supports dashed/dotted)
  if (isBidirectional && initialCurvePoints) {
    return (
      <>
        <Line
          ref={curveLineRef}
          points={initialCurvePoints}
          color={color}
          lineWidth={width}
          dashed={dashParams.dashed}
          dashSize={dashParams.dashSize}
          gapSize={dashParams.gapSize}
          onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
          onPointerOver={onClick ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' } : undefined}
          onPointerOut={onClick ? (e) => { e.stopPropagation(); document.body.style.cursor = 'auto' } : undefined}
        />
        {/* Flow pulse - shown when highlighted */}
        {showFlowPulse && (
          <FlowPulse
            start={currentStartRef.current}
            end={currentEndRef.current}
            color={color}
            width={width}
            positionsRef={positionsRef}
            sourceId={edge.source}
            targetId={edge.target}
          />
        )}
        {/* Edge effect */}
        {EffectComponent && !isDimmed && (
          <EffectComponent
            start={currentStartRef.current}
            end={currentEndRef.current}
            color={color}
            width={width}
            controlPoint={midPointRef.current}
          />
        )}
      </>
    )
  }

  // Render wavy line
  if (isWavy) {
    return (
      <>
        <Wavy3D
          start={currentStartRef.current}
          end={currentEndRef.current}
          color={color}
          width={width}
          positionsRef={positionsRef}
          source={edge.source}
          target={edge.target}
        />
        {/* Flow pulse - shown when highlighted */}
        {showFlowPulse && (
          <FlowPulse
            start={currentStartRef.current}
            end={currentEndRef.current}
            color={color}
            width={width}
            positionsRef={positionsRef}
            sourceId={edge.source}
            targetId={edge.target}
          />
        )}
        {/* Edge effect */}
        {EffectComponent && !isDimmed && (
          <EffectComponent
            start={currentStartRef.current}
            end={currentEndRef.current}
            color={color}
            width={width}
          />
        )}
      </>
    )
  }

  // Render zigzag line
  if (isZigzag) {
    return (
      <>
        <Zigzag3D
          start={currentStartRef.current}
          end={currentEndRef.current}
          color={color}
          width={width}
          positionsRef={positionsRef}
          source={edge.source}
          target={edge.target}
        />
        {/* Flow pulse - shown when highlighted */}
        {showFlowPulse && (
          <FlowPulse
            start={currentStartRef.current}
            end={currentEndRef.current}
            color={color}
            width={width}
            positionsRef={positionsRef}
            sourceId={edge.source}
            targetId={edge.target}
          />
        )}
        {/* Edge effect */}
        {EffectComponent && !isDimmed && (
          <EffectComponent
            start={currentStartRef.current}
            end={currentEndRef.current}
            color={color}
            width={width}
          />
        )}
      </>
    )
  }

  // Render spring line
  if (isSpring) {
    return (
      <>
        <Spring3D
          start={currentStartRef.current}
          end={currentEndRef.current}
          color={color}
          width={width}
          positionsRef={positionsRef}
          source={edge.source}
          target={edge.target}
        />
        {/* Flow pulse - shown when highlighted */}
        {showFlowPulse && (
          <FlowPulse
            start={currentStartRef.current}
            end={currentEndRef.current}
            color={color}
            width={width}
            positionsRef={positionsRef}
            sourceId={edge.source}
            targetId={edge.target}
          />
        )}
        {/* Edge effect */}
        {EffectComponent && !isDimmed && (
          <EffectComponent
            start={currentStartRef.current}
            end={currentEndRef.current}
            color={color}
            width={width}
          />
        )}
      </>
    )
  }

  // Render straight line (solid, dashed, or dotted)
  // If in flow pulse mode, don't render original line, only render FlowPulse
  if (showFlowPulse) {
    return (
      <>
        <FlowPulse
          start={currentStartRef.current}
          end={currentEndRef.current}
          color={color}
          width={width}
          positionsRef={positionsRef}
          sourceId={edge.source}
          targetId={edge.target}
        />
        {/* Edge effect */}
        {EffectComponent && !isDimmed && (
          <EffectComponent
            start={currentStartRef.current}
            end={currentEndRef.current}
            color={color}
            width={width}
          />
        )}
      </>
    )
  }

  return (
    <>
      <Line
        ref={lineRef}
        points={[startPos, endPos]}
        color={color}
        lineWidth={width}
        dashed={dashParams.dashed}
        dashSize={dashParams.dashSize}
        gapSize={dashParams.gapSize}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
        onPointerOver={onClick ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' } : undefined}
        onPointerOut={onClick ? (e) => { e.stopPropagation(); document.body.style.cursor = 'auto' } : undefined}
      />
      {/* Edge effect */}
      {EffectComponent && !isDimmed && (
        <EffectComponent
          start={currentStartRef.current}
          end={currentEndRef.current}
          color={color}
          width={width}
        />
      )}
    </>
  )
})

export default Edge3D
