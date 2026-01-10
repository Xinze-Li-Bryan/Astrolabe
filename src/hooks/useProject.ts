/**
 * useProject Hook
 *
 * Fetch project data from Python backend and manage state
 * Supports detecting if project needs initialization
 */

import { useState, useEffect, useCallback } from "react";
import type { Node, Edge, NodeMeta } from "@/types/node";
import { loadProject, updateNodeMeta, checkProjectStatus, type ProjectStatus } from "@/lib/api";

// ============================================
// Types
// ============================================

interface ProjectStats {
  total_nodes: number;
  total_edges: number;
  by_kind: Record<string, number>;
  by_status: Record<string, number>;
}

interface UseProjectResult {
  // Data
  nodes: Node[];
  edges: Edge[];
  stats: ProjectStats | null;

  // State
  loading: boolean;
  error: string | null;

  // Initialization status
  projectStatus: ProjectStatus | null;
  needsInit: boolean;

  // Operations
  reload: () => Promise<void>;
  updateMeta: (nodeId: string, meta: Partial<NodeMeta>) => Promise<void>;
  recheckStatus: () => Promise<ProjectStatus | null | undefined>;
}

// ============================================
// Hook
// ============================================

export function useProject(projectPath: string | null): UseProjectResult {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null);

  // Check project status
  const checkStatus = useCallback(async () => {
    if (!projectPath) return;

    try {
      const status = await checkProjectStatus(projectPath);
      setProjectStatus(status);
      return status;
    } catch (e) {
      console.error("[useProject] Check status failed:", e);
      return null;
    }
  }, [projectPath]);

  // Load project
  const load = useCallback(async () => {
    if (!projectPath) return;

    setLoading(true);
    setError(null);

    try {
      // Check status first
      const status = await checkStatus();

      // If needs initialization, don't load project (let user initialize first)
      if (status?.needsInit) {
        console.log("[useProject] Project needs initialization");
        setLoading(false);
        return;
      }

      // Load project
      const data = await loadProject(projectPath);

      setNodes(data.nodes);
      setEdges(data.edges);
      setStats(data.stats);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
      console.error("[useProject] Load failed:", message);
    } finally {
      setLoading(false);
    }
  }, [projectPath, checkStatus]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Update node meta
  const updateMeta = useCallback(
    async (nodeId: string, meta: Partial<NodeMeta>) => {
      if (!projectPath) return;

      try {
        await updateNodeMeta(projectPath, nodeId, meta);

        // Optimistically update local state
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId ? { ...n, meta: { ...n.meta, ...meta } } : n
          )
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("[useProject] Update meta failed:", message);
        throw e;
      }
    },
    [projectPath]
  );

  return {
    nodes,
    edges,
    stats,
    loading,
    error,
    projectStatus,
    needsInit: projectStatus?.needsInit ?? false,
    reload: load,
    updateMeta,
    recheckStatus: checkStatus,
  };
}
