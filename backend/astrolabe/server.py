"""
Astrolabe API Server

FastAPI server providing:
- Project data API
- Node meta update API
- WebSocket file change notifications
"""

from typing import Optional, AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
import asyncio
import json
import time

import networkx as nx

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from watchfiles import awatch

from .project import Project
from .graph_cache import GraphCache
from .unified_storage import UnifiedStorage
from .analysis import (
    build_networkx_graph,
    compute_degree_statistics,
    compute_pagerank,
    compute_betweenness_centrality,
    detect_communities_louvain,
    compute_clustering_coefficients,
    compute_von_neumann_entropy,
    compute_structure_entropy,
)
from .analysis.entropy import random_graph_baseline
from .analysis.degree import compute_degree_shannon_entropy
from .lean_lsp import LeanLSPClient, NamespaceInfo
from .lsp_cache import (
    LSPCache,
    get_lsp_cache_path,
    build_lsp_cache,
)


# Project cache
_projects: dict[str, Project] = {}


def get_project(path: str) -> Project:
    """Get or create a Project instance"""
    if path not in _projects:
        _projects[path] = Project(path)
    return _projects[path]


async def get_project_storage(path: str) -> UnifiedStorage:
    """Get UnifiedStorage for a project, loading if necessary"""
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]
        if not project.storage:
            await project.load()
    return project.storage


def should_watch_file(change_type, file_path: str) -> bool:
    """Check if the file should be watched (.ilean, meta.json)"""
    # Watch .ilean files (Lean compilation outputs), meta.json (user custom data)
    return (
        file_path.endswith(".ilean") or
        file_path.endswith("meta.json")
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management"""
    yield
    # Cleanup: stop all file watchers
    for project in _projects.values():
        await project.stop_watching()


app = FastAPI(
    title="Astrolabe API",
    description="Lean 4 Formalization Project Dependency Graph Visualization Tool",
    version="0.1.5",
    lifespan=lifespan,
)

# CORS configuration (allow all origins in development environment)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================
# Pydantic Models
# ============================================


class NodeMetaUpdate(BaseModel):
    """Node meta update request"""

    label: Optional[str] = None
    color: Optional[str] = None
    size: Optional[float] = None
    shape: Optional[str] = None
    effect: Optional[str] = None
    position: Optional[list[float]] = None
    pinned: Optional[bool] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None


class EdgeMetaUpdate(BaseModel):
    """Edge meta update request"""

    width: Optional[float] = None
    color: Optional[str] = None
    style: Optional[str] = None  # solid, dashed, dotted, wavy
    effect: Optional[str] = None
    notes: Optional[str] = None


class ProjectLoadRequest(BaseModel):
    """Project load request"""

    path: str


class PositionsUpdateRequest(BaseModel):
    """Node positions update request"""

    path: str
    positions: dict[str, dict]  # {node_id: {x, y, z}} - 3D positions


class CanvasSaveRequest(BaseModel):
    """Canvas save request"""

    path: str
    visible_nodes: list[str] = []
    positions: dict[str, dict] = {}


class CanvasAddNodeRequest(BaseModel):
    """Add node to canvas"""

    path: str
    node_id: str


class CanvasAddNodesRequest(BaseModel):
    """Batch add nodes to canvas"""

    path: str
    node_ids: list[str]


class FilterOptionsData(BaseModel):
    """Filter options for graph display"""

    hideTechnical: bool = False
    hideOrphaned: bool = False
    transitiveReduction: bool = True


class ViewportUpdateRequest(BaseModel):
    """Viewport state update request"""

    path: str
    camera_position: Optional[list[float]] = None
    camera_target: Optional[list[float]] = None
    zoom: Optional[float] = None
    selected_node_id: Optional[str] = None
    selected_edge_id: Optional[str] = None
    filter_options: Optional[FilterOptionsData] = None


class UserNodeRequest(BaseModel):
    """Add User node request"""

    path: str
    node_id: Optional[str] = None  # Optional, auto-generate custom-{timestamp} if not provided
    name: str
    kind: str = "custom"
    references: list[str] = []
    color: Optional[str] = None
    size: Optional[float] = None
    shape: Optional[str] = None
    effect: Optional[str] = None
    notes: Optional[str] = None


class UserNodeUpdateRequest(BaseModel):
    """Update User node request"""

    path: str
    name: Optional[str] = None
    kind: Optional[str] = None
    references: Optional[list[str]] = None
    color: Optional[str] = None
    size: Optional[float] = None
    shape: Optional[str] = None
    effect: Optional[str] = None
    notes: Optional[str] = None
    visible: Optional[bool] = None


class UserEdgeRequest(BaseModel):
    """Add User edge request"""

    path: str
    source: str
    target: str
    color: Optional[str] = None
    width: Optional[float] = None
    style: Optional[str] = None
    effect: Optional[str] = None
    notes: Optional[str] = None


# ============================================
# API Endpoints
# ============================================


@app.get("/api/health")
async def health():
    """Health check"""
    return {"status": "ok", "version": "0.1.5"}


@app.post("/api/project/load")
async def load_project(request: ProjectLoadRequest):
    """
    Load project

    1. Parse Lean files
    2. Load .astrolabe/meta.json
    3. Return complete project data
    """
    project = get_project(request.path)
    await project.load()
    return project.to_json()


@app.get("/api/project")
async def get_project_data(path: str = Query(..., description="Project path")):
    """Get project data (must load first)"""
    if path not in _projects:
        raise HTTPException(404, f"Project not loaded: {path}")
    return _projects[path].to_json()


@app.get("/api/project/node/{node_id}")
async def get_node(node_id: str, path: str = Query(..., description="Project path")):
    """Get complete information for a single node"""
    if path not in _projects:
        raise HTTPException(404, f"Project not loaded: {path}")

    project = _projects[path]
    node = project.get_node(node_id)
    if not node:
        raise HTTPException(404, f"Node not found: {node_id}")

    return node.to_dict()


@app.get("/api/file")
async def read_file(
    path: str = Query(..., description="File absolute path"),
    line: int = Query(1, description="Target line number (1-indexed)"),
    context: int = Query(20, description="Context line count"),
):
    """
    Read file content (with context)

    Simple file reading API, directly pass file path and line number.

    Returns:
        {
            "content": "File content",
            "startLine": Start line number,
            "endLine": End line number,
            "totalLines": Total line count in file
        }
    """
    file_path = Path(path)

    if not file_path.exists():
        raise HTTPException(404, f"File not found: {path}")

    try:
        content = file_path.read_text(encoding="utf-8")
        lines = content.split("\n")
        total_lines = len(lines)

        # Calculate context range
        start_line = max(1, line - context)
        end_line = min(total_lines, line + context)

        # Extract content
        selected_lines = lines[start_line - 1 : end_line]
        selected_content = "\n".join(selected_lines)

        return {
            "content": selected_content,
            "startLine": start_line,
            "endLine": end_line,
            "totalLines": total_lines,
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to read file: {e}")


@app.patch("/api/project/node/{node_id}/meta")
async def update_node_meta(
    node_id: str,
    updates: NodeMetaUpdate,
    path: str = Query(..., description="Project path"),
):
    """
    Update node meta properties (color, size, notes, etc.)

    Only update non-None fields (empty string and -1 will be passed to indicate deletion)
    """
    if path not in _projects:
        raise HTTPException(404, f"Project not loaded: {path}")

    project = _projects[path]

    # Only update non-None fields (empty string and -1 are also passed to indicate deletion)
    update_dict = {}
    for key, value in updates.model_dump().items():
        if value is not None:
            update_dict[key] = value

    project.update_node_meta(node_id, update_dict)

    return {"status": "ok", "nodeId": node_id, "updated": list(update_dict.keys())}


@app.delete("/api/project/node/{node_id}/meta")
async def delete_node_meta(
    node_id: str, path: str = Query(..., description="Project path")
):
    """Delete all meta of the node"""
    if path not in _projects:
        raise HTTPException(404, f"Project not loaded: {path}")

    project = _projects[path]
    project.delete_node_meta(node_id)

    return {"status": "ok", "nodeId": node_id}


@app.patch("/api/project/edge/{edge_id:path}/meta")
async def update_edge_meta(
    edge_id: str,
    updates: EdgeMetaUpdate,
    path: str = Query(..., description="Project path"),
):
    """
    Update edge meta properties (color, width, effect, notes, etc.)

    edge_id format is "source->target"
    Only update non-None fields (empty string and -1 will be passed to indicate deletion)
    """
    if path not in _projects:
        raise HTTPException(404, f"Project not loaded: {path}")

    project = _projects[path]

    # Only update non-None fields (empty string and -1 are also passed to indicate deletion)
    update_dict = {}
    for key, value in updates.model_dump().items():
        if value is not None:
            update_dict[key] = value

    project.update_edge_meta(edge_id, update_dict)

    return {"status": "ok", "edgeId": edge_id, "updated": list(update_dict.keys())}


@app.delete("/api/project/edge/{edge_id:path}/meta")
async def delete_edge_meta(
    edge_id: str, path: str = Query(..., description="Project path")
):
    """Delete all meta of the edge"""
    if path not in _projects:
        raise HTTPException(404, f"Project not loaded: {path}")

    project = _projects[path]
    project.delete_edge_meta(edge_id)

    return {"status": "ok", "edgeId": edge_id}


@app.post("/api/project/positions")
async def save_positions(request: PositionsUpdateRequest):
    """
    Save node 3D positions to meta.json

    Used to save Force3D layout calculated by frontend or positions after user dragging.
    Positions are merged incrementally, only updating nodes included in the request.

    Request body:
        {
            "path": "/path/to/project",
            "positions": {
                "node_id_1": {"x": 100, "y": 200, "z": 50},
                "node_id_2": {"x": 300, "y": 400, "z": -30}
            }
        }
    """
    storage = await get_project_storage(request.path)
    storage.update_positions(request.positions)
    canvas = storage.get_canvas()

    return {
        "status": "ok",
        "updated": len(request.positions),
        "positions": canvas["positions"],
    }


@app.post("/api/project/refresh")
async def refresh_project(path: str = Query(..., description="Project path")):
    """Refresh project (re-parse Lean files)"""
    if path not in _projects:
        raise HTTPException(404, f"Project not loaded: {path}")

    project = _projects[path]
    await project.load()

    return {"status": "ok", "path": path, "stats": project.get_stats()}


@app.get("/api/project/stats")
async def get_project_stats(path: str = Query(..., description="Project path")):
    """Get project statistics"""
    if path not in _projects:
        raise HTTPException(404, f"Project not loaded: {path}")

    return _projects[path].get_stats()


# ============================================
# Search API
# ============================================


@app.get("/api/project/search")
async def search_nodes(
    path: str = Query(..., description="Project path"),
    q: str = Query("", description="Search keyword (empty returns all)"),
    limit: int = Query(50, description="Maximum return count"),
):
    """
    Search nodes (fuzzy match by name)

    Search rules:
    1. Empty query returns all nodes (sorted by name)
    2. Case insensitive
    3. Match both name and id
    4. Sort by matching score (exact match > prefix match > contains match)
    """
    if path not in _projects:
        # Try to load project
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    results = []
    q_lower = q.strip().lower()

    for node in project.nodes.values():
        name_lower = node.name.lower()
        id_lower = node.id.lower()

        # Calculate matching score
        if not q_lower:
            # Empty query: return all nodes
            score = 0
        elif name_lower == q_lower or id_lower == q_lower:
            score = 100  # Exact match
        elif name_lower.startswith(q_lower) or id_lower.startswith(q_lower):
            score = 50  # Prefix match
        elif q_lower in name_lower or q_lower in id_lower:
            score = 10  # Contains match
        else:
            continue  # No match

        results.append({
            "id": node.id,
            "name": node.name,
            "kind": node.kind,
            "filePath": node.file_path,
            "lineNumber": node.line_number,
            "status": node.status.value,
            "dependsOnCount": node.depends_on_count,
            "usedByCount": node.used_by_count,
            "depth": node.depth,
            "score": score,
        })

    # Sort by score (by name for empty query), take top limit
    if q_lower:
        results.sort(key=lambda x: (-x["score"], x["name"]))
    else:
        results.sort(key=lambda x: x["name"])
    results = results[:limit]

    # Remove score field
    for r in results:
        del r["score"]

    return {"results": results, "total": len(results)}


# ============================================
# Namespace API
# ============================================

# Cache for LSP clients (one per project)
_lsp_clients: dict[str, LeanLSPClient] = {}
# Cache for namespace info (per file, not whole project)
_namespace_file_cache: dict[str, dict[str, NamespaceInfo]] = {}


async def _get_or_create_lsp_client(project_path: str) -> LeanLSPClient:
    """Get or create an LSP client for the project"""
    if project_path not in _lsp_clients:
        client = LeanLSPClient(Path(project_path))
        await client.start()
        _lsp_clients[project_path] = client
    return _lsp_clients[project_path]


async def _get_namespaces_for_file(project_path: str, file_path: str) -> dict[str, NamespaceInfo]:
    """Get namespaces from a specific file, using cache"""
    cache_key = file_path
    if cache_key in _namespace_file_cache:
        return _namespace_file_cache[cache_key]

    client = await _get_or_create_lsp_client(project_path)
    namespaces = await client.get_namespaces(Path(file_path))
    _namespace_file_cache[cache_key] = namespaces
    return namespaces


def _find_file_for_namespace(project: Project, namespace: str) -> Optional[str]:
    """Find the file that contains nodes in this namespace"""
    # Look for nodes that start with "namespace." or equal "namespace"
    # Use node.name which matches how frontend extracts namespaces
    prefix = namespace + "."

    # Find earliest node (by line number) in this namespace
    best_file = None
    best_line = float('inf')

    for node in project.nodes.values():
        if node.name.startswith(prefix) or node.name == namespace:
            if node.file_path and node.line_number:
                if node.line_number < best_line:
                    best_line = node.line_number
                    best_file = node.file_path

    return best_file


@app.get("/api/project/namespace-declaration")
async def get_namespace_declaration(
    path: str = Query(..., description="Project path"),
    namespace: str = Query(..., description="Namespace name (e.g., 'Chapter11' or 'Foo.Bar')"),
):
    """
    Get the declaration location for a namespace.

    Returns the file path and line number where the namespace is declared.
    This is useful for "Jump to Code" functionality when clicking namespace bubbles.

    Priority:
    1. Check namespace_index.json (fast, pre-computed)
    2. Fall back to LSP query (slower, but always accurate)

    Returns:
        {
            "name": "Chapter11",
            "file_path": "/path/to/file.lean",
            "line_number": 19,
            "is_explicit": true
        }
    """
    # First, try to get from cached namespace index (fast path)
    cache_path = get_lsp_cache_path(Path(path))
    cache = LSPCache.load(cache_path)
    index = cache.namespaces

    if namespace in index:
        return {"name": namespace, **index[namespace]}

    # Fall back to LSP query (slow path)
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    # Find which file contains this namespace
    file_path = _find_file_for_namespace(project, namespace)
    if not file_path:
        raise HTTPException(404, f"Namespace not found: {namespace}")

    try:
        # Get namespaces from that file
        namespaces = await _get_namespaces_for_file(path, file_path)
    except Exception as e:
        raise HTTPException(500, f"Failed to get namespaces: {e}")

    if namespace not in namespaces:
        # Namespace might be implicit, return fallback based on first node
        # Use node.name which matches how frontend extracts namespaces
        for node in project.nodes.values():
            if node.name.startswith(namespace + ".") and node.file_path and node.line_number:
                return {
                    "name": namespace,
                    "file_path": node.file_path,
                    "line_number": node.line_number,
                    "is_explicit": False
                }
        raise HTTPException(404, f"Namespace not found: {namespace}")

    return namespaces[namespace].to_dict()


@app.get("/api/project/namespaces")
async def get_all_namespaces_endpoint(
    path: str = Query(..., description="Project path"),
):
    """
    Get unique namespaces from the project's nodes.

    This is a fast operation that extracts namespaces from existing node names,
    without scanning all files via LSP.

    Returns:
        {
            "namespaces": [
                {"name": "Chapter11", "file_path": "...", "line_number": 19},
                ...
            ]
        }
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    # Extract unique namespaces from node names
    namespace_info: dict[str, dict] = {}

    for node in project.nodes.values():
        # Get namespace prefix from node name
        if "." in node.name:
            parts = node.name.rsplit(".", 1)
            ns_name = parts[0]

            # Track earliest occurrence
            if ns_name not in namespace_info:
                namespace_info[ns_name] = {
                    "name": ns_name,
                    "file_path": node.file_path,
                    "line_number": node.line_number,
                    "is_explicit": None  # Unknown without LSP
                }
            elif node.file_path and node.line_number:
                existing = namespace_info[ns_name]
                if existing["line_number"] is None or node.line_number < existing["line_number"]:
                    namespace_info[ns_name]["file_path"] = node.file_path
                    namespace_info[ns_name]["line_number"] = node.line_number

    return {
        "namespaces": list(namespace_info.values())
    }


@app.post("/api/project/namespaces/refresh")
async def refresh_namespace_cache(
    path: str = Query(..., description="Project path"),
):
    """
    Clear namespace cache for a project.

    Call this after significant code changes to update namespace info.
    """
    # Clear file caches for this project
    keys_to_remove = [k for k in _namespace_file_cache.keys() if k.startswith(path)]
    for key in keys_to_remove:
        del _namespace_file_cache[key]

    # Stop and remove old LSP client
    if path in _lsp_clients:
        await _lsp_clients[path].stop()
        del _lsp_clients[path]

    return {"status": "ok"}


# ============================================
# Namespace Index API (persistent cache)
# ============================================


@app.get("/api/project/namespace-index")
async def get_namespace_index(
    path: str = Query(..., description="Project path"),
):
    """
    Get the cached LSP information for fast lookups.

    Returns the namespace index from .astrolabe/lsp.json.
    If the cache doesn't exist, returns an empty list.

    Returns:
        {
            "namespaces": [
                {"name": "Foo", "file_path": "...", "line_number": 10, "is_explicit": true},
                ...
            ],
            "version": 2,
            "built_at": "2026-02-01T16:00:00Z"
        }
    """
    cache_path = get_lsp_cache_path(Path(path))
    cache = LSPCache.load(cache_path)

    # Convert dict to list format for frontend
    namespaces = [
        {"name": ns_name, **info}
        for ns_name, info in cache.namespaces.items()
    ]

    return {
        "namespaces": namespaces,
        "version": cache.version,
        "built_at": cache.built_at,
        "file_count": len(cache.files),
    }


@app.post("/api/project/namespace-index/build")
async def build_namespace_index_endpoint(
    path: str = Query(..., description="Project path"),
):
    """
    Build and save the complete LSP cache.

    This scans all files in the project using the Lean LSP and collects:
    - Document symbols (all declarations with hierarchy)
    - Diagnostics (errors, warnings)
    - Namespace index (extracted from symbols for fast lookup)

    The result is saved to .astrolabe/lsp.json for fast future lookups.
    This operation may take some time for large projects.

    Returns:
        {"status": "ok", "count": 123, "file_count": 45}
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    # Collect unique file paths from nodes
    file_paths = set()
    for node in project.nodes.values():
        if node.file_path:
            file_paths.add(node.file_path)

    # Build complete LSP cache
    cache = await build_lsp_cache(Path(path), list(file_paths))

    # Save to file
    cache_path = get_lsp_cache_path(Path(path))
    cache.save(cache_path)

    return {
        "status": "ok",
        "count": len(cache.namespaces),
        "file_count": len(cache.files),
        "built_at": cache.built_at,
    }


# ============================================
# Dependency Query API
# ============================================


@app.get("/api/project/node/{node_id}/deps")
async def get_node_deps(
    node_id: str,
    path: str = Query(..., description="Project path"),
):
    """
    Get node dependencies

    Returns:
        depends_on: Nodes that this node depends on (upstream)
        used_by: Nodes that depend on this node (downstream)
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    if node_id not in project.nodes:
        raise HTTPException(404, f"Node not found: {node_id}")

    depends_on = []  # Nodes this node depends on
    used_by = []     # Nodes that depend on this node

    for edge in project.edges:
        if edge.source == node_id:
            # This node depends on target
            target_node = project.nodes.get(edge.target)
            if target_node:
                depends_on.append({
                    "id": target_node.id,
                    "name": target_node.name,
                    "kind": target_node.kind,
                })
        elif edge.target == node_id:
            # source depends on this node
            source_node = project.nodes.get(edge.source)
            if source_node:
                used_by.append({
                    "id": source_node.id,
                    "name": source_node.name,
                    "kind": source_node.kind,
                })

    return {
        "node_id": node_id,
        "depends_on": depends_on,
        "used_by": used_by,
    }


# ============================================
# Canvas API
# ============================================


@app.get("/api/canvas")
async def get_canvas(path: str = Query(..., description="Project path")):
    """Load canvas state"""
    storage = await get_project_storage(path)
    canvas = storage.get_canvas()

    return {
        "visible_nodes": canvas["visible_nodes"],
        "positions": canvas["positions"],
    }


@app.post("/api/canvas")
async def save_canvas(request: CanvasSaveRequest):
    """Save canvas state"""
    storage = await get_project_storage(request.path)
    storage.set_canvas({
        "visible_nodes": request.visible_nodes,
        "positions": request.positions,
    })

    return {"status": "ok", "nodes": len(request.visible_nodes)}


@app.post("/api/canvas/add")
async def add_to_canvas(request: CanvasAddNodeRequest):
    """Add node to canvas"""
    storage = await get_project_storage(request.path)
    storage.add_node_to_canvas(request.node_id)
    canvas = storage.get_canvas()

    return {
        "status": "ok",
        "visible_nodes": canvas["visible_nodes"],
        "positions": canvas["positions"],
    }


@app.post("/api/canvas/add-batch")
async def add_batch_to_canvas(request: CanvasAddNodesRequest):
    """Batch add nodes to canvas"""
    storage = await get_project_storage(request.path)
    storage.add_nodes_to_canvas(request.node_ids)
    canvas = storage.get_canvas()

    return {
        "status": "ok",
        "visible_nodes": canvas["visible_nodes"],
        "positions": canvas["positions"],
    }


@app.post("/api/canvas/remove")
async def remove_from_canvas(request: CanvasAddNodeRequest):
    """Remove node from canvas"""
    storage = await get_project_storage(request.path)
    storage.remove_node_from_canvas(request.node_id)
    canvas = storage.get_canvas()

    return {
        "status": "ok",
        "visible_nodes": canvas["visible_nodes"],
        "positions": canvas["positions"],
    }


@app.post("/api/canvas/positions")
async def update_canvas_positions(request: PositionsUpdateRequest):
    """Update canvas node 3D positions"""
    storage = await get_project_storage(request.path)
    storage.update_positions(request.positions)
    canvas = storage.get_canvas()

    return {
        "status": "ok",
        "updated": len(request.positions),
        "positions": canvas["positions"],
    }


@app.post("/api/canvas/clear")
async def clear_canvas(path: str = Query(..., description="Project path")):
    """Clear canvas"""
    storage = await get_project_storage(path)
    storage.clear_canvas()

    return {"status": "ok"}


@app.post("/api/meta/clear")
async def clear_meta(path: str = Query(..., description="Project path")):
    """
    Clear all metadata (node meta, edge meta, canvas).
    This is a destructive operation.
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    if project.storage:
        project.storage.clear()

    return {"status": "ok"}


@app.post("/api/reset")
async def reset_project(path: str = Query(..., description="Project path")):
    """
    Reset all project data.

    Deletes the entire .astrolabe directory, forcing a complete re-parse
    from .ilean files on next load. This will regenerate:
    - graph.json (node/edge structure)
    - meta.json (user metadata)
    - canvas.json (UI state)

    This is useful for:
    - Fixing corrupted cache data
    - Starting fresh after major code changes
    """
    import shutil

    project_path = Path(path)
    astrolabe_dir = project_path / ".astrolabe"

    # Clear from in-memory cache
    if path in _projects:
        del _projects[path]

    # Delete .astrolabe directory
    if astrolabe_dir.exists():
        shutil.rmtree(astrolabe_dir)

    return {"status": "ok"}


@app.get("/api/canvas/viewport")
async def get_viewport(path: str = Query(..., description="Project path")):
    """
    Get viewport state (camera position, selected nodes, etc.)

    Returns:
        {
            "camera_position": [x, y, z],
            "camera_target": [x, y, z],
            "zoom": 1.0,
            "selected_node_id": "node_id" | null
        }
    """
    storage = await get_project_storage(path)
    viewport = storage.get_viewport()

    return viewport


@app.patch("/api/canvas/viewport")
async def update_viewport(request: ViewportUpdateRequest):
    """
    Update viewport state (incremental merge)

    Only update non-None fields
    """
    storage = await get_project_storage(request.path)

    # Build updates dictionary
    updates = {}
    if request.camera_position is not None:
        updates["camera_position"] = request.camera_position
    if request.camera_target is not None:
        updates["camera_target"] = request.camera_target
    if request.zoom is not None:
        updates["zoom"] = request.zoom
    if request.selected_node_id is not None:
        updates["selected_node_id"] = request.selected_node_id
    if request.selected_edge_id is not None:
        # Empty string indicates clearing selection
        updates["selected_edge_id"] = request.selected_edge_id if request.selected_edge_id else None
    if request.filter_options is not None:
        updates["filter_options"] = request.filter_options.model_dump()

    storage.update_viewport(updates)
    viewport = storage.get_viewport()

    return {"status": "ok", "viewport": viewport}


# ============================================
# Macros API
# ============================================


# ============================================
# User Node/Edge API (using UnifiedStorage)
# ============================================


@app.post("/api/project/user-node")
async def add_user_node(request: UserNodeRequest):
    """
    Add User node

    User nodes are user-defined virtual nodes that don't correspond to any Lean code.
    ID format is custom-{timestamp}, can be customized.
    """
    if request.path not in _projects:
        project = get_project(request.path)
        await project.load()
    else:
        project = _projects[request.path]

    if not project.storage:
        raise HTTPException(status_code=500, detail="Storage not initialized")

    # Generate node_id
    node_id = request.node_id or f"custom-{int(time.time() * 1000)}"

    # Collect optional parameters
    kwargs = {}
    if request.color is not None:
        kwargs["color"] = request.color
    if request.size is not None:
        kwargs["size"] = request.size
    if request.shape is not None:
        kwargs["shape"] = request.shape
    if request.effect is not None:
        kwargs["effect"] = request.effect
    if request.notes is not None:
        kwargs["notes"] = request.notes

    node_data = project.storage.add_user_node(
        node_id=node_id,
        name=request.name,
        kind=request.kind,
        references=request.references,
        **kwargs,
    )

    return {"status": "ok", "node": node_data}


@app.get("/api/project/user-nodes")
async def get_user_nodes(path: str = Query(..., description="Project path")):
    """
    Get all User nodes
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    if not project.storage:
        raise HTTPException(status_code=500, detail="Storage not initialized")

    nodes = project.storage.get_all_user_nodes()
    return {"status": "ok", "nodes": nodes}


@app.patch("/api/project/user-node/{node_id}")
async def update_user_node(
    node_id: str,
    request: UserNodeUpdateRequest,
):
    """
    Update User node

    Can only update nodes with custom- prefix
    """
    if request.path not in _projects:
        project = get_project(request.path)
        await project.load()
    else:
        project = _projects[request.path]

    if not project.storage:
        raise HTTPException(status_code=500, detail="Storage not initialized")

    if not project.storage.is_user_node(node_id):
        raise HTTPException(status_code=400, detail=f"Not a user node: {node_id}")

    # Collect non-None update fields
    updates = {}
    for key, value in request.model_dump().items():
        if key != "path" and value is not None:
            updates[key] = value

    project.storage.update_node_meta(node_id, **updates)

    # Return updated node
    node_data = project.storage.get_node(node_id)
    return {"status": "ok", "node": node_data}


@app.delete("/api/project/user-node/{node_id}")
async def delete_user_node(
    node_id: str,
    path: str = Query(..., description="Project path"),
):
    """
    Delete User node

    Will cascade delete related edges and references in other nodes
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    if not project.storage:
        raise HTTPException(status_code=500, detail="Storage not initialized")

    if not project.storage.is_user_node(node_id):
        raise HTTPException(status_code=400, detail=f"Not a user node: {node_id}")

    project.storage.delete_node(node_id)

    return {"status": "ok", "nodeId": node_id}


@app.post("/api/project/user-edge")
async def add_user_edge(request: UserEdgeRequest):
    """
    Add User edge

    User edges can connect any two nodes (Lean nodes or User nodes)
    """
    if request.path not in _projects:
        project = get_project(request.path)
        await project.load()
    else:
        project = _projects[request.path]

    if not project.storage:
        raise HTTPException(status_code=500, detail="Storage not initialized")

    # Collect optional parameters
    kwargs = {}
    if request.color is not None:
        kwargs["color"] = request.color
    if request.width is not None:
        kwargs["width"] = request.width
    if request.style is not None:
        kwargs["style"] = request.style
    if request.effect is not None:
        kwargs["effect"] = request.effect
    if request.notes is not None:
        kwargs["notes"] = request.notes

    edge_data = project.storage.add_user_edge(
        source=request.source,
        target=request.target,
        **kwargs,
    )

    return {"status": "ok", "edge": edge_data}


@app.get("/api/project/user-edges")
async def get_user_edges(path: str = Query(..., description="Project path")):
    """
    Get all User edges
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    if not project.storage:
        raise HTTPException(status_code=500, detail="Storage not initialized")

    edges = project.storage.get_all_user_edges()
    return {"status": "ok", "edges": edges}


@app.delete("/api/project/user-edge/{edge_id:path}")
async def delete_user_edge(
    edge_id: str,
    path: str = Query(..., description="Project path"),
):
    """
    Delete User edge

    Can only delete User edges (type=custom), cannot delete Lean edges
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    if not project.storage:
        raise HTTPException(status_code=500, detail="Storage not initialized")

    if not project.storage.is_user_edge(edge_id):
        raise HTTPException(status_code=400, detail=f"Not a user edge: {edge_id}")

    try:
        project.storage.delete_edge(edge_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": "ok", "edgeId": edge_id}


@app.get("/api/project/status")
async def check_project_status(path: str = Query(..., description="Project path")):
    """
    Check project status

    Returns:
    - exists: Whether project directory exists
    - hasLakefile: Whether lakefile.lean exists
    - hasLakeCache: Whether .lake/build cache exists
    - usesMathlib: Whether depends on Mathlib
    - leanFileCount: Number of .lean files
    - needsInit: Whether initialization is needed (has lakefile but no cache)
    - message: Status message
    """
    project_path = Path(path)

    if not project_path.exists():
        return {
            "exists": False,
            "hasLakefile": False,
            "hasLakeCache": False,
            "usesMathlib": False,
            "leanFileCount": 0,
            "needsInit": False,
            "notSupported": True,
            "message": "Project directory does not exist"
        }

    # Check lakefile.lean or lakefile.toml
    lakefile_lean = project_path / "lakefile.lean"
    lakefile_toml = project_path / "lakefile.toml"
    has_lakefile = lakefile_lean.exists() or lakefile_toml.exists()
    lakefile = lakefile_lean if lakefile_lean.exists() else lakefile_toml

    # Check if depends on Mathlib (also check lake-manifest.json)
    uses_mathlib = False
    if has_lakefile:
        try:
            lakefile_content = lakefile.read_text(encoding="utf-8")
            uses_mathlib = "mathlib" in lakefile_content.lower()
        except Exception:
            pass
    # Also check lake-manifest.json
    if not uses_mathlib:
        manifest = project_path / "lake-manifest.json"
        if manifest.exists():
            try:
                manifest_content = manifest.read_text(encoding="utf-8")
                uses_mathlib = "mathlib" in manifest_content.lower()
            except Exception:
                pass

    # Check .lake/build cache
    lake_build = project_path / ".lake" / "build"
    has_cache = lake_build.exists()

    # Count .lean files
    lean_files = list(project_path.rglob("*.lean"))
    # Exclude .lake directory
    lean_files = [f for f in lean_files if ".lake" not in str(f)]
    lean_count = len(lean_files)

    # Determine if initialization is needed
    needs_init = has_lakefile and not has_cache
    # Non-Lean 4 Lake projects are not supported
    not_supported = not has_lakefile

    # Generate message
    if not has_lakefile:
        message = "This is not a Lean 4 Lake project. Please ensure the project contains lakefile.lean or lakefile.toml."
    elif needs_init:
        if uses_mathlib:
            message = f"No .ilean cache found. Found {lean_count} .lean files. Please run 'lake exe cache get' and 'lake build' first."
        else:
            message = f"No .ilean cache found. Found {lean_count} .lean files. Please run 'lake build' first."
    elif lean_count == 0:
        message = "No .lean files found in this project."
    else:
        message = f"Ready. Found {lean_count} .lean files with compiled cache."

    return {
        "exists": True,
        "hasLakefile": has_lakefile,
        "hasLakeCache": has_cache,
        "usesMathlib": uses_mathlib,
        "leanFileCount": lean_count,
        "needsInit": needs_init,
        "notSupported": not_supported,
        "message": message
    }


# ============================================
# Project Initialization
# ============================================

# Timeout configuration
CACHE_GET_TIMEOUT = 600  # cache get maximum 10 minutes
BUILD_TIMEOUT = 120  # build maximum 2 minutes
BUILD_WARNING_TIME = 30  # warn if build exceeds 30 seconds

# Danger patterns (may cause long compilation times)
DANGER_PATTERNS = [
    "building mathlib",
    "compiling mathlib",
    "building leanprover",
    "lake update",
]

# Running processes (for cancellation)
import time
_running_processes: dict[str, asyncio.subprocess.Process] = {}


async def _run_command_with_output(
    cmd: list[str],
    cwd: str,
    step_name: str,
    timeout: int = 600,
    warning_time: int = None,
    process_key: str = None,
) -> AsyncGenerator[str, None]:
    """Run command with streaming output, supporting timeout and cancellation"""
    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    # Save process reference to support cancellation
    if process_key:
        _running_processes[process_key] = process

    yield f"data: {json.dumps({'type': 'step', 'step': step_name, 'status': 'running'})}\n\n"

    start_time = time.time()
    warning_sent = False
    danger_warning_sent = False
    compile_count = 0

    try:
        while True:
            elapsed = time.time() - start_time

            # Timeout detection
            if elapsed > timeout:
                process.kill()
                await process.wait()
                yield f"data: {json.dumps({'type': 'step', 'step': step_name, 'status': 'timeout'})}\n\n"
                yield f"data: {json.dumps({'type': 'error', 'message': f'{step_name} timeout ({timeout}s), terminated'})}\n\n"
                # Return recovery suggestion
                yield f"data: {json.dumps({'type': 'suggestion', 'message': 'Suggestion: Delete .lake directory and retry', 'commands': [f'rm -rf {cwd}/.lake', f'cd {cwd} && lake exe cache get', f'cd {cwd} && lake build']})}\n\n"
                return

            # Time warning detection
            if warning_time and elapsed > warning_time and not warning_sent:
                warning_sent = True
                yield f"data: {json.dumps({'type': 'warning', 'message': 'Compilation is taking longer, may be recompiling dependencies...'})}\n\n"

            # Read output (with timeout)
            try:
                line = await asyncio.wait_for(process.stdout.readline(), timeout=1.0)
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").rstrip()
                yield f"data: {json.dumps({'type': 'output', 'line': decoded})}\n\n"

                # Danger pattern detection
                decoded_lower = decoded.lower()
                if not danger_warning_sent:
                    for pattern in DANGER_PATTERNS:
                        if pattern in decoded_lower:
                            danger_warning_sent = True
                            yield f"data: {json.dumps({'type': 'warning', 'message': f'Detected {pattern}, may take a very long time. Consider cancelling and checking dependency versions.'})}\n\n"
                            break

                # Compile count detection
                if "compiling" in decoded_lower or "building" in decoded_lower:
                    compile_count += 1
                    if compile_count == 50 and not danger_warning_sent:
                        danger_warning_sent = True
                        yield f"data: {json.dumps({'type': 'warning', 'message': 'Large amount of compilation output, may be recompiling dependency libraries...'})}\n\n"

            except asyncio.TimeoutError:
                # No output, continue loop to check timeout
                continue

        await process.wait()

        if process.returncode == 0:
            yield f"data: {json.dumps({'type': 'step', 'step': step_name, 'status': 'completed'})}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'step', 'step': step_name, 'status': 'failed', 'returncode': process.returncode})}\n\n"
            yield f"data: {json.dumps({'type': 'error', 'message': f'{step_name} failed with code {process.returncode}'})}\n\n"
            # Also return recovery suggestion on failure
            yield f"data: {json.dumps({'type': 'suggestion', 'message': 'Suggestion: Check error message, or try deleting .lake directory and retry', 'commands': [f'rm -rf {cwd}/.lake', f'cd {cwd} && lake exe cache get', f'cd {cwd} && lake build']})}\n\n"
    finally:
        if process_key and process_key in _running_processes:
            del _running_processes[process_key]


async def _init_project_generator(path: str) -> AsyncGenerator[str, None]:
    """Project initialization generator"""
    project_path = Path(path)
    process_key = f"init:{path}"

    # Check lakefile (supports .lean and .toml)
    lakefile_lean = project_path / "lakefile.lean"
    lakefile_toml = project_path / "lakefile.toml"

    if not lakefile_lean.exists() and not lakefile_toml.exists():
        yield f"data: {json.dumps({'type': 'error', 'message': 'No lakefile.lean or lakefile.toml found'})}\n\n"
        return

    # Check if using Mathlib
    uses_mathlib = False
    try:
        if lakefile_lean.exists():
            content = lakefile_lean.read_text(encoding="utf-8")
        else:
            content = lakefile_toml.read_text(encoding="utf-8")
        uses_mathlib = "mathlib" in content.lower()
    except Exception:
        pass

    yield f"data: {json.dumps({'type': 'start', 'usesMathlib': uses_mathlib})}\n\n"

    # If using Mathlib, download cache first
    if uses_mathlib:
        async for msg in _run_command_with_output(
            ["lake", "exe", "cache", "get"],
            str(project_path),
            "cache_get",
            timeout=CACHE_GET_TIMEOUT,
            process_key=f"{process_key}:cache",
        ):
            yield msg
            if '"status": "failed"' in msg or '"status": "timeout"' in msg:
                return

    # Run lake build
    async for msg in _run_command_with_output(
        ["lake", "build"],
        str(project_path),
        "build",
        timeout=BUILD_TIMEOUT,
        warning_time=BUILD_WARNING_TIME,
        process_key=f"{process_key}:build",
    ):
        yield msg
        if '"status": "failed"' in msg or '"status": "timeout"' in msg:
            return

    yield f"data: {json.dumps({'type': 'done', 'success': True})}\n\n"


@app.post("/api/project/init")
async def init_project(path: str = Query(..., description="Project path")):
    """
    Initialize project (SSE streaming progress)

    1. If depends on Mathlib, run lake exe cache get
    2. Run lake build
    3. Return progress events

    Event types:
    - start: Start initialization {usesMathlib}
    - step: Step status {step, status: running|completed|failed}
    - output: Command output {line}
    - error: Error {message}
    - done: Completed {success}
    """
    return StreamingResponse(
        _init_project_generator(path),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@app.post("/api/project/init/cancel")
async def cancel_init(path: str = Query(..., description="Project path")):
    """
    Cancel running project initialization

    Will terminate related lake processes and return recovery suggestion
    """
    process_key = f"init:{path}"
    killed = []

    # Find and terminate related processes
    for key in list(_running_processes.keys()):
        if key.startswith(process_key):
            proc = _running_processes[key]
            try:
                proc.kill()
                killed.append(key)
            except Exception:
                pass

    if killed:
        return {
            "status": "cancelled",
            "killed": killed,
            "suggestion": {
                "message": "Cancelled. If you encounter problems, suggest deleting .lake directory and retry",
                "commands": [
                    f"rm -rf {path}/.lake",
                    f"cd {path} && lake exe cache get",
                    f"cd {path} && lake build"
                ]
            }
        }
    else:
        return {"status": "not_found", "message": "No running init process found"}


# ============================================
# WebSocket File Watching
# ============================================


@app.websocket("/ws/watch")
async def watch_project(websocket: WebSocket, path: str = Query(...)):
    """
    Watch file changes, notify frontend to refresh

    Monitors two types of files:
    1. .ilean file changes → Re-parse project, send refresh message
    2. meta.json changes → Only reload meta, send meta_refresh message
    """
    await websocket.accept()
    print(f"[WebSocket] Client connected, watching: {path}")

    try:
        # Send connection success message
        await websocket.send_json({
            "type": "connected",
            "path": path,
        })

        # Use watchfiles to monitor directory
        async for changes in awatch(path, watch_filter=should_watch_file):
            changed_files = [str(c[1]) for c in changes]
            print(f"[WebSocket] Files changed: {changed_files}")

            # Distinguish change types
            ilean_changed = any(f.endswith(".ilean") for f in changed_files)
            meta_changed = any(f.endswith("meta.json") for f in changed_files)

            if ilean_changed:
                # .ilean changes: Reload entire project
                if path in _projects:
                    try:
                        await _projects[path].load()
                        print(f"[WebSocket] Project reloaded (ilean changed)")
                    except Exception as e:
                        print(f"[WebSocket] Reload error: {e}")

                # Notify frontend to refresh
                await websocket.send_json({
                    "type": "refresh",
                    "files": changed_files,
                    "stats": _projects[path].get_stats() if path in _projects else None,
                })

            elif meta_changed:
                # meta.json changes: Only reload meta data
                if path in _projects:
                    try:
                        _projects[path].reload_meta()
                        print(f"[WebSocket] Meta reloaded")
                    except Exception as e:
                        print(f"[WebSocket] Meta reload error: {e}")

                # Notify frontend of meta changes
                await websocket.send_json({
                    "type": "meta_refresh",
                    "files": changed_files,
                })

    except WebSocketDisconnect:
        print(f"[WebSocket] Client disconnected: {path}")
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e),
            })
        except:
            pass


# ============================================
# Network Analysis API
# ============================================


# Cache for NetworkX graphs (avoid rebuilding on every request)
_graph_cache: dict[str, tuple[nx.DiGraph, float]] = {}  # path -> (graph, timestamp)
GRAPH_CACHE_TTL = 60  # seconds


def _get_or_build_graph(project: Project) -> nx.DiGraph:
    """Get cached NetworkX graph or build a new one"""
    import time as time_module
    path = project.path
    now = time_module.time()

    # Check cache
    if path in _graph_cache:
        cached_graph, timestamp = _graph_cache[path]
        if now - timestamp < GRAPH_CACHE_TTL:
            return cached_graph

    # Build new graph
    nodes = list(project.nodes.values())
    edges = project.edges
    G = build_networkx_graph(nodes, edges, directed=True)

    # Cache it
    _graph_cache[path] = (G, now)
    return G


@app.get("/api/project/analysis/degree")
async def get_degree_analysis(
    path: str = Query(..., description="Project path"),
    top_k: int = Query(20, description="Number of top nodes to return"),
):
    """
    Get degree distribution analysis for the project graph.

    Returns:
        - inDegree: Incoming edge statistics (how many dependencies each node has)
        - outDegree: Outgoing edge statistics (how many nodes depend on each)
        - totalDegree: Combined degree statistics
        - topInDegree: Nodes with most incoming edges (most dependencies)
        - topOutDegree: Nodes with most outgoing edges (most depended upon)
        - shannonEntropy: Entropy of the degree distribution
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    stats = compute_degree_statistics(G, top_k=top_k)

    return {
        "status": "ok",
        "analysis": "degree",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": stats.to_dict(),
    }


@app.get("/api/project/analysis/pagerank")
async def get_pagerank_analysis(
    path: str = Query(..., description="Project path"),
    alpha: float = Query(0.85, description="Damping factor (0-1)"),
    top_k: int = Query(20, description="Number of top nodes to return"),
    include_all: bool = Query(False, description="Include all node values (can be large)"),
):
    """
    Get PageRank centrality analysis for the project graph.

    PageRank identifies the most "important" nodes based on link structure.
    In Lean projects, high PageRank indicates foundational theorems/lemmas
    that are referenced by many other important results.

    Args:
        path: Project path
        alpha: Damping factor (default 0.85, higher = more weight on link structure)
        top_k: Number of top nodes to return
        include_all: If True, include centrality values for all nodes

    Returns:
        - topNodes: List of top k nodes by PageRank
        - mean: Mean PageRank value
        - maxValue: Maximum PageRank value
        - minValue: Minimum PageRank value
        - values: (optional) All node PageRank values
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    result = compute_pagerank(G, alpha=alpha, top_k=top_k)

    response_data = {
        "topNodes": [{"nodeId": n, "value": v} for n, v in result.top_nodes],
        "mean": result.mean,
        "maxValue": result.max_value,
        "minValue": result.min_value,
    }

    if include_all:
        response_data["values"] = result.values

    return {
        "status": "ok",
        "analysis": "pagerank",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "alpha": alpha,
        "data": response_data,
    }


@app.get("/api/project/analysis/betweenness")
async def get_betweenness_analysis(
    path: str = Query(..., description="Project path"),
    k: int = Query(1000, description="Number of samples for approximation (0 = exact)"),
    top_k: int = Query(20, description="Number of top nodes to return"),
    include_all: bool = Query(False, description="Include all node values (can be large)"),
):
    """
    Get Betweenness centrality analysis for the project graph.

    Betweenness measures how often a node lies on shortest paths between other nodes.
    High betweenness indicates "bridge" nodes that connect different parts of the graph.

    In Lean projects, high betweenness indicates lemmas that bridge different
    mathematical domains - "connector" results that link different areas.

    Args:
        path: Project path
        k: Number of random samples for approximation (default 1000, 0 = exact calculation)
        top_k: Number of top nodes to return
        include_all: If True, include centrality values for all nodes

    Returns:
        - topNodes: List of top k nodes by betweenness
        - mean: Mean betweenness value
        - maxValue: Maximum betweenness value
        - minValue: Minimum betweenness value
        - values: (optional) All node betweenness values
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    # k=0 means exact calculation
    sample_k = k if k > 0 else None
    result = compute_betweenness_centrality(G, k=sample_k, top_k=top_k)

    response_data = {
        "topNodes": [{"nodeId": n, "value": v} for n, v in result.top_nodes],
        "mean": result.mean,
        "maxValue": result.max_value,
        "minValue": result.min_value,
    }

    if include_all:
        response_data["values"] = result.values

    return {
        "status": "ok",
        "analysis": "betweenness",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "sampled": sample_k is not None,
        "sampleSize": sample_k,
        "data": response_data,
    }


@app.get("/api/project/analysis/communities")
async def get_community_detection(
    path: str = Query(..., description="Project path"),
    resolution: float = Query(1.0, description="Resolution parameter (higher = more communities)"),
    include_partition: bool = Query(False, description="Include full node->community mapping"),
    include_members: bool = Query(True, description="Include community member lists"),
    top_k: int = Query(10, description="Number of top communities to show members for"),
):
    """
    Detect communities using the Louvain algorithm.

    Communities are groups of densely connected nodes. In Lean projects,
    they represent clusters of related mathematical concepts.

    Args:
        path: Project path
        resolution: Higher = more smaller communities, lower = fewer larger communities
        include_partition: If True, include full node->community_id mapping
        include_members: If True, include member lists for top communities
        top_k: Number of top communities to include member lists for

    Returns:
        - numCommunities: Total number of communities found
        - modularity: Quality score (0-1, higher = better separation)
        - sizes: List of community sizes (sorted descending)
        - communities: (optional) Top k communities with member lists
        - partition: (optional) Full node->community_id mapping
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    result = detect_communities_louvain(G, resolution=resolution)

    # Build response
    response_data = {
        "numCommunities": result.num_communities,
        "modularity": result.modularity,
        "sizes": result.sizes,
    }

    # Include top k communities with members
    if include_members:
        # Sort communities by size
        sorted_communities = sorted(
            result.communities.items(),
            key=lambda x: len(x[1]),
            reverse=True
        )
        top_communities = []
        for comm_id, members in sorted_communities[:top_k]:
            top_communities.append({
                "id": comm_id,
                "size": len(members),
                "members": members,
            })
        response_data["topCommunities"] = top_communities

    if include_partition:
        response_data["partition"] = result.partition

    return {
        "status": "ok",
        "analysis": "communities",
        "algorithm": "louvain",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "resolution": resolution,
        "data": response_data,
    }


@app.get("/api/project/analysis/clustering")
async def get_clustering_analysis(
    path: str = Query(..., description="Project path"),
    top_k: int = Query(20, description="Number of top nodes to return"),
    include_local: bool = Query(False, description="Include all local coefficients (can be large)"),
    include_namespaces: bool = Query(True, description="Include clustering by namespace"),
):
    """
    Get clustering coefficient analysis for the project graph.

    The clustering coefficient measures how much nodes tend to cluster together.
    - Global (transitivity): Fraction of possible triangles that exist
    - Local: For each node, what fraction of its neighbors are also connected
    - By namespace: Average clustering within each namespace

    In Lean projects, high clustering indicates tightly interconnected groups
    of lemmas representing cohesive mathematical topics.

    Args:
        path: Project path
        top_k: Number of top clustered nodes to return
        include_local: If True, include local coefficients for all nodes
        include_namespaces: If True, include clustering breakdown by namespace

    Returns:
        - globalCoefficient: Graph-wide transitivity
        - averageCoefficient: Mean of local coefficients
        - topNodes: Nodes with highest local clustering
        - byNamespace: (optional) Average clustering per namespace
        - local: (optional) All local coefficients
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    result = compute_clustering_coefficients(G, include_local=True)

    # Get top-k nodes by local clustering (filter out nodes with degree < 2)
    G_undirected = G.to_undirected() if G.is_directed() else G
    degrees = dict(G_undirected.degree())

    # Sort nodes by clustering, filter by min degree
    sorted_nodes = sorted(
        [(n, c) for n, c in result.local.items() if degrees.get(n, 0) >= 2],
        key=lambda x: x[1],
        reverse=True
    )
    top_nodes = [{"nodeId": n, "value": c, "degree": degrees.get(n, 0)}
                 for n, c in sorted_nodes[:top_k]]

    # Build response
    response_data = {
        "globalCoefficient": result.global_coefficient,
        "averageCoefficient": result.average_coefficient,
        "topNodes": top_nodes,
    }

    if include_namespaces:
        # Sort namespaces by clustering coefficient
        sorted_ns = sorted(
            result.by_namespace.items(),
            key=lambda x: x[1],
            reverse=True
        )
        response_data["byNamespace"] = [
            {"namespace": ns, "avgClustering": c, "nodeCount": sum(1 for n in result.local if n.startswith(ns + "."))}
            for ns, c in sorted_ns[:50]  # Top 50 namespaces
        ]

    if include_local:
        response_data["local"] = result.local

    return {
        "status": "ok",
        "analysis": "clustering",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": response_data,
    }


@app.get("/api/project/analysis/entropy")
async def get_project_entropy(
    path: str = Query(..., description="Project path"),
    num_eigenvalues: int = Query(100, description="Number of eigenvalues for Von Neumann entropy"),
    random_samples: int = Query(5, description="Number of random graph samples for baseline"),
):
    """
    Compute entropy metrics for the project's dependency graph.

    Returns:
        - vonNeumann: Von Neumann entropy (based on graph Laplacian)
        - shannon: Shannon entropy (based on degree distribution)
        - effectiveDimension: exp(Von Neumann entropy)
        - randomBaseline: Entropy of equivalent random graph (same n, m)
        - normalizedEntropy: Von Neumann entropy / random baseline entropy
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    n = G.number_of_nodes()
    m = G.number_of_edges()

    # Compute Von Neumann entropy
    vn_result = compute_von_neumann_entropy(G, num_eigenvalues=num_eigenvalues)
    vn_entropy = vn_result["vonNeumannEntropy"]
    vn_effective_dim = vn_result["effectiveDimension"]
    vn_num_eigenvalues = len(vn_result["eigenvalues"])

    # Compute Shannon entropy from degree distribution
    shannon_entropy = compute_degree_shannon_entropy(G)

    # Compute random graph baseline
    baseline = random_graph_baseline(n, m, num_samples=random_samples)
    baseline_vn_mean = baseline["vonNeumann"]["mean"]
    baseline_vn_std = baseline["vonNeumann"]["std"]

    # Normalized entropy (compared to random graph)
    normalized = vn_entropy / baseline_vn_mean if baseline_vn_mean > 0 else 0.0

    return {
        "status": "ok",
        "analysis": "entropy",
        "numNodes": n,
        "numEdges": m,
        "data": {
            "vonNeumann": {
                "entropy": vn_entropy,
                "numEigenvalues": vn_num_eigenvalues,
                "effectiveDimension": vn_effective_dim,
            },
            "shannon": {
                "entropy": shannon_entropy,
                "description": "Entropy of degree distribution",
            },
            "randomBaseline": {
                "meanEntropy": baseline_vn_mean,
                "stdEntropy": baseline_vn_std,
                "numSamples": baseline["numSamples"],
            },
            "normalizedEntropy": normalized,
            "interpretation": (
                "low" if normalized < 0.8 else
                "medium" if normalized < 1.2 else
                "high"
            ),
        },
    }


@app.get("/api/project/analysis/dag")
async def get_dag_analysis(
    path: str = Query(..., description="Project path"),
    include_all_depths: bool = Query(False, description="Include depth for all nodes"),
    include_all_scores: bool = Query(False, description="Include bottleneck scores for all nodes"),
    top_k: int = Query(20, description="Number of top nodes to return for each metric"),
):
    """
    Get DAG-specific analysis for the project dependency graph.

    DAG analysis is specialized for formal mathematics dependency structures,
    providing insights into proof depth, bottlenecks, and critical paths.

    Returns:
        - sources: Root nodes (axioms, definitions with no dependencies)
        - sinks: Terminal nodes (not used by other theorems)
        - graphDepth: Length of the longest dependency chain
        - criticalPath: The longest dependency chain (node IDs)
        - layers: Number of topological layers
        - topDeepNodes: Nodes with highest dependency depth
        - topBottlenecks: Nodes with highest bottleneck score
        - topReachability: Nodes that can reach the most other nodes
    """
    from .analysis.dag import (
        analyze_dag,
        compute_dependency_depth,
        compute_bottleneck_scores,
        compute_reachability_count,
    )

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    # Run full DAG analysis
    result = analyze_dag(G)

    if not result.get("is_dag", False):
        return {
            "status": "error",
            "analysis": "dag",
            "error": result.get("error", "Graph contains cycles"),
            "numNodes": G.number_of_nodes(),
            "numEdges": G.number_of_edges(),
        }

    # Prepare top nodes by depth
    depths = result["depths"]
    sorted_by_depth = sorted(depths.items(), key=lambda x: -x[1])[:top_k]

    # Prepare top bottlenecks
    bottlenecks = result["bottleneck_scores"]
    sorted_bottlenecks = sorted(bottlenecks.items(), key=lambda x: -x[1])[:top_k]

    # Prepare top reachability
    reachability = result["reachability"]
    sorted_reachability = sorted(reachability.items(), key=lambda x: -x[1])[:top_k]

    response_data = {
        "isDAG": True,
        "sources": result["sources"],
        "sinks": result["sinks"],
        "numSources": result["num_sources"],
        "numSinks": result["num_sinks"],
        "graphDepth": result["graph_depth"],
        "numLayers": result["num_layers"],
        "criticalPath": result["critical_path"],
        "topDeepNodes": [{"nodeId": n, "depth": d} for n, d in sorted_by_depth],
        "topBottlenecks": [{"nodeId": n, "score": s} for n, s in sorted_bottlenecks],
        "topReachability": [{"nodeId": n, "count": c} for n, c in sorted_reachability],
    }

    if include_all_depths:
        response_data["allDepths"] = depths

    if include_all_scores:
        response_data["allBottleneckScores"] = bottlenecks
        response_data["allReachability"] = reachability

    return {
        "status": "ok",
        "analysis": "dag",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": response_data,
    }


@app.get("/api/project/analysis/critical-path")
async def get_critical_path_to_node(
    path: str = Query(..., description="Project path"),
    target: str = Query(..., description="Target node ID"),
):
    """
    Find the critical path (longest dependency chain) to a specific node.

    This answers: "What is the deepest dependency chain to understand this theorem?"

    Returns:
        - path: List of node IDs forming the longest path to target
        - length: Number of edges in the path
    """
    from .analysis.dag import find_critical_path_to

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    try:
        critical_path = find_critical_path_to(G, target)
        return {
            "status": "ok",
            "analysis": "critical-path",
            "target": target,
            "data": {
                "path": critical_path,
                "length": len(critical_path) - 1 if critical_path else 0,
            },
        }
    except ValueError as e:
        return {
            "status": "error",
            "analysis": "critical-path",
            "target": target,
            "error": str(e),
        }


@app.get("/api/project/analysis/structural")
async def get_structural_analysis(
    path: str = Query(..., description="Project path"),
    top_k: int = Query(20, description="Number of top nodes to return"),
):
    """
    Get structural analysis: bridges, articulation points, HITS scores.

    Identifies critical structural elements in the dependency graph:
    - Bridges: edges whose removal disconnects the graph
    - Articulation points: nodes whose removal disconnects the graph
    - HITS: hub and authority scores

    Returns:
        - bridges: List of bridge edges
        - articulationPoints: List of articulation point node IDs
        - topHubs: Nodes with highest hub scores (comprehensive proofs)
        - topAuthorities: Nodes with highest authority scores (fundamental theorems)
    """
    from .analysis.structural import (
        find_bridges,
        find_articulation_points,
        get_top_hubs,
        get_top_authorities,
    )

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    bridges = find_bridges(G)
    ap = find_articulation_points(G)
    top_hubs = get_top_hubs(G, k=top_k)
    top_authorities = get_top_authorities(G, k=top_k)

    return {
        "status": "ok",
        "analysis": "structural",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": {
            "bridges": [{"source": s, "target": t} for s, t in bridges],
            "numBridges": len(bridges),
            "articulationPoints": ap,
            "numArticulationPoints": len(ap),
            "topHubs": [{"nodeId": n, "score": s} for n, s in top_hubs],
            "topAuthorities": [{"nodeId": n, "score": s} for n, s in top_authorities],
        },
    }


@app.get("/api/project/analysis/katz")
async def get_katz_centrality(
    path: str = Query(..., description="Project path"),
    alpha: float = Query(0.1, description="Attenuation factor"),
    top_k: int = Query(20, description="Number of top nodes to return"),
    include_all: bool = Query(False, description="Include all node values"),
):
    """
    Get Katz centrality analysis.

    Katz centrality measures influence based on total walks from a node.
    Better suited for DAGs than PageRank as it handles sink nodes.

    Args:
        alpha: Attenuation factor (lower = less influence from distant nodes)
        top_k: Number of top nodes to return

    Returns:
        - topNodes: Nodes with highest Katz centrality
        - values: (optional) All node values
    """
    from .analysis.structural import compute_katz_centrality

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    katz = compute_katz_centrality(G, alpha=alpha)
    sorted_katz = sorted(katz.items(), key=lambda x: -x[1])[:top_k]

    response_data = {
        "topNodes": [{"nodeId": n, "value": v} for n, v in sorted_katz],
    }

    if include_all:
        response_data["values"] = katz

    return {
        "status": "ok",
        "analysis": "katz",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "alpha": alpha,
        "data": response_data,
    }


@app.get("/api/project/analysis/transitive-reduction")
async def get_transitive_reduction(
    path: str = Query(..., description="Project path"),
):
    """
    Get transitive reduction of the dependency graph.

    Identifies redundant (transitive) edges that can be removed
    without changing reachability. Useful for simplifying visualization.

    Returns:
        - transitiveEdges: List of edges that are redundant
        - numTransitiveEdges: Count of transitive edges
        - reductionRatio: Percentage of edges that are transitive
    """
    from .analysis.advanced import get_transitive_edges

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    transitive = get_transitive_edges(G)
    total_edges = G.number_of_edges()
    reduction_ratio = len(transitive) / total_edges if total_edges > 0 else 0

    return {
        "status": "ok",
        "analysis": "transitive-reduction",
        "numNodes": G.number_of_nodes(),
        "numEdges": total_edges,
        "data": {
            "transitiveEdges": [{"source": s, "target": t} for s, t in transitive],
            "numTransitiveEdges": len(transitive),
            "reductionRatio": reduction_ratio,
            "essentialEdges": total_edges - len(transitive),
        },
    }


@app.get("/api/project/analysis/spectral")
async def get_spectral_clustering(
    path: str = Query(..., description="Project path"),
    n_clusters: int = Query(5, description="Number of clusters"),
):
    """
    Perform spectral clustering on the dependency graph.

    Uses graph Laplacian eigenvectors for clustering.
    May reveal structure that Louvain misses.

    Returns:
        - clusters: Mapping of node ID to cluster ID
        - numClusters: Number of clusters found
        - fiedlerVector: (optional) 2nd eigenvector for 2-way partitioning
    """
    from .analysis.advanced import compute_spectral_clustering, compute_fiedler_vector

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    clusters = compute_spectral_clustering(G, n_clusters=n_clusters)

    # Group nodes by cluster
    cluster_members = {}
    for node, cid in clusters.items():
        if cid not in cluster_members:
            cluster_members[cid] = []
        cluster_members[cid].append(node)

    return {
        "status": "ok",
        "analysis": "spectral",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "nClusters": n_clusters,
        "data": {
            "clusters": clusters,
            "numClusters": len(cluster_members),
            "clusterSizes": {cid: len(members) for cid, members in cluster_members.items()},
        },
    }


@app.get("/api/project/analysis/hierarchical")
async def get_hierarchical_clustering(
    path: str = Query(..., description="Project path"),
    n_clusters: int = Query(5, description="Number of clusters to cut"),
):
    """
    Perform hierarchical clustering on the dependency graph.

    Produces nested community structure (dendrogram).

    Returns:
        - clusters: Flat clustering at specified level
        - numClusters: Number of clusters
    """
    from .analysis.advanced import compute_hierarchical_clustering, cut_dendrogram

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    result = compute_hierarchical_clustering(G)

    if len(result["labels"]) <= 1:
        clusters = {label: 0 for label in result["labels"]}
    else:
        clusters = cut_dendrogram(
            result["dendrogram"],
            result["labels"],
            n_clusters=n_clusters
        )

    # Group nodes by cluster
    cluster_members = {}
    for node, cid in clusters.items():
        if cid not in cluster_members:
            cluster_members[cid] = []
        cluster_members[cid].append(node)

    return {
        "status": "ok",
        "analysis": "hierarchical",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "nClusters": n_clusters,
        "data": {
            "clusters": clusters,
            "numClusters": len(cluster_members),
            "clusterSizes": {cid: len(members) for cid, members in cluster_members.items()},
        },
    }


# ============================================
# Advanced Analysis API (Statistics, Curvature, Geometry, Topology)
# ============================================


@app.get("/api/project/analysis/statistics")
async def get_statistics_analysis(
    path: str = Query(..., description="Project path"),
    fit_distribution: bool = Query(True, description="Fit power law to degree distribution"),
    compute_correlations: bool = Query(True, description="Compute metric correlations"),
    detect_anomalies_flag: bool = Query(True, description="Detect anomalous nodes"),
    anomaly_threshold: float = Query(3.0, description="Z-score threshold for anomaly detection"),
    top_k: int = Query(20, description="Number of top anomalies to return"),
):
    """
    Comprehensive statistical analysis of the graph.

    Returns:
        - powerLaw: Power law fit results (alpha, xmin, p-value)
        - correlations: Correlation matrix between centrality metrics
        - assortativity: Degree correlation coefficient
        - anomalies: Nodes with unusual metric combinations
    """
    from .analysis.statistics import (
        fit_degree_distribution,
        compute_metric_correlations,
        compute_degree_assortativity,
        detect_zscore_anomalies,
    )

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    result = {}

    # Power law fit
    if fit_distribution:
        result["powerLaw"] = fit_degree_distribution(G)

    # Metric correlations
    if compute_correlations:
        pagerank = nx.pagerank(G)
        betweenness = nx.betweenness_centrality(G)
        in_degree = dict(G.in_degree()) if G.is_directed() else dict(G.degree())
        out_degree = dict(G.out_degree()) if G.is_directed() else dict(G.degree())

        metrics = {
            "pagerank": pagerank,
            "betweenness": betweenness,
            "in_degree": in_degree,
            "out_degree": out_degree,
        }
        result["correlations"] = compute_metric_correlations(metrics)

    # Assortativity
    result["assortativity"] = compute_degree_assortativity(G)

    # Anomaly detection
    if detect_anomalies_flag:
        pagerank = nx.pagerank(G)
        betweenness = nx.betweenness_centrality(G)
        in_degree = dict(G.in_degree()) if G.is_directed() else dict(G.degree())

        metrics = {
            "pagerank": pagerank,
            "betweenness": betweenness,
            "in_degree": in_degree,
        }
        anomaly_result = detect_zscore_anomalies(metrics, threshold=anomaly_threshold)

        # Collect anomalies from all metrics
        all_anomalies = []
        if "by_metric" in anomaly_result:
            for metric_name, metric_data in anomaly_result["by_metric"].items():
                for a in metric_data.get("anomalies", [])[:top_k]:
                    all_anomalies.append({
                        "nodeId": a["node"],
                        "metric": metric_name,
                        "zScore": a["z_score"],
                        "value": a["value"],
                        "direction": a["direction"],
                    })

        # Sort by absolute z-score
        all_anomalies.sort(key=lambda x: abs(x["zScore"]), reverse=True)
        result["anomalies"] = all_anomalies[:top_k]
        result["multiAnomalyNodes"] = anomaly_result.get("multi_anomaly_nodes", [])

    return {
        "status": "ok",
        "analysis": "statistics",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": result,
    }


@app.get("/api/project/analysis/link-prediction")
async def get_link_prediction(
    path: str = Query(..., description="Project path"),
    method: str = Query("adamic_adar", description="Prediction method: common_neighbors, adamic_adar, jaccard, resource_allocation, preferential_attachment"),
    top_k: int = Query(50, description="Number of top predictions to return"),
):
    """
    Predict missing edges in the dependency graph.

    Identifies potential dependencies that may be missing or could be added.
    This is useful for discovering implicit relationships between theorems.

    Returns:
        - predictions: List of predicted edges with scores
    """
    from .analysis.link_prediction import predict_links

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    predictions = predict_links(G, method=method, top_k=top_k)

    return {
        "status": "ok",
        "analysis": "link-prediction",
        "method": method,
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": {
            "predictions": predictions,
            "numPredictions": len(predictions),
        },
    }


@app.get("/api/project/analysis/curvature")
async def get_curvature_analysis(
    path: str = Query(..., description="Project path"),
    method: str = Query("forman", description="Curvature method: forman (fast) or ollivier (accurate)"),
    include_edge_curvatures: bool = Query(False, description="Include all edge curvatures"),
    include_node_curvatures: bool = Query(True, description="Include node curvatures"),
    top_k: int = Query(20, description="Number of extreme nodes/edges to return"),
):
    """
    Compute Ricci curvature of the dependency graph.

    Geometric analysis using optimal transport theory:
    - Positive curvature: Tightly clustered regions
    - Negative curvature: Branching points, fundamental lemmas
    - Zero curvature: Linear chains

    Args:
        method: "forman" (O(E), fast) or "ollivier" (O(V*E), accurate)

    Returns:
        - statistics: Mean, std, min, max curvature
        - interpretation: Structural interpretation
        - mostClustered: Nodes/edges with highest positive curvature
        - mostBranching: Nodes/edges with highest negative curvature
    """
    from .analysis.optimal_transport import analyze_curvature

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    result = analyze_curvature(G, method=method)

    response_data = {
        "method": result["curvature"].get("method", method),
        "statistics": result["curvature"].get("statistics", {}),
        "interpretation": result["curvature"].get("interpretation", {}),
    }

    # Add highlights
    if "highlights" in result:
        response_data["mostClusteredEdges"] = result["highlights"].get("most_clustered_edges", [])[:top_k]
        response_data["mostBranchingEdges"] = result["highlights"].get("most_branching_edges", [])[:top_k]
        response_data["mostClusteredNodes"] = result["highlights"].get("most_clustered_nodes", [])[:top_k]
        response_data["mostBranchingNodes"] = result["highlights"].get("most_branching_nodes", [])[:top_k]

    if include_node_curvatures and "node_curvatures" in result["curvature"]:
        response_data["nodeCurvatures"] = result["curvature"]["node_curvatures"]

    if include_edge_curvatures and "edge_curvatures" in result["curvature"]:
        response_data["edgeCurvatures"] = result["curvature"]["edge_curvatures"]

    return {
        "status": "ok",
        "analysis": "curvature",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": response_data,
    }


@app.get("/api/project/analysis/geometry")
async def get_geometry_analysis(
    path: str = Query(..., description="Project path"),
    include_spectrum: bool = Query(True, description="Include Laplacian spectrum"),
    include_hks: bool = Query(True, description="Include Heat Kernel Signatures"),
    num_eigenvalues: int = Query(10, description="Number of eigenvalues to compute"),
):
    """
    Geometric analysis using the graph Laplacian.

    Returns:
        - spectrum: Laplacian eigenvalues and Fiedler vector
        - hks: Heat Kernel Signature for multi-scale node analysis
        - algebraicConnectivity: Fiedler value (2nd smallest eigenvalue)
    """
    from .analysis.geometry import compute_laplacian_spectrum, compute_heat_kernel_signature

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    response_data = {}

    if include_spectrum:
        spectrum = compute_laplacian_spectrum(G, k=num_eigenvalues)
        response_data["spectrum"] = spectrum

    if include_hks and G.number_of_nodes() <= 2000:
        hks = compute_heat_kernel_signature(G)
        # Only include statistics and top nodes, not full HKS
        if "error" not in hks:
            response_data["hks"] = {
                "timeScales": hks.get("time_scales", []),
                "statistics": hks.get("statistics", {}),
                "interpretation": hks.get("interpretation", ""),
            }
        else:
            response_data["hks"] = hks
    elif include_hks:
        response_data["hks"] = {"note": "Skipped for large graph (>2000 nodes)"}

    return {
        "status": "ok",
        "analysis": "geometry",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": response_data,
    }


@app.get("/api/project/analysis/topology")
async def get_topology_analysis(
    path: str = Query(..., description="Project path"),
    include_persistent_homology: bool = Query(True, description="Include persistent homology (requires gudhi)"),
    filtration: str = Query("degree", description="Filtration type: degree, centrality, distance"),
):
    """
    Topological analysis using TDA methods.

    Returns:
        - bettiNumbers: β₀ (components) and β₁ (cycles)
        - eulerCharacteristic: V - E
        - cyclomaticComplexity: Number of independent cycles
        - persistentHomology: (optional) Persistence diagrams
    """
    from .analysis.topology import compute_betti_numbers, compute_persistent_homology

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    response_data = {}

    # Betti numbers (always available)
    betti = compute_betti_numbers(G)
    response_data["bettiNumbers"] = betti

    # Persistent homology (if gudhi available and graph not too large)
    if include_persistent_homology and G.number_of_nodes() <= 2000:
        ph = compute_persistent_homology(G, filtration=filtration)
        if "error" not in ph and "warning" not in ph:
            response_data["persistentHomology"] = {
                "filtration": ph.get("filtration"),
                "summary": ph.get("summary", {}),
                "bettiCurve": ph.get("betti_curve", []),
                # Include raw diagrams for visualization (P2)
                "diagrams": ph.get("persistence_diagrams", {}),
            }
        else:
            response_data["persistentHomology"] = ph
    elif include_persistent_homology:
        response_data["persistentHomology"] = {"note": "Skipped for large graph (>2000 nodes)"}

    return {
        "status": "ok",
        "analysis": "topology",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": response_data,
    }


@app.get("/api/project/analysis/mapper")
async def get_mapper_analysis(
    path: str = Query(..., description="Project path"),
    filter_func: str = Query("degree", description="Filter function: degree, pagerank, closeness, depth"),
    num_intervals: int = Query(10, description="Number of intervals"),
    overlap: float = Query(0.3, description="Overlap fraction (0-0.5)"),
):
    """
    Compute Mapper graph - a simplified topological skeleton. (P2)

    Mapper creates a simplified representation by:
    1. Applying a filter function for 1D projection
    2. Covering with overlapping intervals
    3. Clustering within each interval
    4. Connecting clusters that share points

    Returns:
        - mapperNodes: List of Mapper nodes with members
        - mapperEdges: List of edges between Mapper nodes
        - summary: Statistics about the Mapper graph
    """
    from .analysis.topology import compute_mapper

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    if G.number_of_nodes() > 5000:
        return {
            "status": "error",
            "analysis": "mapper",
            "error": "Graph too large for Mapper (>5000 nodes)",
        }

    result = compute_mapper(G, filter_func=filter_func, num_intervals=num_intervals, overlap=overlap)

    if "error" in result:
        return {
            "status": "error",
            "analysis": "mapper",
            "error": result["error"],
        }

    return {
        "status": "ok",
        "analysis": "mapper",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": {
            "filterFunction": result.get("filter_function"),
            "mapperNodes": result.get("mapper_nodes", []),
            "mapperEdges": result.get("mapper_edges", []),
            "summary": result.get("summary", {}),
            "interpretation": result.get("interpretation", ""),
        },
    }


@app.get("/api/project/analysis/correlations")
async def get_metric_correlations(
    path: str = Query(..., description="Project path"),
):
    """
    Compute correlation matrix between graph metrics. (P2)

    Returns:
        - metrics: List of metric names
        - matrix: Correlation matrix (NxN)
        - significantPairs: Pairs with p < 0.05
    """
    from .analysis import (
        compute_pagerank,
        compute_betweenness_centrality,
        compute_clustering_coefficients,
    )
    from .analysis.dag import analyze_dag
    from .analysis.statistics import compute_metric_correlations

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    # Collect metrics
    metrics = {}

    # PageRank
    pr_result = compute_pagerank(G)
    metrics["pagerank"] = pr_result.values

    # Betweenness
    bc_result = compute_betweenness_centrality(G)
    metrics["betweenness"] = bc_result.values

    # Clustering
    clustering = compute_clustering_coefficients(G)
    metrics["clustering"] = clustering

    # In-degree
    metrics["indegree"] = {n: G.in_degree(n) for n in G.nodes()}

    # Out-degree
    metrics["outdegree"] = {n: G.out_degree(n) for n in G.nodes()}

    # DAG metrics
    dag_result = analyze_dag(G)
    if dag_result.get("is_dag", False):
        metrics["depth"] = dag_result.get("depths", {})
        metrics["bottleneck"] = dag_result.get("bottleneck_scores", {})
        metrics["reachability"] = dag_result.get("reachability", {})

    # Compute correlations
    corr_result = compute_metric_correlations(metrics, method="spearman")

    if "error" in corr_result:
        return {
            "status": "error",
            "analysis": "correlations",
            "error": corr_result["error"],
        }

    return {
        "status": "ok",
        "analysis": "correlations",
        "numNodes": G.number_of_nodes(),
        "data": {
            "metrics": corr_result.get("metric_names", []),
            "matrix": corr_result.get("correlation_matrix", []),
            "significantPairs": corr_result.get("significant_pairs", []),
        },
    }


@app.get("/api/project/analysis/embedding")
async def get_embedding_analysis(
    path: str = Query(..., description="Project path"),
    method: str = Query("spectral", description="Embedding method: spectral, diffusion"),
    n_components: int = Query(3, description="Number of dimensions"),
):
    """
    Compute graph embedding for visualization or clustering.

    Methods:
    - spectral: Based on Laplacian eigenvectors
    - diffusion: Based on diffusion process on graph

    Returns:
        - embedding: Dict mapping node -> [x, y, z] coordinates
    """
    from .analysis.embedding import compute_spectral_embedding, compute_diffusion_map

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    if method == "spectral":
        result = compute_spectral_embedding(G, n_components=n_components)
    elif method == "diffusion":
        result = compute_diffusion_map(G, n_components=n_components)
    else:
        return {
            "status": "error",
            "analysis": "embedding",
            "error": f"Unknown method: {method}",
        }

    return {
        "status": "ok",
        "analysis": "embedding",
        "method": method,
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": result,
    }


@app.get("/api/project/analysis/patterns")
async def get_pattern_analysis(
    path: str = Query(..., description="Project path"),
    include_motifs: bool = Query(True, description="Count network motifs"),
    include_proof_patterns: bool = Query(True, description="Find proof-specific patterns"),
    sample_size: int = Query(1000, description="Sample size for motif significance"),
):
    """
    Pattern recognition in the dependency graph.

    Identifies structural patterns common in mathematical proofs:
    - Motifs: 3-node and 4-node subgraph patterns
    - Proof patterns: chains, forks, joins, diamonds

    Returns:
        - motifs: Counts and z-scores for each motif type
        - proofPatterns: List of found patterns with locations
    """
    from .analysis.pattern import count_motifs_3node, compute_motif_significance, find_proof_patterns

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    response_data = {}

    if include_motifs:
        motif_counts = count_motifs_3node(G)
        if "error" not in motif_counts:
            significance = compute_motif_significance(G, n_random=sample_size)
            response_data["motifs"] = {
                "counts": motif_counts,
                "significance": significance.get("3_node", {}),
            }
        else:
            response_data["motifs"] = motif_counts

    if include_proof_patterns:
        proof_patterns = find_proof_patterns(G)
        response_data["proofPatterns"] = proof_patterns

    return {
        "status": "ok",
        "analysis": "patterns",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": response_data,
    }


@app.get("/api/project/analysis/embedding-clusters")
async def get_embedding_clusters(
    path: str = Query(..., description="Project path"),
    n_clusters: int = Query(8, description="Number of clusters"),
):
    """
    Compute embedding-based node clusters. (P2)

    Uses spectral embedding + k-means to cluster nodes.

    Returns:
        - clusters: Dict mapping node_id to cluster_id
        - clusterSizes: Size of each cluster
    """
    from .analysis.embedding import compute_spectral_embedding
    from sklearn.cluster import KMeans
    import numpy as np

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    # Get spectral embedding
    embedding_result = compute_spectral_embedding(G, n_components=min(10, G.number_of_nodes() - 1))

    if "error" in embedding_result:
        return {
            "status": "error",
            "analysis": "embedding-clusters",
            "error": embedding_result["error"],
        }

    # Extract embeddings
    embedding = embedding_result.get("embedding", {})
    if not embedding:
        return {
            "status": "error",
            "analysis": "embedding-clusters",
            "error": "No embedding computed",
        }

    nodes = list(embedding.keys())
    X = np.array([embedding[n] for n in nodes])

    # K-means clustering
    n_clusters = min(n_clusters, len(nodes))
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X)

    # Build result
    clusters = {nodes[i]: int(labels[i]) for i in range(len(nodes))}
    cluster_sizes = {}
    for label in labels:
        cluster_sizes[int(label)] = cluster_sizes.get(int(label), 0) + 1

    return {
        "status": "ok",
        "analysis": "embedding-clusters",
        "numNodes": G.number_of_nodes(),
        "data": {
            "clusters": clusters,
            "numClusters": n_clusters,
            "clusterSizes": cluster_sizes,
        },
    }


@app.get("/api/project/analysis/motif-participation")
async def get_motif_participation(
    path: str = Query(..., description="Project path"),
    max_instances: int = Query(500, description="Max pattern instances to find"),
):
    """
    Compute motif participation for each node. (P2)

    Identifies which patterns each node participates in.

    Returns:
        - nodeMotifs: Dict mapping node_id to {pattern_type: count}
        - dominantMotif: Dict mapping node_id to most common motif type
    """
    from .analysis.pattern import find_pattern_instances

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    # Find instances of each pattern
    patterns = ["chain", "fork", "join", "diamond"]
    node_participation = {n: {} for n in G.nodes()}

    for pattern in patterns:
        instances = find_pattern_instances(G, pattern, max_instances=max_instances)
        for instance in instances:
            for node in instance.get("nodes", []):
                if node in node_participation:
                    node_participation[node][pattern] = node_participation[node].get(pattern, 0) + 1

    # Compute dominant motif for each node
    dominant_motif = {}
    for node, counts in node_participation.items():
        if counts:
            dominant_motif[node] = max(counts, key=counts.get)
        else:
            dominant_motif[node] = "none"

    return {
        "status": "ok",
        "analysis": "motif-participation",
        "numNodes": G.number_of_nodes(),
        "data": {
            "nodeMotifs": node_participation,
            "dominantMotif": dominant_motif,
        },
    }


# ============================================
# Lean-Specific Analysis Endpoints
# ============================================

@app.get("/api/project/analysis/lean/types")
async def get_lean_type_analysis(
    path: str = Query(..., description="Project path"),
):
    """
    Lean type system analysis.

    Analyzes declaration kinds, instances, type hierarchy, and namespace structure.

    Returns:
        - kindDistribution: Counts and percentages of declaration kinds
        - instanceAnalysis: Instance statistics and patterns
        - typeHierarchy: Class/structure inheritance relationships
        - namespaceTree: Hierarchical namespace structure
        - topNamespaces: Statistics for largest namespaces
    """
    from .analysis.lean_types import analyze_lean_types

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    nodes = list(project.nodes.values())

    result = analyze_lean_types(nodes, G)

    return {
        "status": "ok",
        "analysis": "lean_types",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": result,
    }


@app.get("/api/project/analysis/lean/namespaces")
async def get_lean_namespace_analysis(
    path: str = Query(..., description="Project path"),
    depth: int = Query(2, description="Namespace depth for grouping"),
):
    """
    Lean namespace hierarchy analysis.

    Analyzes namespace structure, coupling, and dependencies.

    Returns:
        - namespaceTree: Hierarchical namespace structure
        - depthDistribution: How deep namespaces go
        - sizeDistribution: Declaration counts per namespace
        - coupling: Module coupling and cohesion metrics
        - crossDependencies: Cross-namespace dependency patterns
        - bridges: Declarations that bridge namespaces
        - circularDependencies: Cycles between namespaces
    """
    from .analysis.lean_namespace import analyze_lean_namespaces

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    nodes = list(project.nodes.values())

    result = analyze_lean_namespaces(nodes, G, depth)

    return {
        "status": "ok",
        "analysis": "lean_namespaces",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": result,
    }


@app.get("/api/project/analysis/lean/quality")
async def get_lean_quality_analysis(
    path: str = Query(..., description="Project path"),
):
    """
    Lean code quality analysis.

    Identifies API surface, refactoring candidates, and structural issues.

    Returns:
        - apiSurface: Public API declarations and stability score
        - refactoringCandidates: Declarations that might benefit from refactoring
        - structuralAnomalies: Unusual dependency patterns
        - bottlenecks: Critical path bottleneck nodes
        - dependencyChains: Chain length analysis
        - similarProofs: Potentially duplicated proofs
    """
    from .analysis.lean_quality import analyze_lean_quality

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    nodes = list(project.nodes.values())

    result = analyze_lean_quality(nodes, G)

    return {
        "status": "ok",
        "analysis": "lean_quality",
        "numNodes": G.number_of_nodes(),
        "numEdges": G.number_of_edges(),
        "data": result,
    }


@app.get("/api/project/analysis/lean/breaking-change")
async def get_breaking_change_analysis(
    path: str = Query(..., description="Project path"),
    declaration_id: str = Query(..., description="Declaration ID to analyze"),
):
    """
    Analyze the impact of changing a specific declaration.

    Returns the direct and transitive dependents that would be affected
    if the given declaration were modified or removed.

    Returns:
        - declaration: The analyzed declaration ID
        - directImpactCount: Number of directly dependent declarations
        - transitiveImpactCount: Total affected declarations
        - directDependents: List of directly dependent declaration IDs
        - impactedNamespaces: Affected namespaces with counts
        - severity: 'high', 'medium', or 'low'
    """
    from .analysis.lean_quality import breaking_change_impact

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)

    result = breaking_change_impact(G, declaration_id)

    return {
        "status": "ok",
        "analysis": "breaking_change",
        "data": result,
    }


# ============================================
# Aggregated Metrics API (P0)
# ============================================


@app.get("/api/project/analysis/metrics/all")
async def get_all_metrics(
    path: str = Query(..., description="Project path"),
):
    """
    Get aggregated metrics for all nodes in a single request.

    This endpoint combines multiple analysis results to minimize frontend requests.
    Returns per-node metrics and global statistics.

    Returns:
        - nodeMetrics: Dict mapping node_id to metric values
          - pagerank, betweenness, depth, bottleneck, reachability, clustering
        - globalStats: Graph-wide statistics
          - graphDepth, modularity, vonNeumannEntropy, density, etc.
        - kindDistribution: Declaration kind counts (Lean-specific)
    """
    from .analysis import (
        compute_pagerank,
        compute_betweenness_centrality,
        compute_clustering_coefficients,
        compute_von_neumann_entropy,
        detect_communities_louvain,
    )
    from .analysis.dag import analyze_dag
    from .analysis.lean_types import declaration_kind_distribution

    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    G = _get_or_build_graph(project)
    nodes = list(project.nodes.values())
    num_nodes = G.number_of_nodes()
    num_edges = G.number_of_edges()

    # Initialize node metrics dict
    node_metrics: dict[str, dict] = {n: {} for n in G.nodes()}

    # 1. PageRank (always include all values)
    pagerank_result = compute_pagerank(G, top_k=10)
    for node_id, value in pagerank_result.values.items():
        if node_id in node_metrics:
            node_metrics[node_id]["pagerank"] = value

    # 2. Betweenness (sample-based for large graphs)
    sample_k = min(1000, num_nodes) if num_nodes > 100 else None
    betweenness_result = compute_betweenness_centrality(G, k=sample_k, top_k=10)
    for node_id, value in betweenness_result.values.items():
        if node_id in node_metrics:
            node_metrics[node_id]["betweenness"] = value

    # 3. Clustering coefficients
    clustering_result = compute_clustering_coefficients(G)
    for node_id, value in clustering_result.local.items():
        if node_id in node_metrics:
            node_metrics[node_id]["clustering"] = value

    # 4. DAG analysis (depth, bottleneck, reachability)
    dag_result = analyze_dag(G)
    if dag_result.get("is_dag", False):
        depths = dag_result.get("depths", {})
        bottlenecks = dag_result.get("bottleneck_scores", {})
        reachability = dag_result.get("reachability", {})

        for node_id in node_metrics:
            node_metrics[node_id]["depth"] = depths.get(node_id, 0)
            node_metrics[node_id]["bottleneck"] = bottlenecks.get(node_id, 0)
            node_metrics[node_id]["reachability"] = reachability.get(node_id, 0)

    # 5. In-degree (for size mapping)
    for node_id in node_metrics:
        node_metrics[node_id]["indegree"] = G.in_degree(node_id)

    # 6. Katz centrality (P2)
    try:
        from .analysis.structural import compute_katz_centrality
        katz = compute_katz_centrality(G, alpha=0.05)  # Lower alpha for better convergence
        if katz:
            for node_id, value in katz.items():
                if node_id in node_metrics:
                    node_metrics[node_id]["katz"] = value
    except Exception as e:
        import logging
        logging.warning(f"Katz centrality failed: {e}")

    # 7. HITS (hub and authority scores) (P2)
    try:
        from .analysis.structural import compute_hits
        hubs, authorities = compute_hits(G)
        if hubs:
            for node_id, value in hubs.items():
                if node_id in node_metrics:
                    node_metrics[node_id]["hub"] = value
        if authorities:
            for node_id, value in authorities.items():
                if node_id in node_metrics:
                    node_metrics[node_id]["authority"] = value
    except Exception as e:
        import logging
        logging.warning(f"HITS failed: {e}")

    # Global statistics
    global_stats = {
        "numNodes": num_nodes,
        "numEdges": num_edges,
        "density": nx.density(G) if num_nodes > 1 else 0,
    }

    # DAG-specific global stats
    if dag_result.get("is_dag", False):
        global_stats["graphDepth"] = dag_result.get("graph_depth", 0)
        global_stats["numLayers"] = dag_result.get("num_layers", 0)
        global_stats["numSources"] = dag_result.get("num_sources", 0)
        global_stats["numSinks"] = dag_result.get("num_sinks", 0)

    # Community detection for modularity
    try:
        community_result = detect_communities_louvain(G.to_undirected())
        global_stats["modularity"] = community_result.modularity
        global_stats["numCommunities"] = community_result.num_communities
    except Exception:
        global_stats["modularity"] = 0
        global_stats["numCommunities"] = 0

    # Von Neumann entropy
    try:
        entropy_result = compute_von_neumann_entropy(G)
        global_stats["vonNeumannEntropy"] = entropy_result.get("entropy", 0)
    except Exception:
        global_stats["vonNeumannEntropy"] = 0

    # Lean-specific: Declaration kind distribution
    kind_distribution = {}
    try:
        kind_dist = declaration_kind_distribution(nodes)
        kind_distribution = kind_dist.get("counts", {})
        global_stats["totalDeclarations"] = kind_dist.get("total", num_nodes)
    except Exception:
        pass

    return {
        "status": "ok",
        "analysis": "metrics_all",
        "numNodes": num_nodes,
        "numEdges": num_edges,
        "data": {
            "nodeMetrics": node_metrics,
            "globalStats": global_stats,
            "kindDistribution": kind_distribution,
        },
    }


# ============================================
# Main Entry Point
# ============================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
