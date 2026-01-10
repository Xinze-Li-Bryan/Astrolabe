"""
Test Canvas 3D Position Storage

Design principles:
- canvas.json stores 3D positions {x, y, z}
- meta.json does not store position information
- When loading, directly read 3D positions from canvas.json for rendering
"""

import pytest
import json
from pathlib import Path
from astrolabe.canvas import CanvasStore, CanvasData


class TestCanvas3DPositions:
    """Test canvas.json 3D position storage"""

    def test_update_position_3d(self, tmp_path):
        """Position should be 3D {x, y, z}"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        canvas = store.update_position("node_1", 10.0, 20.0, 30.0)

        assert canvas.positions["node_1"] == {"x": 10.0, "y": 20.0, "z": 30.0}

    def test_update_position_3d_persisted(self, tmp_path):
        """3D position should be correctly persisted to file"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.update_position("node_1", 1.5, 2.5, 3.5)

        # Read file directly to verify
        canvas_file = tmp_path / ".astrolabe" / "canvas.json"
        with open(canvas_file, "r") as f:
            data = json.load(f)

        assert data["positions"]["node_1"] == {"x": 1.5, "y": 2.5, "z": 3.5}

    def test_update_positions_batch_3d(self, tmp_path):
        """Batch update 3D positions"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.add_node("node_2")
        store.add_node("node_3")

        positions = {
            "node_1": {"x": 1.0, "y": 2.0, "z": 3.0},
            "node_2": {"x": 4.0, "y": 5.0, "z": 6.0},
            "node_3": {"x": 7.0, "y": 8.0, "z": 9.0},
        }

        canvas = store.update_positions(positions)

        assert canvas.positions["node_1"] == {"x": 1.0, "y": 2.0, "z": 3.0}
        assert canvas.positions["node_2"] == {"x": 4.0, "y": 5.0, "z": 6.0}
        assert canvas.positions["node_3"] == {"x": 7.0, "y": 8.0, "z": 9.0}

    def test_load_3d_positions(self, tmp_path):
        """Should correctly read 3D positions when loading"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.update_position("node_1", 100.0, 200.0, 300.0)

        # Create new store instance to simulate reload
        new_store = CanvasStore(str(tmp_path))
        canvas = new_store.load()

        assert canvas.positions["node_1"] == {"x": 100.0, "y": 200.0, "z": 300.0}

    def test_position_has_z_field(self, tmp_path):
        """Verify position must contain z field"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        canvas = store.update_position("node_1", 1.0, 2.0, 3.0)

        pos = canvas.positions["node_1"]
        assert "x" in pos
        assert "y" in pos
        assert "z" in pos

    def test_remove_node_removes_3d_position(self, tmp_path):
        """Removing a node should also remove its 3D position"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.update_position("node_1", 1.0, 2.0, 3.0)

        canvas = store.remove_node("node_1")

        assert "node_1" not in canvas.positions

    def test_clear_removes_all_3d_positions(self, tmp_path):
        """Clearing canvas should remove all 3D positions"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.add_node("node_2")
        store.update_position("node_1", 1.0, 2.0, 3.0)
        store.update_position("node_2", 4.0, 5.0, 6.0)

        store.clear()
        canvas = store.load()

        assert len(canvas.positions) == 0


class TestCanvasDataSerialization:
    """Test CanvasData 3D position serialization"""

    def test_to_dict_with_3d_positions(self):
        """Serialization should include 3D positions"""
        canvas = CanvasData(
            visible_nodes=["node_1"],
            positions={"node_1": {"x": 1.0, "y": 2.0, "z": 3.0}},
        )

        data = canvas.to_dict()

        assert data["positions"]["node_1"] == {"x": 1.0, "y": 2.0, "z": 3.0}

    def test_from_dict_with_3d_positions(self):
        """Deserialization should correctly read 3D positions"""
        data = {
            "visible_nodes": ["node_1"],
            "positions": {"node_1": {"x": 1.0, "y": 2.0, "z": 3.0}},
        }

        canvas = CanvasData.from_dict(data)

        assert canvas.positions["node_1"] == {"x": 1.0, "y": 2.0, "z": 3.0}

    def test_backward_compatibility_2d_to_3d(self):
        """Backward compatibility: z defaults to 0 when reading old 2D positions"""
        data = {
            "visible_nodes": ["node_1"],
            "positions": {"node_1": {"x": 1.0, "y": 2.0}},  # Old format, no z
        }

        canvas = CanvasData.from_dict(data)

        # z should default to 0
        pos = canvas.positions["node_1"]
        assert pos.get("z", 0) == 0


class TestCanvas3DWorkflow:
    """Full 3D workflow tests"""

    def test_full_3d_workflow(self, tmp_path):
        """Full 3D position workflow"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # 1. Add nodes to canvas
        store.add_node("theorem_1")
        store.add_node("lemma_1")

        # 2. Set 3D positions (simulate user dragging)
        store.update_position("theorem_1", 5.0, 10.0, 15.0)
        store.update_position("lemma_1", -5.0, 0.0, 5.0)

        # 3. Reload after saving
        new_store = CanvasStore(str(tmp_path))
        canvas = new_store.load()

        # 4. Verify positions are correctly saved and loaded
        assert "theorem_1" in canvas.visible_nodes
        assert "lemma_1" in canvas.visible_nodes
        assert canvas.positions["theorem_1"] == {"x": 5.0, "y": 10.0, "z": 15.0}
        assert canvas.positions["lemma_1"] == {"x": -5.0, "y": 0.0, "z": 5.0}

    def test_add_node_without_position(self, tmp_path):
        """Adding node doesn't require setting position immediately"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        canvas = store.add_node("node_1")

        # Node is in visible list but has no position
        assert "node_1" in canvas.visible_nodes
        assert "node_1" not in canvas.positions

    def test_position_update_after_add(self, tmp_path):
        """Add node first, set position later"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Add node (no position)
        store.add_node("node_1")

        # Set position later (after physics simulation stabilizes)
        canvas = store.update_position("node_1", 1.0, 2.0, 3.0)

        assert canvas.positions["node_1"] == {"x": 1.0, "y": 2.0, "z": 3.0}


class TestEmptyCanvas:
    """Empty canvas tests"""

    def test_empty_canvas_has_no_positions(self, tmp_path):
        """Empty canvas has no position data"""
        store = CanvasStore(str(tmp_path))
        canvas = store.load()

        assert len(canvas.visible_nodes) == 0
        assert len(canvas.positions) == 0

    def test_new_project_starts_empty(self, tmp_path):
        """New project starts with empty canvas"""
        store = CanvasStore(str(tmp_path))

        # canvas.json doesn't exist
        canvas_file = tmp_path / ".astrolabe" / "canvas.json"
        assert not canvas_file.exists()

        # load returns empty canvas
        canvas = store.load()
        assert len(canvas.visible_nodes) == 0
        assert len(canvas.positions) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
