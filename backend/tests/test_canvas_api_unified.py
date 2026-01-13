"""
Test Canvas API Endpoints with UnifiedStorage Backend

These tests verify that the /api/canvas/* endpoints work correctly
when backed by UnifiedStorage instead of the old CanvasStore.

The API behavior should remain the same - only the storage backend changes.
"""

import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient


# We'll need to mock the project manager to return our test storage
# The actual import will depend on how server.py is structured


@pytest.fixture
def temp_project(tmp_path):
    """Create a temp project with required structure"""
    # Create .astrolabe directory
    astrolabe_dir = tmp_path / ".astrolabe"
    astrolabe_dir.mkdir()

    # Create minimal graph.json
    graph_file = astrolabe_dir / "graph.json"
    graph_file.write_text(json.dumps({
        "version": "1.0",
        "nodes": [
            {"id": "Module.theorem1", "name": "theorem1", "kind": "theorem"},
            {"id": "Module.theorem2", "name": "theorem2", "kind": "theorem"},
            {"id": "Module.lemma1", "name": "lemma1", "kind": "lemma"},
        ],
        "edges": []
    }))

    return tmp_path


@pytest.fixture
def project_path(temp_project):
    """Return project path as string"""
    return str(temp_project)


class TestGetCanvasAPI:
    """Test GET /api/canvas endpoint"""

    def test_get_canvas_empty(self, project_path):
        """Get canvas when no canvas data exists"""
        from astrolabe.server import app
        client = TestClient(app)

        response = client.get(f"/api/canvas?path={project_path}")

        assert response.status_code == 200
        data = response.json()
        assert "visible_nodes" in data
        assert "positions" in data
        assert data["visible_nodes"] == []

    def test_get_canvas_with_data(self, temp_project, project_path):
        """Get canvas when canvas data exists in meta.json"""
        # Pre-populate meta.json with canvas data
        meta_path = temp_project / ".astrolabe" / "meta.json"
        meta_path.write_text(json.dumps({
            "nodes": {},
            "edges": {},
            "canvas": {
                "visible_nodes": ["Module.theorem1", "Module.theorem2"],
                "positions": {
                    "Module.theorem1": {"x": 1, "y": 2, "z": 3}
                },
                "viewport": {
                    "camera_position": [10, 20, 30]
                }
            }
        }))

        from astrolabe.server import app
        client = TestClient(app)

        response = client.get(f"/api/canvas?path={project_path}")

        assert response.status_code == 200
        data = response.json()
        assert data["visible_nodes"] == ["Module.theorem1", "Module.theorem2"]
        assert data["positions"]["Module.theorem1"] == {"x": 1, "y": 2, "z": 3}


class TestSaveCanvasAPI:
    """Test POST /api/canvas endpoint"""

    def test_save_canvas_basic(self, project_path):
        """Save basic canvas state"""
        from astrolabe.server import app
        client = TestClient(app)

        payload = {
            "path": project_path,
            "visible_nodes": ["Module.theorem1"],
            "positions": {},
        }

        response = client.post("/api/canvas", json=payload)

        assert response.status_code == 200

        # Verify data was saved
        get_response = client.get(f"/api/canvas?path={project_path}")
        data = get_response.json()
        assert data["visible_nodes"] == ["Module.theorem1"]

    def test_save_canvas_with_positions(self, project_path):
        """Save canvas with positions"""
        from astrolabe.server import app
        client = TestClient(app)

        payload = {
            "path": project_path,
            "visible_nodes": ["Module.theorem1", "Module.theorem2"],
            "positions": {
                "Module.theorem1": {"x": 1.5, "y": 2.5, "z": 3.5},
                "Module.theorem2": {"x": 4.0, "y": 5.0, "z": 6.0},
            },
        }

        response = client.post("/api/canvas", json=payload)
        assert response.status_code == 200

        # Verify
        get_response = client.get(f"/api/canvas?path={project_path}")
        data = get_response.json()
        assert data["positions"]["Module.theorem1"]["x"] == 1.5


class TestAddToCanvasAPI:
    """Test POST /api/canvas/add endpoint"""

    def test_add_single_node(self, project_path):
        """Add a single node to canvas"""
        from astrolabe.server import app
        client = TestClient(app)

        payload = {
            "path": project_path,
            "node_id": "Module.theorem1",
        }

        response = client.post("/api/canvas/add", json=payload)
        assert response.status_code == 200

        # Verify node was added
        get_response = client.get(f"/api/canvas?path={project_path}")
        data = get_response.json()
        assert "Module.theorem1" in data["visible_nodes"]

    def test_add_node_idempotent(self, project_path):
        """Adding same node twice should not create duplicates"""
        from astrolabe.server import app
        client = TestClient(app)

        payload = {"path": project_path, "node_id": "Module.theorem1"}

        client.post("/api/canvas/add", json=payload)
        client.post("/api/canvas/add", json=payload)

        get_response = client.get(f"/api/canvas?path={project_path}")
        data = get_response.json()
        assert data["visible_nodes"].count("Module.theorem1") == 1


class TestBatchAddAPI:
    """Test POST /api/canvas/add-batch endpoint"""

    def test_add_batch_nodes(self, project_path):
        """Add multiple nodes at once"""
        from astrolabe.server import app
        client = TestClient(app)

        payload = {
            "path": project_path,
            "node_ids": ["Module.theorem1", "Module.theorem2", "Module.lemma1"],
        }

        response = client.post("/api/canvas/add-batch", json=payload)
        assert response.status_code == 200

        # Verify all nodes added
        get_response = client.get(f"/api/canvas?path={project_path}")
        data = get_response.json()
        assert len(data["visible_nodes"]) == 3


class TestRemoveFromCanvasAPI:
    """Test POST /api/canvas/remove endpoint"""

    def test_remove_node(self, project_path):
        """Remove a node from canvas"""
        from astrolabe.server import app
        client = TestClient(app)

        # First add nodes
        client.post("/api/canvas/add-batch", json={
            "path": project_path,
            "node_ids": ["Module.theorem1", "Module.theorem2"],
        })

        # Remove one
        response = client.post("/api/canvas/remove", json={
            "path": project_path,
            "node_id": "Module.theorem1",
        })
        assert response.status_code == 200

        # Verify removal
        get_response = client.get(f"/api/canvas?path={project_path}")
        data = get_response.json()
        assert "Module.theorem1" not in data["visible_nodes"]
        assert "Module.theorem2" in data["visible_nodes"]

    def test_remove_also_removes_position(self, project_path):
        """Removing node should also remove its position"""
        from astrolabe.server import app
        client = TestClient(app)

        # Add node with position
        client.post("/api/canvas", json={
            "path": project_path,
            "visible_nodes": ["Module.theorem1"],
            "positions": {"Module.theorem1": {"x": 1, "y": 2, "z": 3}},
        })

        # Remove node
        client.post("/api/canvas/remove", json={
            "path": project_path,
            "node_id": "Module.theorem1",
        })

        # Verify position also removed
        get_response = client.get(f"/api/canvas?path={project_path}")
        data = get_response.json()
        assert "Module.theorem1" not in data.get("positions", {})


class TestClearCanvasAPI:
    """Test POST /api/canvas/clear endpoint"""

    def test_clear_canvas(self, project_path):
        """Clear all canvas data"""
        from astrolabe.server import app
        client = TestClient(app)

        # First add some data
        client.post("/api/canvas", json={
            "path": project_path,
            "visible_nodes": ["Module.theorem1", "Module.theorem2"],
            "positions": {"Module.theorem1": {"x": 1, "y": 2, "z": 3}},
        })

        # Clear
        response = client.post(f"/api/canvas/clear?path={project_path}")
        assert response.status_code == 200

        # Verify cleared
        get_response = client.get(f"/api/canvas?path={project_path}")
        data = get_response.json()
        assert data["visible_nodes"] == []
        assert data["positions"] == {}


class TestUpdatePositionsAPI:
    """Test POST /api/canvas/positions endpoint"""

    def test_update_positions(self, project_path):
        """Update node positions"""
        from astrolabe.server import app
        client = TestClient(app)

        payload = {
            "path": project_path,
            "positions": {
                "Module.theorem1": {"x": 10, "y": 20, "z": 30},
                "Module.theorem2": {"x": 40, "y": 50, "z": 60},
            },
        }

        response = client.post("/api/canvas/positions", json=payload)
        assert response.status_code == 200

        # Verify
        get_response = client.get(f"/api/canvas?path={project_path}")
        data = get_response.json()
        assert data["positions"]["Module.theorem1"] == {"x": 10, "y": 20, "z": 30}

    def test_update_positions_partial(self, project_path):
        """Updating some positions should not affect others"""
        from astrolabe.server import app
        client = TestClient(app)

        # Set initial positions
        client.post("/api/canvas/positions", json={
            "path": project_path,
            "positions": {
                "Module.theorem1": {"x": 1, "y": 2, "z": 3},
                "Module.theorem2": {"x": 4, "y": 5, "z": 6},
            },
        })

        # Update only one
        client.post("/api/canvas/positions", json={
            "path": project_path,
            "positions": {
                "Module.theorem1": {"x": 100, "y": 200, "z": 300},
            },
        })

        # Verify
        get_response = client.get(f"/api/canvas?path={project_path}")
        data = get_response.json()
        assert data["positions"]["Module.theorem1"] == {"x": 100, "y": 200, "z": 300}
        assert data["positions"]["Module.theorem2"] == {"x": 4, "y": 5, "z": 6}


class TestGetViewportAPI:
    """Test GET /api/canvas/viewport endpoint"""

    def test_get_viewport_default(self, project_path):
        """Get default viewport"""
        from astrolabe.server import app
        client = TestClient(app)

        response = client.get(f"/api/canvas/viewport?path={project_path}")
        assert response.status_code == 200

        data = response.json()
        assert "camera_position" in data
        assert "camera_target" in data

    def test_get_viewport_with_data(self, temp_project, project_path):
        """Get viewport when data exists"""
        meta_path = temp_project / ".astrolabe" / "meta.json"
        meta_path.write_text(json.dumps({
            "canvas": {
                "visible_nodes": [],
                "positions": {},
                "viewport": {
                    "camera_position": [100, 200, 300],
                    "camera_target": [10, 20, 30],
                    "zoom": 2.5,
                    "selected_node_id": "Module.theorem1"
                }
            }
        }))

        from astrolabe.server import app
        client = TestClient(app)

        response = client.get(f"/api/canvas/viewport?path={project_path}")
        assert response.status_code == 200

        data = response.json()
        assert data["camera_position"] == [100, 200, 300]
        assert data["zoom"] == 2.5
        assert data["selected_node_id"] == "Module.theorem1"


class TestUpdateViewportAPI:
    """Test PATCH /api/canvas/viewport endpoint"""

    def test_update_viewport_full(self, project_path):
        """Update all viewport fields"""
        from astrolabe.server import app
        client = TestClient(app)

        payload = {
            "path": project_path,
            "camera_position": [10, 20, 30],
            "camera_target": [1, 2, 3],
            "zoom": 1.5,
            "selected_node_id": "Module.theorem1",
        }

        response = client.patch("/api/canvas/viewport", json=payload)
        assert response.status_code == 200

        # Verify
        get_response = client.get(f"/api/canvas/viewport?path={project_path}")
        data = get_response.json()
        assert data["camera_position"] == [10, 20, 30]
        assert data["selected_node_id"] == "Module.theorem1"

    def test_update_viewport_partial(self, project_path):
        """Update only some viewport fields"""
        from astrolabe.server import app
        client = TestClient(app)

        # Set initial
        client.patch("/api/canvas/viewport", json={
            "path": project_path,
            "camera_position": [10, 20, 30],
            "camera_target": [1, 2, 3],
            "zoom": 1.5,
        })

        # Update only camera_position
        client.patch("/api/canvas/viewport", json={
            "path": project_path,
            "camera_position": [100, 200, 300],
        })

        # Verify only camera_position changed
        get_response = client.get(f"/api/canvas/viewport?path={project_path}")
        data = get_response.json()
        assert data["camera_position"] == [100, 200, 300]
        assert data["camera_target"] == [1, 2, 3]  # Unchanged
        assert data["zoom"] == 1.5  # Unchanged


class TestAPIPreservesOtherMeta:
    """Test that canvas API operations preserve other meta data"""

    def test_canvas_api_preserves_node_meta(self, temp_project, project_path):
        """Canvas operations should not affect node notes/colors"""
        meta_path = temp_project / ".astrolabe" / "meta.json"
        meta_path.write_text(json.dumps({
            "nodes": {
                "Module.theorem1": {
                    "notes": "# Important",
                    "color": "#ff0000"
                }
            },
            "edges": {},
            "canvas": {
                "visible_nodes": [],
                "positions": {},
                "viewport": {}
            }
        }))

        from astrolabe.server import app
        client = TestClient(app)

        # Perform canvas operations
        client.post("/api/canvas/add", json={
            "path": project_path,
            "node_id": "Module.theorem1",
        })

        client.post("/api/canvas/positions", json={
            "path": project_path,
            "positions": {"Module.theorem1": {"x": 1, "y": 2, "z": 3}},
        })

        # Verify node meta preserved
        with open(meta_path, "r") as f:
            data = json.load(f)

        assert data["nodes"]["Module.theorem1"]["notes"] == "# Important"
        assert data["nodes"]["Module.theorem1"]["color"] == "#ff0000"
