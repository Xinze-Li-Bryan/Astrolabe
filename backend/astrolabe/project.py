"""
Astrolabe Project

Project container, managing nodes, edges, and metadata
Only uses .ilean parsing, no longer supports regex fallback
"""

from typing import Callable, Awaitable, Optional
from pathlib import Path
import time
import json

from .models import Node, Edge
from .watcher import FileWatcher
from .unified_storage import UnifiedStorage
from .graph_cache import GraphCache
from .parsers import parse_project_from_cache
from .parsers.ilean_parser import (
    find_source_file,
    extract_full_declaration,
    detect_sorry,
    infer_kind,
)
from .models.node import ProofStatus


# === Load default styles from assets/themes/default.json ===
def _load_theme_defaults():
    """Load default theme configuration"""
    # Backend is in backend/ directory, assets is in project root
    theme_path = Path(__file__).parent.parent.parent / "assets" / "themes" / "default.json"

    node_defaults = {}
    edge_defaults = {}

    if theme_path.exists():
        try:
            with open(theme_path, "r", encoding="utf-8") as f:
                theme = json.load(f)

            # Parse nodes configuration
            for kind, style in theme.get("nodes", {}).items():
                node_defaults[kind] = {
                    "color": style.get("color", "#888888"),
                    "size": style.get("size", 1.0),
                    "shape": style.get("shape", "sphere"),
                }

            # Parse edges configuration
            for edge_type, style in theme.get("edges", {}).items():
                is_from_lean = edge_type == "from_lean"
                edge_defaults[is_from_lean] = {
                    "color": style.get("color", "#2ecc71"),
                    "width": style.get("width", 1.0),
                    "style": style.get("style", "solid"),
                }
        except Exception as e:
            print(f"[Theme] Failed to load theme: {e}")

    return node_defaults, edge_defaults

# Load theme configuration
NODE_STYLE_DEFAULTS, EDGE_STYLE_DEFAULTS = _load_theme_defaults()

# If theme loading fails, use minimal fallback
if not EDGE_STYLE_DEFAULTS:
    EDGE_STYLE_DEFAULTS = {
        True: {"color": "#2ecc71", "width": 1.0, "style": "solid"},  # Green, consistent with proven nodes
        False: {"color": "#888888", "width": 0.8, "style": "dashed"},  # Gray dashed, for custom edges
    }

DEFAULT_NODE_STYLE = {"color": "#888888", "size": 1.0, "shape": "sphere"}
DEFAULT_EDGE_STYLE = {"color": "#2ecc71", "width": 1.0, "style": "solid"}  # Green


class Project:
    """Astrolabe project container"""

    def __init__(self, path: str):
        self.path = path
        self.project_path = Path(path)
        self.nodes: dict[str, Node] = {}
        self.edges: list[Edge] = []
        self.storage: Optional[UnifiedStorage] = None  # Unified storage
        self.graph_cache = GraphCache(path)
        self._watcher: Optional[FileWatcher] = None

    async def load(self, skip_edges: bool = False):
        """
        Load project

        Loading priority:
        1. .astrolabe/graph.json cache (fastest)
        2. .lake/build/*.ilean cache (fast)

        If .ilean doesn't exist, prompt user to run `lake build`

        Args:
            skip_edges: If True, skip edge construction (large projects can show nodes first)
        """
        start_time = time.time()

        # Clear existing data
        self.nodes.clear()
        self.edges.clear()

        project_path = Path(self.path)
        loaded = False

        # 1. Try loading from graph.json cache
        cached = self.graph_cache.load()
        if cached:
            nodes, edges = cached
            for node in nodes:
                self.nodes[node.id] = node
            self.edges = edges
            loaded = True
            elapsed = time.time() - start_time
            print(f"[Project] Loaded from graph.json cache in {elapsed:.2f}s")

        # 2. Try loading from .ilean cache
        need_save_cache = False  # Flag whether need to save to graph.json
        if not loaded:
            cache_path = project_path / ".lake" / "build" / "lib"
            if cache_path.exists():
                try:
                    print(f"[Project] Loading from .ilean cache...")
                    await self._load_from_cache()
                    if self.nodes:
                        loaded = True
                        need_save_cache = True  # Need to save, but wait until stats calculation is complete
                        elapsed = time.time() - start_time
                        print(f"[Project] Loaded {len(self.nodes)} nodes from .ilean in {elapsed:.2f}s")
                    else:
                        print(f"[Project] .ilean returned no nodes")
                except Exception as e:
                    print(f"[Project] .ilean parsing failed: {e}")
            else:
                print(f"[Project] .lake/build/lib not found. Please run 'lake build' first.")

        # 3. If still not loaded, prompt user
        if not loaded:
            print(f"[Project] No data loaded. Please run 'lake build' in {self.path}")

        # 4. Compute node statistics (dependency count, used-by count, depth)
        self._compute_node_stats()

        # 5. Set default styles
        self._set_default_styles()

        # 6. Save to graph.json cache (after stats and default styles are computed)
        if need_save_cache:
            self.graph_cache.save(
                list(self.nodes.values()),
                self.edges
            )

        # 7. Create UnifiedStorage instance
        # Build graph_data (read-only data of Lean nodes and edges)
        graph_data = {
            "nodes": [n.to_dict() for n in self.nodes.values()],
            "edges": [{"source": e.source, "target": e.target} for e in self.edges],
        }
        meta_path = self.project_path / ".astrolabe" / "meta.json"
        self.storage = UnifiedStorage(graph_data, meta_path, project_path=self.project_path)

        # 8. Merge meta to nodes (using storage)
        from .models.node import NodeMeta
        for node_id, node in self.nodes.items():
            meta_data = self.storage.get_node_meta(node_id)
            if meta_data:
                node.meta = NodeMeta.from_dict(meta_data)
            else:
                node.meta = NodeMeta()

        # 9. Merge meta to edges (using storage)
        from .models.edge import EdgeMeta
        for edge in self.edges:
            meta_data = self.storage.get_edge_meta(edge.id)
            if meta_data:
                edge.meta = EdgeMeta.from_dict(meta_data)
            else:
                edge.meta = EdgeMeta()

    async def _load_from_cache(self):
        """Load from .lake/build cache (fast)"""
        project_path = Path(self.path)

        nodes, edges = parse_project_from_cache(project_path)

        for node in nodes:
            if node.id in self.nodes:
                # ID conflict, add file suffix to distinguish
                node.id = f"{node.id}@{Path(node.file_path).stem}"
            self.nodes[node.id] = node

        # Save edges built from cache
        self.edges = edges

        print(f"[Project] Loaded {len(nodes)} declarations, {len(edges)} edges from cache")

    def _compute_node_stats(self):
        """
        Compute node statistics: dependency count, used-by count, depth

        Depth calculation rules:
        - depth 0 = doesn't depend on any other nodes (leaf nodes)
        - depth N = max(depth of all dependency nodes) + 1
        """
        # Reset all statistics
        for node in self.nodes.values():
            node.depends_on_count = 0
            node.used_by_count = 0
            node.depth = 0

        # Build dependency graph
        # depends_on[A] = [B, C] means A depends on B and C
        depends_on: dict[str, list[str]] = {nid: [] for nid in self.nodes}

        for edge in self.edges:
            # edge.source depends on edge.target
            if edge.source in self.nodes and edge.target in self.nodes:
                depends_on[edge.source].append(edge.target)
                self.nodes[edge.source].depends_on_count += 1
                self.nodes[edge.target].used_by_count += 1

        # Compute depth (using memoized recursion)
        computed_depth: dict[str, int] = {}

        def compute_depth(node_id: str, visited: set[str]) -> int:
            """Recursively compute node depth, handling circular dependencies"""
            if node_id in computed_depth:
                return computed_depth[node_id]

            # Detect circular dependencies
            if node_id in visited:
                return 0

            visited.add(node_id)

            deps = depends_on.get(node_id, [])
            if not deps:
                # Leaf node
                computed_depth[node_id] = 0
            else:
                # Depth = max(dependency node depth) + 1
                max_dep_depth = max(compute_depth(dep, visited.copy()) for dep in deps)
                computed_depth[node_id] = max_dep_depth + 1

            return computed_depth[node_id]

        # Compute depth for all nodes
        for node_id in self.nodes:
            self.nodes[node_id].depth = compute_depth(node_id, set())

        # Output statistics
        max_depth = max((n.depth for n in self.nodes.values()), default=0)
        max_used_by = max((n.used_by_count for n in self.nodes.values()), default=0)
        print(f"[Project] Stats computed: max_depth={max_depth}, max_used_by={max_used_by}")

    def _set_default_styles(self):
        """Set default styles for all nodes and edges"""
        # Node default styles (by kind)
        for node in self.nodes.values():
            defaults = NODE_STYLE_DEFAULTS.get(node.kind, DEFAULT_NODE_STYLE)
            node.default_color = defaults["color"]
            node.default_size = defaults["size"]
            node.default_shape = defaults["shape"]

        # Edge default styles (by from_lean)
        for edge in self.edges:
            defaults = EDGE_STYLE_DEFAULTS.get(edge.from_lean, DEFAULT_EDGE_STYLE)
            edge.default_color = defaults["color"]
            edge.default_width = defaults["width"]
            edge.default_style = defaults["style"]

    async def watch(self, callback: Callable[[str], Awaitable[None]]):
        """
        Watch project file changes
        When .ilean file is modified, call callback(file_path)
        """
        self._watcher = FileWatcher(self.path)
        await self._watcher.start(callback)

    async def stop_watching(self):
        """Stop file watching"""
        if self._watcher:
            await self._watcher.stop()
            self._watcher = None

    async def refresh(self, file_path: str):
        """
        After .ilean file changes, reload entire project

        Simplified version: directly reload, because .ilean change means compilation is complete
        """
        print(f"[Project] .ilean changed: {file_path}, reloading...")
        await self.load()

    def reload_meta(self):
        """
        Reload meta.json and update node/edge meta data

        Used to sync to memory after external modification of meta.json (e.g., Claude Code)
        """
        print(f"[Project] Reloading meta.json...")

        # Recreate UnifiedStorage (reload meta.json)
        graph_data = {
            "nodes": [n.to_dict() for n in self.nodes.values()],
            "edges": [{"source": e.source, "target": e.target} for e in self.edges],
        }
        meta_path = self.project_path / ".astrolabe" / "meta.json"
        self.storage = UnifiedStorage(graph_data, meta_path, project_path=self.project_path)

        # Update node meta (using storage)
        from .models.node import NodeMeta
        for node_id, node in self.nodes.items():
            meta_data = self.storage.get_node_meta(node_id)
            if meta_data:
                node.meta = NodeMeta.from_dict(meta_data)
            else:
                node.meta = NodeMeta()

        # Update edge meta (using storage)
        from .models.edge import EdgeMeta
        for edge in self.edges:
            meta_data = self.storage.get_edge_meta(edge.id)
            if meta_data:
                edge.meta = EdgeMeta.from_dict(meta_data)
            else:
                edge.meta = EdgeMeta()

    def get_macros(self) -> dict[str, str]:
        """Get custom LaTeX macros"""
        if self.storage:
            return self.storage.get_macros()
        return {}

    def set_macros(self, macros: dict[str, str]):
        """Set custom LaTeX macros"""
        if self.storage:
            self.storage.set_macros(macros)

    def update_node_meta(self, node_id: str, updates: dict):
        """
        Update node meta (for API calls)

        Args:
            node_id: Node ID
            updates: Fields to update {"color": "#fff", "notes": "..."}
        """
        if self.storage:
            self.storage.update_node_meta(node_id, **updates)

            # Update node meta in memory
            if node_id in self.nodes:
                from .models.node import NodeMeta
                meta_data = self.storage.get_node_meta(node_id)
                if meta_data:
                    self.nodes[node_id].meta = NodeMeta.from_dict(meta_data)
                else:
                    self.nodes[node_id].meta = NodeMeta()

    def delete_node_meta(self, node_id: str):
        """Delete all meta of the node"""
        if self.storage:
            self.storage.delete_node(node_id)

        if node_id in self.nodes:
            from .models.node import NodeMeta
            self.nodes[node_id].meta = NodeMeta()

    def update_edge_meta(self, edge_id: str, updates: dict):
        """
        Update edge meta (for API calls)

        Args:
            edge_id: Edge ID, format "source->target"
            updates: Fields to update {"color": "#fff", "width": 2}
        """
        if self.storage:
            self.storage.update_edge_meta(edge_id, **updates)

            # Update edge meta in memory
            from .models.edge import EdgeMeta
            for edge in self.edges:
                if edge.id == edge_id:
                    meta_data = self.storage.get_edge_meta(edge_id)
                    if meta_data:
                        edge.meta = EdgeMeta.from_dict(meta_data)
                    else:
                        edge.meta = EdgeMeta()
                    break

    def delete_edge_meta(self, edge_id: str):
        """Delete all meta of the edge"""
        # Can only clear Lean edge meta, cannot delete Lean edge itself
        # For User edges, can completely delete
        if self.storage:
            # First check if it's a User edge
            if self.storage.is_user_edge(edge_id):
                try:
                    self.storage.delete_edge(edge_id)
                except ValueError:
                    pass  # Lean edges cannot be deleted
            else:
                # Lean edges only clear meta, override with empty update
                pass  # UnifiedStorage doesn't have direct method to clear Lean edge meta

        # Reset edge meta in memory
        from .models.edge import EdgeMeta
        for edge in self.edges:
            if edge.id == edge_id:
                edge.meta = EdgeMeta()
                break

    def get_node(self, node_id: str) -> Optional[Node]:
        """Get single node"""
        return self.nodes.get(node_id)

    def get_stats(self) -> dict:
        """Get project statistics"""
        kind_counts = {}
        status_counts = {}

        for node in self.nodes.values():
            kind_counts[node.kind] = kind_counts.get(node.kind, 0) + 1
            status_counts[node.status.value] = (
                status_counts.get(node.status.value, 0) + 1
            )

        return {
            "total_nodes": len(self.nodes),
            "total_edges": len(self.edges),
            "by_kind": kind_counts,
            "by_status": status_counts,
        }

    def to_json(self) -> dict:
        """Serialize entire project for frontend"""
        # Note: Node position data is stored in canvas.json, not in graph.json
        # Frontend loads positions separately via /api/canvas

        nodes_json = []
        for n in self.nodes.values():
            node_dict = n.to_dict()
            nodes_json.append(node_dict)

        return {
            "path": self.path,
            "nodes": nodes_json,
            "edges": [e.to_dict() for e in self.edges],
            "stats": self.get_stats(),
            "macros": self.get_macros(),
        }
