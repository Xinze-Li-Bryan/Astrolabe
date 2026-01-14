"""
Test UnifiedStorage Canvas Operations

Tests for canvas functionality that will be merged into UnifiedStorage.
These tests are written BEFORE implementation - they should fail until
the canvas methods are added to UnifiedStorage.

Canvas data structure in meta.json:
{
  "nodes": {...},
  "edges": {...},
  "macros": {...},
  "canvas": {
    "visible_nodes": ["node1", "node2"],
    "positions": {"node1": {"x": 1.0, "y": 2.0, "z": 3.0}},
    "viewport": {
      "camera_position": [0, 0, 20],
      "camera_target": [0, 0, 0],
      "zoom": 1.0,
      "selected_node_id": null,
      "selected_edge_id": null
    }
  }
}
"""

import json
import pytest
from pathlib import Path

from astrolabe.unified_storage import UnifiedStorage


# Mock graph data for testing
MOCK_GRAPH_DATA = {
    "version": "1.0",
    "nodes": [
        {
            "id": "Module.theorem1",
            "name": "theorem1",
            "kind": "theorem",
            "file_path": "/test/file.lean",
            "line_number": 10,
        },
        {
            "id": "Module.theorem2",
            "name": "theorem2",
            "kind": "theorem",
            "file_path": "/test/file.lean",
            "line_number": 20,
        },
        {
            "id": "Module.lemma1",
            "name": "lemma1",
            "kind": "lemma",
            "file_path": "/test/file.lean",
            "line_number": 30,
        },
    ],
    "edges": [
        {"source": "Module.theorem1", "target": "Module.lemma1", "from_lean": True},
    ],
}


@pytest.fixture
def temp_dir(tmp_path):
    """Create temp directory with .astrolabe subdirectory"""
    astrolabe_dir = tmp_path / ".astrolabe"
    astrolabe_dir.mkdir()
    return tmp_path


@pytest.fixture
def meta_path(temp_dir):
    """Return meta.json path"""
    return Path(temp_dir) / ".astrolabe" / "meta.json"


@pytest.fixture
def storage(meta_path):
    """Create UnifiedStorage with mock graph data"""
    return UnifiedStorage(graph_data=MOCK_GRAPH_DATA, meta_path=meta_path)


class TestCanvasBasicOperations:
    """Test basic canvas operations"""

    def test_get_canvas_empty_project(self, storage):
        """Get canvas from project with no canvas data yet"""
        canvas = storage.get_canvas()

        assert canvas is not None
        assert canvas.get("visible_nodes") == []
        assert canvas.get("positions") == {}
        assert "viewport" in canvas

    def test_get_canvas_with_data(self, storage, meta_path):
        """Get canvas when canvas data exists in meta.json"""
        # Pre-populate meta.json with canvas data (new format: visible in nodes)
        initial_meta = {
            "nodes": {
                "Module.theorem1": {"visible": True},
                "Module.theorem2": {"visible": True},
            },
            "edges": {},
            "macros": {},
            "canvas": {
                "positions": {
                    "Module.theorem1": {"x": 1.0, "y": 2.0, "z": 3.0}
                },
                "viewport": {
                    "camera_position": [10, 10, 30],
                    "camera_target": [0, 0, 0],
                    "zoom": 1.5,
                }
            }
        }
        with open(meta_path, "w") as f:
            json.dump(initial_meta, f)

        # Reload storage to pick up the file
        storage = UnifiedStorage(graph_data=MOCK_GRAPH_DATA, meta_path=meta_path)
        canvas = storage.get_canvas()

        assert set(canvas["visible_nodes"]) == {"Module.theorem1", "Module.theorem2"}
        assert canvas["positions"]["Module.theorem1"] == {"x": 1.0, "y": 2.0, "z": 3.0}
        assert canvas["viewport"]["camera_position"] == [10, 10, 30]

    def test_set_visible_nodes(self, storage, meta_path):
        """Set visible nodes list"""
        nodes = ["Module.theorem1", "Module.lemma1"]
        storage.set_visible_nodes(nodes)

        # Verify in memory
        canvas = storage.get_canvas()
        assert set(canvas["visible_nodes"]) == set(nodes)

        # Verify persisted to file (visible is now in nodes.<id>.visible)
        with open(meta_path, "r") as f:
            data = json.load(f)
        assert data["nodes"]["Module.theorem1"]["visible"] is True
        assert data["nodes"]["Module.lemma1"]["visible"] is True

    def test_add_node_to_canvas(self, storage, meta_path):
        """Add a single node to canvas"""
        storage.add_node_to_canvas("Module.theorem1")

        canvas = storage.get_canvas()
        assert "Module.theorem1" in canvas["visible_nodes"]

        # Add another
        storage.add_node_to_canvas("Module.theorem2")
        canvas = storage.get_canvas()
        assert "Module.theorem1" in canvas["visible_nodes"]
        assert "Module.theorem2" in canvas["visible_nodes"]

    def test_add_node_to_canvas_no_duplicates(self, storage):
        """Adding same node twice should not create duplicates"""
        storage.add_node_to_canvas("Module.theorem1")
        storage.add_node_to_canvas("Module.theorem1")

        canvas = storage.get_canvas()
        assert canvas["visible_nodes"].count("Module.theorem1") == 1

    def test_add_nodes_to_canvas_batch(self, storage):
        """Add multiple nodes at once"""
        nodes = ["Module.theorem1", "Module.theorem2", "Module.lemma1"]
        storage.add_nodes_to_canvas(nodes)

        canvas = storage.get_canvas()
        assert set(canvas["visible_nodes"]) == set(nodes)

    def test_remove_node_from_canvas(self, storage):
        """Remove a node from canvas"""
        # First add some nodes
        storage.set_visible_nodes(["Module.theorem1", "Module.theorem2", "Module.lemma1"])

        # Remove one
        storage.remove_node_from_canvas("Module.theorem2")

        canvas = storage.get_canvas()
        assert "Module.theorem2" not in canvas["visible_nodes"]
        assert "Module.theorem1" in canvas["visible_nodes"]
        assert "Module.lemma1" in canvas["visible_nodes"]

    def test_remove_node_from_canvas_also_removes_position(self, storage):
        """Removing a node should also remove its position"""
        storage.set_visible_nodes(["Module.theorem1", "Module.theorem2"])
        storage.set_positions({
            "Module.theorem1": {"x": 1, "y": 2, "z": 3},
            "Module.theorem2": {"x": 4, "y": 5, "z": 6},
        })

        storage.remove_node_from_canvas("Module.theorem1")

        canvas = storage.get_canvas()
        assert "Module.theorem1" not in canvas["positions"]
        assert "Module.theorem2" in canvas["positions"]

    def test_remove_nonexistent_node(self, storage):
        """Removing a node that doesn't exist should not error"""
        storage.set_visible_nodes(["Module.theorem1"])
        storage.remove_node_from_canvas("Module.nonexistent")

        canvas = storage.get_canvas()
        assert canvas["visible_nodes"] == ["Module.theorem1"]

    def test_clear_canvas(self, storage, meta_path):
        """Clear all canvas data"""
        # Setup some data
        storage.set_visible_nodes(["Module.theorem1", "Module.theorem2"])
        storage.set_positions({
            "Module.theorem1": {"x": 1, "y": 2, "z": 3},
        })

        # Clear
        storage.clear_canvas()

        canvas = storage.get_canvas()
        assert canvas["visible_nodes"] == []
        assert canvas["positions"] == {}


class TestCanvasPositionOperations:
    """Test position-related canvas operations"""

    def test_get_positions_empty(self, storage):
        """Get positions when none are set"""
        canvas = storage.get_canvas()
        assert canvas["positions"] == {}

    def test_set_positions(self, storage, meta_path):
        """Set node positions"""
        positions = {
            "Module.theorem1": {"x": 1.5, "y": 2.5, "z": 3.5},
            "Module.theorem2": {"x": -1.0, "y": 0.0, "z": 5.0},
        }
        storage.set_positions(positions)

        canvas = storage.get_canvas()
        assert canvas["positions"] == positions

        # Verify persisted
        with open(meta_path, "r") as f:
            data = json.load(f)
        assert data["canvas"]["positions"] == positions

    def test_update_positions_partial(self, storage):
        """Update some positions while keeping others"""
        # Set initial positions
        storage.set_positions({
            "Module.theorem1": {"x": 1, "y": 2, "z": 3},
            "Module.theorem2": {"x": 4, "y": 5, "z": 6},
        })

        # Update only theorem1
        storage.update_positions({
            "Module.theorem1": {"x": 10, "y": 20, "z": 30},
        })

        canvas = storage.get_canvas()
        assert canvas["positions"]["Module.theorem1"] == {"x": 10, "y": 20, "z": 30}
        assert canvas["positions"]["Module.theorem2"] == {"x": 4, "y": 5, "z": 6}

    def test_update_positions_add_new(self, storage):
        """Update positions can add new nodes"""
        storage.set_positions({
            "Module.theorem1": {"x": 1, "y": 2, "z": 3},
        })

        storage.update_positions({
            "Module.theorem2": {"x": 4, "y": 5, "z": 6},
        })

        canvas = storage.get_canvas()
        assert "Module.theorem1" in canvas["positions"]
        assert "Module.theorem2" in canvas["positions"]

    def test_get_position_single_node(self, storage):
        """Get position for a single node"""
        storage.set_positions({
            "Module.theorem1": {"x": 1, "y": 2, "z": 3},
        })

        pos = storage.get_node_position("Module.theorem1")
        assert pos == {"x": 1, "y": 2, "z": 3}

    def test_get_position_nonexistent_node(self, storage):
        """Get position for node that has no position"""
        pos = storage.get_node_position("Module.nonexistent")
        assert pos is None


class TestCanvasViewportOperations:
    """Test viewport-related canvas operations"""

    def test_get_viewport_default(self, storage):
        """Get default viewport when none is set"""
        viewport = storage.get_viewport()

        assert viewport["camera_position"] == [0, 0, 20]
        assert viewport["camera_target"] == [0, 0, 0]
        assert viewport["zoom"] == 1.0
        assert viewport.get("selected_node_id") is None

    def test_set_viewport(self, storage, meta_path):
        """Set complete viewport"""
        viewport = {
            "camera_position": [10, 20, 30],
            "camera_target": [1, 2, 3],
            "zoom": 2.0,
            "selected_node_id": "Module.theorem1",
        }
        storage.set_viewport(viewport)

        result = storage.get_viewport()
        assert result["camera_position"] == [10, 20, 30]
        assert result["camera_target"] == [1, 2, 3]
        assert result["zoom"] == 2.0
        assert result["selected_node_id"] == "Module.theorem1"

    def test_update_viewport_partial(self, storage):
        """Update only some viewport fields"""
        # Set initial viewport
        storage.set_viewport({
            "camera_position": [10, 20, 30],
            "camera_target": [1, 2, 3],
            "zoom": 2.0,
        })

        # Update only camera_position
        storage.update_viewport({
            "camera_position": [100, 200, 300],
        })

        viewport = storage.get_viewport()
        assert viewport["camera_position"] == [100, 200, 300]
        assert viewport["camera_target"] == [1, 2, 3]  # Unchanged
        assert viewport["zoom"] == 2.0  # Unchanged

    def test_update_viewport_selected_node(self, storage):
        """Update selected node in viewport"""
        storage.update_viewport({
            "selected_node_id": "Module.theorem1",
        })

        viewport = storage.get_viewport()
        assert viewport["selected_node_id"] == "Module.theorem1"

        # Change selection
        storage.update_viewport({
            "selected_node_id": "Module.theorem2",
        })

        viewport = storage.get_viewport()
        assert viewport["selected_node_id"] == "Module.theorem2"

    def test_update_viewport_clear_selection(self, storage):
        """Clear selected node"""
        storage.update_viewport({
            "selected_node_id": "Module.theorem1",
        })
        storage.update_viewport({
            "selected_node_id": None,
        })

        viewport = storage.get_viewport()
        assert viewport.get("selected_node_id") is None


class TestCanvasCoexistsWithMeta:
    """Test that canvas data coexists properly with other meta data"""

    def test_canvas_coexists_with_node_meta(self, storage, meta_path):
        """Canvas operations should not affect node meta (notes, colors)"""
        # Set up node meta
        storage.update_node_meta("Module.theorem1", notes="# My notes", color="#ff0000")

        # Set up canvas
        storage.set_visible_nodes(["Module.theorem1", "Module.theorem2"])
        storage.set_positions({"Module.theorem1": {"x": 1, "y": 2, "z": 3}})

        # Verify node meta still exists
        node_meta = storage.get_node_meta("Module.theorem1")
        assert node_meta["notes"] == "# My notes"
        assert node_meta["color"] == "#ff0000"

        # Verify canvas exists
        canvas = storage.get_canvas()
        assert "Module.theorem1" in canvas["visible_nodes"]

        # Verify file structure (visible is now in nodes.<id>.visible)
        with open(meta_path, "r") as f:
            data = json.load(f)
        assert "nodes" in data
        assert "canvas" in data
        assert data["nodes"]["Module.theorem1"]["notes"] == "# My notes"
        assert data["nodes"]["Module.theorem1"]["visible"] is True
        assert data["nodes"]["Module.theorem2"]["visible"] is True

    def test_canvas_coexists_with_edge_meta(self, storage, meta_path):
        """Canvas operations should not affect edge meta"""
        # Set up edge meta
        edge_id = "Module.theorem1->Module.lemma1"
        storage.update_edge_meta(edge_id, color="#00ff00", width=2.0)

        # Set up canvas
        storage.set_visible_nodes(["Module.theorem1", "Module.lemma1"])

        # Verify edge meta still exists
        edge_meta = storage.get_edge_meta(edge_id)
        assert edge_meta["color"] == "#00ff00"
        assert edge_meta["width"] == 2.0

        # Verify canvas exists
        canvas = storage.get_canvas()
        assert "Module.theorem1" in canvas["visible_nodes"]

    def test_canvas_coexists_with_custom_nodes(self, storage, meta_path):
        """Canvas operations should not affect custom nodes"""
        # Create custom node
        storage.add_user_node(
            node_id="custom-123",
            name="My Custom Node",
            kind="custom",
        )

        # Add custom node to canvas
        storage.add_node_to_canvas("custom-123")
        storage.add_node_to_canvas("Module.theorem1")

        # Verify custom node still exists
        user_nodes = storage.get_all_user_nodes()
        assert len(user_nodes) == 1
        assert user_nodes[0]["name"] == "My Custom Node"

        # Verify canvas has both
        canvas = storage.get_canvas()
        assert "custom-123" in canvas["visible_nodes"]
        assert "Module.theorem1" in canvas["visible_nodes"]

    def test_canvas_coexists_with_macros(self, storage, meta_path):
        """Canvas operations should not affect macros"""
        # Set up macros
        storage.set_macros({"\\R": "\\mathbb{R}"})

        # Set up canvas
        storage.set_visible_nodes(["Module.theorem1"])

        # Verify macros still exist
        macros = storage.get_macros()
        assert macros["\\R"] == "\\mathbb{R}"

        # Verify canvas exists
        canvas = storage.get_canvas()
        assert "Module.theorem1" in canvas["visible_nodes"]

    def test_clear_canvas_preserves_other_meta(self, storage, meta_path):
        """Clearing canvas should not affect other meta data"""
        # Set up various meta data
        storage.update_node_meta("Module.theorem1", notes="# Notes")
        storage.add_user_node("custom-1", "Custom", "custom")
        storage.set_macros({"\\N": "\\mathbb{N}"})

        # Set up and then clear canvas
        storage.set_visible_nodes(["Module.theorem1", "custom-1"])
        storage.set_positions({"Module.theorem1": {"x": 1, "y": 2, "z": 3}})
        storage.clear_canvas()

        # Verify other meta preserved
        assert storage.get_node_meta("Module.theorem1")["notes"] == "# Notes"
        assert len(storage.get_all_user_nodes()) == 1
        assert storage.get_macros()["\\N"] == "\\mathbb{N}"

        # Verify canvas cleared
        canvas = storage.get_canvas()
        assert canvas["visible_nodes"] == []
        assert canvas["positions"] == {}


class TestCanvasPersistence:
    """Test that canvas data is properly persisted"""

    def test_canvas_survives_reload(self, meta_path):
        """Canvas data should survive storage reload"""
        # Create storage and set data
        storage1 = UnifiedStorage(graph_data=MOCK_GRAPH_DATA, meta_path=meta_path)
        storage1.set_visible_nodes(["Module.theorem1", "Module.theorem2"])
        storage1.set_positions({"Module.theorem1": {"x": 1, "y": 2, "z": 3}})
        storage1.set_viewport({"camera_position": [10, 20, 30]})

        # Create new storage instance (simulates reload)
        storage2 = UnifiedStorage(graph_data=MOCK_GRAPH_DATA, meta_path=meta_path)
        canvas = storage2.get_canvas()

        assert set(canvas["visible_nodes"]) == {"Module.theorem1", "Module.theorem2"}
        assert canvas["positions"]["Module.theorem1"] == {"x": 1, "y": 2, "z": 3}
        assert canvas["viewport"]["camera_position"] == [10, 20, 30]

    def test_canvas_file_format(self, storage, meta_path):
        """Verify canvas is stored in correct JSON format (visible in nodes)"""
        storage.set_visible_nodes(["Module.theorem1"])
        storage.set_positions({"Module.theorem1": {"x": 1.5, "y": 2.5, "z": 3.5}})
        storage.set_viewport({
            "camera_position": [10, 20, 30],
            "camera_target": [0, 0, 0],
            "zoom": 1.5,
            "selected_node_id": "Module.theorem1",
        })

        with open(meta_path, "r") as f:
            data = json.load(f)

        # visible is now in nodes.<id>.visible
        assert "nodes" in data
        assert data["nodes"]["Module.theorem1"]["visible"] is True
        # positions and viewport are in canvas
        assert "canvas" in data
        assert data["canvas"]["positions"]["Module.theorem1"]["x"] == 1.5
        assert data["canvas"]["viewport"]["camera_position"] == [10, 20, 30]
        assert data["canvas"]["viewport"]["selected_node_id"] == "Module.theorem1"
