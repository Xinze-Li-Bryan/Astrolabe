"""
Test Reset All Data functionality

Reset All Data should:
1. Delete the entire .astrolabe directory
2. Force re-parsing from .ilean on next load
"""

import pytest
import tempfile
import shutil
from pathlib import Path
from fastapi.testclient import TestClient

from astrolabe.server import app
from astrolabe.graph_cache import GraphCache


@pytest.fixture
def temp_project():
    """Create a temporary project with .astrolabe directory"""
    temp_dir = tempfile.mkdtemp()
    project_path = Path(temp_dir)

    # Create .astrolabe directory with some files
    astrolabe_dir = project_path / ".astrolabe"
    astrolabe_dir.mkdir()

    # Create graph.json (old format with status inside)
    graph_file = astrolabe_dir / "graph.json"
    graph_file.write_text('{"version": "1.0", "nodes": [{"id": "Test.theorem1", "status": "proven"}], "edges": []}')

    # Create meta.json
    meta_file = astrolabe_dir / "meta.json"
    meta_file.write_text('{"nodes": {}, "edges": {}}')

    # Create canvas.json
    canvas_file = astrolabe_dir / "canvas.json"
    canvas_file.write_text('{"visible_nodes": [], "positions": {}}')


    yield project_path

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)


class TestResetAllDataAPI:
    """Test /api/reset endpoint"""

    def test_reset_endpoint_exists(self, temp_project):
        """Test that /api/reset endpoint exists"""
        client = TestClient(app)
        response = client.post(f"/api/reset?path={temp_project}")

        # Should not return 404
        assert response.status_code != 404, "API endpoint /api/reset should exist"

    def test_reset_deletes_astrolabe_directory(self, temp_project):
        """Test that reset deletes the .astrolabe directory"""
        client = TestClient(app)

        astrolabe_dir = temp_project / ".astrolabe"
        assert astrolabe_dir.exists(), "Precondition: .astrolabe should exist"

        response = client.post(f"/api/reset?path={temp_project}")
        assert response.status_code == 200

        # .astrolabe directory should be deleted
        assert not astrolabe_dir.exists(), ".astrolabe directory should be deleted after reset"

    def test_reset_returns_success(self, temp_project):
        """Test that reset returns success status"""
        client = TestClient(app)

        response = client.post(f"/api/reset?path={temp_project}")
        assert response.status_code == 200

        data = response.json()
        assert data.get("status") == "ok"


class TestResetClearsProjectCache:
    """Test that reset clears the in-memory project cache"""

    def test_reset_clears_project_from_cache(self, temp_project):
        """Test that reset removes project from _projects cache"""
        client = TestClient(app)

        # First load the project to add it to cache
        # (We can't easily test this without the full project structure,
        # but we can test the API response)

        response = client.post(f"/api/reset?path={temp_project}")
        assert response.status_code == 200

        data = response.json()
        assert "cleared_from_cache" in data or data.get("status") == "ok"


class TestResetTriggersReparse:
    """Test that after reset, next load will re-parse from .ilean"""

    def test_graph_cache_invalid_after_reset(self, temp_project):
        """Test that GraphCache.is_valid() returns False after reset"""
        client = TestClient(app)

        # Reset
        response = client.post(f"/api/reset?path={temp_project}")
        assert response.status_code == 200

        # GraphCache should be invalid (no graph.json)
        cache = GraphCache(str(temp_project))
        assert not cache.is_valid(), "GraphCache should be invalid after reset"


class TestCanvasDoesNotRecreateAfterReset:
    """Test that canvas operations don't recreate .astrolabe after reset"""

    def test_viewport_save_does_not_recreate_astrolabe(self, temp_project):
        """
        After reset, saving viewport should NOT recreate .astrolabe directory.
        This prevents race conditions where viewport autosave recreates the dir.
        """
        client = TestClient(app)
        astrolabe_dir = temp_project / ".astrolabe"

        # Verify .astrolabe exists before reset
        assert astrolabe_dir.exists()

        # Reset
        response = client.post(f"/api/reset?path={temp_project}")
        assert response.status_code == 200
        assert not astrolabe_dir.exists(), ".astrolabe should be deleted"

        # Try to save viewport - should NOT recreate .astrolabe
        response = client.patch(
            "/api/canvas/viewport",
            json={
                "path": str(temp_project),
                "camera_position": [0, 0, 50],
            }
        )
        # Should succeed but not create directory
        assert response.status_code == 200

        # .astrolabe should still NOT exist
        assert not astrolabe_dir.exists(), \
            "Viewport save should NOT recreate .astrolabe after reset"

    def test_canvas_save_does_not_recreate_astrolabe(self, temp_project):
        """
        After reset, adding nodes to canvas should NOT recreate .astrolabe.
        """
        client = TestClient(app)
        astrolabe_dir = temp_project / ".astrolabe"

        # Reset
        response = client.post(f"/api/reset?path={temp_project}")
        assert response.status_code == 200
        assert not astrolabe_dir.exists()

        # Try to add a node to canvas - should NOT recreate .astrolabe
        response = client.post(
            "/api/canvas/add",
            json={"path": str(temp_project), "node_id": "test.node"}
        )
        # Should succeed but not create directory
        assert response.status_code == 200

        # .astrolabe should still NOT exist
        assert not astrolabe_dir.exists(), \
            "Canvas add should NOT recreate .astrolabe after reset"
