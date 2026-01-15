'use client'

import { useState, useEffect, useCallback, Suspense, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
    HomeIcon,
    MagnifyingGlassIcon,
    XMarkIcon,
    CodeBracketIcon,
    CubeIcon,
    SwatchIcon,
    PencilSquareIcon,
    PlusIcon,
    ArrowPathIcon,
    FunnelIcon,
    Cog6ToothIcon,
    EyeIcon,
    EyeSlashIcon,
    TagIcon,
    ArrowLongRightIcon,
    ChevronDownIcon,
    ArrowsPointingOutIcon,
    TrashIcon,
    DocumentTextIcon,
    BoltIcon,
} from '@heroicons/react/24/outline'
import { useGraphData, type GraphNode } from '@/hooks/useGraphData'
import { UIColors } from '@/lib/colors'
import { PROOF_STATUS_CONFIG, type ProofStatusType } from '@/lib/proofStatus'
import type { NodeKind, NodeStatus, AstrolabeNode, AstrolabeEdge } from '@/types/graph'
import NodeStylePanel from '@/components/NodeStylePanel'
import EdgeStylePanel from '@/components/EdgeStylePanel'
import { ProjectInitPanel } from '@/components/ProjectInitPanel'
import { SearchPanel } from '@/components/SearchPanel'
import { LeanCodePanel } from '@/components/LeanCodePanel'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { useCanvasStore, type SearchResult } from '@/lib/canvasStore'
import { calculateNodeStatusLines } from '@/lib/successLines'
import { readFile, readFullFile, updateNodeMeta, updateEdgeMeta, getViewport, updateViewport, type FileContent, type ViewportData } from '@/lib/api'
import type { Node, Edge } from '@/lib/store'

// Dynamically import graph components
const SigmaGraph = dynamic(() => import('@/components/graph/SigmaGraph'), {
    ssr: false,
    loading: () => (
        <div className="h-full flex items-center justify-center text-white/40 bg-black">
            Loading 2D graph...
        </div>
    )
})

const ForceGraph3D = dynamic(() => import('@/components/graph3d/ForceGraph3D'), {
    ssr: false,
    loading: () => (
        <div className="h-full flex items-center justify-center text-white/40 bg-black">
            Loading 3D graph...
        </div>
    )
})

// Import physics types
import type { PhysicsParams } from '@/components/graph3d/ForceGraph3D'
import { DEFAULT_PHYSICS } from '@/components/graph3d/ForceLayout'


const getStatusLabel = (status: string) => {
    switch (status) {
        case 'proven': return 'Proven'
        case 'sorry': return 'Has sorry'
        case 'stated': return 'Stated only'
        default: return 'Unknown'
    }
}

const getTypeLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1)
}

type ViewMode = '2d' | '3d'

function LocalEditorContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const projectPath = searchParams.get('path') || ''
    const projectName = projectPath.split('/').pop() || 'Project'

    // Suppress Monaco "Canceled" errors globally
    // These occur during unmount and are harmless
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            if (event.message === 'Canceled' || event.error?.message === 'Canceled') {
                event.preventDefault()
                event.stopPropagation()
                return true
            }
        }
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (event.reason?.message === 'Canceled' || event.reason?.name === 'Canceled') {
                event.preventDefault()
                return
            }
        }
        window.addEventListener('error', handleError, true)
        window.addEventListener('unhandledrejection', handleUnhandledRejection)
        return () => {
            window.removeEventListener('error', handleError, true)
            window.removeEventListener('unhandledrejection', handleUnhandledRejection)
        }
    }, [])

    const [isTauri, setIsTauri] = useState(false)
    const [infoPanelOpen, setInfoPanelOpen] = useState(true) // Node Info panel
    const [searchPanelOpen, setSearchPanelOpen] = useState(true) // Left search panel
    const [viewMode, setViewMode] = useState<ViewMode>('3d') // Default 3D view
    const [focusNodeId, setFocusNodeId] = useState<string | null>(null) // Node ID to focus on
    const [focusEdgeId, setFocusEdgeId] = useState<string | null>(null) // Edge ID to focus on
    const [showLabels, setShowLabels] = useState(true) // Whether to show node labels
    const [showShortcutEdges, setShowShortcutEdges] = useState(false) // Whether to show shortcut edges

    // Physics settings for 3D force graph
    const [showPhysicsPanel, setShowPhysicsPanel] = useState(false)
    const [physics, setPhysics] = useState<PhysicsParams>({ ...DEFAULT_PHYSICS })

    // Viewport state (camera position persistence)
    const [initialViewport, setInitialViewport] = useState<ViewportData | null>(null)
    const [viewportLoaded, setViewportLoaded] = useState(false)

    // When project path changes, reset viewport loading state
    const prevProjectPathRef = useRef<string | null>(null)
    const selectionRestoredRef = useRef(false)
    useEffect(() => {
        if (projectPath !== prevProjectPathRef.current) {
            prevProjectPathRef.current = projectPath
            setViewportLoaded(false)
            setInitialViewport(null)
            selectionRestoredRef.current = false  // Reset selection restored flag
            // Also clear current selection state, wait to load from new project
            setSelectedNodeState(null)
            setSelectedEdge(null)
        }
    }, [projectPath])

    // Lean code viewer state
    const [codeViewerOpen, setCodeViewerOpen] = useState(false)
    const [codeFile, setCodeFile] = useState<FileContent | null>(null)
    const [codeLoading, setCodeLoading] = useState(false)
    const [codeDirty, setCodeDirty] = useState(false)  // Whether there are unsaved changes


    // Canvas store - manages on-demand added nodes
    const {
        visibleNodes,
        customNodes,
        customEdges,
        positionsLoaded,
        searchResults,
        setProjectPath: setCanvasProjectPath,
        loadCanvas,
        addNode: addCanvasNode,
        addNodes: addCanvasNodes,
        removeNode: removeCanvasNode,
        clearCanvas,
        resetAllData,
        addCustomNode,
        updateCustomNode,
        removeCustomNode,
        addCustomEdge,
        removeCustomEdge,
        deleteNodeWithMeta,
    } = useCanvasStore()

    // Custom node creation dialog state
    const [showCustomNodeDialog, setShowCustomNodeDialog] = useState(false)
    const [customNodeName, setCustomNodeName] = useState('')

    // Edit custom node name
    const [isEditingCustomNodeName, setIsEditingCustomNodeName] = useState(false)
    const [editingCustomNodeNameValue, setEditingCustomNodeNameValue] = useState('')
    const customNodeNameInputRef = useRef<HTMLInputElement>(null)

    // Add custom edge mode
    const [isAddingEdge, setIsAddingEdge] = useState(false)
    const [addingEdgeDirection, setAddingEdgeDirection] = useState<'outgoing' | 'incoming'>('outgoing')

    // Remove node mode - click nodes on canvas to delete directly
    const [isRemovingNodes, setIsRemovingNodes] = useState(false)

    // Edges panel collapse state
    const [customDepsExpanded, setCustomDepsExpanded] = useState(true)
    const [customUsedByExpanded, setCustomUsedByExpanded] = useState(true)
    const [provenDepsExpanded, setProvenDepsExpanded] = useState(true)
    const [provenUsedByExpanded, setProvenUsedByExpanded] = useState(true)

    // Confirmation dialog state
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [showReloadPrompt, setShowReloadPrompt] = useState(false)
    const [showClearCanvasDialog, setShowClearCanvasDialog] = useState(false)
    const [selectedNodesToRemove, setSelectedNodesToRemove] = useState<Set<string>>(new Set())

    // Graph data - source nodes from backend API
    // Use nodes and edges (including backend-calculated default styles), while keeping legacyNodes for search and other compatibility features
    const { nodes: astrolabeNodes, edges: astrolabeEdges, legacyNodes: graphNodes, links: graphLinks, loading: graphLoading, reload: reloadGraph, reloadMeta, projectStatus, needsInit, notSupported, recheckStatus } = useGraphData(projectPath)

    // Color helper - extract color mapping from backend-returned node data
    const typeColors = useMemo(() => {
        const colors: Record<string, string> = {}
        for (const node of astrolabeNodes) {
            if (!colors[node.kind]) {
                colors[node.kind] = node.defaultColor
            }
        }
        return colors
    }, [astrolabeNodes])

    // Status colors - from unified proof status config (memoized for performance)
    const statusColors: Record<string, string> = useMemo(() =>
        Object.fromEntries(
            Object.entries(PROOF_STATUS_CONFIG).map(([key, config]) => [key, config.color])
        ),
        []  // PROOF_STATUS_CONFIG is static, only compute once
    )

    // Selected node for info panel - sync with astrolabe config
    const [selectedNode, setSelectedNodeState] = useState<GraphNode | null>(null)
    // Click counter, used to trigger Monaco highlight refresh (even when clicking the same node)
    const [nodeClickCount, setNodeClickCount] = useState(0)

    // Selected edge for edge style editing
    interface SelectedEdge {
        id: string
        source: string
        target: string
        sourceName: string
        targetName: string
        notes?: string
        style?: string
        effect?: string
        defaultStyle: string  // Default style for this edge
    }
    const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null)

    const setSelectedNode = useCallback((node: GraphNode | null) => {
        setSelectedNodeState(node)
        setNodeClickCount(c => c + 1)  // Increment on each click, trigger highlight refresh
        // As long as node is selected and on canvas, focus on it
        // Check regular node or custom node
        const isOnCanvas = node && (
            visibleNodes.includes(node.id) ||
            customNodes.some(cn => cn.id === node.id)
        )
        if (isOnCanvas) {
            setFocusNodeId(node.id)
        }
        // If newly selected node is not either end of current edge, clear edge highlight
        if (node && selectedEdge) {
            if (node.id !== selectedEdge.source && node.id !== selectedEdge.target) {
                setSelectedEdge(null)
            }
        }
        // Save selected node to viewport
        if (projectPath) {
            updateViewport(projectPath, {
                selected_node_id: node?.id,
            }).catch((err) => {
                console.error('[page] Failed to save selected node:', err)
            })
        }
    }, [visibleNodes, customNodes, projectPath, selectedEdge])

    // When graphNodes updates, synchronize update of selectedNode (keep meta data up to date)
    useEffect(() => {
        if (selectedNode && graphNodes.length > 0) {
            const updatedNode = graphNodes.find(n => n.id === selectedNode.id)
            if (updatedNode && (
                updatedNode.customSize !== selectedNode.customSize ||
                updatedNode.customEffect !== selectedNode.customEffect ||
                updatedNode.customColor !== selectedNode.customColor
            )) {
                setSelectedNodeState(updatedNode)
            }
        }
    }, [graphNodes, selectedNode])

    // Handle adding custom edge
    const handleAddCustomEdge = useCallback(async (targetNodeId: string) => {
        if (!selectedNode || !isAddingEdge) return

        const source = addingEdgeDirection === 'outgoing' ? selectedNode.id : targetNodeId
        const target = addingEdgeDirection === 'outgoing' ? targetNodeId : selectedNode.id

        // Cannot add edge from self to self
        if (source === target) {
            console.log('[page] Cannot add edge to self')
            setIsAddingEdge(false)
            return
        }

        try {
            // Pass all Lean edges to check for cycles
            const leanEdges = astrolabeEdges.map(e => ({ source: e.source, target: e.target }))
            const result = await addCustomEdge(source, target, leanEdges)

            if (result.error) {
                // Show error alert for cycle detection
                alert(result.error)
                console.warn('[page] Edge creation blocked:', result.error)
            } else if (result.edge) {
                console.log('[page] Created custom edge:', result.edge)
            }
        } catch (err) {
            console.error('[page] Failed to create custom edge:', err)
        }

        setIsAddingEdge(false)
    }, [selectedNode, isAddingEdge, addingEdgeDirection, addCustomEdge, astrolabeEdges])

    // Cancel adding edge mode
    const cancelAddingEdge = useCallback(() => {
        setIsAddingEdge(false)
    }, [])

    // Save custom node name
    const saveCustomNodeName = useCallback(async () => {
        if (!selectedNode || selectedNode.type !== 'custom' || !editingCustomNodeNameValue.trim()) {
            setIsEditingCustomNodeName(false)
            return
        }
        const newName = editingCustomNodeNameValue.trim()
        if (newName !== selectedNode.name) {
            await updateCustomNode(selectedNode.id, { name: newName })
            // Update selectedNode display
            setSelectedNodeState(prev => prev ? { ...prev, name: newName } : null)
        }
        setIsEditingCustomNodeName(false)
    }, [selectedNode, editingCustomNodeNameValue, updateCustomNode])

    // When selected node is added to canvas, automatically focus on it
    const prevVisibleNodesRef = useRef<string[]>([])
    useEffect(() => {
        if (selectedNode && visibleNodes.includes(selectedNode.id)) {
            // Check if it's a newly added node
            if (!prevVisibleNodesRef.current.includes(selectedNode.id)) {
                setFocusNodeId(selectedNode.id)
            }
        }
        prevVisibleNodesRef.current = visibleNodes
    }, [visibleNodes, selectedNode])

    // Notes - now from backend meta.json via graphNode.notes
    const [editingNote, setEditingNote] = useState<string>('')
    // Code view mode: 'code' for Lean code, 'notes' for Markdown notes
    const [codeViewMode, setCodeViewMode] = useState<'code' | 'notes'>('code')

    // Tool panel view state
    const [toolPanelView, setToolPanelView] = useState<'edges' | 'notes' | 'style' | 'neighbors' | null>(null)
    const [notesExpanded, setNotesExpanded] = useState(false)


    // Auto-save note when it changes (with debounce)
    // Uniformly store to backend meta.json, no longer use frontend local config
    const saveNoteTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const handleNoteChange = useCallback((value: string) => {
        setEditingNote(value)
        // Debounce auto-save
        if (saveNoteTimeoutRef.current) {
            clearTimeout(saveNoteTimeoutRef.current)
        }
        if (selectedNode && projectPath) {
            saveNoteTimeoutRef.current = setTimeout(async () => {
                // Only save to backend meta.json
                try {
                    await updateNodeMeta(projectPath, selectedNode.id, {
                        notes: value || undefined, // Empty value passes undefined which will delete the field
                    })
                } catch (err) {
                    console.error('[handleNoteChange] Failed to sync note to backend:', err)
                }
            }, 500) // Save after 500ms of no typing
        }
    }, [selectedNode, projectPath])


    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveNoteTimeoutRef.current) {
                clearTimeout(saveNoteTimeoutRef.current)
            }
        }
    }, [])

    // Unified node selection entry point
    const selectNode = useCallback((node: GraphNode | null) => {
        setSelectedNode(node)
        if (node) {
            setEditingNote(node.notes || '')
            // If node has Lean file, automatically open code viewer
            if (node.leanFilePath) {
                setCodeViewerOpen(true)
                setCodeViewMode('code')
            }
        } else {
            setEditingNote('')
            setCodeViewerOpen(false)
        }
    }, [setSelectedNode])

    // Handle style change from NodeStylePanel
    // Uniformly store to backend meta.json, no longer use frontend local config
    const handleStyleChange = useCallback(async (nodeId: string, style: { effect?: string; size?: number }) => {
        console.log('[handleStyleChange]', { nodeId, style })
        if (!projectPath) return
        try {
            // Call backend API to save meta
            await updateNodeMeta(projectPath, nodeId, {
                size: style.size,
                effect: style.effect,
            })
            // Refresh data to display new style
            // reloadMeta refreshes Lean nodes, loadCanvas refreshes custom nodes
            console.log('[handleStyleChange] Refreshing meta after update...')
            reloadMeta()
            loadCanvas()
        } catch (err) {
            console.error('[handleStyleChange] Failed to update node meta:', err)
        }
    }, [projectPath, reloadMeta, loadCanvas])

    // Handle edge style change from EdgeStylePanel
    const handleEdgeStyleChange = useCallback(async (edgeId: string, style: { effect?: string; style?: string }) => {
        console.log('[handleEdgeStyleChange]', { edgeId, style })
        if (!projectPath) return
        try {
            // Call backend API to save edge meta
            await updateEdgeMeta(projectPath, edgeId, {
                effect: style.effect,
                style: style.style,
            })
            // Refresh data to display new styles
            // reloadMeta refreshes regular edges, loadCanvas refreshes custom edges
            reloadMeta()
            loadCanvas()
        } catch (err) {
            console.error('[handleEdgeStyleChange] Failed to update edge meta:', err)
        }
    }, [projectPath, reloadMeta, loadCanvas])

    // Toggle code viewer
    const handleToggleCodeViewer = useCallback(() => {
        setCodeViewerOpen(prev => !prev)
    }, [])

    // Automatically load code when codeViewerOpen is true and there is a selectedNode
    useEffect(() => {
        if (!codeViewerOpen || !selectedNode?.leanFilePath) {
            return
        }

        const loadCode = async () => {
            setCodeLoading(true)
            try {
                // Load full file to support editing
                const result = await readFullFile(selectedNode.leanFilePath!)
                setCodeFile(result)
            } catch (error) {
                console.error('Failed to read file:', error)
                setCodeFile({
                    content: '-- Failed to load file',
                    startLine: 1,
                    endLine: 1,
                    totalLines: 1,
                })
            } finally {
                setCodeLoading(false)
            }
        }

        loadCode()
    }, [codeViewerOpen, selectedNode?.leanFilePath, selectedNode?.leanLineNumber])

    // Handle code editing changes
    const handleCodeChange = useCallback(async (newContent: string) => {
        if (!projectPath || !selectedNode?.leanFilePath) return

        // Update local state
        setCodeFile(prev => prev ? { ...prev, content: newContent } : null)
        setCodeDirty(true)  // Mark as having unsaved changes
    }, [projectPath, selectedNode?.leanFilePath])

    // Save file to disk (placeholder - file saving not implemented yet)
    const handleSaveFile = useCallback(async () => {
        if (!projectPath || !selectedNode?.leanFilePath || !codeFile) {
            return
        }
        // TODO: Implement file saving via Tauri API
        console.warn('[Save] File saving not implemented yet')
        setCodeDirty(false)  // Clear dirty state for now
    }, [projectPath, selectedNode?.leanFilePath, codeFile])

    // Ctrl+S keyboard shortcut for saving (backup, mainly handled by Monaco Editor)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                handleSaveFile()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleSaveFile])

    // Reset dirty state when switching files
    useEffect(() => {
        setCodeDirty(false)
    }, [selectedNode?.leanFilePath])

    const handleToggleToolView = (tool: 'edges' | 'notes' | 'style' | 'neighbors') => {
        if (toolPanelView === tool) {
            setToolPanelView(null) // Toggle off (collapse)
        } else {
            setToolPanelView(tool) // Expand this section
        }
    }

    // Check if right panel should be visible (info panel or code viewer)
    const rightPanelVisible = infoPanelOpen || codeViewerOpen

    useEffect(() => {
        setIsTauri(!!(window as any).__TAURI_INTERNALS__)
    }, [])

    // Initialize canvasStore
    useEffect(() => {
        if (projectPath) {
            setCanvasProjectPath(projectPath)
            loadCanvas()
        }
    }, [projectPath, setCanvasProjectPath, loadCanvas])

    // Load viewport state (only load camera position)
    useEffect(() => {
        if (!projectPath || viewportLoaded) return

        getViewport(projectPath)
            .then((viewport) => {
                setInitialViewport(viewport)
                setViewportLoaded(true)
            })
            .catch((err) => {
                console.error('[page] Failed to load viewport:', err)
                setViewportLoaded(true)
            })
    }, [projectPath, viewportLoaded])

    // Restore selection state (executed after node data is loaded)
    useEffect(() => {
        // Requires viewport loaded, node data loaded, and selection not yet restored
        if (!initialViewport || graphNodes.length === 0 || selectionRestoredRef.current) return

        // Mark as restored to avoid duplicate execution
        selectionRestoredRef.current = true

        // Restore selected node
        if (initialViewport.selected_node_id) {
            const savedNode = graphNodes.find(n => n.id === initialViewport.selected_node_id)
            if (savedNode) {
                setSelectedNodeState(savedNode)
                setEditingNote(savedNode.notes || '')
                // Trigger focus on selected node
                setFocusNodeId(savedNode.id)
                console.log('[page] Restored selected node:', savedNode.id)
            }
        }

        // Restore selected edge
        if (initialViewport.selected_edge_id) {
            const parts = initialViewport.selected_edge_id.split('->')
            if (parts.length === 2) {
                const [sourceId, targetId] = parts
                const sourceNode = graphNodes.find(n => n.id === sourceId) || customNodes.find(n => n.id === sourceId)
                const targetNode = graphNodes.find(n => n.id === targetId) || customNodes.find(n => n.id === targetId)
                // Find edge style information
                const edgeData = astrolabeEdges.find(e => e.id === initialViewport.selected_edge_id)
                const customEdge = customEdges.find(e => e.id === initialViewport.selected_edge_id)
                if (sourceNode && targetNode) {
                    setSelectedEdge({
                        id: initialViewport.selected_edge_id,
                        source: sourceId,
                        target: targetId,
                        sourceName: sourceNode.name,
                        targetName: targetNode.name,
                        notes: edgeData?.notes || customEdge?.notes,
                        style: edgeData?.style || customEdge?.style,
                        effect: edgeData?.effect || customEdge?.effect,
                        defaultStyle: edgeData?.defaultStyle || 'solid',
                    })
                    // Trigger focus on edge
                    setFocusEdgeId(initialViewport.selected_edge_id)
                    console.log('[page] Restored selected edge:', initialViewport.selected_edge_id)
                }
            }
        }
    }, [initialViewport, graphNodes, customNodes, astrolabeEdges, customEdges])

    // Save camera position (with debounce)
    const saveCameraTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastCameraRef = useRef<{ position: [number, number, number]; target: [number, number, number]; saved: boolean } | null>(null)
    const handleCameraChange = useCallback((
        position: [number, number, number],
        target: [number, number, number]
    ) => {
        if (!projectPath) return

        // Record latest camera position
        lastCameraRef.current = { position, target, saved: false }

        // Debounce: save after 500ms
        if (saveCameraTimeoutRef.current) {
            clearTimeout(saveCameraTimeoutRef.current)
        }
        saveCameraTimeoutRef.current = setTimeout(() => {
            updateViewport(projectPath, {
                camera_position: position,
                camera_target: target,
            }).then(() => {
                if (lastCameraRef.current) {
                    lastCameraRef.current.saved = true
                }
            }).catch((err) => {
                console.error('[page] Failed to save camera position:', err)
            })
        }, 500)
    }, [projectPath])

    // Save unsaved camera position before page unload
    const projectPathRef = useRef(projectPath)
    projectPathRef.current = projectPath

    useEffect(() => {
        const saveBeforeUnload = () => {
            if (projectPathRef.current && lastCameraRef.current && !lastCameraRef.current.saved) {
                // Use sendBeacon for synchronous save (does not block page close)
                const data = JSON.stringify({
                    path: projectPathRef.current,
                    camera_position: lastCameraRef.current.position,
                    camera_target: lastCameraRef.current.target,
                })
                navigator.sendBeacon('http://127.0.0.1:8765/api/canvas/viewport', data)
            }
        }

        window.addEventListener('beforeunload', saveBeforeUnload)
        return () => {
            window.removeEventListener('beforeunload', saveBeforeUnload)
            // Also save on component unmount
            if (projectPathRef.current && lastCameraRef.current && !lastCameraRef.current.saved) {
                updateViewport(projectPathRef.current, {
                    camera_position: lastCameraRef.current.position,
                    camera_target: lastCameraRef.current.target,
                }).catch(() => {})
            }
            if (saveCameraTimeoutRef.current) {
                clearTimeout(saveCameraTimeoutRef.current)
            }
        }
    }, [])

    // Calculate nodes and edges to display on canvas
    // Convert GraphNode to Node type
    const mapStatusToNodeStatus = (status: string): 'proven' | 'sorry' | 'error' | 'unknown' => {
        if (status === 'proven') return 'proven'
        if (status === 'sorry') return 'sorry'
        if (status === 'error') return 'error'
        return 'unknown' // 'stated' and other statuses map to 'unknown'
    }

    const canvasNodes: Node[] = useMemo(() => {
        // Only show nodes in visibleNodes, using backend-returned default styles
        return astrolabeNodes
            .filter(node => visibleNodes.includes(node.id))
            .map(node => ({
                id: node.id,
                name: node.name,
                kind: node.kind,
                filePath: node.leanFile?.path || '',
                lineNumber: node.leanFile?.line || 0,
                status: mapStatusToNodeStatus(node.status),
                references: [],
                // Statistics fields
                dependsOnCount: 0,
                usedByCount: 0,
                depth: 0,
                // Default styles - directly use backend-returned values
                defaultColor: node.defaultColor,
                defaultSize: node.defaultSize,
                defaultShape: node.defaultShape,
                // User override styles - from meta.json
                meta: {
                    size: node.size,
                    shape: node.shape,
                    effect: node.effect,
                    // Position information - used for direct positioning during initialization, avoiding physics simulation "pulling"
                    position: node.position ? [node.position.x, node.position.y, node.position.z] as [number, number, number] : undefined,
                },
            }))
    }, [astrolabeNodes, visibleNodes])

    const canvasEdges: Edge[] = useMemo(() => {
        const nodeIds = new Set(canvasNodes.map(n => n.id))
        // Use backend-returned edge data (including default styles)
        return astrolabeEdges
            .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
            .map(edge => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                fromLean: edge.fromLean,
                visible: edge.visible,
                // Default styles - directly use backend-returned values
                defaultColor: edge.defaultColor,
                defaultWidth: edge.defaultWidth,
                defaultStyle: edge.defaultStyle,
                // User override styles - from meta.json (color and width removed)
                meta: {
                    style: edge.style,
                    effect: edge.effect,
                },
            }))
    }, [astrolabeEdges, canvasNodes])

    // Only show customNodes in visibleNodes (uniformly controlled by visibleNodes[] for visibility)
    const visibleCustomNodes = useMemo(() => {
        const visibleNodeIds = new Set(visibleNodes)
        return customNodes.filter(node => visibleNodeIds.has(node.id))
    }, [customNodes, visibleNodes])

    // Only show customEdges where both endpoint nodes are visible
    const visibleCustomEdges = useMemo(() => {
        const visibleNodeIds = new Set(visibleNodes)
        return customEdges.filter(edge => {
            // Both source and target need to be in visibleNodes
            const sourceVisible = visibleNodeIds.has(edge.source)
            const targetVisible = visibleNodeIds.has(edge.target)
            return sourceVisible && targetVisible
        })
    }, [customEdges, visibleNodes])

    // Calculate status lines for each node in the current file (for displaying status icons)
    // proven -> ✓, sorry -> ⚠
    const nodeStatusLines = useMemo(() => {
        return calculateNodeStatusLines(selectedNode?.leanFilePath, astrolabeNodes)
    }, [selectedNode?.leanFilePath, astrolabeNodes])

    // Handle node click (adapted to Node type)
    const handleCanvasNodeClick = useCallback((node: Node | null) => {
        // Clear edge selection when clicking on a node
        setSelectedEdge(null)

        if (!node) {
            // Clicking empty area cancels add edge mode or delete mode
            if (isAddingEdge) {
                cancelAddingEdge()
            }
            if (isRemovingNodes) {
                setIsRemovingNodes(false)
            }
            setSelectedNode(null)
            // Close code viewer when deselecting (return to initial state)
            setCodeViewerOpen(false)
            return
        }

        // If in delete node mode, directly delete the node
        if (isRemovingNodes) {
            removeCanvasNode(node.id)
            // If deleting the currently selected node, clear selection state
            if (selectedNode?.id === node.id) {
                setSelectedNode(null)
            }
            return
        }

        // If in add edge mode, handle target node selection
        if (isAddingEdge && selectedNode) {
            handleAddCustomEdge(node.id)
            return
        }

        // First check if it's a custom node
        const customNode = customNodes.find(cn => cn.id === node.id)
        if (customNode) {
            // Construct a GraphNode-like object for right panel display
            const fakeGraphNode: GraphNode = {
                id: customNode.id,
                name: customNode.name,
                type: 'custom',
                status: 'unknown',
                notes: customNode.notes,
                leanFilePath: undefined,
                leanLineNumber: undefined,
            }
            selectNode(fakeGraphNode)
            return
        }

        // Find the corresponding GraphNode
        const graphNode = graphNodes.find(gn => gn.id === node.id)
        if (graphNode) {
            selectNode(graphNode)
        }
    }, [graphNodes, customNodes, selectNode, setSelectedNode, isAddingEdge, selectedNode, handleAddCustomEdge, cancelAddingEdge, isRemovingNodes, removeCanvasNode])

    // Show clear canvas dialog
    const handleClearCanvas = useCallback(() => {
        setSelectedNodesToRemove(new Set())
        setShowClearCanvasDialog(true)
    }, [])

    // Toggle selection of node to remove
    const toggleNodeToRemove = useCallback((nodeId: string) => {
        setSelectedNodesToRemove(prev => {
            const newSet = new Set(prev)
            if (newSet.has(nodeId)) {
                newSet.delete(nodeId)
            } else {
                newSet.add(nodeId)
            }
            return newSet
        })
    }, [])

    // Select all / deselect all
    const selectAllNodesToRemove = useCallback(() => {
        const allIds = canvasNodes.map(n => n.id)
        setSelectedNodesToRemove(new Set(allIds))
    }, [canvasNodes])

    const deselectAllNodesToRemove = useCallback(() => {
        setSelectedNodesToRemove(new Set())
    }, [])

    // Remove selected nodes
    const removeSelectedNodes = useCallback(async () => {
        for (const nodeId of selectedNodesToRemove) {
            await removeCanvasNode(nodeId)
        }
        setSelectedNodesToRemove(new Set())
        setSelectedNode(null)
        if (selectedNodesToRemove.size === canvasNodes.length) {
            setShowClearCanvasDialog(false)
        }
    }, [selectedNodesToRemove, removeCanvasNode, setSelectedNode, canvasNodes.length])

    // Clear all nodes
    const clearAllNodes = useCallback(() => {
        clearCanvas()
        setSelectedNode(null)
        setShowClearCanvasDialog(false)
    }, [clearCanvas, setSelectedNode])

    // Show reset confirmation dialog
    const handleResetAllData = useCallback(() => {
        setShowResetConfirm(true)
    }, [])

    // Confirm reset all data
    const confirmResetAllData = useCallback(async () => {
        await resetAllData()
        setSelectedNode(null)
        setShowResetConfirm(false)
        // Show reload prompt
        setShowReloadPrompt(true)
    }, [resetAllData, setSelectedNode])

    // Handle creating custom node
    const handleCreateCustomNode = useCallback(async () => {
        const name = customNodeName.trim()
        if (!name) return

        // Generate ID (using timestamp to ensure uniqueness)
        const id = `custom-${Date.now()}`
        const node = await addCustomNode(id, name)

        if (node) {
            setShowCustomNodeDialog(false)
            setCustomNodeName('')
            console.log('[page] Created custom node:', node)
        }
    }, [customNodeName, addCustomNode])

    // Handle search result selection - find the corresponding GraphNode and select it
    const handleSearchResultSelect = useCallback((result: SearchResult) => {
        // First check if it's a custom node
        if (result.kind === 'custom') {
            const customNode = customNodes.find(cn => cn.id === result.id)
            if (customNode) {
                // Construct a GraphNode-like object
                const fakeGraphNode: GraphNode = {
                    id: customNode.id,
                    name: customNode.name,
                    type: 'custom',
                    status: 'proven',
                    leanFilePath: '',
                    leanLineNumber: 0,
                    notes: customNode.notes || '',
                }
                selectNode(fakeGraphNode)
                setInfoPanelOpen(true)
                setFocusNodeId(customNode.id) // Focus on custom node
            }
            return
        }

        // Regular node
        const matchingNode = graphNodes.find(node => node.id === result.id)
        if (matchingNode) {
            selectNode(matchingNode)
            setInfoPanelOpen(true) // Auto-open info panel
        }
    }, [graphNodes, customNodes, selectNode])

    // Handle edge selection from 3D view (stable callback to prevent edge flickering)
    const handleEdgeSelect = useCallback((edge: { id: string; source: string; target: string } | null) => {
        if (!edge) {
            setSelectedEdge(null)
            // Save cleared edge selection to viewport
            if (projectPath) {
                updateViewport(projectPath, { selected_edge_id: '' }).catch((err) => {
                    console.error('[page] Failed to clear selected edge:', err)
                })
            }
            return
        }
        // Find node names for display (check both graphNodes and customNodes)
        const sourceNode = graphNodes.find(n => n.id === edge.source) || customNodes.find(n => n.id === edge.source)
        const targetNode = graphNodes.find(n => n.id === edge.target) || customNodes.find(n => n.id === edge.target)
        // Find edge data for style/effect (check both astrolabeEdges and customEdges)
        const edgeData = astrolabeEdges.find(e => e.id === edge.id)
        const customEdge = customEdges.find(e => e.id === edge.id)
        // Toggle if same edge clicked
        if (selectedEdge?.id === edge.id) {
            setSelectedEdge(null)
            // Save cleared edge selection to viewport
            if (projectPath) {
                updateViewport(projectPath, { selected_edge_id: '' }).catch((err) => {
                    console.error('[page] Failed to clear selected edge:', err)
                })
            }
        } else {
            setSelectedEdge({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceName: sourceNode?.name || edge.source,
                targetName: targetNode?.name || edge.target,
                style: edgeData?.style ?? customEdge?.style,
                effect: edgeData?.effect ?? customEdge?.effect,
                defaultStyle: edgeData?.defaultStyle ?? (customEdge ? 'dashed' : 'solid'),
            })
            // Focus on edge
            setFocusEdgeId(edge.id)
            // Open Edges tool panel to show edge style
            setToolPanelView('edges')
            // Save selected edge to viewport
            if (projectPath) {
                updateViewport(projectPath, { selected_edge_id: edge.id }).catch((err) => {
                    console.error('[page] Failed to save selected edge:', err)
                })
            }
        }
    }, [graphNodes, customNodes, astrolabeEdges, customEdges, selectedEdge, projectPath])

    // Unified node navigation function - handles GraphNode and CustomNode
    const navigateToNode = useCallback((nodeId: string) => {
        // First check if it's a CustomNode
        const customNode = customNodes.find(cn => cn.id === nodeId)
        if (customNode) {
            const fakeGraphNode: GraphNode = {
                id: customNode.id,
                name: customNode.name,
                type: 'custom',
                status: 'unknown',
                notes: customNode.notes,
                leanFilePath: undefined,
                leanLineNumber: undefined,
            }
            selectNode(fakeGraphNode)
            setFocusNodeId(customNode.id)
            return
        }

        // Regular node
        const graphNode = graphNodes.find(n => n.id === nodeId)
        if (graphNode) {
            selectNode(graphNode)
            setFocusNodeId(nodeId)
        }
    }, [graphNodes, customNodes, selectNode])

    if (!isTauri) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-mono text-white mb-4">Astrolabe</h1>
                    <p className="text-white/60 text-sm">Please run this application in Tauri desktop mode</p>
                </div>
            </div>
        )
    }

    if (!projectPath) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-mono text-white mb-4">No Project Selected</h1>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                    >
                        Go to Home
                    </button>
                </div>
            </div>
        )
    }

    // Non-Lean 4 Lake projects are not supported
    if (notSupported && projectStatus) {
        return (
            <div className="h-screen flex flex-col bg-black text-white">
                {/* Top Bar */}
                <div className="h-10 border-b border-white/10 bg-black/90 flex items-center px-3">
                    <button
                        onClick={() => router.push('/')}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        title="Home"
                    >
                        <HomeIcon className="w-4 h-4 text-white/60 hover:text-white" />
                    </button>
                    <span className="text-sm font-mono text-white/60 ml-2">{projectName}</span>
                </div>
                {/* Not Supported Panel */}
                <div className="flex-1 flex items-center justify-center">
                    <div className="max-w-lg text-center p-8">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
                            <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold mb-4">Project Not Supported</h2>
                        <p className="text-white/60 mb-6">{projectStatus.message}</p>
                        <p className="text-sm text-white/40 mb-8">
                            Astrolabe currently only supports Lean 4 + Lake projects. Please ensure the project root contains <code className="bg-white/10 px-1.5 py-0.5 rounded">lakefile.lean</code> or <code className="bg-white/10 px-1.5 py-0.5 rounded">lakefile.toml</code>.
                        </p>
                        <button
                            onClick={() => router.push('/')}
                            className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Project needs initialization
    if (needsInit && projectStatus) {
        return (
            <div className="h-screen flex flex-col bg-black text-white">
                {/* Top Bar */}
                <div className="h-10 border-b border-white/10 bg-black/90 flex items-center px-3">
                    <button
                        onClick={() => router.push('/')}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        title="Home"
                    >
                        <HomeIcon className="w-4 h-4 text-white/60 hover:text-white" />
                    </button>
                    <span className="text-sm font-mono text-white/60 ml-2">{projectName}</span>
                </div>
                {/* Init Panel */}
                <ProjectInitPanel
                    projectPath={projectPath}
                    projectStatus={projectStatus}
                    onInitComplete={async () => {
                        // Recheck status and reload
                        await recheckStatus()
                        reloadGraph()
                    }}
                />
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col bg-black text-white">
            {/* Top Bar - minimal */}
            <div className="h-10 border-b border-white/10 bg-black/90 flex items-center justify-between px-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => router.push('/')}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        title="Home"
                    >
                        <HomeIcon className="w-4 h-4 text-white/60 hover:text-white" />
                    </button>
                    <span className="text-sm font-mono text-white/60 ml-2">{projectName}</span>
                </div>
                <div className="flex items-center gap-2">
                    {/* View mode switch - temporarily hidden, 2D in development */}
                    {/* <div className="flex bg-white/5 rounded overflow-hidden">
                        <button
                            onClick={() => setViewMode('3d')}
                            className={`px-2 py-1 text-xs transition-colors ${
                                viewMode === '3d' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'
                            }`}
                            title="3D Force Graph"
                        >
                            3D
                        </button>
                        <button
                            onClick={() => setViewMode('2d')}
                            className={`px-2 py-1 text-xs transition-colors ${
                                viewMode === '2d' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'
                            }`}
                            title="2D Sigma Graph"
                        >
                            2D
                        </button>
                    </div>
                    <div className="w-px h-4 bg-white/20" /> */}
                    <button
                        onClick={() => setSearchPanelOpen(!searchPanelOpen)}
                        className={`p-1.5 rounded transition-colors ${
                            searchPanelOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40 hover:text-white'
                        }`}
                        title="Search Panel"
                    >
                        <MagnifyingGlassIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setInfoPanelOpen(!infoPanelOpen)}
                        className={`p-1.5 rounded transition-colors ${
                            infoPanelOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40 hover:text-white'
                        }`}
                        title="Node Info"
                    >
                        <CubeIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleToggleCodeViewer}
                        className={`p-1.5 rounded transition-colors ${
                            codeViewerOpen ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-white/40 hover:text-white'
                        }`}
                        title="Code Viewer"
                    >
                        <CodeBracketIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-h-0 flex">
                {/* Main horizontal panel group: Left + Center + Right */}
                <PanelGroup direction="horizontal" className="flex-1">
                    {/* Left: Search panel */}
                    {searchPanelOpen && (
                        <>
                            <Panel defaultSize={15} minSize={10} maxSize={30}>
                                <SearchPanel
                                    className="h-full"
                                    selectedNodeId={selectedNode?.id}
                                    onNodeSelect={handleSearchResultSelect}
                                />
                            </Panel>
                            <PanelResizeHandle className="w-2 bg-white/10 hover:bg-blue-500/50 transition-colors cursor-col-resize flex items-center justify-center group">
                                <div className="h-12 w-1 bg-white/20 group-hover:bg-white/40 rounded-full" />
                            </PanelResizeHandle>
                        </>
                    )}

                    {/* Center: Graph */}
                    <Panel defaultSize={75} minSize={50}>
                        {/* Graph - Main Area */}
                        <div className="h-full w-full overflow-hidden relative bg-[#0a0a0f]">
                            {/* Render different graph components based on view mode */}
                            {!positionsLoaded ? (
                                <div className="h-full flex items-center justify-center text-white/40">
                                    Loading canvas...
                                </div>
                            ) : canvasNodes.length === 0 && visibleCustomNodes.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-white/40">
                                    <div className="text-lg mb-2">Canvas is empty</div>
                                    <div className="text-sm">Search and add nodes from the left panel</div>
                                </div>
                            ) : viewMode === '3d' ? (
                                <ForceGraph3D
                                    nodes={canvasNodes}
                                    edges={canvasEdges}
                                    customNodes={visibleCustomNodes}
                                    customEdges={visibleCustomEdges}
                                    selectedNodeId={selectedNode?.id}
                                    focusNodeId={focusNodeId}
                                    focusEdgeId={focusEdgeId}
                                    highlightedEdge={selectedEdge ? {
                                        id: selectedEdge.id,
                                        source: selectedEdge.source,
                                        target: selectedEdge.target
                                    } : null}
                                    onNodeSelect={handleCanvasNodeClick}
                                    onEdgeSelect={handleEdgeSelect}
                                    showLabels={showLabels}
                                    initialCameraPosition={initialViewport?.camera_position}
                                    initialCameraTarget={initialViewport?.camera_target}
                                    onCameraChange={handleCameraChange}
                                    physics={physics}
                                    isAddingEdge={isAddingEdge}
                                    isRemovingNodes={isRemovingNodes}
                                />
                            ) : (
                                <SigmaGraph
                                    nodes={canvasNodes}
                                    edges={canvasEdges}
                                    projectPath={projectPath}
                                    onNodeClick={handleCanvasNodeClick}
                                    onEdgeSelect={handleEdgeSelect}
                                    selectedNodeId={selectedNode?.id}
                                    focusNodeId={focusNodeId}
                                    highlightedEdge={selectedEdge ? {
                                        id: selectedEdge.id,
                                        source: selectedEdge.source,
                                        target: selectedEdge.target
                                    } : null}
                                    showLabels={showLabels}
                                />
                            )}

                            {/* Loading Overlay */}
                            {graphLoading && (
                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
                                    <div className="w-8 h-8 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin mb-4" />
                                    <div className="text-white/80 text-sm font-mono">Loading project...</div>
                                    <div className="text-white/40 text-xs mt-2">Parsing Lean files</div>
                                </div>
                            )}

                            {/* Canvas toolbar - top left corner */}
                            <div className="absolute top-3 left-3 z-10 flex gap-2">
                                <div className="bg-black/60 px-3 py-1.5 rounded text-xs text-white/60 font-mono">
                                    {canvasNodes.length} / {graphNodes.length} nodes
                                </div>

                                {/* Refresh button */}
                                <button
                                    onClick={() => {
                                        console.log('[Canvas] Refresh clicked')
                                        reloadGraph()
                                    }}
                                    disabled={graphLoading}
                                    className="p-1.5 bg-black/60 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
                                    title="Refresh"
                                >
                                    <ArrowPathIcon className={`w-4 h-4 text-white/60 ${graphLoading ? 'animate-spin' : ''}`} />
                                </button>

                                {/* Label display toggle */}
                                <button
                                    onClick={() => setShowLabels(!showLabels)}
                                    className={`p-1.5 rounded transition-colors ${
                                        showLabels ? 'bg-green-500/30 text-green-400' : 'bg-black/60 text-white/40 hover:text-white'
                                    }`}
                                    title={showLabels ? 'Hide Labels' : 'Show Labels'}
                                >
                                    <TagIcon className="w-4 h-4" />
                                </button>

                                {/* Shortcut edges toggle */}
                                <button
                                    onClick={() => setShowShortcutEdges(!showShortcutEdges)}
                                    className={`p-1.5 rounded transition-colors ${
                                        showShortcutEdges ? 'bg-yellow-500/30 text-yellow-400' : 'bg-black/60 text-white/40 hover:text-white'
                                    }`}
                                    title={showShortcutEdges ? 'Hide Shortcut Edges' : 'Show Shortcut Edges'}
                                >
                                    <BoltIcon className="w-4 h-4" />
                                </button>

                                {/* Add custom node button */}
                                <button
                                    onClick={() => setShowCustomNodeDialog(true)}
                                    className="p-1.5 bg-black/60 hover:bg-blue-500/30 text-white/60 hover:text-blue-400 rounded transition-colors"
                                    title="Add Custom Node"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                </button>

                                {/* Delete node mode button */}
                                <button
                                    onClick={() => {
                                        setIsRemovingNodes(!isRemovingNodes)
                                        if (!isRemovingNodes) {
                                            // When entering delete mode, cancel add edge mode
                                            setIsAddingEdge(false)
                                        }
                                    }}
                                    className={`p-1.5 rounded transition-colors ${
                                        isRemovingNodes
                                            ? 'bg-red-500/40 text-red-400 ring-1 ring-red-500/50'
                                            : 'bg-black/60 text-white/60 hover:text-red-400 hover:bg-red-500/20'
                                    }`}
                                    title={isRemovingNodes ? 'Exit Remove Mode (click empty area)' : 'Remove Nodes Mode'}
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>

                                {/* Physics settings button - only shown in 3D mode */}
                                {viewMode === '3d' && (
                                    <button
                                        onClick={() => setShowPhysicsPanel(!showPhysicsPanel)}
                                        className={`p-1.5 rounded transition-colors ${
                                            showPhysicsPanel
                                                ? 'bg-purple-500/30 text-purple-400'
                                                : 'bg-black/60 text-white/60 hover:text-white hover:bg-white/20'
                                        }`}
                                        title="Physics Settings"
                                    >
                                        <Cog6ToothIcon className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Following buttons temporarily hidden, to be developed later */}
                                {/* Filter button - TODO: backend to be developed
                                <button
                                    onClick={() => {
                                        console.log('[Canvas] Filter clicked - TODO: implement filter panel')
                                    }}
                                    className="p-1.5 bg-black/60 hover:bg-white/20 rounded transition-colors"
                                    title="Filter (TODO)"
                                >
                                    <FunnelIcon className="w-4 h-4 text-white/60" />
                                </button>
                                */}

                                {/* In-canvas find button - TODO: backend to be developed
                                <button
                                    onClick={() => {
                                        console.log('[Canvas] Find clicked - TODO: implement in-canvas search')
                                    }}
                                    className="p-1.5 bg-black/60 hover:bg-white/20 rounded transition-colors"
                                    title="Find in Canvas (TODO)"
                                >
                                    <MagnifyingGlassIcon className="w-4 h-4 text-white/60" />
                                </button>
                                */}

                                {/* 光带/流动动画按钮 - TODO: 后端待开发
                                <button
                                    onClick={() => {
                                        console.log('[Canvas] Flow animation clicked - TODO: implement edge flow animation')
                                    }}
                                    className="p-1.5 bg-black/60 hover:bg-white/20 rounded transition-colors"
                                    title="Flow Animation (TODO)"
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none">
                                        <defs>
                                            <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#666" stopOpacity="0.3" />
                                                <stop offset="50%" stopColor="#00d4ff" stopOpacity="1" />
                                                <stop offset="100%" stopColor="#666" stopOpacity="0.3" />
                                            </linearGradient>
                                        </defs>
                                        <path d="M2 10 Q5 6, 10 10 T18 10" stroke="url(#flowGrad)" strokeWidth="2" fill="none" strokeLinecap="round" />
                                    </svg>
                                </button>
                                */}

                                {/* 添加自定义节点按钮 - TODO: 后端待开发
                                <button
                                    onClick={() => {
                                        console.log('[Canvas] Add custom node clicked - TODO: implement custom node creation')
                                    }}
                                    className="p-1.5 bg-black/60 hover:bg-green-500/30 rounded transition-colors"
                                    title="Add Custom Node (TODO)"
                                >
                                    <PlusIcon className="w-4 h-4 text-green-400" />
                                </button>
                                */}

                                {/* 工具设置按钮 - TODO: 后端待开发
                                <button
                                    onClick={() => {
                                        console.log('[Canvas] Tools clicked - TODO: implement tools panel')
                                    }}
                                    className="p-1.5 bg-black/60 hover:bg-white/20 rounded transition-colors"
                                    title="Tools & Settings (TODO)"
                                >
                                    <Cog6ToothIcon className="w-4 h-4 text-white/60" />
                                </button>
                                */}
                            </div>

                            {/* 物理设置面板 */}
                            {showPhysicsPanel && viewMode === '3d' && (
                                <div className="absolute top-14 left-3 z-10 bg-black/80 backdrop-blur-sm border border-white/20 rounded-lg p-4 w-64">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-medium text-white">Physics Settings</h3>
                                        <button
                                            onClick={() => setShowPhysicsPanel(false)}
                                            className="text-white/40 hover:text-white"
                                        >
                                            <XMarkIcon className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Repulsion Strength */}
                                        <div>
                                            <label className="text-xs text-white/60 flex justify-between mb-1">
                                                <span>Repulsion</span>
                                                <span className="text-white/80">{physics.repulsionStrength}</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="10"
                                                max="500"
                                                step="10"
                                                value={physics.repulsionStrength}
                                                onChange={(e) => setPhysics(p => ({ ...p, repulsionStrength: Number(e.target.value) }))}
                                                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                        </div>

                                        {/* Spring Length */}
                                        <div>
                                            <label className="text-xs text-white/60 flex justify-between mb-1">
                                                <span>Spring Length</span>
                                                <span className="text-white/80">{physics.springLength}</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="1"
                                                max="20"
                                                step="0.5"
                                                value={physics.springLength}
                                                onChange={(e) => setPhysics(p => ({ ...p, springLength: Number(e.target.value) }))}
                                                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                        </div>

                                        {/* Spring Strength */}
                                        <div>
                                            <label className="text-xs text-white/60 flex justify-between mb-1">
                                                <span>Spring Strength</span>
                                                <span className="text-white/80">{physics.springStrength}</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0.1"
                                                max="10"
                                                step="0.1"
                                                value={physics.springStrength}
                                                onChange={(e) => setPhysics(p => ({ ...p, springStrength: Number(e.target.value) }))}
                                                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                        </div>

                                        {/* Center Gravity */}
                                        <div>
                                            <label className="text-xs text-white/60 flex justify-between mb-1">
                                                <span>Center Gravity</span>
                                                <span className="text-white/80">{physics.centerStrength}</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="5"
                                                step="0.1"
                                                value={physics.centerStrength}
                                                onChange={(e) => setPhysics(p => ({ ...p, centerStrength: Number(e.target.value) }))}
                                                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                        </div>

                                        {/* Damping */}
                                        <div>
                                            <label className="text-xs text-white/60 flex justify-between mb-1">
                                                <span>Damping</span>
                                                <span className="text-white/80">{physics.damping.toFixed(2)}</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="0.99"
                                                step="0.01"
                                                value={physics.damping}
                                                onChange={(e) => setPhysics(p => ({ ...p, damping: Number(e.target.value) }))}
                                                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                        </div>

                                        {/* Reset Button */}
                                        <button
                                            onClick={() => setPhysics({ ...DEFAULT_PHYSICS })}
                                            className="w-full py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors"
                                        >
                                            Reset to Default
                                        </button>

                                        {/* Divider */}
                                        <div className="border-t border-white/10 pt-3 space-y-2">
                                            {/* Clear Canvas Button - just hides nodes */}
                                            <button
                                                onClick={handleClearCanvas}
                                                disabled={canvasNodes.length === 0}
                                                className="w-full py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Clear Canvas
                                            </button>
                                            {/* Reset All Data Button - destructive */}
                                            <button
                                                onClick={handleResetAllData}
                                                className="w-full py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                                            >
                                                Reset All Data
                                            </button>
                                            <p className="text-[10px] text-white/30 text-center">
                                                Reset deletes all custom nodes, edges & metadata
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* Right Panel - Info Panel + Code Viewer (independent toggles) */}
                    {rightPanelVisible && (
                        <>
                            <PanelResizeHandle className="w-2 bg-white/10 hover:bg-blue-500/50 transition-colors cursor-col-resize flex items-center justify-center group">
                                <div className="h-12 w-1 bg-white/20 group-hover:bg-white/40 rounded-full" />
                            </PanelResizeHandle>
                            <Panel defaultSize={25} minSize={15} maxSize={40}>
                                <div className="h-full relative">
                                    {/* Add Edge mode dim overlay */}
                                    {isAddingEdge && (
                                        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center pointer-events-auto">
                                            <div className="text-center text-white/80 px-4">
                                                <div className="text-sm font-medium mb-2">Click a node on canvas</div>
                                                <button
                                                    onClick={() => setIsAddingEdge(false)}
                                                    className="text-xs text-white/50 hover:text-white/70 underline"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                <PanelGroup direction="vertical" className="h-full">
                                    {/* Info Panel */}
                                    {infoPanelOpen && (
                                    <Panel defaultSize={65} minSize={20}>
                                        <div className="h-full bg-black flex flex-col overflow-hidden border-l border-white/10">

                                    {/* Node Panel Content */}
                                    <>
                                    {selectedNode ? (
                                        <div className="flex-1 overflow-y-auto">
                                            {/* Node Header */}
                                            <div className="p-3 border-b border-white/10">
                                                {/* Row 1: Eye + Type + Number + Delete(custom only) */}
                                                <div className="flex items-center gap-2">
                                                    {/* 可见性按钮 - 所有节点统一使用 visibleNodes[] 控制 */}
                                                    <button
                                                        onClick={async () => {
                                                            const isVisible = visibleNodes.includes(selectedNode.id)
                                                            if (isVisible) {
                                                                await removeCanvasNode(selectedNode.id)
                                                            } else {
                                                                await addCanvasNode(selectedNode.id)
                                                            }
                                                        }}
                                                        className={`p-0.5 rounded transition-all flex-shrink-0 ${
                                                            visibleNodes.includes(selectedNode.id)
                                                                ? 'text-green-400 hover:text-green-300 drop-shadow-[0_0_6px_rgba(74,222,128,0.8)]'
                                                                : 'text-gray-500 hover:text-gray-400 animate-pulse-glow'
                                                        }`}
                                                        title={visibleNodes.includes(selectedNode.id) ? 'Remove from canvas' : 'Add to canvas'}
                                                    >
                                                        {visibleNodes.includes(selectedNode.id) ? (
                                                            <EyeIcon className="w-4 h-4" />
                                                        ) : (
                                                            <EyeSlashIcon className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    {/* Node name with type color - dims when not on canvas */}
                                                    {(() => {
                                                        const isCustomNode = selectedNode.type === 'custom'
                                                        const color = isCustomNode
                                                            ? '#666666'  // 虚构节点用灰色
                                                            : (typeColors[selectedNode.type] || '#888')
                                                        const isOnCanvas = visibleNodes.includes(selectedNode.id)
                                                        return (
                                                            <span
                                                                className={`font-semibold transition-opacity flex-1 truncate ${isOnCanvas ? '' : 'opacity-40'}`}
                                                                style={{ color }}
                                                                title={selectedNode.name}
                                                            >
                                                                {selectedNode.name}
                                                            </span>
                                                        )
                                                    })()}
                                                    {/* Tool buttons - small icons next to name */}
                                                    <div className={`flex gap-0.5 flex-shrink-0 transition-opacity ${
                                                        visibleNodes.includes(selectedNode.id) ? '' : 'opacity-40'
                                                    }`}>
                                                        <button
                                                            onClick={() => handleToggleToolView('style')}
                                                            className={`p-0.5 rounded transition-colors ${
                                                                toolPanelView === 'style'
                                                                    ? 'text-pink-300'
                                                                    : 'text-white/30 hover:text-pink-400'
                                                            }`}
                                                            title="Style"
                                                        >
                                                            <SwatchIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleToolView('edges')}
                                                            className={`p-0.5 rounded transition-colors ${
                                                                toolPanelView === 'edges'
                                                                    ? 'text-blue-300'
                                                                    : 'text-white/30 hover:text-blue-400'
                                                            }`}
                                                            title="Edges"
                                                        >
                                                            <ArrowLongRightIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleToolView('neighbors')}
                                                            className={`p-0.5 rounded transition-colors ${
                                                                toolPanelView === 'neighbors'
                                                                    ? 'text-purple-300'
                                                                    : 'text-white/30 hover:text-purple-400'
                                                            }`}
                                                            title="Neighbors"
                                                        >
                                                            <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    {/* Delete button - 统一处理所有节点类型 */}
                                                    {(visibleNodes.includes(selectedNode.id) || selectedNode.type === 'custom') && (
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm('Delete this node? This will remove it from canvas and clear its meta info.')) {
                                                                    await deleteNodeWithMeta(selectedNode.id)
                                                                    setSelectedNode(null)
                                                                }
                                                            }}
                                                            className="p-0.5 rounded transition-all flex-shrink-0 text-red-400 hover:text-red-300"
                                                            title="Delete node"
                                                        >
                                                            <XMarkIcon className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Custom Node Name - editable for custom nodes only */}
                                                {selectedNode.type === 'custom' && (
                                                    <div className="mt-2">
                                                        {isEditingCustomNodeName ? (
                                                            <input
                                                                ref={customNodeNameInputRef}
                                                                type="text"
                                                                value={editingCustomNodeNameValue}
                                                                onChange={(e) => setEditingCustomNodeNameValue(e.target.value)}
                                                                onBlur={saveCustomNodeName}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') saveCustomNodeName()
                                                                    if (e.key === 'Escape') setIsEditingCustomNodeName(false)
                                                                }}
                                                                className="w-full bg-black/30 border border-white/20 rounded px-2 py-1 text-sm text-white font-mono focus:border-cyan-500/50 focus:outline-none"
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <div
                                                                onClick={() => {
                                                                    setEditingCustomNodeNameValue(selectedNode.name)
                                                                    setIsEditingCustomNodeName(true)
                                                                }}
                                                                className="text-sm text-white/80 font-mono cursor-pointer hover:text-cyan-400 transition-colors px-2 py-1 rounded hover:bg-white/5"
                                                                title="Click to edit name"
                                                            >
                                                                {selectedNode.name}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Notes section - always visible */}
                                                {editingNote && (
                                                    <div className="mt-3 pt-3 border-t border-white/5">
                                                        <div
                                                            onClick={() => setNotesExpanded(!notesExpanded)}
                                                            className={`cursor-pointer ${notesExpanded ? 'overflow-y-auto' : 'max-h-24 overflow-hidden'}`}
                                                            style={notesExpanded ? { maxHeight: `calc(100vh - ${codeViewerOpen ? '400px' : '300px'})` } : {
                                                                maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                                                                WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                                                            }}
                                                        >
                                                            <MarkdownRenderer content={editingNote} />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Tool panel expand area */}
                                                {toolPanelView && toolPanelView !== 'notes' && (
                                                    <div className="mt-2 p-2 bg-black/20 rounded-md">
                                                        {toolPanelView === 'edges' && (
                                                            <div className="space-y-2">
                                                                {/* Add Edge button / Adding mode indicator */}
                                                                {isAddingEdge ? (
                                                                    <div className="p-1.5 bg-green-500/20 border border-green-500/30 rounded text-xs flex items-center justify-between">
                                                                        <span className="text-green-400">Click node to connect</span>
                                                                        <button onClick={cancelAddingEdge} className="text-white/50 hover:text-white">
                                                                            <XMarkIcon className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => {
                                                                            setAddingEdgeDirection('outgoing')
                                                                            setIsAddingEdge(true)
                                                                            setIsRemovingNodes(false)
                                                                        }}
                                                                        className="w-full py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs rounded transition-colors flex items-center justify-center gap-1"
                                                                    >
                                                                        <PlusIcon className="w-3.5 h-3.5" />
                                                                        <span>Add Edge</span>
                                                                    </button>
                                                                )}

                                                                {/* Unified Edges List */}
                                                                {(() => {
                                                                    // Collect all incoming edges (depends on)
                                                                    const customIncoming = customEdges.filter(e => e.target === selectedNode.id)
                                                                    const provenIncoming = graphLinks.filter(l => l.target === selectedNode.id)
                                                                    // Collect all outgoing edges (used by)
                                                                    const customOutgoing = customEdges.filter(e => e.source === selectedNode.id)
                                                                    const provenOutgoing = graphLinks.filter(l => l.source === selectedNode.id)

                                                                    const totalIncoming = customIncoming.length + provenIncoming.length
                                                                    const totalOutgoing = customOutgoing.length + provenOutgoing.length

                                                                    const renderEdgeItem = (edge: any, isCustom: boolean, direction: 'in' | 'out') => {
                                                                        const nodeId = direction === 'in' ? edge.source : edge.target
                                                                        const node = graphNodes.find(n => n.id === nodeId) || customNodes.find(cn => cn.id === nodeId)
                                                                        const nodeName = node?.name || nodeId
                                                                        const nodeKind = node ? ('kind' in node ? node.kind : ('type' in node ? node.type : undefined)) : undefined
                                                                        const nodeColor = node ? (nodeKind === 'custom' ? '#666' : (nodeKind ? typeColors[nodeKind] || '#888' : '#888')) : '#888'
                                                                        const isOnCanvas = node ? visibleNodes.includes(node.id) : false
                                                                        const edgeId = isCustom ? edge.id : `${edge.source}->${edge.target}`
                                                                        const isEdgeSelected = selectedEdge?.id === edgeId

                                                                        return (
                                                                            <div
                                                                                key={edgeId}
                                                                                onClick={() => {
                                                                                    if (isEdgeSelected) {
                                                                                        setSelectedEdge(null)
                                                                                        setFocusEdgeId(null)
                                                                                    } else {
                                                                                        const edgeData = isCustom ? edge : astrolabeEdges.find(e => e.id === edgeId)
                                                                                        setSelectedEdge({
                                                                                            id: edgeId,
                                                                                            source: edge.source,
                                                                                            target: edge.target,
                                                                                            sourceName: direction === 'in' ? nodeName : selectedNode.name,
                                                                                            targetName: direction === 'in' ? selectedNode.name : nodeName,
                                                                                            style: edgeData?.style,
                                                                                            effect: edgeData?.effect,
                                                                                            defaultStyle: isCustom ? 'dashed' : (edgeData?.defaultStyle ?? 'solid'),
                                                                                        })
                                                                                        setFocusEdgeId(edgeId)
                                                                                    }
                                                                                }}
                                                                                className={`px-1.5 py-1 rounded text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                                                                                    isEdgeSelected
                                                                                        ? 'bg-cyan-500/30 ring-1 ring-cyan-500/50'
                                                                                        : 'bg-white/5 hover:bg-white/10'
                                                                                }`}
                                                                            >
                                                                                {/* Custom indicator */}
                                                                                {isCustom && <span className="w-2 h-0 border-t border-dashed border-gray-400 flex-shrink-0" title="Custom edge" />}
                                                                                {/* Node name */}
                                                                                <span
                                                                                    className={`font-mono flex-1 truncate ${isOnCanvas ? '' : 'opacity-50'}`}
                                                                                    style={{ color: nodeColor }}
                                                                                >
                                                                                    {nodeName.split('.').pop()}
                                                                                </span>
                                                                                {/* Goto button */}
                                                                                {node && (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); navigateToNode(nodeId) }}
                                                                                        className="text-[9px] text-white/40 hover:text-cyan-300 transition-colors"
                                                                                    >
                                                                                        →
                                                                                    </button>
                                                                                )}
                                                                                {/* Delete button for custom edges */}
                                                                                {isCustom && (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); removeCustomEdge(edge.id) }}
                                                                                        className="text-red-400/40 hover:text-red-400 transition-colors"
                                                                                    >
                                                                                        <XMarkIcon className="w-3 h-3" />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    }

                                                                    return (
                                                                        <div className="space-y-2">
                                                                            {/* Depends on */}
                                                                            <div>
                                                                                <div className="text-[10px] text-cyan-400/70 mb-1 flex items-center gap-1">
                                                                                    <ArrowLongRightIcon className="w-3 h-3 rotate-180" />
                                                                                    <span>Depends on ({totalIncoming})</span>
                                                                                </div>
                                                                                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                                                                    {totalIncoming === 0 ? (
                                                                                        <span className="text-[10px] text-white/30 pl-1">None</span>
                                                                                    ) : (
                                                                                        <>
                                                                                            {customIncoming.map(e => renderEdgeItem(e, true, 'in'))}
                                                                                            {provenIncoming.map(e => renderEdgeItem(e, false, 'in'))}
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            {/* Used by */}
                                                                            <div>
                                                                                <div className="text-[10px] text-orange-400/70 mb-1 flex items-center gap-1">
                                                                                    <ArrowLongRightIcon className="w-3 h-3" />
                                                                                    <span>Used by ({totalOutgoing})</span>
                                                                                </div>
                                                                                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                                                                    {totalOutgoing === 0 ? (
                                                                                        <span className="text-[10px] text-white/30 pl-1">None</span>
                                                                                    ) : (
                                                                                        <>
                                                                                            {customOutgoing.map(e => renderEdgeItem(e, true, 'out'))}
                                                                                            {provenOutgoing.map(e => renderEdgeItem(e, false, 'out'))}
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })()}

                                                                {/* Edge Style Panel */}
                                                                {selectedEdge && (
                                                                    <div className="pt-2 border-t border-white/10">
                                                                        <EdgeStylePanel
                                                                            edgeId={selectedEdge.id}
                                                                            sourceNode={selectedEdge.sourceName}
                                                                            targetNode={selectedEdge.targetName}
                                                                            initialStyle={selectedEdge.style ?? selectedEdge.defaultStyle}
                                                                            initialEffect={selectedEdge.effect}
                                                                            defaultStyle={selectedEdge.defaultStyle}
                                                                            onStyleChange={handleEdgeStyleChange}
                                                                            compact
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {toolPanelView === 'style' && (
                                                            <NodeStylePanel
                                                                nodeId={selectedNode.id}
                                                                initialSize={selectedNode.customSize ?? 1.0}
                                                                initialEffect={selectedNode.customEffect}
                                                                onStyleChange={handleStyleChange}
                                                                compact
                                                            />
                                                        )}

                                                        {toolPanelView === 'neighbors' && (() => {
                                                            // Collect all connected nodes with relationship info
                                                            const customIncoming = customEdges.filter(e => e.target === selectedNode.id)
                                                            const customOutgoing = customEdges.filter(e => e.source === selectedNode.id)
                                                            const provenIncoming = graphLinks.filter(l => l.target === selectedNode.id)
                                                            const provenOutgoing = graphLinks.filter(l => l.source === selectedNode.id)

                                                            // Build neighbor list with relationship type
                                                            const customNodeIds = new Set(customNodes.map(n => n.id))
                                                            const neighborMap = new Map<string, { id: string; name: string; kind: string; relation: 'depends' | 'usedBy'; isCustom: boolean; isOnCanvas: boolean }>()

                                                            // Depends on (incoming edges = this node depends on source)
                                                            provenIncoming.forEach(e => {
                                                                const node = graphNodes.find(n => n.id === e.source)
                                                                neighborMap.set(e.source, {
                                                                    id: e.source,
                                                                    name: node?.name || e.source,
                                                                    kind: node?.type || 'unknown',
                                                                    relation: 'depends',
                                                                    isCustom: false,
                                                                    isOnCanvas: visibleNodes.includes(e.source)
                                                                })
                                                            })
                                                            customIncoming.forEach(e => {
                                                                const isCustomNode = customNodeIds.has(e.source)
                                                                const customNode = customNodes.find(n => n.id === e.source)
                                                                const node = graphNodes.find(n => n.id === e.source)
                                                                neighborMap.set(e.source, {
                                                                    id: e.source,
                                                                    name: customNode?.name || node?.name || e.source,
                                                                    kind: isCustomNode ? 'custom' : (node?.type || 'unknown'),
                                                                    relation: 'depends',
                                                                    isCustom: true,
                                                                    isOnCanvas: visibleNodes.includes(e.source)
                                                                })
                                                            })

                                                            // Used by (outgoing edges = target uses this node)
                                                            provenOutgoing.forEach(e => {
                                                                const node = graphNodes.find(n => n.id === e.target)
                                                                neighborMap.set(e.target, {
                                                                    id: e.target,
                                                                    name: node?.name || e.target,
                                                                    kind: node?.type || 'unknown',
                                                                    relation: 'usedBy',
                                                                    isCustom: false,
                                                                    isOnCanvas: visibleNodes.includes(e.target)
                                                                })
                                                            })
                                                            customOutgoing.forEach(e => {
                                                                const isCustomNode = customNodeIds.has(e.target)
                                                                const customNode = customNodes.find(n => n.id === e.target)
                                                                const node = graphNodes.find(n => n.id === e.target)
                                                                neighborMap.set(e.target, {
                                                                    id: e.target,
                                                                    name: customNode?.name || node?.name || e.target,
                                                                    kind: isCustomNode ? 'custom' : (node?.type || 'unknown'),
                                                                    relation: 'usedBy',
                                                                    isCustom: true,
                                                                    isOnCanvas: visibleNodes.includes(e.target)
                                                                })
                                                            })

                                                            const neighborsList = Array.from(neighborMap.values())
                                                            // closedNeighbors: 不在画布上的邻居节点（统一使用 visibleNodes 判断）
                                                            const closedNeighbors = neighborsList.filter(n => !n.isOnCanvas)
                                                            const allOpen = closedNeighbors.length === 0

                                                            if (neighborsList.length === 0) {
                                                                return (
                                                                    <div className="text-xs text-white/40 text-center py-4">
                                                                        No neighbors found
                                                                    </div>
                                                                )
                                                            }

                                                            return (
                                                                <div className="space-y-2">
                                                                    {/* Node list - click to toggle */}
                                                                    <div className="max-h-60 overflow-y-auto space-y-0.5">
                                                                        {neighborsList.map(node => {
                                                                            const isCustomNode = customNodeIds.has(node.id)
                                                                            return (
                                                                                <div
                                                                                    key={node.id}
                                                                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors hover:bg-white/10 ${node.isOnCanvas ? '' : 'opacity-40'}`}
                                                                                >
                                                                                    {/* Toggle visibility button (not for custom nodes) */}
                                                                                    {!isCustomNode ? (
                                                                                        <button
                                                                                            onClick={async () => {
                                                                                                if (node.isOnCanvas) {
                                                                                                    await removeCanvasNode(node.id)
                                                                                                } else {
                                                                                                    await addCanvasNode(node.id)
                                                                                                }
                                                                                            }}
                                                                                            className={`w-4 h-4 flex items-center justify-center rounded transition-colors ${
                                                                                                node.isOnCanvas
                                                                                                    ? 'text-green-400/60 hover:text-red-400'
                                                                                                    : 'text-white/30 hover:text-green-400'
                                                                                            }`}
                                                                                            title={node.isOnCanvas ? 'Remove from canvas' : 'Add to canvas'}
                                                                                        >
                                                                                            {node.isOnCanvas ? (
                                                                                                <EyeIcon className="w-3.5 h-3.5" />
                                                                                            ) : (
                                                                                                <EyeSlashIcon className="w-3.5 h-3.5" />
                                                                                            )}
                                                                                        </button>
                                                                                    ) : (
                                                                                        <div className="w-4" />
                                                                                    )}
                                                                                    {/* Relation indicator */}
                                                                                    <span className={`text-[9px] w-8 ${
                                                                                        node.relation === 'depends' ? 'text-cyan-400/60' : 'text-orange-400/60'
                                                                                    }`}>
                                                                                        {node.relation === 'depends' ? 'dep' : 'used'}
                                                                                    </span>
                                                                                    {/* Node name - clickable to navigate */}
                                                                                    <button
                                                                                        onClick={() => navigateToNode(node.id)}
                                                                                        className="text-xs truncate flex-1 text-left hover:underline"
                                                                                        style={{ color: node.kind === 'custom' ? '#888' : (typeColors[node.kind] || '#888') }}
                                                                                        title="Go to node"
                                                                                    >
                                                                                        {node.name}
                                                                                    </button>
                                                                                    {/* Custom badge */}
                                                                                    {node.isCustom && (
                                                                                        <span className="text-[8px] px-1 py-0.5 bg-gray-500/30 text-gray-400 rounded">
                                                                                            custom
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            )
                                                                        })}
                                                                    </div>

                                                                    {/* Toggle All button */}
                                                                    {(closedNeighbors.length > 0 || neighborsList.some(n => n.isOnCanvas && !customNodeIds.has(n.id))) && (
                                                                        <button
                                                                            onClick={async () => {
                                                                                if (allOpen) {
                                                                                    // Close all (except custom nodes)
                                                                                    for (const node of neighborsList) {
                                                                                        if (node.isOnCanvas && !customNodeIds.has(node.id)) {
                                                                                            await removeCanvasNode(node.id)
                                                                                        }
                                                                                    }
                                                                                } else {
                                                                                    // Open all closed
                                                                                    await addCanvasNodes(closedNeighbors.map(n => n.id))
                                                                                }
                                                                            }}
                                                                            className={`w-full py-1.5 text-xs rounded transition-colors ${
                                                                                allOpen
                                                                                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                                                                                    : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                                                                            }`}
                                                                        >
                                                                            {allOpen ? 'Close All' : 'Open All'}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )
                                                        })()}

                                                    </div>
                                                )}
                                            </div>

                                        </div>
                                    ) : (
                                        /* Empty state when no node is selected */
                                        <div className="flex flex-col items-center justify-center flex-1 text-white/40 p-4">
                                            <CubeIcon className="w-12 h-12 mb-3 opacity-50" />
                                                <p className="text-sm text-center">Select a node to view details</p>
                                                <p className="text-xs text-center mt-1 text-white/30">Click on any node in the graph</p>
                                            </div>
                                        )}
                                    </>
                                        </div>
                                    </Panel>
                                    )}

                                    {/* Resize handle between panels (only if both are open) */}
                                    {infoPanelOpen && codeViewerOpen && (
                                        <PanelResizeHandle className="h-2 bg-white/10 hover:bg-blue-500/50 transition-colors cursor-row-resize flex items-center justify-center group">
                                            <div className="w-12 h-1 bg-white/20 group-hover:bg-white/40 rounded-full" />
                                        </PanelResizeHandle>
                                    )}

                                    {/* Code Viewer Panel - 由 Lean 按钮触发 */}
                                    {codeViewerOpen && (
                                        <Panel defaultSize={35} minSize={20}>
                                            <div className="h-full flex flex-col bg-[#0d1117] border-l border-white/10">
                                                {/* Tab buttons */}
                                                <div className="flex border-b border-white/10 px-2 pt-2 gap-1">
                                                    <button
                                                        onClick={() => setCodeViewMode('code')}
                                                        className={`px-3 py-1.5 text-xs rounded-t transition-colors flex items-center gap-1 ${
                                                            codeViewMode === 'code'
                                                                ? 'bg-cyan-500/20 text-cyan-400 border-b-2 border-cyan-400'
                                                                : 'text-white/50 hover:text-white/80'
                                                        }`}
                                                    >
                                                        L∃∀N
                                                        {codeDirty && <span className="text-yellow-400" title="Unsaved changes (Ctrl+S to save)">●</span>}
                                                    </button>
                                                    <button
                                                        onClick={() => setCodeViewMode('notes')}
                                                        className={`px-3 py-1.5 text-xs rounded-t transition-colors ${
                                                            codeViewMode === 'notes'
                                                                ? 'bg-yellow-500/20 text-yellow-400 border-b-2 border-yellow-400'
                                                                : 'text-white/50 hover:text-white/80'
                                                        }`}
                                                        title="Edit Notes"
                                                    >
                                                        Notes
                                                    </button>
                                                    <div className="flex-1" />
                                                    <button
                                                        onClick={() => setCodeViewerOpen(false)}
                                                        className="px-2 py-1 text-white/40 hover:text-white/80 text-xs"
                                                        title="Close"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                {/* Content area */}
                                                <div className="flex-1 overflow-auto relative">
                                                    {/* Code panel - keep mounted, hide with CSS to avoid Monaco "Canceled" errors */}
                                                    <div className={`h-full ${codeViewMode === 'code' ? '' : 'hidden'}`}>
                                                        {codeLoading && (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                                                                <div className="text-white/40 text-sm">Loading...</div>
                                                            </div>
                                                        )}
                                                        {codeFile ? (
                                                            <LeanCodePanel
                                                                key={`${selectedNode?.leanFilePath || 'editor'}-${nodeClickCount}`}
                                                                content={codeFile.content}
                                                                filePath={selectedNode?.leanFilePath}
                                                                lineNumber={selectedNode?.leanLineNumber}
                                                                startLine={codeFile.startLine}
                                                                endLine={codeFile.endLine}
                                                                totalLines={codeFile.totalLines}
                                                                nodeName={selectedNode?.name}
                                                                nodeKind={selectedNode?.type}
                                                                onClose={() => setCodeViewerOpen(false)}
                                                                hideHeader
                                                                readOnly
                                                                nodeStatusLines={nodeStatusLines}
                                                            />
                                                        ) : !codeLoading && (
                                                            <div className="h-full flex items-center justify-center">
                                                                <div className="text-white/40 text-sm">No content</div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Notes panel */}
                                                    <div className={`h-full flex flex-col ${codeViewMode === 'notes' ? '' : 'hidden'}`}>
                                                        <textarea
                                                            value={editingNote}
                                                            onChange={(e) => handleNoteChange(e.target.value)}
                                                            placeholder="# Notes&#10;&#10;Write your notes in **Markdown** format...&#10;&#10;- Supports lists&#10;- Code blocks&#10;- Math: $E = mc^2$&#10;&#10;Auto-saves as you type."
                                                            className="flex-1 w-full bg-transparent text-white/90 text-xs font-mono p-3 resize-none focus:outline-none placeholder-white/30 leading-relaxed"
                                                            spellCheck={false}
                                                        />
                                                        <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-white/30">
                                                            Markdown supported. Auto-saves as you type.
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Panel>
                                    )}
                                </PanelGroup>
                                </div>
                            </Panel>
                        </>
                    )}
                </PanelGroup>
            </div>

            {/* Status Bar */}
            <div className="h-6 border-t border-white/10 bg-black flex items-center justify-between px-2 text-xs text-white/70 shrink-0">
                <div className="flex items-center gap-3">
                    {/* Project name */}
                    <span className="text-white/60">{projectName}</span>
                </div>

                <div className="flex items-center gap-3 text-white/60">
                    {/* Current File */}
                    {selectedNode?.leanFilePath && (
                        <span className="truncate max-w-[300px] flex items-center gap-1" title={selectedNode.leanFilePath}>
                            {selectedNode.leanFilePath.split('/').pop()}
                            {codeDirty && <span className="text-white/80" title="Unsaved changes (Ctrl+S to save)">●</span>}
                        </span>
                    )}
                </div>
            </div>

            {/* 创建虚构节点对话框 */}
            {showCustomNodeDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* 背景遮罩 */}
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => {
                            setShowCustomNodeDialog(false)
                            setCustomNodeName('')
                        }}
                    />
                    {/* 对话框 */}
                    <div className="relative bg-gray-900 rounded-lg p-6 w-96 border border-white/10 shadow-2xl">
                        <h3 className="text-lg font-semibold text-white mb-4">Add Custom Node</h3>
                        <p className="text-sm text-white/60 mb-4">
                            Custom nodes are displayed in gray and represent planned theorems or conjectures.
                        </p>
                        <input
                            type="text"
                            value={customNodeName}
                            onChange={(e) => setCustomNodeName(e.target.value)}
                            placeholder="Enter node name..."
                            className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded text-white text-sm placeholder-white/40 focus:outline-none focus:border-blue-500"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleCreateCustomNode()
                                } else if (e.key === 'Escape') {
                                    setShowCustomNodeDialog(false)
                                    setCustomNodeName('')
                                }
                            }}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => {
                                    setShowCustomNodeDialog(false)
                                    setCustomNodeName('')
                                }}
                                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateCustomNode}
                                disabled={!customNodeName.trim()}
                                className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/30 disabled:text-white/30 text-white rounded transition-colors"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset All Data Confirmation Dialog */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* 背景遮罩 */}
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => setShowResetConfirm(false)}
                    />
                    {/* 对话框 */}
                    <div className="relative bg-gray-900 rounded-lg p-6 w-96 border border-red-500/30 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-white">Reset All Data</h3>
                        </div>
                        <p className="text-sm text-white/60 mb-2">
                            This will permanently delete:
                        </p>
                        <ul className="text-sm text-red-400 mb-4 list-disc list-inside space-y-1">
                            <li>All custom nodes</li>
                            <li>All custom edges</li>
                            <li>All node metadata (colors, labels, notes)</li>
                        </ul>
                        <p className="text-sm text-white/40 mb-4">
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmResetAllData}
                                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                            >
                                Reset All Data
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reload Prompt after Reset */}
            {showReloadPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* 背景遮罩 */}
                    <div className="absolute inset-0 bg-black/70" />
                    {/* 对话框 */}
                    <div className="relative bg-gray-900 rounded-lg p-6 w-96 border border-green-500/30 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-white">Reset Complete</h3>
                        </div>
                        <p className="text-sm text-white/60 mb-4">
                            All data has been cleared. Click &quot;Reload&quot; to re-parse the project from Lean files and regenerate the graph.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowReloadPrompt(false)}
                                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                            >
                                Later
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                            >
                                Reload Now
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clear Canvas Dialog */}
            {showClearCanvasDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* 背景遮罩 */}
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => setShowClearCanvasDialog(false)}
                    />
                    {/* 对话框 */}
                    <div className="relative bg-gray-900 rounded-lg p-6 w-[480px] max-h-[80vh] border border-white/10 shadow-2xl flex flex-col">
                        <h3 className="text-lg font-semibold text-white mb-4">Clear Canvas</h3>

                        {canvasNodes.length === 0 ? (
                            <p className="text-sm text-white/60 mb-4">No nodes on canvas.</p>
                        ) : (
                            <>
                                {/* 操作按钮 */}
                                <div className="flex gap-2 mb-3">
                                    <button
                                        onClick={selectAllNodesToRemove}
                                        className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={deselectAllNodesToRemove}
                                        className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors"
                                    >
                                        Deselect All
                                    </button>
                                    <span className="text-xs text-white/40 ml-auto self-center">
                                        {selectedNodesToRemove.size} / {canvasNodes.length} selected
                                    </span>
                                </div>

                                {/* 节点列表 */}
                                <div className="flex-1 overflow-y-auto max-h-[300px] border border-white/10 rounded mb-4">
                                    {canvasNodes.map(node => (
                                        <div
                                            key={node.id}
                                            onClick={() => toggleNodeToRemove(node.id)}
                                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                                                selectedNodesToRemove.has(node.id)
                                                    ? 'bg-blue-500/20'
                                                    : 'hover:bg-white/5'
                                            }`}
                                        >
                                            {/* Checkbox */}
                                            <div className={`w-4 h-4 rounded border ${
                                                selectedNodesToRemove.has(node.id)
                                                    ? 'bg-blue-500 border-blue-500'
                                                    : 'border-white/30'
                                            } flex items-center justify-center`}>
                                                {selectedNodesToRemove.has(node.id) && (
                                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            {/* 节点信息 */}
                                            <div className="flex-1 min-w-0">
                                                <div
                                                    className="text-sm truncate"
                                                    style={{ color: node.defaultColor }}
                                                >
                                                    {node.name}
                                                </div>
                                                <div className="text-xs text-white/40">{node.kind}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* 底部按钮 */}
                        <div className="flex justify-between gap-2">
                            <button
                                onClick={() => setShowClearCanvasDialog(false)}
                                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={removeSelectedNodes}
                                    disabled={selectedNodesToRemove.size === 0}
                                    className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/30 disabled:text-white/30 text-white rounded transition-colors"
                                >
                                    Remove Selected ({selectedNodesToRemove.size})
                                </button>
                                <button
                                    onClick={clearAllNodes}
                                    disabled={canvasNodes.length === 0}
                                    className="px-4 py-2 text-sm bg-red-500/80 hover:bg-red-500 disabled:bg-red-500/30 disabled:text-white/30 text-white rounded transition-colors"
                                >
                                    Clear All
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function LocalEditPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-white/60">Loading...</div>
            </div>
        }>
            <LocalEditorContent />
        </Suspense>
    )
}
