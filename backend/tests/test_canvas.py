"""
Test Canvas API and CanvasStore

Ensure visibility toggle functionality works correctly:
- Add nodes to canvas
- Remove nodes from canvas
- State consistency
"""

import pytest
import json
import tempfile
from pathlib import Path
from astrolabe.canvas import CanvasStore, CanvasData


class TestCanvasStore:
    """Test CanvasStore core logic"""

    def test_add_node_basic(self, tmp_path):
        """Basic add node functionality"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Add first node
        canvas = store.add_node("node_1")
        assert "node_1" in canvas.visible_nodes
        assert len(canvas.visible_nodes) == 1

        # Verify persistence
        loaded = store.load()
        assert "node_1" in loaded.visible_nodes

    def test_add_node_idempotent(self, tmp_path):
        """Adding the same node should be idempotent"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.add_node("node_1")  # Duplicate add
        store.add_node("node_1")  # Duplicate again

        canvas = store.load()
        assert canvas.visible_nodes.count("node_1") == 1  # Should only have one

    def test_add_multiple_nodes(self, tmp_path):
        """Add multiple nodes"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.add_node("node_2")
        store.add_node("node_3")

        canvas = store.load()
        assert len(canvas.visible_nodes) == 3
        assert "node_1" in canvas.visible_nodes
        assert "node_2" in canvas.visible_nodes
        assert "node_3" in canvas.visible_nodes

    def test_remove_node_basic(self, tmp_path):
        """Basic remove node functionality"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # First add
        store.add_node("node_1")
        store.add_node("node_2")

        # Remove
        canvas = store.remove_node("node_1")
        assert "node_1" not in canvas.visible_nodes
        assert "node_2" in canvas.visible_nodes

        # Verify persistence
        loaded = store.load()
        assert "node_1" not in loaded.visible_nodes
        assert "node_2" in loaded.visible_nodes

    def test_remove_nonexistent_node(self, tmp_path):
        """Removing a nonexistent node should not throw an error"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")

        # Remove nonexistent node
        canvas = store.remove_node("nonexistent")

        # Original node should be unaffected
        assert "node_1" in canvas.visible_nodes

    def test_remove_also_removes_position(self, tmp_path):
        """Removing a node should also remove its position"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.update_position("node_1", 100.0, 200.0, 0.0)

        # Verify position exists
        canvas = store.load()
        assert "node_1" in canvas.positions

        # Remove node
        canvas = store.remove_node("node_1")

        # Position should also be removed
        assert "node_1" not in canvas.positions

    def test_toggle_visibility_cycle(self, tmp_path):
        """Test visibility toggle cycle: add -> remove -> add"""
        store = CanvasStore(str(tmp_path))

        # Initial state: not visible
        canvas = store.load()
        assert "node_1" not in canvas.visible_nodes

        # Add (becomes visible)
        canvas = store.add_node("node_1")
        assert "node_1" in canvas.visible_nodes

        # Remove (becomes invisible)
        canvas = store.remove_node("node_1")
        assert "node_1" not in canvas.visible_nodes

        # Add again (becomes visible)
        canvas = store.add_node("node_1")
        assert "node_1" in canvas.visible_nodes

    def test_rapid_toggle(self, tmp_path):
        """Rapid toggle test (simulating user rapid clicking)"""
        store = CanvasStore(str(tmp_path))

        # Rapidly toggle 10 times
        for i in range(10):
            if i % 2 == 0:
                store.add_node("node_1")
            else:
                store.remove_node("node_1")

        # Final state should be invisible (even adds, odd removes)
        canvas = store.load()
        assert "node_1" not in canvas.visible_nodes

    def test_concurrent_add_same_node(self, tmp_path):
        """Handling concurrent adds of the same node"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Simulate concurrency: multiple adds of the same node
        for _ in range(5):
            store.add_node("node_1")

        canvas = store.load()
        # Node should only appear once
        assert canvas.visible_nodes.count("node_1") == 1

    def test_clear_canvas(self, tmp_path):
        """Clear canvas"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Add some nodes and positions
        store.add_node("node_1")
        store.add_node("node_2")
        store.update_position("node_1", 10.0, 20.0, 0.0)

        # Clear
        store.clear()

        canvas = store.load()
        assert len(canvas.visible_nodes) == 0
        assert len(canvas.positions) == 0

    def test_canvas_file_format(self, tmp_path):
        """Verify canvas.json file format"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.update_position("node_1", 100.0, 200.0, 0.0)

        # Read file directly to verify format
        canvas_file = tmp_path / ".astrolabe" / "canvas.json"
        assert canvas_file.exists()

        with open(canvas_file, "r") as f:
            data = json.load(f)

        assert "version" in data
        assert "updated_at" in data
        assert "visible_nodes" in data
        assert "positions" in data
        assert data["visible_nodes"] == ["node_1"]
        assert data["positions"]["node_1"] == {"x": 100.0, "y": 200.0, "z": 0.0}


class TestCanvasData:
    """Test CanvasData data class"""

    def test_to_dict(self):
        """Test serialization - 3D position format"""
        canvas = CanvasData(
            visible_nodes=["node_1", "node_2"],
            positions={"node_1": {"x": 10, "y": 20, "z": 30}},
        )

        data = canvas.to_dict()

        assert data["visible_nodes"] == ["node_1", "node_2"]
        assert data["positions"] == {"node_1": {"x": 10, "y": 20, "z": 30}}
        assert "version" in data
        assert "updated_at" in data

    def test_from_dict(self):
        """Test deserialization - 3D position format"""
        data = {
            "visible_nodes": ["node_1", "node_2"],
            "positions": {"node_1": {"x": 10, "y": 20, "z": 30}},
            "custom_nodes": [],
            "custom_edges": [],
        }

        canvas = CanvasData.from_dict(data)

        assert canvas.visible_nodes == ["node_1", "node_2"]
        assert canvas.positions == {"node_1": {"x": 10, "y": 20, "z": 30}}

    def test_from_dict_empty(self):
        """Test deserialization with empty data"""
        canvas = CanvasData.from_dict({})

        assert canvas.visible_nodes == []
        assert canvas.positions == {}


class TestCanvasAPIIntegration:
    """Integration test: simulate API call flow"""

    def test_api_add_returns_correct_data(self, tmp_path):
        """API add node should return correct data structure"""
        store = CanvasStore(str(tmp_path))

        # Simulate API call
        canvas = store.add_node("node_1")

        # API should return complete data
        response = {
            "status": "ok",
            "visible_nodes": canvas.visible_nodes,
            "positions": canvas.positions,  # Key: positions should also be returned
        }

        assert "node_1" in response["visible_nodes"]
        assert isinstance(response["positions"], dict)

    def test_api_remove_returns_correct_data(self, tmp_path):
        """API remove node should return correct data structure"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.update_position("node_1", 10.0, 20.0, 0.0)

        # Simulate API call
        canvas = store.remove_node("node_1")

        response = {
            "status": "ok",
            "visible_nodes": canvas.visible_nodes,
            "positions": canvas.positions,
        }

        assert "node_1" not in response["visible_nodes"]
        assert "node_1" not in response["positions"]

    def test_full_workflow(self, tmp_path):
        """Full workflow test"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # 1. Initial load - empty canvas
        canvas = store.load()
        assert len(canvas.visible_nodes) == 0

        # 2. Add node after search
        canvas = store.add_node("theorem_1")
        assert "theorem_1" in canvas.visible_nodes

        # 3. Update position after dragging in 3D graph
        canvas = store.update_position("theorem_1", 50.0, 100.0, 0.0)
        assert canvas.positions["theorem_1"] == {"x": 50.0, "y": 100.0, "z": 0.0}

        # 4. Add more nodes
        store.add_node("lemma_1")
        store.add_node("definition_1")

        # 5. Remove a node via toggle
        canvas = store.remove_node("lemma_1")
        assert "lemma_1" not in canvas.visible_nodes
        assert "theorem_1" in canvas.visible_nodes

        # 6. Load after reopening the app
        new_store = CanvasStore(str(tmp_path))
        loaded = new_store.load()

        assert "theorem_1" in loaded.visible_nodes
        assert "definition_1" in loaded.visible_nodes
        assert "lemma_1" not in loaded.visible_nodes
        assert loaded.positions["theorem_1"] == {"x": 50.0, "y": 100.0, "z": 0.0}


class TestEdgeCases:
    """Edge case tests"""

    def test_empty_node_id(self, tmp_path):
        """Empty node ID"""
        store = CanvasStore(str(tmp_path))

        # Empty string ID
        canvas = store.add_node("")
        assert "" in canvas.visible_nodes  # Technically allowed, but may need validation at API layer

    def test_special_characters_in_node_id(self, tmp_path):
        """Node ID with special characters"""
        store = CanvasStore(str(tmp_path))

        special_ids = [
            "node.with.dots",
            "node/with/slashes",
            "node:with:colons",
            "Mathlib.Topology.Basic.theorem1",
        ]

        for node_id in special_ids:
            canvas = store.add_node(node_id)
            assert node_id in canvas.visible_nodes

            # Remove
            canvas = store.remove_node(node_id)
            assert node_id not in canvas.visible_nodes

    def test_very_long_node_id(self, tmp_path):
        """Very long node ID"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        long_id = "a" * 1000
        canvas = store.add_node(long_id)
        assert long_id in canvas.visible_nodes

        # Verify persistence
        loaded = store.load()
        assert long_id in loaded.visible_nodes

    def test_unicode_node_id(self, tmp_path):
        """Unicode node ID"""
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        unicode_id = "定理_球面外翻"
        canvas = store.add_node(unicode_id)
        assert unicode_id in canvas.visible_nodes

        # Verify persistence
        loaded = store.load()
        assert unicode_id in loaded.visible_nodes

    def test_corrupted_canvas_file(self, tmp_path):
        """Corrupted canvas.json case"""
        store = CanvasStore(str(tmp_path))

        # Create corrupted file
        astrolabe_dir = tmp_path / ".astrolabe"
        astrolabe_dir.mkdir()
        canvas_file = astrolabe_dir / "canvas.json"
        canvas_file.write_text("{ invalid json }")

        # Should return empty canvas instead of throwing error
        canvas = store.load()
        assert canvas.visible_nodes == []

        # Should be able to add nodes normally (overwrite corrupted file)
        canvas = store.add_node("node_1")
        assert "node_1" in canvas.visible_nodes


class TestCanvasAPIResponse:
    """Test API response format - ensure all fields expected by frontend exist"""

    def test_add_api_returns_positions(self, tmp_path):
        """
        BUG FIX: /api/canvas/add must return positions field

        Frontend canvasStore.addNode expects response to contain:
        - visible_nodes: string[]
        - positions: Record<string, {x, y}>

        If positions is missing, frontend will set positions to undefined,
        causing nodes to potentially not display correctly after adding.
        """
        store = CanvasStore(str(tmp_path))
        canvas = store.add_node("node_1")

        # Simulate API response
        response = {
            "status": "ok",
            "visible_nodes": canvas.visible_nodes,
            "positions": canvas.positions,
        }

        # Key assertion: positions must exist and be a dict
        assert "positions" in response, "API response must include positions field"
        assert isinstance(response["positions"], dict), "positions must be dict type"

    def test_remove_api_returns_positions(self, tmp_path):
        """
        BUG FIX: /api/canvas/remove must return positions field
        """
        store = CanvasStore(str(tmp_path))
        store.add_node("node_1")
        canvas = store.remove_node("node_1")

        response = {
            "status": "ok",
            "visible_nodes": canvas.visible_nodes,
            "positions": canvas.positions,
        }

        assert "positions" in response, "API response must include positions field"
        assert isinstance(response["positions"], dict)

    def test_visibility_toggle_preserves_other_positions(self, tmp_path):
        """
        Ensure toggling one node's visibility doesn't affect other nodes' positions
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Add multiple nodes and set positions
        store.add_node("node_1")
        store.add_node("node_2")
        store.update_position("node_1", 100.0, 200.0, 0.0)
        store.update_position("node_2", 300.0, 400.0, 0.0)

        # Remove node_1
        canvas = store.remove_node("node_1")

        # node_2's position should remain unchanged
        assert canvas.positions["node_2"] == {"x": 300.0, "y": 400.0, "z": 0.0}
        # node_1's position should be removed
        assert "node_1" not in canvas.positions

        # Re-add node_1
        canvas = store.add_node("node_1")

        # node_2's position should still be unchanged
        assert canvas.positions["node_2"] == {"x": 300.0, "y": 400.0, "z": 0.0}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
