"""
Graph Cache

Manages reading and writing of .astrolabe/graph.json
Caches parsed nodes and edges to avoid repeatedly parsing .ilean files
"""

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from .models import Node, Edge
from .models.node import NodeMeta, ProofStatus


CACHE_VERSION = "1.0"


class GraphCache:
    """Manages reading and writing of .astrolabe/graph.json"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.astrolabe_dir = self.project_path / ".astrolabe"
        self.cache_file = self.astrolabe_dir / "graph.json"

    def ensure_dir(self):
        """Ensure .astrolabe directory exists"""
        # If .astrolabe is a file (old format), migration is needed
        if self.astrolabe_dir.exists() and self.astrolabe_dir.is_file():
            # Backup old file
            old_config = self.astrolabe_dir.read_text(encoding="utf-8")
            self.astrolabe_dir.unlink()
            self.astrolabe_dir.mkdir(exist_ok=True)
            # Save old config to config.json
            config_file = self.astrolabe_dir / "config.json"
            config_file.write_text(old_config, encoding="utf-8")
            print(f"[GraphCache] Migrated old .astrolabe file to .astrolabe/config.json")
        else:
            self.astrolabe_dir.mkdir(exist_ok=True)

    def compute_ilean_hash(self) -> str:
        """
        Compute hash of all project .ilean files

        Only computes hash for the project's own .ilean files, excluding dependencies
        """
        lake_build = self.project_path / ".lake" / "build" / "lib" / "lean"
        if not lake_build.exists():
            return ""

        # Get project name
        project_name = self._get_project_name()

        # Only scan the project's own .ilean files
        project_ilean_dir = lake_build / project_name
        if not project_ilean_dir.exists():
            # Fallback: scan non-dependency directories
            excluded_dirs = {
                "Mathlib", "Batteries", "Aesop", "ProofWidgets", "Qq", "ImportGraph",
                "Lean", "Lake", "Init", "Std", "LeanSearchClient", "Plausible",
            }
            ilean_files = []
            for subdir in lake_build.iterdir():
                if subdir.is_dir() and subdir.name not in excluded_dirs:
                    ilean_files.extend(sorted(subdir.rglob("*.ilean")))
        else:
            ilean_files = sorted(project_ilean_dir.rglob("*.ilean"))

        if not ilean_files:
            return ""

        # Compute hash of modification time and size for all files
        hasher = hashlib.md5()
        for ilean_file in ilean_files:
            stat = ilean_file.stat()
            hasher.update(f"{ilean_file}:{stat.st_mtime}:{stat.st_size}".encode())

        return hasher.hexdigest()

    def _get_project_name(self) -> str:
        """Get project name from lakefile"""
        import re

        # Try lakefile.lean
        lakefile_lean = self.project_path / "lakefile.lean"
        if lakefile_lean.exists():
            try:
                content = lakefile_lean.read_text(encoding="utf-8")
                match = re.search(r'lean_lib\s+(\w+)', content)
                if match:
                    return match.group(1)
                match = re.search(r'package\s+(\w+)', content)
                if match:
                    return match.group(1)
            except Exception:
                pass

        # Try lakefile.toml
        lakefile_toml = self.project_path / "lakefile.toml"
        if lakefile_toml.exists():
            try:
                content = lakefile_toml.read_text(encoding="utf-8")
                match = re.search(r'\[\[lean_lib\]\][^\[]*name\s*=\s*["\'](\w+)["\']', content, re.DOTALL)
                if match:
                    return match.group(1)
                match = re.search(r'name\s*=\s*["\'](\w+)["\']', content)
                if match:
                    return match.group(1)
            except Exception:
                pass

        return self.project_path.name

    def is_valid(self) -> bool:
        """
        Check if cache is valid

        - File exists
        - Version matches
        - ilean_hash matches
        """
        if not self.cache_file.exists():
            return False

        try:
            with open(self.cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            # Check version
            if data.get("version") != CACHE_VERSION:
                print(f"[GraphCache] Version mismatch: {data.get('version')} != {CACHE_VERSION}")
                return False

            # Check hash
            cached_hash = data.get("ilean_hash", "")
            current_hash = self.compute_ilean_hash()

            if cached_hash != current_hash:
                print(f"[GraphCache] Hash mismatch, cache outdated")
                return False

            return True

        except (json.JSONDecodeError, KeyError) as e:
            print(f"[GraphCache] Invalid cache file: {e}")
            return False

    def load(self) -> Optional[tuple[list[Node], list[Edge]]]:
        """
        Load nodes and edges from cache

        Returns:
            (nodes, edges) or None (if cache is invalid)
        """
        if not self.is_valid():
            return None

        try:
            with open(self.cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            # All node status defaults to unknown, may be updated in real-time

            nodes = []
            for n in data.get("nodes", []):
                node_id = n["id"]
                # Default status is unknown
                node = Node(
                    id=node_id,
                    name=n["name"],
                    kind=n["kind"],
                    file_path=n["file_path"],
                    line_number=n["line_number"],
                    status=ProofStatus.UNKNOWN,
                    references=n.get("references", []),
                    depends_on_count=n.get("depends_on_count", 0),
                    used_by_count=n.get("used_by_count", 0),
                    depth=n.get("depth", 0),
                    default_color=n.get("default_color", "#888888"),
                    default_size=n.get("default_size", 1.0),
                    default_shape=n.get("default_shape", "sphere"),
                )
                # Don't load meta from cache, meta is managed by UnifiedStorage
                nodes.append(node)

            edges = []
            for e in data.get("edges", []):
                edge = Edge(
                    source=e["source"],
                    target=e["target"],
                    from_lean=e.get("from_lean", True),
                    default_color=e.get("default_color", "#2ecc71"),
                    default_width=e.get("default_width", 1.0),
                    default_style=e.get("default_style", "solid"),
                )
                edges.append(edge)

            print(f"[GraphCache] Loaded {len(nodes)} nodes, {len(edges)} edges from cache")
            return nodes, edges

        except Exception as e:
            print(f"[GraphCache] Error loading cache: {e}")
            return None

    def save(self, nodes: list[Node], edges: list[Edge]):
        """
        Save nodes and edges to cache

        Note:
        - Doesn't save meta (managed by UnifiedStorage)
        - Status is not saved in graph.json
        - Doesn't save content (frontend uses readFile API to get source code)
        """
        self.ensure_dir()

        # Save graph.json (without status and content)
        data = {
            "version": CACHE_VERSION,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "ilean_hash": self.compute_ilean_hash(),
            "nodes": [
                {
                    "id": n.id,
                    "name": n.name,
                    "kind": n.kind,
                    "file_path": n.file_path,
                    "line_number": n.line_number,
                    # status not saved
                    # content not saved, frontend uses readFile API
                    "references": n.references,
                    "depends_on_count": n.depends_on_count,
                    "used_by_count": n.used_by_count,
                    "depth": n.depth,
                    "default_color": n.default_color,
                    "default_size": n.default_size,
                    "default_shape": n.default_shape,
                }
                for n in nodes
            ],
            "edges": [
                {
                    "source": e.source,
                    "target": e.target,
                    "from_lean": e.from_lean,
                    "default_color": e.default_color,
                    "default_width": e.default_width,
                    "default_style": e.default_style,
                }
                for e in edges
            ],
        }

        with open(self.cache_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"[GraphCache] Saved {len(nodes)} nodes, {len(edges)} edges to cache")

    def invalidate(self):
        """Delete cache file"""
        if self.cache_file.exists():
            self.cache_file.unlink()
            print(f"[GraphCache] Cache invalidated")

    def update_positions(self, positions: dict[str, dict]):
        """
        Update node positions (incremental merge)

        Args:
            positions: {node_id: {x, y}}
        """
        if not positions:
            return

        self.ensure_dir()

        # Load existing data
        data = {}
        if self.cache_file.exists():
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (json.JSONDecodeError, IOError):
                data = {}

        # Ensure positions field exists
        if "positions" not in data:
            data["positions"] = {}

        # Merge positions
        for node_id, pos in positions.items():
            data["positions"][node_id] = {
                "x": pos.get("x", 0),
                "y": pos.get("y", 0),
            }

        # Save
        with open(self.cache_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"[GraphCache] Updated positions for {len(positions)} nodes")

    def get_positions(self) -> dict[str, dict]:
        """
        Get all saved positions

        Returns:
            {node_id: {x, y}}
        """
        if not self.cache_file.exists():
            return {}

        try:
            with open(self.cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("positions", {})
        except (json.JSONDecodeError, IOError):
            return {}
