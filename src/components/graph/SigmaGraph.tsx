'use client'

/**
 * ForceGraph2D - Force-directed graph rendered using d3-force + Canvas
 *
 * Completely mimics Obsidian's effect:
 * - Repulsion between nodes
 * - Spring attraction between connected nodes
 * - When dragging, connections stretch and connected nodes follow
 * - Smooth physics simulation
 */

import { useEffect, useRef, useMemo } from 'react'
import * as d3 from 'd3'
import { Node, Edge, getNodeColor, KIND_COLORS } from '@/lib/store'
import { INTERACTION_STYLES } from '@/lib/interactions'

interface ForceNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  color: string
  originalNode: Node
}

interface ForceLink extends d3.SimulationLinkDatum<ForceNode> {
  source: ForceNode | string
  target: ForceNode | string
  id: string  // edge id for highlighting
}

interface HighlightedEdge {
  id: string
  source: string
  target: string
}

interface SigmaGraphProps {
  nodes: Node[]
  edges: Edge[]
  projectPath?: string
  onNodeClick?: (node: Node | null) => void
  onEdgeSelect?: (edge: HighlightedEdge | null) => void
  selectedNodeId?: string | null
  focusNodeId?: string | null
  highlightedEdge?: HighlightedEdge | null
  showLabels?: boolean
}

const styles = INTERACTION_STYLES['2d']

export function SigmaGraph({ nodes, edges, onNodeClick, onEdgeSelect, selectedNodeId, focusNodeId, highlightedEdge, showLabels = true }: SigmaGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simulationRef = useRef<d3.Simulation<ForceNode, ForceLink> | null>(null)
  const transformRef = useRef(d3.zoomIdentity)
  const nodesDataRef = useRef<ForceNode[]>([])
  const linksDataRef = useRef<ForceLink[]>([])
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)

  // Store these values in refs to avoid triggering re-initialization on changes
  const onNodeClickRef = useRef(onNodeClick)
  const onEdgeSelectRef = useRef(onEdgeSelect)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const highlightedEdgeRef = useRef(highlightedEdge)
  const showLabelsRef = useRef(showLabels)

  // Update refs on each render
  onNodeClickRef.current = onNodeClick
  onEdgeSelectRef.current = onEdgeSelect
  selectedNodeIdRef.current = selectedNodeId
  highlightedEdgeRef.current = highlightedEdge
  showLabelsRef.current = showLabels

  // Stabilize nodes and edges - only update when content actually changes
  const nodesKey = useMemo(() => nodes.map(n => n.id).sort().join(','), [nodes])
  const edgesKey = useMemo(() => edges.map(e => `${e.source}-${e.target}`).sort().join(','), [edges])

  const stableNodes = useMemo(() => nodes, [nodesKey])
  const stableEdges = useMemo(() => edges, [edgesKey])

  // Render function - use ref, don't put in dependency array
  const renderRef = useRef<() => void>(() => {})

  renderRef.current = () => {
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
    ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()

    ctx.save()
    ctx.translate(transform.x, transform.y)
    ctx.scale(transform.k, transform.k)

    // Draw edges
    const currentHighlightedEdge = highlightedEdgeRef.current
    const hasHighlightedEdge = currentHighlightedEdge !== null && currentHighlightedEdge !== undefined
    const currentSelectedId = selectedNodeIdRef.current

    // Calculate related edges of selected node (input/output)
    const inputEdges = new Set<string>()
    const outputEdges = new Set<string>()
    if (currentSelectedId && !hasHighlightedEdge) {
      linksDataRef.current.forEach(link => {
        const source = link.source as ForceNode
        const target = link.target as ForceNode
        if (target.id === currentSelectedId) inputEdges.add(link.id)
        if (source.id === currentSelectedId) outputEdges.add(link.id)
      })
    }
    const hasRelatedEdges = inputEdges.size > 0 || outputEdges.size > 0

    linksDataRef.current.forEach(link => {
      const source = link.source as ForceNode
      const target = link.target as ForceNode
      if (source.x != null && source.y != null && target.x != null && target.y != null) {
        const isSelectedEdge = hasHighlightedEdge &&
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
      }
    })

    // 画节点
    nodesDataRef.current.forEach(node => {
      if (node.x == null || node.y == null) return

      const isSelected = node.id === currentSelectedId
      const isEdgeEndpoint = hasHighlightedEdge &&
        (node.id === currentHighlightedEdge.source || node.id === currentHighlightedEdge.target)
      const isDimmedByEdge = hasHighlightedEdge && !isEdgeEndpoint
      const radius = (isSelected || isEdgeEndpoint) ? 8 : 5

      // 选中节点的光晕效果
      if (isSelected || isEdgeEndpoint) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius + styles.node.selected.glowRadius, 0, 2 * Math.PI)
        ctx.fillStyle = styles.node.selected.glowColor
        ctx.fill()
      }

      // 节点圆
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

      // 标签（需要开启 showLabels，且缩放足够大时显示，选中节点始终显示）
      if (showLabelsRef.current && (transform.k > 0.5 || isSelected || isEdgeEndpoint)) {
        ctx.font = `${((isSelected || isEdgeEndpoint) ? 12 : 11) / transform.k}px monospace`
        ctx.fillStyle = (isSelected || isEdgeEndpoint) ? 'rgba(255, 255, 255, 0.9)' : (isDimmedByEdge ? `rgba(255, 255, 255, ${styles.node.dimmed.opacity})` : 'rgba(255, 255, 255, 0.7)')
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const label = node.name.length > 25 ? node.name.slice(0, 22) + '...' : node.name
        ctx.fillText(label, node.x, node.y + radius + 3)
      }
    })

    ctx.restore()
  }

  // Initialization - only execute when nodes/edges content actually changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || stableNodes.length === 0) return

    // Set canvas dimensions
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      }
      renderRef.current()
    }
    resize()
    window.addEventListener('resize', resize)

    // Create node data
    const nodeMap = new Map<string, ForceNode>()
    const forceNodes: ForceNode[] = stableNodes.map(n => {
      const node: ForceNode = {
        id: n.id,
        name: n.name,
        color: getNodeColor(n),
        originalNode: n,
        x: undefined,
        y: undefined,
      }
      nodeMap.set(n.id, node)
      return node
    })

    // Create edge data
    const forceLinks: ForceLink[] = stableEdges
      .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map(e => ({
        source: e.source,
        target: e.target,
        id: `${e.source}->${e.target}`,
      }))

    nodesDataRef.current = forceNodes
    linksDataRef.current = forceLinks

    // Create force simulation - Obsidian style parameters
    const rect = canvas.getBoundingClientRect()
    const simulation = d3.forceSimulation<ForceNode>(forceNodes)
      .force('link', d3.forceLink<ForceNode, ForceLink>(forceLinks)
        .id(d => d.id)
        .distance(80)
        .strength(0.3))
      .force('charge', d3.forceManyBody()
        .strength(-200)
        .distanceMax(500))
      .force('center', d3.forceCenter(rect.width / 2, rect.height / 2).strength(0.05))
      .force('collision', d3.forceCollide(15))
      .alphaDecay(0.01)
      .velocityDecay(0.3)

    simulation.on('tick', () => renderRef.current())
    simulationRef.current = simulation

    // Find node
    const findNode = (x: number, y: number): ForceNode | null => {
      const transform = transformRef.current
      const px = (x - transform.x) / transform.k
      const py = (y - transform.y) / transform.k

      for (const node of forceNodes) {
        if (node.x == null || node.y == null) continue
        const dx = node.x - px
        const dy = node.y - py
        if (dx * dx + dy * dy < 100) {
          return node
        }
      }
      return null
    }

    // Find edge - calculate distance from point to line segment
    const findEdge = (x: number, y: number): ForceLink | null => {
      const transform = transformRef.current
      const px = (x - transform.x) / transform.k
      const py = (y - transform.y) / transform.k
      const threshold = 8 / transform.k  // Click tolerance

      for (const link of linksDataRef.current) {
        const source = link.source as ForceNode
        const target = link.target as ForceNode
        if (source.x == null || source.y == null || target.x == null || target.y == null) continue

        // Calculate distance from point to line segment
        const dx = target.x - source.x
        const dy = target.y - source.y
        const length = Math.sqrt(dx * dx + dy * dy)
        if (length === 0) continue

        // Position of projection point on line segment (0-1)
        const t = Math.max(0, Math.min(1,
          ((px - source.x) * dx + (py - source.y) * dy) / (length * length)
        ))

        // Projection point coordinates
        const projX = source.x + t * dx
        const projY = source.y + t * dy

        // Distance from point to projection point
        const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)

        if (dist < threshold) {
          return link
        }
      }
      return null
    }

    // Dragging
    let dragNode: ForceNode | null = null

    const drag = d3.drag<HTMLCanvasElement, unknown>()
      .subject((event) => {
        const node = findNode(event.x, event.y)
        if (node) {
          return { x: node.x, y: node.y, node }
        }
        return null
      })
      .on('start', (event) => {
        if (!event.subject) return
        dragNode = event.subject.node as ForceNode
        simulation.alphaTarget(0.3).restart()
        dragNode.fx = dragNode.x
        dragNode.fy = dragNode.y
      })
      .on('drag', (event) => {
        if (!dragNode) return
        const transform = transformRef.current
        dragNode.fx = (event.x - transform.x) / transform.k
        dragNode.fy = (event.y - transform.y) / transform.k
      })
      .on('end', () => {
        if (dragNode) {
          simulation.alphaTarget(0)
          dragNode.fx = null
          dragNode.fy = null
          dragNode = null
        }
      })

    // Zoom
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 10])
      .filter((event) => {
        if (event.type === 'mousedown') {
          const r = canvas.getBoundingClientRect()
          const node = findNode(event.clientX - r.left, event.clientY - r.top)
          if (node) return false
        }
        return true
      })
      .on('zoom', (event) => {
        transformRef.current = event.transform
        renderRef.current()
      })

    zoomRef.current = zoom

    // Click detection - use distance threshold to distinguish click from drag
    let mouseDownPos: { x: number; y: number } | null = null
    const DRAG_THRESHOLD = 5 // More than 5 pixels is considered dragging

    const handleMouseDown = (e: MouseEvent) => {
      mouseDownPos = { x: e.clientX, y: e.clientY }
    }

    const handleClick = (e: MouseEvent) => {
      // If movement exceeds threshold, consider it dragging, don't trigger click
      if (mouseDownPos) {
        const dx = e.clientX - mouseDownPos.x
        const dy = e.clientY - mouseDownPos.y
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
          return
        }
      }

      const r = canvas.getBoundingClientRect()
      const clickX = e.clientX - r.left
      const clickY = e.clientY - r.top

      // Check nodes first
      const node = findNode(clickX, clickY)
      if (node) {
        onNodeClickRef.current?.(node.originalNode)
        return
      }

      // Then check edges
      const edge = findEdge(clickX, clickY)
      if (edge) {
        const source = edge.source as ForceNode
        const target = edge.target as ForceNode
        onEdgeSelectRef.current?.({
          id: edge.id,
          source: source.id,
          target: target.id,
        })
        return
      }

      // Click on empty space
      onNodeClickRef.current?.(null)
      onEdgeSelectRef.current?.(null)
    }

    // Apply
    const selection = d3.select(canvas)
    selection.call(zoom)
    selection.call(drag)

    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('click', handleClick)

    // Initial centering
    const initialTransform = d3.zoomIdentity
      .translate(rect.width / 2, rect.height / 2)
      .scale(0.8)
      .translate(-rect.width / 2, -rect.height / 2)
    selection.call(zoom.transform, initialTransform)

    return () => {
      simulation.stop()
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('click', handleClick)
    }
  }, [stableNodes, stableEdges])

  // Only redraw when selection changes, don't reinitialize
  useEffect(() => {
    renderRef.current()
  }, [selectedNodeId])

  // Redraw when edge highlight changes
  useEffect(() => {
    renderRef.current()
  }, [highlightedEdge])

  // Redraw when label visibility changes
  useEffect(() => {
    renderRef.current()
  }, [showLabels])

  // Focus on specified node - smooth movement to center node
  const prevFocusNodeId = useRef<string | null | undefined>(null)
  useEffect(() => {
    // Only trigger when focusNodeId changes
    if (focusNodeId === prevFocusNodeId.current) return
    prevFocusNodeId.current = focusNodeId

    if (!focusNodeId || !canvasRef.current || !zoomRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    // Find target node
    const targetNode = nodesDataRef.current.find(n => n.id === focusNodeId)
    if (!targetNode || targetNode.x == null || targetNode.y == null) return

    // Calculate new transform: maintain current zoom, but center the node
    const currentTransform = transformRef.current
    const newTransform = d3.zoomIdentity
      .translate(centerX - targetNode.x * currentTransform.k, centerY - targetNode.y * currentTransform.k)
      .scale(currentTransform.k)

    // Smooth transition to new position
    d3.select(canvas)
      .transition()
      .duration(500)
      .ease(d3.easeCubicOut)
      .call(zoomRef.current.transform, newTransform)
  }, [focusNodeId])

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
        style={{ display: 'block' }}
      />

      <div className="absolute bottom-4 left-4 text-xs text-white/40 font-mono bg-black/60 px-2 py-1 rounded">
        {stableNodes.length} nodes | {stableEdges.length} edges | 2D
      </div>

      <div className="absolute top-4 left-4 text-xs font-mono bg-black/80 rounded p-2 space-y-1">
        <div className="text-white/50 mb-1.5 text-[10px] uppercase tracking-wide">Types</div>
        {['theorem', 'lemma', 'definition', 'proposition'].map((kind) => (
          <div key={kind} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: KIND_COLORS[kind] }} />
            <span className="text-white/40 text-[10px]">{kind}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SigmaGraph
