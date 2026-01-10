/**
 * Astrolabe API Client
 *
 * Python backend API client
 * Backend runs at http://127.0.0.1:8765
 */

import type { Node, Edge, NodeMeta, EdgeMeta, ProjectData } from "@/types/node";

const API_BASE = "http://127.0.0.1:8765";

// ============================================
// Tauri HTTP Client Wrapper
// ============================================

/**
 * Check if running in Tauri environment
 */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Cache for Tauri HTTP fetch function
let cachedTauriFetch: typeof fetch | null = null;
let tauriFetchInitialized = false;

/**
 * Initialize Tauri HTTP fetch (called once)
 */
async function initTauriFetch(): Promise<typeof fetch | null> {
  if (tauriFetchInitialized) {
    return cachedTauriFetch;
  }
  tauriFetchInitialized = true;

  if (!isTauri()) {
    return null;
  }

  try {
    const module = await import("@tauri-apps/plugin-http");
    cachedTauriFetch = module.fetch as typeof fetch;
    console.log("[API] Tauri HTTP plugin loaded successfully");
    return cachedTauriFetch;
  } catch (error) {
    console.warn("[API] Tauri HTTP plugin not available:", error);
    return null;
  }
}

/**
 * Custom fetch that uses Tauri HTTP plugin when available
 * This bypasses system proxy for localhost requests
 */
async function tauriFetch(
  input: string | URL,
  init?: RequestInit
): Promise<Response> {
  // Try to use Tauri HTTP if available
  const tauriHttp = await initTauriFetch();
  if (tauriHttp) {
    try {
      return await tauriHttp(input, init);
    } catch (error) {
      console.warn("[API] Tauri HTTP request failed, falling back to standard fetch:", error);
    }
  }

  // Fallback to standard fetch
  return fetch(input, init);
}

// ============================================
// API Response Types
// ============================================

interface ProjectStats {
  total_nodes: number;
  total_edges: number;
  by_kind: Record<string, number>;
  by_status: Record<string, number>;
}

interface ProjectResponse extends ProjectData {
  stats: ProjectStats;
}

interface UpdateMetaResponse {
  status: string;
  nodeId: string;
  updated: string[];
}

// ============================================
// API Functions
// ============================================

/**
 * Load project (parse Lean files)
 */
export async function loadProject(path: string): Promise<ProjectResponse> {
  const res = await tauriFetch(`${API_BASE}/api/project/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to load project: ${res.status}`);
  }

  return res.json();
}

/**
 * Get loaded project data
 */
export async function getProject(path: string): Promise<ProjectResponse> {
  const res = await tauriFetch(
    `${API_BASE}/api/project?path=${encodeURIComponent(path)}`
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to get project: ${res.status}`);
  }

  return res.json();
}

/**
 * Get a single node
 */
export async function getNode(path: string, nodeId: string): Promise<Node> {
  const res = await tauriFetch(
    `${API_BASE}/api/project/node/${encodeURIComponent(nodeId)}?path=${encodeURIComponent(path)}`
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to get node: ${res.status}`);
  }

  return res.json();
}

/**
 * Read file content (with context)
 * Used to display Lean source code in frontend
 */
export interface FileContent {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
}

export async function readFile(
  filePath: string,
  line: number = 1,
  context: number = 20
): Promise<FileContent> {
  const res = await tauriFetch(
    `${API_BASE}/api/file?path=${encodeURIComponent(filePath)}&line=${line}&context=${context}`
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to read file: ${res.status}`);
  }

  return res.json();
}

/**
 * Read complete file content (for editor)
 */
export async function readFullFile(filePath: string): Promise<FileContent> {
  // Use a very large context to get the complete file
  const res = await tauriFetch(
    `${API_BASE}/api/file?path=${encodeURIComponent(filePath)}&line=1&context=100000`
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to read file: ${res.status}`);
  }

  return res.json();
}

/**
 * Update node meta
 */
export async function updateNodeMeta(
  path: string,
  nodeId: string,
  meta: Partial<NodeMeta>
): Promise<UpdateMetaResponse> {
  const res = await tauriFetch(
    `${API_BASE}/api/project/node/${encodeURIComponent(nodeId)}/meta?path=${encodeURIComponent(path)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to update meta: ${res.status}`);
  }

  return res.json();
}

/**
 * Delete node meta
 */
export async function deleteNodeMeta(
  path: string,
  nodeId: string
): Promise<{ status: string; nodeId: string }> {
  const res = await tauriFetch(
    `${API_BASE}/api/project/node/${encodeURIComponent(nodeId)}/meta?path=${encodeURIComponent(path)}`,
    { method: "DELETE" }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to delete meta: ${res.status}`);
  }

  return res.json();
}

/**
 * Update edge meta
 */
export async function updateEdgeMeta(
  path: string,
  edgeId: string,
  meta: Partial<EdgeMeta>
): Promise<{ status: string; edgeId: string; updated: string[] }> {
  const res = await tauriFetch(
    `${API_BASE}/api/project/edge/${encodeURIComponent(edgeId)}/meta?path=${encodeURIComponent(path)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to update edge meta: ${res.status}`);
  }

  return res.json();
}

/**
 * Delete edge meta
 */
export async function deleteEdgeMeta(
  path: string,
  edgeId: string
): Promise<{ status: string; edgeId: string }> {
  const res = await tauriFetch(
    `${API_BASE}/api/project/edge/${encodeURIComponent(edgeId)}/meta?path=${encodeURIComponent(path)}`,
    { method: "DELETE" }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to delete edge meta: ${res.status}`);
  }

  return res.json();
}

/**
 * Refresh project (re-parse)
 */
export async function refreshProject(
  path: string
): Promise<{ status: string; path: string; stats: ProjectStats }> {
  const res = await tauriFetch(
    `${API_BASE}/api/project/refresh?path=${encodeURIComponent(path)}`,
    { method: "POST" }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to refresh project: ${res.status}`);
  }

  return res.json();
}

/**
 * Get project statistics
 */
export async function getProjectStats(path: string): Promise<ProjectStats> {
  const res = await tauriFetch(
    `${API_BASE}/api/project/stats?path=${encodeURIComponent(path)}`
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to get stats: ${res.status}`);
  }

  return res.json();
}

/**
 * Health check
 */
export async function healthCheck(): Promise<{ status: string; version: string }> {
  const res = await tauriFetch(`${API_BASE}/api/health`);

  if (!res.ok) {
    throw new Error(`Backend not available: ${res.status}`);
  }

  return res.json();
}

/**
 * Check project status
 */
export interface ProjectStatus {
  exists: boolean;
  hasLakefile: boolean;
  hasLakeCache: boolean;
  usesMathlib: boolean;
  leanFileCount: number;
  needsInit: boolean;
  notSupported: boolean;  // Not a Lean 4 Lake project
  message: string;
}

export async function checkProjectStatus(path: string): Promise<ProjectStatus> {
  const res = await tauriFetch(
    `${API_BASE}/api/project/status?path=${encodeURIComponent(path)}`
  );

  if (!res.ok) {
    // If API doesn't exist, return default status
    return {
      exists: true,
      hasLakefile: false,
      hasLakeCache: false,
      usesMathlib: false,
      leanFileCount: 0,
      needsInit: false,
      notSupported: true,
      message: "Unable to check project status",
    };
  }

  return res.json();
}

/**
 * Project initialization event types
 */
export type InitEvent =
  | { type: "start"; usesMathlib: boolean }
  | { type: "step"; step: string; status: "running" | "completed" | "failed" | "timeout"; returncode?: number }
  | { type: "output"; line: string }
  | { type: "warning"; message: string }
  | { type: "error"; message: string }
  | { type: "suggestion"; message: string; commands: string[] }
  | { type: "done"; success: boolean };

/**
 * Initialize project (SSE streaming)
 * Returns EventSource for listening
 */
export function initProject(
  path: string,
  onEvent: (event: InitEvent) => void,
  onError?: (error: Error) => void
): () => void {
  const url = `${API_BASE}/api/project/init?path=${encodeURIComponent(path)}`;

  // Use fetch + ReadableStream because EventSource doesn't support POST
  const controller = new AbortController();

  tauriFetch(url, {
    method: "POST",
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Init failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent(data as InitEvent);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    })
    .catch((error) => {
      if (error.name !== "AbortError") {
        onError?.(error);
      }
    });

  // Return cancel function
  return () => controller.abort();
}

/**
 * Cancel running initialization
 */
export async function cancelInit(path: string): Promise<{
  status: "cancelled" | "not_found";
  killed?: string[];
  suggestion?: { message: string; commands: string[] };
}> {
  const res = await tauriFetch(
    `${API_BASE}/api/project/init/cancel?path=${encodeURIComponent(path)}`,
    { method: "POST" }
  );

  if (!res.ok) {
    throw new Error(`Failed to cancel: ${res.status}`);
  }

  return res.json();
}

// ============================================
// Viewport API (camera state persistence)
// ============================================

export interface ViewportData {
  camera_position: [number, number, number];
  camera_target: [number, number, number];
  zoom: number;
  selected_node_id?: string;
  selected_edge_id?: string;
}

/**
 * Get viewport state
 */
export async function getViewport(path: string): Promise<ViewportData> {
  const res = await tauriFetch(
    `${API_BASE}/api/canvas/viewport?path=${encodeURIComponent(path)}`
  );

  if (!res.ok) {
    // If not saved before, return default values
    return {
      camera_position: [0, 0, 20],
      camera_target: [0, 0, 0],
      zoom: 1.0,
    };
  }

  return res.json();
}

/**
 * Update viewport state (incremental merge)
 */
export async function updateViewport(
  path: string,
  updates: Partial<ViewportData>
): Promise<{ status: string; viewport: ViewportData }> {
  const res = await tauriFetch(`${API_BASE}/api/canvas/viewport`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, ...updates }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to update viewport: ${res.status}`);
  }

  return res.json();
}

// ============================================
// Macros API (custom LaTeX macros)
// ============================================

export type MacrosData = Record<string, string>;

/**
 * Get project's custom LaTeX macros
 */
export async function getMacros(path: string): Promise<MacrosData> {
  const res = await tauriFetch(
    `${API_BASE}/api/project/macros?path=${encodeURIComponent(path)}`
  );

  if (!res.ok) {
    // If no macros, return empty object
    return {};
  }

  const data = await res.json();
  return data.macros || {};
}

/**
 * Update project's custom LaTeX macros (complete replacement)
 */
export async function updateMacros(
  path: string,
  macros: MacrosData
): Promise<{ status: string; macros: MacrosData }> {
  const res = await tauriFetch(`${API_BASE}/api/project/macros`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, macros }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Failed to update macros: ${res.status}`);
  }

  return res.json();
}

// ============================================
// Legacy API object (for backward compatibility)
// ============================================

export const api = {
  getProject: loadProject,
  refreshFile: async (_projectPath: string, _filePath: string) => {
    // TODO: implement single file refresh
    console.warn("refreshFile not implemented");
  },
  subscribeToFileChanges: (
    _projectPath: string,
    _callback: (filePath: string) => void
  ) => {
    // TODO: WebSocket subscription
    console.warn("subscribeToFileChanges not implemented");
    return () => {};
  },
  saveState: async (_projectPath: string, _state: unknown) => {
    // TODO: save state
    console.warn("saveState not implemented");
  },
  loadState: async (_projectPath: string) => {
    // TODO: load state
    console.warn("loadState not implemented");
    return null;
  },
};
