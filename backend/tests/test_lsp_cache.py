"""
Tests for LSP Cache - complete storage of Lean LSP information

The LSP cache stores:
1. Document symbols (all declarations with hierarchy)
2. Diagnostics (errors, warnings, etc.)
3. Namespace index (extracted from symbols for fast lookup)

File format (.astrolabe/lsp.json):
{
    "version": 2,
    "built_at": "2026-02-01T16:00:00Z",
    "files": {
        "/path/to/file.lean": {
            "symbols": [...],
            "diagnostics": [...]
        }
    },
    "namespaces": {...}  // Fast lookup index
}
"""

import pytest
import json
from pathlib import Path
from datetime import datetime


class TestLSPCacheStructure:
    """Test the LSP cache data structure"""

    def test_cache_version_2_structure(self, tmp_path):
        """Test new version 2 cache structure"""
        from astrolabe.lsp_cache import (
            LSPCache,
            LSP_CACHE_VERSION,
        )

        cache = LSPCache()

        # Add a file with symbols and diagnostics
        cache.add_file_symbols("/path/to/test.lean", [
            {
                "name": "TestNamespace",
                "kind": 3,  # namespace
                "range": {"start": {"line": 10, "character": 0}, "end": {"line": 50, "character": 3}},
                "selectionRange": {"start": {"line": 10, "character": 10}, "end": {"line": 10, "character": 23}},
                "children": [
                    {
                        "name": "foo",
                        "kind": 12,  # function
                        "range": {"start": {"line": 12, "character": 0}, "end": {"line": 15, "character": 5}},
                        "selectionRange": {"start": {"line": 12, "character": 4}, "end": {"line": 12, "character": 7}},
                    }
                ]
            }
        ])

        cache.add_file_diagnostics("/path/to/test.lean", [
            {
                "range": {"start": {"line": 20, "character": 0}, "end": {"line": 20, "character": 10}},
                "severity": 1,  # error
                "message": "unknown identifier 'foo'",
                "source": "lean4"
            }
        ])

        # Save and reload
        cache_path = tmp_path / "lsp.json"
        cache.save(cache_path)

        loaded = LSPCache.load(cache_path)

        assert loaded.version == LSP_CACHE_VERSION
        assert loaded.built_at is not None
        assert "/path/to/test.lean" in loaded.files
        assert len(loaded.files["/path/to/test.lean"]["symbols"]) == 1
        assert len(loaded.files["/path/to/test.lean"]["diagnostics"]) == 1

    def test_namespace_index_extraction(self, tmp_path):
        """Test that namespace index is automatically extracted from symbols"""
        from astrolabe.lsp_cache import LSPCache

        cache = LSPCache()

        # Add symbols with namespaces
        cache.add_file_symbols("/path/to/test.lean", [
            {
                "name": "Foo",
                "kind": 3,  # namespace
                "range": {"start": {"line": 10, "character": 0}, "end": {"line": 50, "character": 3}},
                "selectionRange": {"start": {"line": 10, "character": 10}, "end": {"line": 10, "character": 13}},
                "children": [
                    {
                        "name": "Bar",
                        "kind": 3,  # nested namespace
                        "range": {"start": {"line": 20, "character": 0}, "end": {"line": 30, "character": 3}},
                        "selectionRange": {"start": {"line": 20, "character": 10}, "end": {"line": 20, "character": 13}},
                    }
                ]
            }
        ])

        # Rebuild namespace index
        cache.rebuild_namespace_index()

        assert "Foo" in cache.namespaces
        assert cache.namespaces["Foo"]["line_number"] == 11  # 1-indexed
        assert "Foo.Bar" in cache.namespaces
        assert cache.namespaces["Foo.Bar"]["line_number"] == 21

    def test_backward_compatibility_v1(self, tmp_path):
        """Test loading version 1 cache (old format)"""
        from astrolabe.lsp_cache import LSPCache

        # Write old format
        old_cache = {
            "version": 1,
            "namespaces": {
                "Foo": {"name": "Foo", "file_path": "/path/to/test.lean", "line_number": 10, "is_explicit": True}
            }
        }

        cache_path = tmp_path / "lsp.json"
        with open(cache_path, "w") as f:
            json.dump(old_cache, f)

        # Load should upgrade to v2 structure
        loaded = LSPCache.load(cache_path)

        # Namespaces should be preserved
        assert "Foo" in loaded.namespaces
        assert loaded.namespaces["Foo"]["line_number"] == 10


class TestLSPCacheIntegration:
    """Integration tests with real Lean projects"""

    @pytest.fixture
    def real_lean_project(self):
        """Get a real Lean project for testing"""
        test_paths = [
            Path.home() / "LeanProjs" / "sphere-eversion",
            Path.home() / "LeanProjs" / "Lean-QuantumInfo",
        ]
        for path in test_paths:
            if (path / "lakefile.toml").exists() or (path / "lakefile.lean").exists():
                return path
        pytest.skip("No real Lean project found")

    @pytest.mark.asyncio
    async def test_build_complete_cache(self, real_lean_project):
        """Test building complete LSP cache with symbols and diagnostics"""
        from astrolabe.lsp_cache import build_lsp_cache
        from astrolabe.project import Project

        # Load project to get file list
        project = Project(str(real_lean_project))
        await project.load()

        # Get unique files
        files = set()
        for node in project.nodes.values():
            if node.file_path:
                files.add(node.file_path)

        # Build cache (limit to first 3 files for speed)
        file_list = list(files)[:3]
        cache = await build_lsp_cache(real_lean_project, file_list)

        print(f"\nBuilt cache with {len(cache.files)} files")
        print(f"Namespaces: {len(cache.namespaces)}")

        # Check structure
        assert cache.version >= 2
        assert cache.built_at is not None

        for file_path, file_data in cache.files.items():
            print(f"\n{Path(file_path).name}:")
            print(f"  Symbols: {len(file_data.get('symbols', []))}")
            print(f"  Diagnostics: {len(file_data.get('diagnostics', []))}")

    @pytest.mark.asyncio
    async def test_get_file_diagnostics(self, real_lean_project):
        """Test getting diagnostics for a specific file"""
        from astrolabe.lsp_cache import build_lsp_cache, LSPCache
        from astrolabe.project import Project

        project = Project(str(real_lean_project))
        await project.load()

        # Find a file
        file_path = None
        for node in project.nodes.values():
            if node.file_path:
                file_path = node.file_path
                break

        if not file_path:
            pytest.skip("No files found")

        cache = await build_lsp_cache(real_lean_project, [file_path])

        # Get diagnostics
        diagnostics = cache.get_file_diagnostics(file_path)
        print(f"\nDiagnostics for {Path(file_path).name}: {len(diagnostics)}")

        for diag in diagnostics[:5]:
            severity = ["", "error", "warning", "info", "hint"][diag.get("severity", 0)]
            line = diag.get("range", {}).get("start", {}).get("line", 0) + 1
            print(f"  Line {line} [{severity}]: {diag.get('message', '')[:50]}")
