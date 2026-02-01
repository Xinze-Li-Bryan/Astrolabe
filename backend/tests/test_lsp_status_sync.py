"""
Tests for syncing LSP status to meta.json

When lsp.json changes, the node statuses should be synced to meta.json
so the frontend can read from a single source.
"""

import pytest
import json
from pathlib import Path


def make_storage(tmp_path, graph_nodes=None):
    """Helper to create UnifiedStorage for testing"""
    from astrolabe.unified_storage import UnifiedStorage

    if graph_nodes is None:
        graph_nodes = []

    graph_data = {"nodes": graph_nodes, "edges": []}
    meta_path = tmp_path / ".astrolabe" / "meta.json"
    meta_path.parent.mkdir(parents=True, exist_ok=True)

    return UnifiedStorage(graph_data, meta_path, tmp_path)


class TestLSPStatusSync:
    """Test syncing LSP node statuses to meta.json"""

    def test_sync_lsp_statuses_to_meta(self, tmp_path):
        """LSP statuses should be written to meta.json"""
        storage = make_storage(tmp_path)

        # Sync some LSP statuses
        lsp_statuses = {
            "Foo.bar": "sorry",
            "Foo.baz": "proven",
            "Qux.error_func": "error",
        }

        storage.sync_lsp_statuses(lsp_statuses)

        # Check meta.json
        meta_path = tmp_path / ".astrolabe" / "meta.json"
        with open(meta_path) as f:
            meta = json.load(f)

        assert meta["nodes"]["Foo.bar"]["lsp_status"] == "sorry"
        assert meta["nodes"]["Foo.baz"]["lsp_status"] == "proven"
        assert meta["nodes"]["Qux.error_func"]["lsp_status"] == "error"

    def test_sync_preserves_other_meta(self, tmp_path):
        """Syncing LSP status should not overwrite other meta"""
        storage = make_storage(tmp_path)

        # Set some other meta first
        storage.update_node_meta("Foo.bar", color="#ff0000", notes="important")

        # Now sync LSP status
        storage.sync_lsp_statuses({"Foo.bar": "sorry"})

        # Check both are preserved
        meta_path = tmp_path / ".astrolabe" / "meta.json"
        with open(meta_path) as f:
            meta = json.load(f)

        assert meta["nodes"]["Foo.bar"]["color"] == "#ff0000"
        assert meta["nodes"]["Foo.bar"]["notes"] == "important"
        assert meta["nodes"]["Foo.bar"]["lsp_status"] == "sorry"

    def test_sync_updates_existing_status(self, tmp_path):
        """Syncing should update existing LSP status"""
        storage = make_storage(tmp_path)

        # First sync
        storage.sync_lsp_statuses({"Foo.bar": "sorry"})

        # Second sync with updated status
        storage.sync_lsp_statuses({"Foo.bar": "proven"})

        # Check updated
        meta_path = tmp_path / ".astrolabe" / "meta.json"
        with open(meta_path) as f:
            meta = json.load(f)

        assert meta["nodes"]["Foo.bar"]["lsp_status"] == "proven"

    def test_get_node_with_lsp_status(self, tmp_path):
        """Getting node should include LSP status"""
        storage = make_storage(tmp_path)
        storage.sync_lsp_statuses({"Foo.bar": "sorry"})

        node = storage.get_node("Foo.bar")

        assert node is not None
        assert node.get("lsp_status") == "sorry"


class TestLSPCacheToMetaSync:
    """Test syncing from LSP cache to meta.json"""

    def test_sync_from_lsp_cache(self, tmp_path):
        """Sync all node statuses from LSP cache to meta"""
        from astrolabe.lsp_cache import LSPCache

        # Create LSP cache with node statuses
        cache = LSPCache()
        cache.add_file_symbols("/path/to/test.lean", [
            {
                "name": "myTheorem",
                "kind": 12,
                "range": {"start": {"line": 10}, "end": {"line": 20}},
            }
        ])
        cache.add_file_diagnostics("/path/to/test.lean", [
            {
                "range": {"start": {"line": 15}},
                "severity": 2,
                "message": "declaration uses 'sorry'"
            }
        ])
        cache.compute_all_node_statuses()

        # Save LSP cache
        lsp_path = tmp_path / ".astrolabe" / "lsp.json"
        cache.save(lsp_path)

        # Create storage and sync from LSP
        storage = make_storage(tmp_path)
        storage.sync_from_lsp_cache(lsp_path)

        # Check meta.json
        meta_path = tmp_path / ".astrolabe" / "meta.json"
        with open(meta_path) as f:
            meta = json.load(f)

        assert meta["nodes"]["myTheorem"]["lsp_status"] == "sorry"


class TestStatusPriority:
    """Test that LSP status takes priority over graph status"""

    def test_lsp_status_overrides_graph_status(self, tmp_path):
        """LSP status should be used over graph.json status"""
        storage = make_storage(tmp_path)

        # Simulate graph.json status (from .ilean)
        graph_status = "sorry"

        # LSP says it's now proven
        storage.sync_lsp_statuses({"Foo.bar": "proven"})

        # Get effective status
        effective = storage.get_effective_status("Foo.bar", graph_status)

        # LSP wins
        assert effective == "proven"

    def test_fallback_to_graph_status(self, tmp_path):
        """If no LSP status, use graph status"""
        storage = make_storage(tmp_path)

        # No LSP sync done
        graph_status = "sorry"

        effective = storage.get_effective_status("Foo.bar", graph_status)

        # Falls back to graph
        assert effective == "sorry"
