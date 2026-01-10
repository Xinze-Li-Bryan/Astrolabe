"""
Canvas Store

Manages reading and writing of .astrolabe/canvas.json
User canvas state: which nodes to display, custom nodes/edges, layout positions
"""

import json
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field
from datetime import datetime


CANVAS_VERSION = "1.1"


@dataclass
class ViewportData:
    """Viewport state"""
    camera_position: list[float] = field(default_factory=lambda: [0, 0, 20])  # 3D camera position
    camera_target: list[float] = field(default_factory=lambda: [0, 0, 0])     # 3D looking at
    zoom: float = 1.0                                                          # 2D zoom (reserved)
    selected_node_id: Optional[str] = None                                     # Selected node
    selected_edge_id: Optional[str] = None                                     # Selected edge

    def to_dict(self) -> dict:
        result = {
            "camera_position": self.camera_position,
            "camera_target": self.camera_target,
            "zoom": self.zoom,
        }
        if self.selected_node_id:
            result["selected_node_id"] = self.selected_node_id
        if self.selected_edge_id:
            result["selected_edge_id"] = self.selected_edge_id
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "ViewportData":
        return cls(
            camera_position=data.get("camera_position", [0, 0, 20]),
            camera_target=data.get("camera_target", [0, 0, 0]),
            zoom=data.get("zoom", 1.0),
            selected_node_id=data.get("selected_node_id"),
            selected_edge_id=data.get("selected_edge_id"),
        )


@dataclass
class CanvasData:
    """Canvas state"""
    visible_nodes: list[str] = field(default_factory=list)  # Visible node IDs
    positions: dict[str, dict] = field(default_factory=dict)  # Node 3D positions {id: {x, y, z}}
    viewport: ViewportData = field(default_factory=ViewportData)  # Viewport state

    def to_dict(self) -> dict:
        return {
            "version": CANVAS_VERSION,
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "visible_nodes": self.visible_nodes,
            "positions": self.positions,
            "viewport": self.viewport.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "CanvasData":
        return cls(
            visible_nodes=data.get("visible_nodes", []),
            positions=data.get("positions", {}),
            viewport=ViewportData.from_dict(data.get("viewport", {})),
        )


class CanvasStore:
    """Manages reading and writing of .astrolabe/canvas.json"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.astrolabe_dir = self.project_path / ".astrolabe"
        self.canvas_file = self.astrolabe_dir / "canvas.json"

    def ensure_dir(self):
        """Ensure .astrolabe directory exists"""
        self.astrolabe_dir.mkdir(exist_ok=True)

    def load(self) -> CanvasData:
        """Load canvas state"""
        if not self.canvas_file.exists():
            return CanvasData()

        try:
            with open(self.canvas_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return CanvasData.from_dict(data)
        except (json.JSONDecodeError, IOError) as e:
            print(f"[CanvasStore] Error loading canvas: {e}")
            return CanvasData()

    def save(self, canvas: CanvasData):
        """
        Save canvas state

        Note: If .astrolabe directory doesn't exist, it won't be created.
        This avoids accidentally recreating the directory after a reset.
        """
        if not self.astrolabe_dir.exists():
            # Don't create .astrolabe if it doesn't exist (e.g., after reset)
            print(f"[CanvasStore] Skipped save: .astrolabe not found")
            return

        with open(self.canvas_file, "w", encoding="utf-8") as f:
            json.dump(canvas.to_dict(), f, indent=2, ensure_ascii=False)

        print(f"[CanvasStore] Saved canvas: {len(canvas.visible_nodes)} nodes")

    def add_node(self, node_id: str) -> CanvasData:
        """Add node to canvas"""
        canvas = self.load()
        if node_id not in canvas.visible_nodes:
            canvas.visible_nodes.append(node_id)
            self.save(canvas)
        return canvas

    def add_nodes(self, node_ids: list[str]) -> CanvasData:
        """Batch add nodes to canvas"""
        canvas = self.load()
        existing = set(canvas.visible_nodes)
        added = 0
        for node_id in node_ids:
            if node_id not in existing:
                canvas.visible_nodes.append(node_id)
                existing.add(node_id)
                added += 1
        if added > 0:
            self.save(canvas)
            print(f"[CanvasStore] Batch added {added} nodes")
        return canvas

    def remove_node(self, node_id: str) -> CanvasData:
        """Remove node from canvas"""
        canvas = self.load()
        if node_id in canvas.visible_nodes:
            canvas.visible_nodes.remove(node_id)
            # Also delete position
            canvas.positions.pop(node_id, None)
            self.save(canvas)
        return canvas

    def update_position(self, node_id: str, x: float, y: float, z: float) -> CanvasData:
        """Update node 3D position"""
        canvas = self.load()
        canvas.positions[node_id] = {"x": x, "y": y, "z": z}
        self.save(canvas)
        return canvas

    def update_positions(self, positions: dict[str, dict]) -> CanvasData:
        """Batch update node 3D positions"""
        canvas = self.load()
        for node_id, pos in positions.items():
            canvas.positions[node_id] = {
                "x": pos.get("x", 0),
                "y": pos.get("y", 0),
                "z": pos.get("z", 0),
            }
        self.save(canvas)
        return canvas

    def clear(self):
        """Clear canvas"""
        self.save(CanvasData())

    def get_viewport(self) -> ViewportData:
        """Get viewport state"""
        canvas = self.load()
        return canvas.viewport

    def update_viewport(self, updates: dict) -> ViewportData:
        """
        Update viewport state (incremental merge)

        Args:
            updates: Fields to update, e.g. {"camera_position": [x,y,z], "selected_node_id": "..."}
        """
        canvas = self.load()

        # Incremental update
        if "camera_position" in updates:
            canvas.viewport.camera_position = updates["camera_position"]
        if "camera_target" in updates:
            canvas.viewport.camera_target = updates["camera_target"]
        if "zoom" in updates:
            canvas.viewport.zoom = updates["zoom"]
        if "selected_node_id" in updates:
            canvas.viewport.selected_node_id = updates["selected_node_id"]
        if "selected_edge_id" in updates:
            canvas.viewport.selected_edge_id = updates["selected_edge_id"]

        self.save(canvas)
        return canvas.viewport
