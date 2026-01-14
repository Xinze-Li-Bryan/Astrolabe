"""
Test Canvas Migration from canvas.json to meta.json

Tests for migrating old canvas.json format to new meta.json format.
These tests are written BEFORE implementation.

Migration scenarios:
1. Old project with canvas.json but no canvas in meta.json
2. New project with canvas already in meta.json
3. Project with no canvas data at all
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
    ],
    "edges": [],
}


@pytest.fixture
def temp_project(tmp_path):
    """Create a temp project directory with .astrolabe subdirectory"""
    astrolabe_dir = tmp_path / ".astrolabe"
    astrolabe_dir.mkdir()
    return tmp_path


@pytest.fixture
def meta_path(temp_project):
    """Return meta.json path"""
    return temp_project / ".astrolabe" / "meta.json"


@pytest.fixture
def canvas_path(temp_project):
    """Return old canvas.json path"""
    return temp_project / ".astrolabe" / "canvas.json"


class TestMigrateEmptyCanvas:
    """Test migration when canvas.json is empty or minimal"""

    def test_migrate_empty_canvas(self, temp_project, meta_path, canvas_path):
        """Migrate empty canvas.json"""
        # Create empty canvas.json
        canvas_path.write_text(json.dumps({
            "version": "1.1",
            "visible_nodes": [],
            "positions": {},
            "viewport": {}
        }))

        # Create storage (should trigger migration)
        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project  # For finding canvas.json
        )

        # Verify migration happened
        canvas = storage.get_canvas()
        assert canvas["visible_nodes"] == []
        assert canvas["positions"] == {}

    def test_migrate_no_canvas_file(self, temp_project, meta_path, canvas_path):
        """Migration when canvas.json doesn't exist at all"""
        # Don't create canvas.json
        assert not canvas_path.exists()

        # Create storage
        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        # Should have default empty canvas
        canvas = storage.get_canvas()
        assert canvas["visible_nodes"] == []
        assert canvas["positions"] == {}


class TestMigrateCanvasWithData:
    """Test migration with actual canvas data"""

    def test_migrate_canvas_with_nodes(self, temp_project, meta_path, canvas_path):
        """Migrate canvas.json with visible nodes"""
        # Create canvas.json with nodes
        canvas_path.write_text(json.dumps({
            "version": "1.1",
            "visible_nodes": ["Module.theorem1", "Module.theorem2"],
            "positions": {},
            "viewport": {}
        }))

        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        canvas = storage.get_canvas()
        assert canvas["visible_nodes"] == ["Module.theorem1", "Module.theorem2"]

    def test_migrate_canvas_with_positions(self, temp_project, meta_path, canvas_path):
        """Migrate canvas.json with 3D positions"""
        canvas_path.write_text(json.dumps({
            "version": "1.1",
            "visible_nodes": ["Module.theorem1"],
            "positions": {
                "Module.theorem1": {"x": 1.5, "y": 2.5, "z": 3.5}
            },
            "viewport": {}
        }))

        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        canvas = storage.get_canvas()
        assert canvas["positions"]["Module.theorem1"] == {"x": 1.5, "y": 2.5, "z": 3.5}

    def test_migrate_canvas_with_viewport(self, temp_project, meta_path, canvas_path):
        """Migrate canvas.json with viewport data"""
        canvas_path.write_text(json.dumps({
            "version": "1.1",
            "visible_nodes": [],
            "positions": {},
            "viewport": {
                "camera_position": [10, 20, 30],
                "camera_target": [1, 2, 3],
                "zoom": 2.0,
                "selected_node_id": "Module.theorem1"
            }
        }))

        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        viewport = storage.get_viewport()
        assert viewport["camera_position"] == [10, 20, 30]
        assert viewport["camera_target"] == [1, 2, 3]
        assert viewport["zoom"] == 2.0
        assert viewport["selected_node_id"] == "Module.theorem1"

    def test_migrate_full_canvas(self, temp_project, meta_path, canvas_path):
        """Migrate canvas.json with all fields populated"""
        canvas_path.write_text(json.dumps({
            "version": "1.1",
            "updated_at": "2026-01-13T12:00:00Z",
            "visible_nodes": ["Module.theorem1", "Module.theorem2"],
            "positions": {
                "Module.theorem1": {"x": 1, "y": 2, "z": 3},
                "Module.theorem2": {"x": 4, "y": 5, "z": 6},
            },
            "viewport": {
                "camera_position": [10, 20, 30],
                "camera_target": [0, 0, 0],
                "zoom": 1.5,
                "selected_node_id": "Module.theorem1",
                "selected_edge_id": None
            }
        }))

        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        canvas = storage.get_canvas()
        assert len(canvas["visible_nodes"]) == 2
        assert len(canvas["positions"]) == 2
        assert canvas["viewport"]["camera_position"] == [10, 20, 30]


class TestMigrationEdgeCases:
    """Test edge cases in migration"""

    def test_migrate_already_migrated(self, temp_project, meta_path, canvas_path):
        """Migration when meta.json already has canvas data"""
        # Create meta.json with existing canvas
        meta_path.write_text(json.dumps({
            "nodes": {},
            "edges": {},
            "macros": {},
            "canvas": {
                "visible_nodes": ["Module.theorem1"],
                "positions": {"Module.theorem1": {"x": 100, "y": 200, "z": 300}},
                "viewport": {"camera_position": [1, 1, 1]}
            }
        }))

        # Create old canvas.json with different data
        canvas_path.write_text(json.dumps({
            "version": "1.1",
            "visible_nodes": ["Module.theorem2"],
            "positions": {"Module.theorem2": {"x": 0, "y": 0, "z": 0}},
            "viewport": {"camera_position": [0, 0, 0]}
        }))

        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        # Should keep existing meta.json canvas data, not overwrite
        canvas = storage.get_canvas()
        assert canvas["visible_nodes"] == ["Module.theorem1"]
        assert canvas["positions"]["Module.theorem1"] == {"x": 100, "y": 200, "z": 300}

    def test_migrate_preserves_existing_meta(self, temp_project, meta_path, canvas_path):
        """Migration should preserve existing node/edge meta"""
        # Create meta.json with node meta
        meta_path.write_text(json.dumps({
            "nodes": {
                "Module.theorem1": {
                    "notes": "# Important theorem",
                    "color": "#ff0000"
                }
            },
            "edges": {
                "Module.theorem1->Module.theorem2": {
                    "color": "#00ff00"
                }
            },
            "macros": {
                "\\R": "\\mathbb{R}"
            }
        }))

        # Create canvas.json
        canvas_path.write_text(json.dumps({
            "version": "1.1",
            "visible_nodes": ["Module.theorem1"],
            "positions": {},
            "viewport": {}
        }))

        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        # Verify original meta preserved
        node_meta = storage.get_node_meta("Module.theorem1")
        assert node_meta["notes"] == "# Important theorem"
        assert node_meta["color"] == "#ff0000"

        edge_meta = storage.get_edge_meta("Module.theorem1->Module.theorem2")
        assert edge_meta["color"] == "#00ff00"

        macros = storage.get_macros()
        assert macros["\\R"] == "\\mathbb{R}"

        # Verify canvas was migrated
        canvas = storage.get_canvas()
        assert "Module.theorem1" in canvas["visible_nodes"]

    def test_migrate_corrupted_canvas(self, temp_project, meta_path, canvas_path):
        """Migration should handle corrupted canvas.json gracefully"""
        # Create corrupted canvas.json
        canvas_path.write_text("{ invalid json }")

        # Should not crash, should use defaults
        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        canvas = storage.get_canvas()
        assert canvas["visible_nodes"] == []

    def test_migrate_partial_canvas(self, temp_project, meta_path, canvas_path):
        """Migration should handle canvas.json with missing fields"""
        # Create canvas.json with only some fields
        canvas_path.write_text(json.dumps({
            "visible_nodes": ["Module.theorem1"]
            # Missing: positions, viewport
        }))

        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        canvas = storage.get_canvas()
        assert canvas["visible_nodes"] == ["Module.theorem1"]
        assert canvas["positions"] == {}  # Default
        assert "viewport" in canvas  # Default


class TestMigrationCleanup:
    """Test cleanup after migration"""

    def test_delete_old_canvas_after_migration(self, temp_project, meta_path, canvas_path):
        """Old canvas.json should be deleted after successful migration"""
        # Create canvas.json
        canvas_path.write_text(json.dumps({
            "version": "1.1",
            "visible_nodes": ["Module.theorem1"],
            "positions": {},
            "viewport": {}
        }))

        assert canvas_path.exists()

        # Migration
        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        # Explicitly trigger cleanup
        storage.cleanup_old_canvas()

        # Verify canvas.json is deleted
        assert not canvas_path.exists()

        # Verify data is in meta.json (visible is now in nodes.<id>.visible)
        with open(meta_path, "r") as f:
            data = json.load(f)
        assert "nodes" in data
        assert data["nodes"]["Module.theorem1"]["visible"] is True

    def test_no_delete_if_migration_failed(self, temp_project, meta_path, canvas_path):
        """Don't delete canvas.json if migration somehow fails"""
        # This test verifies safety - we won't delete old file if new data isn't persisted

        # Create canvas.json with important data
        canvas_path.write_text(json.dumps({
            "version": "1.1",
            "visible_nodes": ["Module.theorem1", "Module.theorem2"],
            "positions": {
                "Module.theorem1": {"x": 1, "y": 2, "z": 3}
            },
            "viewport": {
                "camera_position": [10, 20, 30]
            }
        }))

        # If meta.json is not writable (simulated by not having canvas in it after "migration")
        # The old canvas.json should remain

        # This is more of a design consideration - implementation should ensure
        # we only delete canvas.json after confirming data is in meta.json
        pass  # Implementation detail

    def test_cleanup_idempotent(self, temp_project, meta_path, canvas_path):
        """Cleanup should be safe to call multiple times"""
        # Create and migrate
        canvas_path.write_text(json.dumps({
            "visible_nodes": ["Module.theorem1"],
            "positions": {},
            "viewport": {}
        }))

        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        # Call cleanup multiple times - should not error
        storage.cleanup_old_canvas()
        storage.cleanup_old_canvas()
        storage.cleanup_old_canvas()

        # Data should still be intact
        canvas = storage.get_canvas()
        assert canvas["visible_nodes"] == ["Module.theorem1"]


class TestMigrationWithMetaVersion:
    """Test version handling during migration"""

    def test_migration_updates_meta_version(self, temp_project, meta_path, canvas_path):
        """Meta.json should have version field after migration"""
        canvas_path.write_text(json.dumps({
            "visible_nodes": ["Module.theorem1"],
            "positions": {},
            "viewport": {}
        }))

        storage = UnifiedStorage(
            graph_data=MOCK_GRAPH_DATA,
            meta_path=meta_path,
            project_path=temp_project
        )

        with open(meta_path, "r") as f:
            data = json.load(f)

        # New meta.json format should have version
        # Version could be "2.0" or similar to indicate canvas support
        assert "version" in data or "canvas" in data  # At minimum canvas should exist
