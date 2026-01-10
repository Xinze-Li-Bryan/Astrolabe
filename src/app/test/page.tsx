'use client'

/**
 * Test page - verify Sigma.js graph rendering
 *
 * Access: http://localhost:3000/test?path=/path/to/lean/project
 */

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useStore, Node, getNodeColor, STATUS_COLORS } from '@/lib/store'

// Dynamically load Sigma component (avoid SSR issues)
const SigmaGraph = dynamic(
  () => import('@/components/graph/SigmaGraph').then((m) => m.SigmaGraph),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-black flex items-center justify-center text-white/40">
        Loading graph...
      </div>
    ),
  }
)

function TestContent() {
  const searchParams = useSearchParams()
  const projectPath = searchParams.get('path') || ''

  // Get state from store
  const {
    projectData,
    loading,
    error,
    selectedNodeId,
    loadProject,
    selectNode,
    getSelectedNode,
  } = useStore()

  // Load project
  useEffect(() => {
    if (projectPath) {
      loadProject(projectPath)
    }
  }, [projectPath, loadProject])

  const selectedNode = getSelectedNode()

  // Node click handler
  const handleNodeClick = (node: Node | null) => {
    selectNode(node?.id ?? null)
  }

  return (
    <div className="h-screen flex flex-col bg-black text-white">
      {/* 顶栏 */}
      <div className="h-10 border-b border-white/10 flex items-center px-4">
        <span className="text-sm font-mono text-white/60">
          Test: {projectPath.split('/').pop()}
        </span>
        {loading && (
          <span className="ml-4 text-xs text-blue-400">Loading...</span>
        )}
        {error && (
          <span className="ml-4 text-xs text-red-400">{error}</span>
        )}
        {projectData && (
          <span className="ml-4 text-xs text-green-400">
            {projectData.nodes.length} nodes, {projectData.edges.length} edges
          </span>
        )}
      </div>

      {/* 主内容 */}
      <div className="flex-1 flex">
        {/* 图 */}
        <div className="flex-1">
          {projectData ? (
            <SigmaGraph
              nodes={projectData.nodes}
              edges={projectData.edges}
              selectedNodeId={selectedNodeId}
              onNodeClick={handleNodeClick}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/40">
              {loading ? 'Loading...' : 'No data'}
            </div>
          )}
        </div>

        {/* 信息面板 */}
        {selectedNode && (
          <div className="w-80 border-l border-white/10 p-4 overflow-auto">
            <h2 className="text-lg font-semibold mb-2">{selectedNode.name}</h2>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-white/40">Kind:</span>
                <span
                  className="px-2 py-0.5 rounded text-xs"
                  style={{ backgroundColor: getNodeColor(selectedNode) + '40', color: getNodeColor(selectedNode) }}
                >
                  {selectedNode.kind}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-white/40">Status:</span>
                <span
                  className="px-2 py-0.5 rounded text-xs"
                  style={{ backgroundColor: STATUS_COLORS[selectedNode.status] + '40', color: STATUS_COLORS[selectedNode.status] }}
                >
                  {selectedNode.status}
                </span>
              </div>

              <div>
                <span className="text-white/40">File:</span>
                <div className="text-xs text-white/60 font-mono mt-1 break-all">
                  {selectedNode.filePath}:{selectedNode.lineNumber}
                </div>
              </div>

              {selectedNode.references.length > 0 && (
                <div>
                  <span className="text-white/40">References ({selectedNode.references.length}):</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedNode.references.slice(0, 10).map((ref) => (
                      <span
                        key={ref}
                        className="text-xs px-1.5 py-0.5 bg-white/10 rounded cursor-pointer hover:bg-white/20"
                        onClick={() => selectNode(ref)}
                      >
                        {ref.split('.').pop()}
                      </span>
                    ))}
                    {selectedNode.references.length > 10 && (
                      <span className="text-xs text-white/40">
                        +{selectedNode.references.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TestPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-black flex items-center justify-center text-white/40">Loading...</div>}>
      <TestContent />
    </Suspense>
  )
}
