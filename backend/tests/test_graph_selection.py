"""
Test graph node selection scenarios

Simulate node selection behavior in 2D/3D graphs:
- Node selection should not affect canvas state
- Rapid selection switching should not cause data loss
- Selection state and canvas visibility should be independent
"""

import pytest
from astrolabe.canvas import CanvasStore, CanvasData


class TestNodeSelectionScenarios:
    """Test node selection scenarios - simulating frontend 3D graph behavior"""

    def test_selection_does_not_modify_canvas(self, tmp_path):
        """
        Node selection should not modify canvas state

        Frontend behavior: clicking a node only updates selectedNodeId,
        should not trigger canvas API calls
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Add some nodes
        store.add_node("theorem_1")
        store.add_node("lemma_1")
        store.add_node("definition_1")

        initial_canvas = store.load()
        initial_count = len(initial_canvas.visible_nodes)

        # Simulate selection operation - read only, no modification
        # Frontend's selectedNodeId is pure frontend state
        for _ in range(10):
            # Simulate rapid selection switching
            canvas = store.load()
            assert len(canvas.visible_nodes) == initial_count

        # Verify canvas state unchanged
        final_canvas = store.load()
        assert final_canvas.visible_nodes == initial_canvas.visible_nodes

    def test_selection_and_visibility_independent(self, tmp_path):
        """
        Selection state and visibility should be independent

        User can:
        - Select a visible node
        - Deselect but keep visible
        - Remove node (also clears selection)
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Add nodes
        store.add_node("node_1")
        store.add_node("node_2")

        # Select node_1 - frontend state
        selected_node_id = "node_1"

        # Verify node_1 is on canvas
        canvas = store.load()
        assert selected_node_id in canvas.visible_nodes

        # Remove node_1 - this affects canvas, frontend should clear selection
        canvas = store.remove_node("node_1")
        assert "node_1" not in canvas.visible_nodes

        # Frontend should detect and clear selectedNodeId
        # This is frontend logic: if selectedNode?.id === removedNodeId: setSelectedNode(null)

    def test_rapid_add_remove_does_not_lose_nodes(self, tmp_path):
        """
        Rapid add/remove operations should not lose nodes

        Simulates user rapidly clicking add/remove buttons
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Rapidly add multiple nodes
        nodes_to_add = [f"node_{i}" for i in range(20)]
        for node_id in nodes_to_add:
            store.add_node(node_id)

        canvas = store.load()
        assert len(canvas.visible_nodes) == 20

        # Rapidly remove half
        for i in range(10):
            store.remove_node(f"node_{i}")

        canvas = store.load()
        assert len(canvas.visible_nodes) == 10

        # Verify correct nodes were preserved
        for i in range(10, 20):
            assert f"node_{i}" in canvas.visible_nodes

    def test_position_preserved_during_selection_changes(self, tmp_path):
        """
        Position should remain unchanged during selection changes

        3D graph's force-directed layout continuously updates positions,
        but selection operations should not reset positions
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Add nodes
        store.add_node("node_1")
        store.add_node("node_2")

        # Set positions (simulating stable 3D positions after force-directed layout)
        store.update_position("node_1", 100.0, 150.0, 0.0)
        store.update_position("node_2", 200.0, 250.0, 0.0)

        # Multiple loads (simulating re-renders due to selection changes)
        for _ in range(5):
            canvas = store.load()
            assert canvas.positions["node_1"] == {"x": 100.0, "y": 150.0, "z": 0.0}
            assert canvas.positions["node_2"] == {"x": 200.0, "y": 250.0, "z": 0.0}

    def test_empty_selection_does_not_clear_canvas(self, tmp_path):
        """
        Clearing selection (clicking empty space) should not clear canvas
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Add nodes
        store.add_node("node_1")
        store.add_node("node_2")

        # Simulate clicking empty space - frontend onNodeClick(null)
        # This only clears selectedNode, doesn't affect canvas

        canvas = store.load()
        assert len(canvas.visible_nodes) == 2


class TestGraphDataStability:
    """Test graph data stability - prevent unnecessary re-renders"""

    def test_load_returns_consistent_data(self, tmp_path):
        """
        Consecutive loads should return consistent data

        This is important for frontend's useMemo stability
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        store.add_node("node_1")
        store.add_node("node_2")
        store.update_position("node_1", 50.0, 60.0, 0.0)

        # Load multiple times consecutively
        results = [store.load() for _ in range(5)]

        # All results should be consistent
        for result in results:
            assert result.visible_nodes == results[0].visible_nodes
            assert result.positions == results[0].positions

    def test_node_order_preserved(self, tmp_path):
        """
        Node order should remain consistent

        This affects frontend's key stability calculation
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Add in order
        store.add_node("a_node")
        store.add_node("b_node")
        store.add_node("c_node")

        canvas = store.load()

        # Order should be consistent after reload
        canvas2 = store.load()
        assert canvas.visible_nodes == canvas2.visible_nodes


class TestEdgeCasesForGraph:
    """Edge cases for graph rendering"""

    def test_self_referencing_node(self, tmp_path):
        """
        Self-referencing node (edge source and target are the same)

        This can happen in Lean (recursive theorems)
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Add node that might have self-reference
        store.add_node("recursive_theorem")

        canvas = store.load()
        assert "recursive_theorem" in canvas.visible_nodes

    def test_very_long_node_names(self, tmp_path):
        """
        Very long node names

        Lean's fully qualified names can be very long
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        long_name = "Mathlib.Topology.MetricSpace.Basic.isOpen_ball_of_continuous"
        store.add_node(long_name)

        canvas = store.load()
        assert long_name in canvas.visible_nodes

    def test_special_characters_in_names(self, tmp_path):
        """
        Node names with special characters

        Lean supports Unicode identifiers
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        special_names = [
            "theorem_α",
            "lemma_∀x",
            "def_→_arrow",
            "prop_∃_exists",
        ]

        for name in special_names:
            store.add_node(name)

        canvas = store.load()
        for name in special_names:
            assert name in canvas.visible_nodes


class TestConcurrentAccess:
    """Concurrent access tests - simulating rapid frontend operations"""

    def test_rapid_toggle_same_node(self, tmp_path):
        """
        Rapidly toggle visibility of the same node

        Simulates user rapidly double-clicking scenario
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Rapidly add/remove the same node
        for i in range(20):
            if i % 2 == 0:
                store.add_node("toggle_node")
            else:
                store.remove_node("toggle_node")

        # Final state: even number of adds, odd number of removes
        # 0: add, 1: remove, ..., 18: add, 19: remove
        # Should not be in the list at the end
        canvas = store.load()
        assert "toggle_node" not in canvas.visible_nodes

    def test_multiple_nodes_interleaved_operations(self, tmp_path):
        """
        Interleaved operations on multiple nodes
        """
        (tmp_path / ".astrolabe").mkdir()
        store = CanvasStore(str(tmp_path))

        # Interleaved add and remove
        store.add_node("node_1")
        store.add_node("node_2")
        store.remove_node("node_1")
        store.add_node("node_3")
        store.add_node("node_1")  # Re-add
        store.remove_node("node_2")

        canvas = store.load()
        assert "node_1" in canvas.visible_nodes
        assert "node_2" not in canvas.visible_nodes
        assert "node_3" in canvas.visible_nodes


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
