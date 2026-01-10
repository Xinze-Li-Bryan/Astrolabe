"""
Test Canvas API endpoints for 3D position functionality

Ensure:
- POST /api/canvas/positions receives and saves 3D coordinates {x, y, z}
- GET /api/canvas returns 3D positions
- Position updates don't affect other nodes
"""

import pytest
from fastapi.testclient import TestClient
from astrolabe.server import app
from astrolabe.canvas import CanvasStore


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


@pytest.fixture
def project_with_canvas(tmp_path):
    """Create a test project with canvas data"""
    # Create .astrolabe directory
    astrolabe_dir = tmp_path / ".astrolabe"
    astrolabe_dir.mkdir()

    # Initialize canvas and add some nodes
    store = CanvasStore(str(tmp_path))
    store.add_node("node_1")
    store.add_node("node_2")
    store.add_node("node_3")

    return str(tmp_path)


class TestCanvasPositionsAPI:
    """Test POST /api/canvas/positions endpoint"""

    def test_save_3d_positions(self, client, project_with_canvas):
        """
        POST /api/canvas/positions should receive and save 3D coordinates

        Request format:
        {
            "path": "/project/path",
            "positions": {
                "node_1": {"x": 10.0, "y": 20.0, "z": 30.0}
            }
        }
        """
        response = client.post(
            "/api/canvas/positions",
            json={
                "path": project_with_canvas,
                "positions": {
                    "node_1": {"x": 10.0, "y": 20.0, "z": 30.0},
                    "node_2": {"x": 40.0, "y": 50.0, "z": 60.0},
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["updated"] == 2

        # Verify saved positions include z coordinate
        assert "positions" in data
        assert data["positions"]["node_1"] == {"x": 10.0, "y": 20.0, "z": 30.0}
        assert data["positions"]["node_2"] == {"x": 40.0, "y": 50.0, "z": 60.0}

    def test_save_positions_returns_all_positions(self, client, project_with_canvas):
        """
        After saving partial node positions, response should return all node positions
        """
        # First save node_1's position
        client.post(
            "/api/canvas/positions",
            json={
                "path": project_with_canvas,
                "positions": {"node_1": {"x": 1.0, "y": 2.0, "z": 3.0}},
            },
        )

        # Then save node_2's position
        response = client.post(
            "/api/canvas/positions",
            json={
                "path": project_with_canvas,
                "positions": {"node_2": {"x": 4.0, "y": 5.0, "z": 6.0}},
            },
        )

        data = response.json()

        # Response should contain all saved positions
        assert "node_1" in data["positions"]
        assert "node_2" in data["positions"]
        assert data["positions"]["node_1"] == {"x": 1.0, "y": 2.0, "z": 3.0}
        assert data["positions"]["node_2"] == {"x": 4.0, "y": 5.0, "z": 6.0}

    def test_partial_position_update_preserves_others(self, client, project_with_canvas):
        """
        Updating partial node positions should not affect other node positions
        """
        # First save all node positions
        client.post(
            "/api/canvas/positions",
            json={
                "path": project_with_canvas,
                "positions": {
                    "node_1": {"x": 100.0, "y": 200.0, "z": 300.0},
                    "node_2": {"x": 400.0, "y": 500.0, "z": 600.0},
                },
            },
        )

        # Only update node_1
        response = client.post(
            "/api/canvas/positions",
            json={
                "path": project_with_canvas,
                "positions": {"node_1": {"x": 999.0, "y": 888.0, "z": 777.0}},
            },
        )

        data = response.json()

        # node_1 should be updated
        assert data["positions"]["node_1"] == {"x": 999.0, "y": 888.0, "z": 777.0}
        # node_2 should remain unchanged
        assert data["positions"]["node_2"] == {"x": 400.0, "y": 500.0, "z": 600.0}

    def test_save_position_with_negative_coordinates(self, client, project_with_canvas):
        """
        Should correctly handle negative coordinate values
        """
        response = client.post(
            "/api/canvas/positions",
            json={
                "path": project_with_canvas,
                "positions": {
                    "node_1": {"x": -10.5, "y": -20.5, "z": -30.5},
                },
            },
        )

        data = response.json()
        assert data["positions"]["node_1"] == {"x": -10.5, "y": -20.5, "z": -30.5}

    def test_save_position_with_zero_z(self, client, project_with_canvas):
        """
        z=0 should be correctly saved (should not be ignored)
        """
        response = client.post(
            "/api/canvas/positions",
            json={
                "path": project_with_canvas,
                "positions": {
                    "node_1": {"x": 10.0, "y": 20.0, "z": 0.0},
                },
            },
        )

        data = response.json()
        pos = data["positions"]["node_1"]
        assert pos["z"] == 0.0


class TestCanvasLoadAPI:
    """Test GET /api/canvas returns 3D positions"""

    def test_load_returns_3d_positions(self, client, project_with_canvas):
        """
        GET /api/canvas should return 3D position format {x, y, z}
        """
        # First save some 3D positions
        store = CanvasStore(project_with_canvas)
        store.update_position("node_1", 10.0, 20.0, 30.0)
        store.update_position("node_2", 40.0, 50.0, 60.0)

        # Load canvas
        response = client.get(
            f"/api/canvas?path={project_with_canvas}"
        )

        assert response.status_code == 200
        data = response.json()

        # Verify positions are in 3D format
        assert "positions" in data
        assert data["positions"]["node_1"] == {"x": 10.0, "y": 20.0, "z": 30.0}
        assert data["positions"]["node_2"] == {"x": 40.0, "y": 50.0, "z": 60.0}

    def test_load_empty_canvas_returns_empty_positions(self, client, tmp_path):
        """
        Empty canvas should return empty positions object
        """
        # Create empty .astrolabe directory
        (tmp_path / ".astrolabe").mkdir()

        response = client.get(
            f"/api/canvas?path={str(tmp_path)}"
        )

        assert response.status_code == 200
        data = response.json()

        assert data["visible_nodes"] == []
        assert data["positions"] == {}

    def test_load_canvas_includes_all_fields(self, client, project_with_canvas):
        """
        GET /api/canvas response should include all necessary fields
        """
        response = client.get(
            f"/api/canvas?path={project_with_canvas}"
        )

        data = response.json()

        # Necessary fields
        assert "visible_nodes" in data
        assert "positions" in data
        assert isinstance(data["visible_nodes"], list)
        assert isinstance(data["positions"], dict)


class TestCanvasAddNodeAPI:
    """Test POST /api/canvas/add returned position format"""

    def test_add_node_returns_positions_field(self, client, project_with_canvas):
        """
        Response after adding node should include positions field
        """
        # First set some positions
        store = CanvasStore(project_with_canvas)
        store.update_position("node_1", 1.0, 2.0, 3.0)

        # Add new node
        response = client.post(
            "/api/canvas/add",
            json={
                "path": project_with_canvas,
                "node_id": "new_node",
            },
        )

        assert response.status_code == 200
        data = response.json()

        # Response should contain positions
        assert "positions" in data
        # Existing positions should be preserved
        assert data["positions"]["node_1"] == {"x": 1.0, "y": 2.0, "z": 3.0}


class TestCanvasRemoveNodeAPI:
    """Test POST /api/canvas/remove position cleanup"""

    def test_remove_node_removes_its_position(self, client, project_with_canvas):
        """
        When removing a node, its position should also be removed
        """
        # First set positions
        store = CanvasStore(project_with_canvas)
        store.update_position("node_1", 1.0, 2.0, 3.0)
        store.update_position("node_2", 4.0, 5.0, 6.0)

        # Remove node_1
        response = client.post(
            "/api/canvas/remove",
            json={
                "path": project_with_canvas,
                "node_id": "node_1",
            },
        )

        data = response.json()

        # node_1's position should be removed
        assert "node_1" not in data["positions"]
        # node_2's position should be preserved
        assert data["positions"]["node_2"] == {"x": 4.0, "y": 5.0, "z": 6.0}


class TestViewportSelectedEdge:
    """Test viewport selected_edge_id persistence"""

    def test_save_selected_edge_id(self, client, project_with_canvas):
        """
        PATCH /api/canvas/viewport should be able to save selected_edge_id
        """
        response = client.patch(
            "/api/canvas/viewport",
            json={
                "path": project_with_canvas,
                "selected_edge_id": "node_1->node_2",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["viewport"]["selected_edge_id"] == "node_1->node_2"

    def test_load_selected_edge_id(self, client, project_with_canvas):
        """
        GET /api/canvas/viewport should return saved selected_edge_id
        """
        # First save
        client.patch(
            "/api/canvas/viewport",
            json={
                "path": project_with_canvas,
                "selected_edge_id": "node_2->node_3",
            },
        )

        # Then load
        response = client.get(
            f"/api/canvas/viewport?path={project_with_canvas}"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["selected_edge_id"] == "node_2->node_3"

    def test_clear_selected_edge_id(self, client, project_with_canvas):
        """
        selected_edge_id should be cleared when set to empty string
        """
        # First save a value
        client.patch(
            "/api/canvas/viewport",
            json={
                "path": project_with_canvas,
                "selected_edge_id": "node_1->node_2",
            },
        )

        # Clear by setting to empty string
        response = client.patch(
            "/api/canvas/viewport",
            json={
                "path": project_with_canvas,
                "selected_edge_id": "",
            },
        )

        assert response.status_code == 200
        data = response.json()
        # selected_edge_id should not exist (empty string not output)
        assert data["viewport"].get("selected_edge_id") is None

    def test_save_both_selected_node_and_edge(self, client, project_with_canvas):
        """
        Should be able to save both selected_node_id and selected_edge_id simultaneously
        """
        response = client.patch(
            "/api/canvas/viewport",
            json={
                "path": project_with_canvas,
                "selected_node_id": "node_1",
                "selected_edge_id": "node_1->node_2",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["viewport"]["selected_node_id"] == "node_1"
        assert data["viewport"]["selected_edge_id"] == "node_1->node_2"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
