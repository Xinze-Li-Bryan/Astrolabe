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

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from watchfiles import awatch

from .project import Project
from .graph_cache import GraphCache
from .canvas import CanvasStore, CanvasData


# Project cache
_projects: dict[str, Project] = {}


def get_project(path: str) -> Project:
    """Get or create a Project instance"""
    if path not in _projects:
        _projects[path] = Project(path)
    return _projects[path]


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


class ViewportUpdateRequest(BaseModel):
    """Viewport state update request"""

    path: str
    camera_position: Optional[list[float]] = None
    camera_target: Optional[list[float]] = None
    zoom: Optional[float] = None
    selected_node_id: Optional[str] = None
    selected_edge_id: Optional[str] = None


class MacrosUpdateRequest(BaseModel):
    """LaTeX macros update request"""

    path: str
    macros: dict[str, str]  # { "\\RR": "\\mathbb{R}", ... }


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
    Save node 3D positions to canvas.json

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
    # Positions are now uniformly stored in canvas.json
    store = CanvasStore(request.path)
    canvas = store.update_positions(request.positions)

    return {
        "status": "ok",
        "updated": len(request.positions),
        "positions": canvas.positions,
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
    store = CanvasStore(path)
    canvas = store.load()

    return {
        "visible_nodes": canvas.visible_nodes,
        "positions": canvas.positions,
    }


@app.post("/api/canvas")
async def save_canvas(request: CanvasSaveRequest):
    """Save canvas state"""
    store = CanvasStore(request.path)
    canvas = CanvasData(
        visible_nodes=request.visible_nodes,
        positions=request.positions,
    )
    store.save(canvas)

    return {"status": "ok", "nodes": len(canvas.visible_nodes)}


@app.post("/api/canvas/add")
async def add_to_canvas(request: CanvasAddNodeRequest):
    """Add node to canvas"""
    store = CanvasStore(request.path)
    canvas = store.add_node(request.node_id)

    return {
        "status": "ok",
        "visible_nodes": canvas.visible_nodes,
        "positions": canvas.positions,
    }


@app.post("/api/canvas/add-batch")
async def add_batch_to_canvas(request: CanvasAddNodesRequest):
    """Batch add nodes to canvas"""
    store = CanvasStore(request.path)
    canvas = store.add_nodes(request.node_ids)

    return {
        "status": "ok",
        "visible_nodes": canvas.visible_nodes,
        "positions": canvas.positions,
    }


@app.post("/api/canvas/remove")
async def remove_from_canvas(request: CanvasAddNodeRequest):
    """Remove node from canvas"""
    store = CanvasStore(request.path)
    canvas = store.remove_node(request.node_id)

    return {
        "status": "ok",
        "visible_nodes": canvas.visible_nodes,
        "positions": canvas.positions,
    }


@app.post("/api/canvas/positions")
async def update_canvas_positions(request: PositionsUpdateRequest):
    """Update canvas node 3D positions"""
    store = CanvasStore(request.path)
    canvas = store.update_positions(request.positions)

    return {
        "status": "ok",
        "updated": len(request.positions),
        "positions": canvas.positions,
    }


@app.post("/api/canvas/clear")
async def clear_canvas(path: str = Query(..., description="Project path")):
    """Clear canvas"""
    canvas_store = CanvasStore(path)
    canvas_store.clear()

    return {"status": "ok"}


@app.post("/api/meta/clear")
async def clear_meta(path: str = Query(..., description="Project path")):
    """
    Clear all metadata (node meta, edge meta, macros).
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
    store = CanvasStore(path)
    viewport = store.get_viewport()

    return viewport.to_dict()


@app.patch("/api/canvas/viewport")
async def update_viewport(request: ViewportUpdateRequest):
    """
    Update viewport state (incremental merge)

    Only update non-None fields
    """
    store = CanvasStore(request.path)

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

    viewport = store.update_viewport(updates)

    return {"status": "ok", "viewport": viewport.to_dict()}


# ============================================
# Macros API
# ============================================


@app.get("/api/project/macros")
async def get_macros(path: str = Query(..., description="Project path")):
    """
    Get project's custom LaTeX macros

    Returns:
        { "macros": { "\\RR": "\\mathbb{R}", ... } }
    """
    if path not in _projects:
        project = get_project(path)
        await project.load()
    else:
        project = _projects[path]

    return {"macros": project.get_macros()}


@app.put("/api/project/macros")
async def update_macros(request: MacrosUpdateRequest):
    """
    Update project's custom LaTeX macros (full replacement)

    Request body:
        {
            "path": "/path/to/project",
            "macros": { "\\RR": "\\mathbb{R}", ... }
        }
    """
    if request.path not in _projects:
        project = get_project(request.path)
        await project.load()
    else:
        project = _projects[request.path]

    project.set_macros(request.macros)

    return {"status": "ok", "macros": project.get_macros()}


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
# Main Entry Point
# ============================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
