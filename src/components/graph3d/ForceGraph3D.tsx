'use client'

/**
 * ForceGraph3D - 3D Force-Directed Graph Main Container
 *
 * Directly uses backend data (Node/Edge from types/node.ts)
 * Data source: meta.json + canvas.json (via backend API)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Node, Edge } from '@/types/node'
import type { CustomNode, CustomEdge, Position3D } from '@/lib/canvasStore'
import { useCanvasStore } from '@/lib/canvasStore'
import ForceLayout, { PhysicsParams, DEFAULT_PHYSICS } from './ForceLayout'
import {
  calculateBatchSpawnPositions,
  detectNodeChanges,
  type Position3D as LifecyclePosition3D,
} from '@/lib/nodeLifecycle'
import Node3D from './Node3D'
import Edge3D from './Edge3D'
import type { ProofStatusType } from '@/lib/proofStatus'

// Re-export types and default values
export type { PhysicsParams }
export { DEFAULT_PHYSICS }

// Custom node color
const CUSTOM_NODE_COLOR = '#666666'

interface HighlightedEdge {
  id: string
  source: string
  target: string
}

interface ForceGraph3DProps {
  nodes: Node[]
  edges: Edge[]
  customNodes?: CustomNode[]
  customEdges?: CustomEdge[]
  selectedNodeId?: string | null
  focusNodeId?: string | null
  focusEdgeId?: string | null  // Focus on edge (source->target format)
  highlightedEdge?: HighlightedEdge | null
  onNodeSelect?: (node: Node | null) => void
  onEdgeSelect?: (edge: { id: string; source: string; target: string } | null) => void
  showLabels?: boolean
  initialCameraPosition?: [number, number, number]
  initialCameraTarget?: [number, number, number]
  onCameraChange?: (position: [number, number, number], target: [number, number, number]) => void
  physics?: PhysicsParams
  isAddingEdge?: boolean
  isRemovingNodes?: boolean  // Remove mode
}

// Camera focus control
function CameraController({
  targetPosition,
  enabled,
  controlsRef,
}: {
  targetPosition: [number, number, number] | null
  enabled: boolean
  controlsRef: React.RefObject<any>
}) {
  const { camera } = useThree()
  const isAnimating = useRef(false)
  const progress = useRef(0)
  const startCameraPos = useRef(new THREE.Vector3())
  const endCameraPos = useRef(new THREE.Vector3())
  const startTarget = useRef(new THREE.Vector3())
  const endTarget = useRef(new THREE.Vector3())

  useEffect(() => {
    if (enabled && targetPosition && controlsRef.current) {
      isAnimating.current = true
      progress.current = 0
      startCameraPos.current.copy(camera.position)
      startTarget.current.copy(controlsRef.current.target)
      endTarget.current.set(...targetPosition)
      const offset = new THREE.Vector3().subVectors(camera.position, controlsRef.current.target)
      endCameraPos.current.set(
        targetPosition[0] + offset.x,
        targetPosition[1] + offset.y,
        targetPosition[2] + offset.z
      )
    }
  }, [targetPosition, enabled, camera, controlsRef])

  useFrame((_, delta) => {
    if (isAnimating.current && controlsRef.current) {
      progress.current = Math.min(progress.current + delta * 2.5, 1)
      const t = 1 - Math.pow(1 - progress.current, 3)
      camera.position.lerpVectors(startCameraPos.current, endCameraPos.current, t)
      controlsRef.current.target.lerpVectors(startTarget.current, endTarget.current, t)
      controlsRef.current.update()
      if (progress.current >= 1) isAnimating.current = false
    }
  })

  return null
}

// Edge focus camera control - Make edge parallel to screen and centered
function EdgeCameraController({
  sourcePosition,
  targetPosition,
  enabled,
  controlsRef,
}: {
  sourcePosition: [number, number, number] | null
  targetPosition: [number, number, number] | null
  enabled: boolean
  controlsRef: React.RefObject<any>
}) {
  const { camera } = useThree()
  const isAnimating = useRef(false)
  const progress = useRef(0)
  const startCameraPos = useRef(new THREE.Vector3())
  const endCameraPos = useRef(new THREE.Vector3())
  const startTarget = useRef(new THREE.Vector3())
  const endTarget = useRef(new THREE.Vector3())

  useEffect(() => {
    if (enabled && sourcePosition && targetPosition && controlsRef.current) {
      isAnimating.current = true
      progress.current = 0

      // Calculate edge midpoint
      const midPoint = new THREE.Vector3(
        (sourcePosition[0] + targetPosition[0]) / 2,
        (sourcePosition[1] + targetPosition[1]) / 2,
        (sourcePosition[2] + targetPosition[2]) / 2
      )

      // Calculate edge direction
      const edgeDir = new THREE.Vector3(
        targetPosition[0] - sourcePosition[0],
        targetPosition[1] - sourcePosition[1],
        targetPosition[2] - sourcePosition[2]
      )
      const edgeLength = edgeDir.length()
      edgeDir.normalize()

      // Calculate perpendicular direction to edge (for camera position)
      // Use world Y axis as reference to calculate perpendicular to edge
      const worldUp = new THREE.Vector3(0, 1, 0)
      let perpendicular = new THREE.Vector3().crossVectors(edgeDir, worldUp).normalize()

      // If edge is nearly vertical, use X axis as reference
      if (perpendicular.length() < 0.1) {
        perpendicular = new THREE.Vector3().crossVectors(edgeDir, new THREE.Vector3(1, 0, 0)).normalize()
      }

      // Camera distance: adjust based on edge length to ensure entire edge is visible
      const distance = Math.max(edgeLength * 1.5, 20)

      // Calculate target camera position: move from midpoint along perpendicular direction
      const cameraPos = new THREE.Vector3().copy(midPoint).add(perpendicular.multiplyScalar(distance))

      startCameraPos.current.copy(camera.position)
      startTarget.current.copy(controlsRef.current.target)
      endCameraPos.current.copy(cameraPos)
      endTarget.current.copy(midPoint)
    }
  }, [sourcePosition, targetPosition, enabled, camera, controlsRef])

  useFrame((_, delta) => {
    if (isAnimating.current && controlsRef.current) {
      progress.current = Math.min(progress.current + delta * 2, 1)
      const t = 1 - Math.pow(1 - progress.current, 3) // ease out cubic

      camera.position.lerpVectors(startCameraPos.current, endCameraPos.current, t)
      controlsRef.current.target.lerpVectors(startTarget.current, endTarget.current, t)
      controlsRef.current.update()

      if (progress.current >= 1) isAnimating.current = false
    }
  })

  return null
}

// Camera initialization
function CameraInitializer({
  initialPosition,
  initialTarget,
  controlsRef,
}: {
  initialPosition?: [number, number, number]
  initialTarget?: [number, number, number]
  controlsRef: React.RefObject<any>
}) {
  const { camera } = useThree()
  const lastAppliedPosition = useRef<[number, number, number] | null>(null)
  const lastAppliedTarget = useRef<[number, number, number] | null>(null)

  const isSameVec3 = (
    a: [number, number, number] | null | undefined,
    b: [number, number, number] | null | undefined
  ) => {
    if (!a || !b) return false
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
  }

  useEffect(() => {
    if (!controlsRef.current) return

    let didApply = false

    if (initialPosition && !isSameVec3(initialPosition, lastAppliedPosition.current)) {
      camera.position.set(...initialPosition)
      lastAppliedPosition.current = [...initialPosition]
      didApply = true
    }

    if (initialTarget && !isSameVec3(initialTarget, lastAppliedTarget.current)) {
      controlsRef.current.target.set(...initialTarget)
      lastAppliedTarget.current = [...initialTarget]
      didApply = true
    }

    if (didApply) {
      controlsRef.current.update()
    }
  }, [camera, controlsRef, initialPosition, initialTarget])

  return null
}

// Camera change listener - Save only after user stops interacting
function CameraSaver({
  controlsRef,
  onCameraChange,
  onUserInteractionStart,
}: {
  controlsRef: React.RefObject<any>
  onCameraChange?: (position: [number, number, number], target: [number, number, number]) => void
  onUserInteractionStart?: () => void
}) {
  const { camera } = useThree()
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedPos = useRef<[number, number, number]>([0, 0, 0])
  const lastSavedTarget = useRef<[number, number, number]>([0, 0, 0])
  const userInteracting = useRef(false)

  useEffect(() => {
    if (!controlsRef.current || !onCameraChange) return

    const controls = controlsRef.current

    const handleStart = () => {
      userInteracting.current = true
      onUserInteractionStart?.()
    }

    const handleEnd = () => {
      userInteracting.current = false
    }

    const handleChange = () => {
      if (!userInteracting.current) return

      // Clear previous pending save
      if (pendingSave.current) {
        clearTimeout(pendingSave.current)
      }

      // Delay save, wait for user to stop interacting
      pendingSave.current = setTimeout(() => {
        const pos = camera.position
        const target = controls.target
        const threshold = 1.0

        const posChanged = Math.abs(pos.x - lastSavedPos.current[0]) > threshold ||
          Math.abs(pos.y - lastSavedPos.current[1]) > threshold ||
          Math.abs(pos.z - lastSavedPos.current[2]) > threshold
        const targetChanged = Math.abs(target.x - lastSavedTarget.current[0]) > threshold ||
          Math.abs(target.y - lastSavedTarget.current[1]) > threshold ||
          Math.abs(target.z - lastSavedTarget.current[2]) > threshold

        if (posChanged || targetChanged) {
          lastSavedPos.current = [pos.x, pos.y, pos.z]
          lastSavedTarget.current = [target.x, target.y, target.z]
          onCameraChange([pos.x, pos.y, pos.z], [target.x, target.y, target.z])
        }
      }, 1000) // Save after 1 second of user inactivity
    }

    controls.addEventListener('start', handleStart)
    controls.addEventListener('end', handleEnd)
    controls.addEventListener('change', handleChange)

    return () => {
      controls.removeEventListener('start', handleStart)
      controls.removeEventListener('end', handleEnd)
      controls.removeEventListener('change', handleChange)
      if (pendingSave.current) {
        clearTimeout(pendingSave.current)
      }
    }
  }, [camera, controlsRef, onCameraChange, onUserInteractionStart])

  return null
}

// Auto-center camera on the graph when layout stabilizes (unless user moved camera)
function CameraAutoCenter({
  positionsRef,
  controlsRef,
  enabled,
  layoutStableTick,
  hasUserInteractedRef,
  cameraInitKey,
  positionsCount,
}: {
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  controlsRef: React.RefObject<any>
  enabled: boolean
  layoutStableTick: number
  hasUserInteractedRef: React.MutableRefObject<boolean>
  cameraInitKey: string
  positionsCount: number
}) {
  const { camera } = useThree()
  const lastCenterKey = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (hasUserInteractedRef.current) return
    if (!controlsRef.current) return
    if (positionsRef.current.size === 0) return

    const centerKey = `${layoutStableTick}:${cameraInitKey}:${positionsCount}`
    if (lastCenterKey.current === centerKey) return

    let cx = 0, cy = 0, cz = 0
    for (const pos of positionsRef.current.values()) {
      cx += pos[0]
      cy += pos[1]
      cz += pos[2]
    }
    cx /= positionsRef.current.size
    cy /= positionsRef.current.size
    cz /= positionsRef.current.size

    const target = controlsRef.current.target
    const center = new THREE.Vector3(cx, cy, cz)
    const offset = new THREE.Vector3().subVectors(camera.position, target)
    const distance = target.distanceTo(center)

    if (distance > 0.001) {
      controlsRef.current.target.copy(center)
      camera.position.copy(center.clone().add(offset))
      controlsRef.current.update()
    }

    lastCenterKey.current = centerKey
  }, [camera, controlsRef, enabled, layoutStableTick, hasUserInteractedRef, positionsRef, cameraInitKey, positionsCount])

  return null
}

// Scene content
function GraphScene({
  nodes,
  edges,
  positionsRef,
  selectedNodeId,
  focusNodeId,
  focusEdgeId,
  highlightedEdge,
  onNodeSelect,
  onEdgeSelect,
  showLabels,
  initialCameraPosition,
  initialCameraTarget,
  onCameraChange,
  physics,
  isAddingEdge = false,
  isRemovingNodes = false,
  savedPositionCount = 0,
  onStable,
  layoutStableTick,
  layoutReady,
  onWarmupComplete,
}: {
  nodes: Node[]
  edges: Edge[]
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  selectedNodeId: string | null
  focusNodeId: string | null
  focusEdgeId: string | null
  highlightedEdge: HighlightedEdge | null
  onNodeSelect: (node: Node | null) => void
  onEdgeSelect: (edge: { id: string; source: string; target: string } | null) => void
  showLabels: boolean
  initialCameraPosition?: [number, number, number]
  initialCameraTarget?: [number, number, number]
  onCameraChange?: (position: [number, number, number], target: [number, number, number]) => void
  physics?: PhysicsParams
  isAddingEdge?: boolean
  isRemovingNodes?: boolean
  savedPositionCount?: number
  onStable?: () => void
  layoutStableTick: number
  layoutReady: boolean
  onWarmupComplete?: () => void
}) {
  // Node focus
  const focusPosition = focusNodeId ? positionsRef.current.get(focusNodeId) || null : null
  const prevFocusNodeId = useRef<string | null>(null)
  const shouldFocusNode = focusNodeId !== prevFocusNodeId.current && focusNodeId !== null

  useEffect(() => { prevFocusNodeId.current = focusNodeId }, [focusNodeId])

  // Edge focus
  const prevFocusEdgeId = useRef<string | null>(null)
  const shouldFocusEdge = focusEdgeId !== prevFocusEdgeId.current && focusEdgeId !== null

  useEffect(() => { prevFocusEdgeId.current = focusEdgeId }, [focusEdgeId])

  // Parse edge ID to get source and target positions
  const edgeFocusPositions = useMemo(() => {
    if (!focusEdgeId) return { source: null, target: null }
    const parts = focusEdgeId.split('->')
    if (parts.length !== 2) return { source: null, target: null }
    const [sourceId, targetId] = parts
    const sourcePos = positionsRef.current.get(sourceId) || null
    const targetPos = positionsRef.current.get(targetId) || null
    return { source: sourcePos, target: targetPos }
  }, [focusEdgeId, positionsRef])

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const controlsRef = useRef<any>(null)
  const hasUserInteractedRef = useRef(false)
  const shouldAutoCenter = !focusNodeId && !focusEdgeId
  const cameraInitKey = `${initialCameraPosition?.join(',') ?? ''}|${initialCameraTarget?.join(',') ?? ''}`
  const handleUserInteractionStart = useCallback(() => {
    hasUserInteractedRef.current = true
  }, [])
  const positionsCount = positionsRef.current.size

  // Calculate related edges
  const relatedEdges = useMemo(() => {
    const activeId = hoveredNodeId || selectedNodeId
    if (!activeId) return { inputs: new Set<string>(), outputs: new Set<string>() }
    const inputs = new Set<string>()
    const outputs = new Set<string>()
    edges.forEach(e => {
      if (e.target === activeId) inputs.add(e.id)
      if (e.source === activeId) outputs.add(e.id)
    })
    return { inputs, outputs }
  }, [hoveredNodeId, selectedNodeId, edges])

  // Detect bidirectional edges (A→B and B→A both exist)
  const bidirectionalEdges = useMemo(() => {
    const edgeSet = new Set<string>()
    const edgePairs = new Map<string, string>() // key: "source->target", value: edge.id

    edges.forEach(e => {
      edgePairs.set(`${e.source}->${e.target}`, e.id)
    })

    edges.forEach(e => {
      const reverseKey = `${e.target}->${e.source}`
      if (edgePairs.has(reverseKey)) {
        // Both edges are part of a bidirectional pair
        edgeSet.add(e.id)
        edgeSet.add(edgePairs.get(reverseKey)!)
      }
    })

    return edgeSet
  }, [edges])

  // Node status map - for edge color calculation
  const nodeStatusMap = useMemo(() => {
    const map = new Map<string, ProofStatusType>()
    nodes.forEach(node => {
      if (node.status) {
        map.set(node.id, node.status as ProofStatusType)
      }
    })
    return map
  }, [nodes])

  // Edge click handlers
  const edgeClickHandlers = useMemo(() => {
    const handlers = new Map<string, () => void>()
    edges.forEach(e => {
      handlers.set(e.id, () => onEdgeSelect({ id: e.id, source: e.source, target: e.target }))
    })
    return handlers
  }, [edges, onEdgeSelect])

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 15, 10]} intensity={3.0} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />

      <ForceLayout
        nodes={nodes}
        edges={edges}
        positionsRef={positionsRef}
        draggingNodeId={draggingNodeId}
        setDraggingNodeId={setDraggingNodeId}
        running={true}
        physics={physics}
        savedPositionCount={savedPositionCount}
        onStable={onStable}
        onWarmupComplete={onWarmupComplete}
        controlsRef={controlsRef}
      />

      {layoutReady && edges.map(edge => {
        if (!positionsRef.current.has(edge.source) || !positionsRef.current.has(edge.target)) return null
        const isInput = relatedEdges.inputs.has(edge.id)
        const isOutput = relatedEdges.outputs.has(edge.id)
        const isSelectedEdge = highlightedEdge && edge.source === highlightedEdge.source && edge.target === highlightedEdge.target
        const isDimmed = highlightedEdge !== null && !isSelectedEdge
        const isHighlighted = !!(isInput || isOutput || isSelectedEdge)
        const isBidirectional = bidirectionalEdges.has(edge.id)

        return (
          <Edge3D
            key={edge.id}
            edge={edge}
            positionsRef={positionsRef}
            isHighlighted={isHighlighted}
            highlightType={isSelectedEdge ? 'selected' : isInput ? 'input' : isOutput ? 'output' : 'none'}
            isDimmed={isDimmed}
            isBidirectional={isBidirectional}
            onClick={edgeClickHandlers.get(edge.id)}
            nodeStatusMap={nodeStatusMap}
          />
        )
      })}

      {layoutReady && nodes.map(node => {
        if (!positionsRef.current.has(node.id)) return null
        const isDimmedByEdge = highlightedEdge !== null && node.id !== highlightedEdge.source && node.id !== highlightedEdge.target
        const isEdgeEndpoint = highlightedEdge !== null && (node.id === highlightedEdge.source || node.id === highlightedEdge.target)

        return (
          <Node3D
            key={node.id}
            node={node}
            positionsRef={positionsRef}
            isSelected={selectedNodeId === node.id || isEdgeEndpoint}
            isHovered={hoveredNodeId === node.id}
            isDimmed={isDimmedByEdge}
            isClickable={isAddingEdge && selectedNodeId !== node.id}
            isRemovable={isRemovingNodes}
            onSelect={() => onNodeSelect(node)}
            onHover={(h) => setHoveredNodeId(h ? node.id : null)}
            onDragStart={() => setDraggingNodeId(node.id)}
            onDragEnd={() => setDraggingNodeId(null)}
            isDragging={draggingNodeId === node.id}
            showLabel={showLabels}
          />
        )
      })}

      <OrbitControls
        ref={controlsRef}
        enablePan
        enableZoom
        enableRotate
        minDistance={5}
        maxDistance={100}
        zoomSpeed={0.5}
        rotateSpeed={0.5}
      />
      <CameraController targetPosition={focusPosition} enabled={shouldFocusNode} controlsRef={controlsRef} />
      <EdgeCameraController
        sourcePosition={edgeFocusPositions.source}
        targetPosition={edgeFocusPositions.target}
        enabled={shouldFocusEdge}
        controlsRef={controlsRef}
      />
      <CameraInitializer initialPosition={initialCameraPosition} initialTarget={initialCameraTarget} controlsRef={controlsRef} />
      <CameraSaver
        controlsRef={controlsRef}
        onCameraChange={onCameraChange}
        onUserInteractionStart={handleUserInteractionStart}
      />
      <CameraAutoCenter
        positionsRef={positionsRef}
        controlsRef={controlsRef}
        enabled={shouldAutoCenter}
        layoutStableTick={layoutStableTick}
        hasUserInteractedRef={hasUserInteractedRef}
        cameraInitKey={cameraInitKey}
        positionsCount={positionsCount}
      />
    </>
  )
}

export function ForceGraph3D({
  nodes,
  edges,
  customNodes = [],
  customEdges = [],
  selectedNodeId = null,
  focusNodeId = null,
  focusEdgeId = null,
  highlightedEdge = null,
  onNodeSelect,
  onEdgeSelect,
  showLabels = true,
  initialCameraPosition,
  initialCameraTarget,
  onCameraChange,
  physics,
  isAddingEdge = false,
  isRemovingNodes = false,
}: ForceGraph3DProps) {
  const positionsRef = useRef<Map<string, [number, number, number]>>(new Map())
  const [layoutStableTick, setLayoutStableTick] = useState(0)
  const [layoutReady, setLayoutReady] = useState(false)
  const hasShownLayout = useRef(false)

  // Convert customNodes to Node type
  const customNodesAsNodes: Node[] = useMemo(() => {
    return customNodes.map(cn => ({
      id: cn.id,
      name: cn.name,
      kind: 'custom' as const,
      status: 'unknown' as const,
      filePath: '',
      lineNumber: 0,
      content: '',
      references: [],
      dependsOnCount: 0,
      usedByCount: 0,
      depth: 0,
      defaultColor: CUSTOM_NODE_COLOR,
      defaultSize: cn.size || 1.0,
      defaultShape: 'octahedron',
      meta: {
        notes: cn.notes,
        effect: cn.effect,
        size: cn.size,
      },
    }))
  }, [customNodes])

  // Convert customEdges to Edge type
  const customEdgesAsEdges: Edge[] = useMemo(() => {
    return customEdges.map(ce => ({
      id: ce.id,
      source: ce.source,
      target: ce.target,
      fromLean: false,
      defaultColor: '#888888',
      defaultWidth: 1.0,
      defaultStyle: 'dashed',
      meta: {
        notes: ce.notes,
        style: ce.style,
        effect: ce.effect,
      },
    }))
  }, [customEdges])

  // Merge all nodes and edges
  const allNodes = useMemo(() => [...nodes, ...customNodesAsNodes], [nodes, customNodesAsNodes])
  const allEdges = useMemo(() => [...edges, ...customEdgesAsEdges], [edges, customEdgesAsEdges])

  // Track previous node IDs to detect changes
  const prevNodeIdsRef = useRef<Set<string>>(new Set())

  // Get saved positions from canvasStore
  const canvasPositions = useCanvasStore((state) => state.positions)

  // Record how many nodes have saved positions (to decide whether to skip physics simulation)
  const [savedPositionCount, setSavedPositionCount] = useState(0)

  // Initialize node positions (including custom nodes)
  // Use nodeLifecycle module for intelligent position calculation
  useEffect(() => {
    if (allNodes.length === 0) {
      positionsRef.current.clear()
      prevNodeIdsRef.current.clear()
      setSavedPositionCount(0)
      return
    }

    const currentIds = new Set(allNodes.map(n => n.id))

    // Detect node changes
    const { added, removed } = detectNodeChanges(prevNodeIdsRef.current, currentIds)

    // Delete non-existent nodes
    for (const id of removed) {
      positionsRef.current.delete(id)
    }

    // If there are new nodes, use intelligent position calculation
    if (added.length > 0) {
      // Read saved positions from canvasStore.positions (3D: {x, y, z})
      const savedPositions = new Map<string, LifecyclePosition3D | undefined>()
      let savedCount = 0
      for (const id of added) {
        const pos = canvasPositions[id]
        if (pos) {
          // Convert to [x, y, z] format
          savedPositions.set(id, [pos.x, pos.y, pos.z])
          savedCount++
        } else {
          savedPositions.set(id, undefined)
        }
      }

      // Update saved position count (accumulate with existing)
      setSavedPositionCount(prev => prev + savedCount)

      // Get existing node positions (excluding those to be deleted)
      const existingPositions = new Map<string, LifecyclePosition3D>()
      for (const [id, pos] of positionsRef.current.entries()) {
        if (currentIds.has(id) && !added.includes(id)) {
          existingPositions.set(id, pos)
        }
      }

      // Batch calculate new node positions
      const newPositions = calculateBatchSpawnPositions(
        added,
        savedPositions,
        existingPositions,
        allEdges
      )

      // Apply new positions
      for (const [id, pos] of newPositions.entries()) {
        positionsRef.current.set(id, pos)
      }
    }

    // Update tracked node IDs
    prevNodeIdsRef.current = currentIds
  }, [allNodes, allEdges, canvasPositions])

  const handleNodeSelect = useCallback((node: Node | null) => onNodeSelect?.(node), [onNodeSelect])
  const handleEdgeSelect = useCallback((edge: { id: string; source: string; target: string } | null) => onEdgeSelect?.(edge), [onEdgeSelect])

  // Get updatePositions function for saving positions
  const updatePositions = useCanvasStore((state) => state.updatePositions)

  // Save all node positions after physics simulation stabilizes
  const handleStable = useCallback(() => {
    const positions: Record<string, Position3D> = {}
    for (const [id, pos] of positionsRef.current.entries()) {
      positions[id] = { x: pos[0], y: pos[1], z: pos[2] }
    }
    console.log('[ForceGraph3D] Simulation stable, saving', Object.keys(positions).length, 'positions')
    updatePositions(positions)
    setLayoutStableTick((current) => current + 1)
  }, [updatePositions])

  const handleWarmupComplete = useCallback(() => {
    if (!hasShownLayout.current) {
      hasShownLayout.current = true
      setLayoutReady(true)
    }
  }, [])

  useEffect(() => {
    if (allNodes.length === 0) {
      hasShownLayout.current = false
      setLayoutReady(false)
    }
  }, [allNodes.length])

  if (allNodes.length === 0) {
    return (
      <div className="w-full h-full bg-[#0a0a0f] flex items-center justify-center text-white/40">
        No nodes to display
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-[#0a0a0f]">
      <Canvas camera={{ position: [0, 0, 30], fov: 60 }} onPointerMissed={() => handleNodeSelect(null)}>
        <GraphScene
          nodes={allNodes}
          edges={allEdges}
          positionsRef={positionsRef}
          selectedNodeId={selectedNodeId}
          focusNodeId={focusNodeId}
          focusEdgeId={focusEdgeId}
          highlightedEdge={highlightedEdge}
          onNodeSelect={handleNodeSelect}
          onEdgeSelect={handleEdgeSelect}
          showLabels={showLabels}
          initialCameraPosition={initialCameraPosition}
          initialCameraTarget={initialCameraTarget}
          onCameraChange={onCameraChange}
          physics={physics}
          isAddingEdge={isAddingEdge}
          isRemovingNodes={isRemovingNodes}
          savedPositionCount={savedPositionCount}
          onStable={handleStable}
          layoutStableTick={layoutStableTick}
          layoutReady={layoutReady}
          onWarmupComplete={handleWarmupComplete}
        />
      </Canvas>
      <div className="absolute bottom-4 left-4 text-xs text-white/40 font-mono bg-black/60 px-2 py-1 rounded">
        {nodes.length} nodes{customNodes.length > 0 ? ` + ${customNodes.length} custom` : ''} | {edges.length} edges{customEdges.length > 0 ? ` + ${customEdges.length} custom` : ''} | 3D
      </div>
    </div>
  )
}

export default ForceGraph3D
