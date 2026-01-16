"""
Test graph node selection scenarios

Simulate node selection behavior in 2D/3D graphs:
- Node selection should not affect canvas state
- Rapid selection switching should not cause data loss
- Selection state and canvas visibility should be independent
"""

import pytest
from pathlib import Path
from astrolabe.unified_storage import UnifiedStorage


# Mock graph data for testing
MOCK_GRAPH_DATA = {
    "version": "1.0",
    "nodes": [],
    "edges": [],
}


@pytest.fixture
def storage(tmp_path):
    """Create a UnifiedStorage instance with temp directory"""
    meta_path = tmp_path / ".astrolabe" / "meta.json"
    (tmp_path / ".astrolabe").mkdir()
    return UnifiedStorage(
        graph_data=MOCK_GRAPH_DATA,
        meta_path=meta_path,
        project_path=tmp_path,
    )


class TestNodeSelectionScenarios:
    """Test node selection scenarios - simulating frontend 3D graph behavior"""

    def test_selection_does_not_modify_canvas(self, storage):
        """
        Node selection should not modify canvas state

        Frontend behavior: clicking a node only updates selectedNodeId,
        should not trigger canvas API calls
        """
        # Add some nodes
        storage.add_node_to_canvas("theorem_1")
        storage.add_node_to_canvas("lemma_1")
        storage.add_node_to_canvas("definition_1")

        initial_canvas = storage.get_canvas()
        initial_count = len(initial_canvas["visible_nodes"])

        # Simulate selection operation - read only, no modification
        # Frontend's selectedNodeId is pure frontend state
        for _ in range(10):
            # Simulate rapid selection switching
            canvas = storage.get_canvas()
            assert len(canvas["visible_nodes"]) == initial_count

        # Verify canvas state unchanged
        final_canvas = storage.get_canvas()
        assert final_canvas["visible_nodes"] == initial_canvas["visible_nodes"]

    def test_selection_and_visibility_independent(self, storage):
        """
        Selection state and visibility should be independent

        User can:
        - Select a visible node
        - Deselect but keep visible
        - Remove node (also clears selection)
        """
        # Add nodes
        storage.add_node_to_canvas("node_1")
        storage.add_node_to_canvas("node_2")

        # Select node_1 - frontend state
        selected_node_id = "node_1"

        # Verify node_1 is on canvas
        canvas = storage.get_canvas()
        assert selected_node_id in canvas["visible_nodes"]

        # Remove node_1 - this affects canvas, frontend should clear selection
        storage.remove_node_from_canvas("node_1")
        canvas = storage.get_canvas()
        assert "node_1" not in canvas["visible_nodes"]

        # Frontend should detect and clear selectedNodeId
        # This is frontend logic: if selectedNode?.id === removedNodeId: setSelectedNode(null)

    def test_rapid_add_remove_does_not_lose_nodes(self, storage):
        """
        Rapid add/remove operations should not lose nodes

        Simulates user rapidly clicking add/remove buttons
        """
        # Rapidly add multiple nodes
        nodes_to_add = [f"node_{i}" for i in range(20)]
        for node_id in nodes_to_add:
            storage.add_node_to_canvas(node_id)

        canvas = storage.get_canvas()
        assert len(canvas["visible_nodes"]) == 20

        # Rapidly remove half
        for i in range(10):
            storage.remove_node_from_canvas(f"node_{i}")

        canvas = storage.get_canvas()
        assert len(canvas["visible_nodes"]) == 10

        # Verify correct nodes were preserved
        for i in range(10, 20):
            assert f"node_{i}" in canvas["visible_nodes"]

    def test_position_preserved_during_selection_changes(self, storage):
        """
        Position should remain unchanged during selection changes

        3D graph's force-directed layout continuously updates positions,
        but selection operations should not reset positions
        """
        # Add nodes
        storage.add_node_to_canvas("node_1")
        storage.add_node_to_canvas("node_2")

        # Set positions (simulating stable 3D positions after force-directed layout)
        storage.update_positions({
            "node_1": {"x": 100.0, "y": 150.0, "z": 0.0},
            "node_2": {"x": 200.0, "y": 250.0, "z": 0.0},
        })

        # Multiple loads (simulating re-renders due to selection changes)
        for _ in range(5):
            canvas = storage.get_canvas()
            assert canvas["positions"]["node_1"] == {"x": 100.0, "y": 150.0, "z": 0.0}
            assert canvas["positions"]["node_2"] == {"x": 200.0, "y": 250.0, "z": 0.0}

    def test_empty_selection_does_not_clear_canvas(self, storage):
        """
        Clearing selection (clicking empty space) should not clear canvas
        """
        # Add nodes
        storage.add_node_to_canvas("node_1")
        storage.add_node_to_canvas("node_2")

        # Simulate clicking empty space - frontend onNodeClick(null)
        # This only clears selectedNode, doesn't affect canvas

        canvas = storage.get_canvas()
        assert len(canvas["visible_nodes"]) == 2


class TestGraphDataStability:
    """Test graph data stability - prevent unnecessary re-renders"""

    def test_load_returns_consistent_data(self, storage):
        """
        Consecutive loads should return consistent data

        This is important for frontend's useMemo stability
        """
        storage.add_node_to_canvas("node_1")
        storage.add_node_to_canvas("node_2")
        storage.update_positions({"node_1": {"x": 50.0, "y": 60.0, "z": 0.0}})

        # Load multiple times consecutively
        results = [storage.get_canvas() for _ in range(5)]

        # All results should be consistent
        for result in results:
            assert result["visible_nodes"] == results[0]["visible_nodes"]
            assert result["positions"] == results[0]["positions"]

    def test_node_order_preserved(self, storage):
        """
        Node order should remain consistent

        This affects frontend's key stability calculation
        """
        # Add in order
        storage.add_node_to_canvas("a_node")
        storage.add_node_to_canvas("b_node")
        storage.add_node_to_canvas("c_node")

        canvas = storage.get_canvas()

        # Order should be consistent after reload
        canvas2 = storage.get_canvas()
        assert canvas["visible_nodes"] == canvas2["visible_nodes"]


class TestEdgeCasesForGraph:
    """Edge cases for graph rendering"""

    def test_self_referencing_node(self, storage):
        """
        Self-referencing node (edge source and target are the same)

        This can happen in Lean (recursive theorems)
        """
        # Add node that might have self-reference
        storage.add_node_to_canvas("recursive_theorem")

        canvas = storage.get_canvas()
        assert "recursive_theorem" in canvas["visible_nodes"]

    def test_very_long_node_names(self, storage):
        """
        Very long node names

        Lean's fully qualified names can be very long
        """
        long_name = "Mathlib.Topology.MetricSpace.Basic.isOpen_ball_of_continuous"
        storage.add_node_to_canvas(long_name)

        canvas = storage.get_canvas()
        assert long_name in canvas["visible_nodes"]

    def test_special_characters_in_names(self, storage):
        """
        Node names with special characters

        Lean supports Unicode identifiers
        """
        special_names = [
            "theorem_α",
            "lemma_∀x",
            "def_→_arrow",
            "prop_∃_exists",
        ]

        for name in special_names:
            storage.add_node_to_canvas(name)

        canvas = storage.get_canvas()
        for name in special_names:
            assert name in canvas["visible_nodes"]


class TestConcurrentAccess:
    """Concurrent access tests - simulating rapid frontend operations"""

    def test_rapid_toggle_same_node(self, storage):
        """
        Rapidly toggle visibility of the same node

        Simulates user rapidly double-clicking scenario
        """
        # Rapidly add/remove the same node
        for i in range(20):
            if i % 2 == 0:
                storage.add_node_to_canvas("toggle_node")
            else:
                storage.remove_node_from_canvas("toggle_node")

        # Final state: even number of adds, odd number of removes
        # 0: add, 1: remove, ..., 18: add, 19: remove
        # Should not be in the list at the end
        canvas = storage.get_canvas()
        assert "toggle_node" not in canvas["visible_nodes"]

    def test_multiple_nodes_interleaved_operations(self, storage):
        """
        Interleaved operations on multiple nodes
        """
        # Interleaved add and remove
        storage.add_node_to_canvas("node_1")
        storage.add_node_to_canvas("node_2")
        storage.remove_node_from_canvas("node_1")
        storage.add_node_to_canvas("node_3")
        storage.add_node_to_canvas("node_1")  # Re-add
        storage.remove_node_from_canvas("node_2")

        canvas = storage.get_canvas()
        assert "node_1" in canvas["visible_nodes"]
        assert "node_2" not in canvas["visible_nodes"]
        assert "node_3" in canvas["visible_nodes"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
