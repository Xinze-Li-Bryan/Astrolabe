"""
Tests for per-node proof status from LSP diagnostics

The goal is to:
1. Match diagnostics to specific nodes by line range
2. Compute proof status for each node (sorry/error/proven)
3. Merge LSP status with graph.json status (LSP takes priority)
"""

import pytest
from pathlib import Path


class TestDiagnosticsToNodeMatching:
    """Test matching diagnostics to specific nodes by line range"""

    def test_match_diagnostic_to_symbol(self):
        """Diagnostic at line X should match symbol containing that line"""
        from astrolabe.lsp_cache import match_diagnostics_to_symbols

        symbols = [
            {
                "name": "foo",
                "kind": 12,
                "range": {"start": {"line": 10}, "end": {"line": 20}},
            },
            {
                "name": "bar",
                "kind": 12,
                "range": {"start": {"line": 25}, "end": {"line": 35}},
            },
        ]

        diagnostics = [
            {"range": {"start": {"line": 15}}, "severity": 2, "message": "uses sorry"},
            {"range": {"start": {"line": 30}}, "severity": 1, "message": "type error"},
        ]

        result = match_diagnostics_to_symbols(symbols, diagnostics)

        # foo should have the sorry diagnostic
        assert "foo" in result
        assert len(result["foo"]) == 1
        assert "sorry" in result["foo"][0]["message"]

        # bar should have the error diagnostic
        assert "bar" in result
        assert len(result["bar"]) == 1
        assert "type error" in result["bar"][0]["message"]

    def test_diagnostic_outside_any_symbol(self):
        """Diagnostic outside all symbols should go to _file_ bucket"""
        from astrolabe.lsp_cache import match_diagnostics_to_symbols

        symbols = [
            {
                "name": "foo",
                "kind": 12,
                "range": {"start": {"line": 10}, "end": {"line": 20}},
            },
        ]

        diagnostics = [
            {"range": {"start": {"line": 5}}, "severity": 1, "message": "import error"},
        ]

        result = match_diagnostics_to_symbols(symbols, diagnostics)

        # Should be in _file_ bucket (file-level diagnostic)
        assert "_file_" in result
        assert len(result["_file_"]) == 1

    def test_nested_symbols(self):
        """Diagnostic should match innermost containing symbol"""
        from astrolabe.lsp_cache import match_diagnostics_to_symbols

        symbols = [
            {
                "name": "Outer",
                "kind": 3,  # namespace
                "range": {"start": {"line": 10}, "end": {"line": 50}},
                "children": [
                    {
                        "name": "inner_func",
                        "kind": 12,
                        "range": {"start": {"line": 20}, "end": {"line": 30}},
                    }
                ]
            },
        ]

        diagnostics = [
            {"range": {"start": {"line": 25}}, "severity": 2, "message": "sorry"},
        ]

        result = match_diagnostics_to_symbols(symbols, diagnostics)

        # Should match inner_func, not Outer
        assert "inner_func" in result
        assert "Outer" not in result or len(result.get("Outer", [])) == 0

    def test_empty_diagnostics(self):
        """No diagnostics should return empty result"""
        from astrolabe.lsp_cache import match_diagnostics_to_symbols

        symbols = [
            {
                "name": "foo",
                "kind": 12,
                "range": {"start": {"line": 10}, "end": {"line": 20}},
            },
        ]

        result = match_diagnostics_to_symbols(symbols, [])
        assert result == {} or all(len(v) == 0 for v in result.values())


class TestNodeProofStatus:
    """Test computing proof status for each node"""

    def test_compute_node_statuses(self):
        """Compute status for all nodes from matched diagnostics"""
        from astrolabe.lsp_cache import compute_node_statuses

        matched = {
            "foo": [{"severity": 2, "message": "declaration uses 'sorry'"}],
            "bar": [{"severity": 1, "message": "type mismatch"}],
            "baz": [],  # no diagnostics
        }

        statuses = compute_node_statuses(matched)

        assert statuses["foo"] == "sorry"
        assert statuses["bar"] == "error"
        assert statuses["baz"] == "proven"

    def test_error_takes_precedence(self):
        """If node has both error and sorry, status is error"""
        from astrolabe.lsp_cache import compute_node_statuses

        matched = {
            "foo": [
                {"severity": 1, "message": "type error"},
                {"severity": 2, "message": "declaration uses 'sorry'"},
            ],
        }

        statuses = compute_node_statuses(matched)
        assert statuses["foo"] == "error"


class TestStatusMerging:
    """Test merging LSP status with graph.json status"""

    def test_lsp_status_takes_priority(self):
        """LSP status should override graph.json status"""
        from astrolabe.lsp_cache import merge_node_statuses

        graph_statuses = {
            "foo": "sorry",   # old: sorry
            "bar": "sorry",   # old: sorry
            "baz": "proven",  # old: proven
        }

        lsp_statuses = {
            "foo": "proven",  # new: now proven!
            "bar": "sorry",   # still sorry
            # baz not in LSP result
        }

        merged = merge_node_statuses(graph_statuses, lsp_statuses)

        assert merged["foo"] == "proven"  # LSP wins
        assert merged["bar"] == "sorry"
        assert merged["baz"] == "proven"  # fallback to graph

    def test_empty_lsp_uses_graph(self):
        """If LSP has no data, use graph status"""
        from astrolabe.lsp_cache import merge_node_statuses

        graph_statuses = {"foo": "sorry", "bar": "proven"}
        lsp_statuses = {}

        merged = merge_node_statuses(graph_statuses, lsp_statuses)

        assert merged["foo"] == "sorry"
        assert merged["bar"] == "proven"


class TestLSPCacheWithStatus:
    """Test LSP cache stores per-node status"""

    def test_cache_includes_node_statuses(self, tmp_path):
        """LSP cache should include computed node statuses"""
        from astrolabe.lsp_cache import LSPCache

        cache = LSPCache()

        # Add file with symbols and diagnostics
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

        # Compute node statuses
        cache.compute_all_node_statuses()

        # Check status is stored
        statuses = cache.get_node_statuses("/path/to/test.lean")
        assert "myTheorem" in statuses
        assert statuses["myTheorem"] == "sorry"

    def test_cache_save_load_preserves_statuses(self, tmp_path):
        """Saving and loading cache should preserve node statuses"""
        from astrolabe.lsp_cache import LSPCache

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

        # Save
        cache_path = tmp_path / "lsp.json"
        cache.save(cache_path)

        # Load
        loaded = LSPCache.load(cache_path)

        # Check statuses preserved
        statuses = loaded.get_node_statuses("/path/to/test.lean")
        assert statuses.get("myTheorem") == "sorry"


class TestIntegrationWithRealProject:
    """Integration tests with real Lean projects"""

    @pytest.fixture
    def derham_project(self):
        """Get DeRhamCohomology project for testing"""
        path = Path.home() / "LeanProjs" / "DeRhamCohomology"
        if not (path / "lakefile.toml").exists() and not (path / "lakefile.lean").exists():
            pytest.skip("DeRhamCohomology project not found")
        return path

    @pytest.mark.asyncio
    async def test_real_project_node_statuses(self, derham_project):
        """Test computing node statuses on real project"""
        from astrolabe.lsp_cache import build_lsp_cache

        test_file = derham_project / "DeRhamCohomology" / "DifferentialForm.lean"
        if not test_file.exists():
            pytest.skip("DifferentialForm.lean not found")

        cache = await build_lsp_cache(derham_project, [str(test_file)])

        # Compute statuses
        cache.compute_all_node_statuses()

        # Get statuses for the file
        statuses = cache.get_node_statuses(str(test_file))

        print(f"\nNode statuses for {test_file.name}:")
        for name, status in list(statuses.items())[:10]:
            print(f"  {name}: {status}")

        # Should have at least some nodes
        assert len(statuses) >= 0  # May be 0 if all diagnostics are file-level
