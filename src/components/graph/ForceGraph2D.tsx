'use client'

/**
 * ForceGraph2D - 2D Force-directed graph with ForceAtlas2 Web Worker
 *
 * Features:
 * - ForceAtlas2 layout running in Web Worker (non-blocking)
 * - Barnes-Hut O(n log n) optimization for large graphs
 * - Switchable to hierarchical (ELK) layout
 * - Canvas rendering with zoom/pan
 */

import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { useLayout, type LayoutMode } from '@/hooks/useLayout'
import type { Node, Edge } from '@/lib/store'
import { getNodeColor, KIND_COLORS } from '@/lib/store'
import { INTERACTION_STYLES } from '@/lib/interactions'

interface HighlightedEdge {
  id: string
  source: string
  target: string
}

interface ForceGraph2DProps {
  nodes: Node[]
  edges: Edge[]
  onNodeClick?: (node: Node | null) => void
  onEdgeSelect?: (edge: HighlightedEdge | null) => void
  selectedNodeId?: string | null
  focusNodeId?: string | null
  highlightedEdge?: HighlightedEdge | null
  showLabels?: boolean
  showLayoutToggle?: boolean
  initialLayoutMode?: LayoutMode
}

interface NodeData {
  id: string
  name: string
  color: string
  originalNode: Node
  x: number
  y: number
}

interface LinkData {
  source: string
  target: string
  id: string
}

const styles = INTERACTION_STYLES['2d']

export function ForceGraph2D({
  nodes,
  edges,
  onNodeClick,
  onEdgeSelect,
  selectedNodeId,
  focusNodeId,
  highlightedEdge,
  showLabels = true,
  showLayoutToggle = true,
  initialLayoutMode = 'force',
}: ForceGraph2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const transformRef = useRef({ x: 0, y: 0, k: 1 })
  const animationFrameRef = useRef<number | null>(null)

  // Interaction state
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragNodeRef = useRef<NodeData | null>(null)

  // Refs for callbacks (avoid re-renders)
  const onNodeClickRef = useRef(onNodeClick)
  const onEdgeSelectRef = useRef(onEdgeSelect)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const highlightedEdgeRef = useRef(highlightedEdge)
  const showLabelsRef = useRef(showLabels)

  // Update refs
  onNodeClickRef.current = onNodeClick
  onEdgeSelectRef.current = onEdgeSelect
  selectedNodeIdRef.current = selectedNodeId
  highlightedEdgeRef.current = highlightedEdge
  showLabelsRef.current = showLabels

  // Stabilize data
  const nodesKey = useMemo(() => nodes.map((n) => n.id).sort().join(','), [nodes])
  const edgesKey = useMemo(
    () => edges.map((e) => `${e.source}-${e.target}`).sort().join(','),
    [edges]
  )
  const stableNodes = useMemo(() => nodes, [nodesKey])
  const stableEdges = useMemo(() => edges, [edgesKey])

  // Build node/link data
  const nodeMap = useMemo(() => {
    const map = new Map<string, NodeData>()
    stableNodes.forEach((n) => {
      map.set(n.id, {
        id: n.id,
        name: n.name,
        color: getNodeColor(n),
        originalNode: n,
        x: 0,
        y: 0,
      })
    })
    return map
  }, [stableNodes])

  const links = useMemo<LinkData[]>(() => {
    return stableEdges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        id: `${e.source}->${e.target}`,
      }))
  }, [stableEdges, nodeMap])

  // Use layout hook
  const { mode, setMode, positionsRef, start, stop, isRunning } = useLayout(
    stableNodes,
    stableEdges,
    {
      initialMode: initialLayoutMode,
      autoStart: true,
      onPositionUpdate: () => {
        // Trigger re-render
        renderFrame()
      },
    }
  )

  // Render function
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const transform = transformRef.current

    // Clear canvas
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    ctx.save()
    ctx.translate(transform.x + width / 2, transform.y + height / 2)
    ctx.scale(transform.k, transform.k)

    // Update node positions from layout
    const positions = positionsRef.current
    for (const [id, pos] of positions.entries()) {
      const node = nodeMap.get(id)
      if (node) {
        node.x = pos[0]
        node.y = pos[1]
      }
    }

    // Draw edges
    const currentHighlightedEdge = highlightedEdgeRef.current
    const hasHighlightedEdge = currentHighlightedEdge !== null
    const currentSelectedId = selectedNodeIdRef.current

    // Calculate related edges
    const inputEdges = new Set<string>()
    const outputEdges = new Set<string>()
    if (currentSelectedId && !hasHighlightedEdge) {
      links.forEach((link) => {
        if (link.target === currentSelectedId) inputEdges.add(link.id)
        if (link.source === currentSelectedId) outputEdges.add(link.id)
      })
    }
    const hasRelatedEdges = inputEdges.size > 0 || outputEdges.size > 0

    links.forEach((link) => {
      const source = nodeMap.get(link.source)
      const target = nodeMap.get(link.target)
      if (!source || !target) return

      const isSelectedEdge =
        hasHighlightedEdge &&
        currentHighlightedEdge &&
        source.id === currentHighlightedEdge.source &&
        target.id === currentHighlightedEdge.target
      const isInputEdge = inputEdges.has(link.id)
      const isOutputEdge = outputEdges.has(link.id)
      const isDimmedByHighlight = hasHighlightedEdge && !isSelectedEdge
      const isDimmedByRelated = hasRelatedEdges && !isInputEdge && !isOutputEdge

      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)

      if (isSelectedEdge) {
        ctx.strokeStyle = styles.edge.selected.color
        ctx.lineWidth = styles.edge.selected.width / transform.k
      } else if (isInputEdge) {
        ctx.strokeStyle = styles.edge.input.color
        ctx.lineWidth = styles.edge.input.width / transform.k
      } else if (isOutputEdge) {
        ctx.strokeStyle = styles.edge.output.color
        ctx.lineWidth = styles.edge.output.width / transform.k
      } else if (isDimmedByHighlight || isDimmedByRelated) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${styles.edge.dimmed.opacity})`
        ctx.lineWidth = 1 / transform.k
      } else {
        ctx.strokeStyle = styles.edge.normal.color
        ctx.lineWidth = styles.edge.normal.width / transform.k
      }
      ctx.stroke()
    })

    // Draw nodes
    for (const node of nodeMap.values()) {
      const isSelected = node.id === currentSelectedId
      const isEdgeEndpoint =
        hasHighlightedEdge &&
        currentHighlightedEdge &&
        (node.id === currentHighlightedEdge.source ||
          node.id === currentHighlightedEdge.target)
      const isDimmedByEdge = hasHighlightedEdge && !isEdgeEndpoint
      const radius = isSelected || isEdgeEndpoint ? 8 : 5

      // Glow effect for selected
      if (isSelected || isEdgeEndpoint) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius + styles.node.selected.glowRadius, 0, 2 * Math.PI)
        ctx.fillStyle = styles.node.selected.glowColor
        ctx.fill()
      }

      // Node circle
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
      if (isDimmedByEdge) {
        ctx.fillStyle = node.color
        ctx.globalAlpha = styles.node.dimmed.opacity
      } else {
        ctx.fillStyle = isSelected ? '#ffffff' : node.color
        ctx.globalAlpha = 1
      }
      ctx.fill()
      ctx.globalAlpha = 1

      // Labels
      if (showLabelsRef.current && (transform.k > 0.5 || isSelected || isEdgeEndpoint)) {
        ctx.font = `${(isSelected || isEdgeEndpoint ? 12 : 11) / transform.k}px monospace`
        ctx.fillStyle =
          isSelected || isEdgeEndpoint
            ? 'rgba(255, 255, 255, 0.9)'
            : isDimmedByEdge
            ? `rgba(255, 255, 255, ${styles.node.dimmed.opacity})`
            : 'rgba(255, 255, 255, 0.7)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const label = node.name.length > 25 ? node.name.slice(0, 22) + '...' : node.name
        ctx.fillText(label, node.x, node.y + radius + 3)
      }
    }

    ctx.restore()
  }, [nodeMap, links, positionsRef])

  // Animation frame for continuous rendering
  const renderFrame = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    animationFrameRef.current = requestAnimationFrame(() => {
      render()
      // Continue rendering if layout is running
      if (isRunning) {
        renderFrame()
      }
    })
  }, [render, isRunning])

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      }
      render()
    }

    resize()
    window.addEventListener('resize', resize)
    renderFrame()

    return () => {
      window.removeEventListener('resize', resize)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [render, renderFrame])

  // Find node at position
  const findNodeAt = useCallback(
    (clientX: number, clientY: number): NodeData | null => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      const transform = transformRef.current
      const px = (clientX - rect.left - rect.width / 2 - transform.x) / transform.k
      const py = (clientY - rect.top - rect.height / 2 - transform.y) / transform.k

      for (const node of nodeMap.values()) {
        const dx = node.x - px
        const dy = node.y - py
        if (dx * dx + dy * dy < 100) {
          return node
        }
      }
      return null
    },
    [nodeMap]
  )

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const node = findNodeAt(e.clientX, e.clientY)
      if (node) {
        dragNodeRef.current = node
        setIsDragging(true)
      }
      dragStartRef.current = { x: e.clientX, y: e.clientY }
    },
    [findNodeAt]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragStartRef.current) return

      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y

      if (dragNodeRef.current) {
        // Drag node
        const transform = transformRef.current
        dragNodeRef.current.x += dx / transform.k
        dragNodeRef.current.y += dy / transform.k
        // Update position in layout
        positionsRef.current.set(dragNodeRef.current.id, [
          dragNodeRef.current.x,
          dragNodeRef.current.y,
          0,
        ])
        render()
      } else if (isDragging) {
        // Pan canvas
        transformRef.current.x += dx
        transformRef.current.y += dy
        render()
      }

      dragStartRef.current = { x: e.clientX, y: e.clientY }
    },
    [isDragging, positionsRef, render]
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (dragStartRef.current) {
        const dx = e.clientX - dragStartRef.current.x
        const dy = e.clientY - dragStartRef.current.y
        const didDrag = dx * dx + dy * dy > 25

        if (!didDrag && !dragNodeRef.current) {
          // Click - check for node
          const node = findNodeAt(e.clientX, e.clientY)
          if (node) {
            onNodeClickRef.current?.(node.originalNode)
          } else {
            onNodeClickRef.current?.(null)
            onEdgeSelectRef.current?.(null)
          }
        }
      }

      dragNodeRef.current = null
      dragStartRef.current = null
      setIsDragging(false)
    },
    [findNodeAt]
  )

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left - rect.width / 2
      const mouseY = e.clientY - rect.top - rect.height / 2

      const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1
      const newK = Math.min(10, Math.max(0.1, transformRef.current.k * scaleFactor))

      // Zoom towards mouse position
      const transform = transformRef.current
      transform.x = mouseX - (mouseX - transform.x) * (newK / transform.k)
      transform.y = mouseY - (mouseY - transform.y) * (newK / transform.k)
      transform.k = newK

      render()
    },
    [render]
  )

  // Re-render on selection change
  useEffect(() => {
    render()
  }, [selectedNodeId, highlightedEdge, showLabels, render])

  // Focus on node
  useEffect(() => {
    if (!focusNodeId) return
    const node = nodeMap.get(focusNodeId)
    if (!node) return

    // Animate to center node
    transformRef.current = {
      x: -node.x * transformRef.current.k,
      y: -node.y * transformRef.current.k,
      k: transformRef.current.k,
    }
    render()
  }, [focusNodeId, nodeMap, render])

  if (stableNodes.length === 0) {
    return (
      <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center text-white/40">
        No nodes to display
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-[#0a0a0a] relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block', cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Status bar */}
      <div className="absolute bottom-4 left-4 text-xs text-white/40 font-mono bg-black/60 px-2 py-1 rounded">
        {stableNodes.length} nodes | {stableEdges.length} edges | {mode}
      </div>

      {/* Layout toggle */}
      {showLayoutToggle && (
        <div className="absolute top-4 right-4 flex gap-1 bg-black/80 rounded p-1">
          <button
            className={`px-2 py-1 text-xs rounded transition-colors ${
              mode === 'force'
                ? 'bg-purple-600 text-white'
                : 'text-white/60 hover:text-white'
            }`}
            onClick={() => setMode('force')}
          >
            Force
          </button>
          <button
            className={`px-2 py-1 text-xs rounded transition-colors ${
              mode === 'hierarchical'
                ? 'bg-purple-600 text-white'
                : 'text-white/60 hover:text-white'
            }`}
            onClick={() => setMode('hierarchical')}
          >
            Hierarchical
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-4 left-4 text-xs font-mono bg-black/80 rounded p-2 space-y-1">
        <div className="text-white/50 mb-1.5 text-[10px] uppercase tracking-wide">
          Types
        </div>
        {['theorem', 'lemma', 'definition', 'proposition'].map((kind) => (
          <div key={kind} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: KIND_COLORS[kind] }}
            />
            <span className="text-white/40 text-[10px]">{kind}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ForceGraph2D
