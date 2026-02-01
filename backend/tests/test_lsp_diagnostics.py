"""
Tests for LSP Diagnostics collection and proof status inference

LSP diagnostics tell us about:
- Errors: compilation errors, type mismatches, etc.
- Warnings: unused variables, deprecations, etc.
- Information: including 'sorry' placeholders

From diagnostics we can infer proof status:
- has error diagnostic → "error"
- has 'sorry' in diagnostic message → "sorry"
- no errors, no sorry → "proven"
"""

import pytest
from pathlib import Path


class TestDiagnosticsCollection:
    """Test collecting diagnostics from LSP notifications"""

    def test_diagnostics_notification_parsing(self):
        """Test parsing publishDiagnostics notification"""
        from astrolabe.lean_lsp import parse_diagnostics_notification

        # Sample notification from Lean LSP
        notification = {
            "jsonrpc": "2.0",
            "method": "textDocument/publishDiagnostics",
            "params": {
                "uri": "file:///path/to/test.lean",
                "diagnostics": [
                    {
                        "range": {
                            "start": {"line": 10, "character": 0},
                            "end": {"line": 10, "character": 5}
                        },
                        "severity": 1,  # Error
                        "message": "unknown identifier 'foo'",
                        "source": "Lean 4"
                    },
                    {
                        "range": {
                            "start": {"line": 20, "character": 0},
                            "end": {"line": 20, "character": 5}
                        },
                        "severity": 2,  # Warning
                        "message": "declaration uses 'sorry'",
                        "source": "Lean 4"
                    }
                ]
            }
        }

        result = parse_diagnostics_notification(notification)

        assert result["uri"] == "file:///path/to/test.lean"
        assert len(result["diagnostics"]) == 2
        assert result["diagnostics"][0]["severity"] == 1
        assert result["diagnostics"][0]["message"] == "unknown identifier 'foo'"

    def test_empty_diagnostics(self):
        """Test parsing empty diagnostics (file is clean)"""
        from astrolabe.lean_lsp import parse_diagnostics_notification

        notification = {
            "jsonrpc": "2.0",
            "method": "textDocument/publishDiagnostics",
            "params": {
                "uri": "file:///path/to/clean.lean",
                "diagnostics": []
            }
        }

        result = parse_diagnostics_notification(notification)

        assert result["uri"] == "file:///path/to/clean.lean"
        assert len(result["diagnostics"]) == 0


class TestProofStatusInference:
    """Test inferring proof status from diagnostics"""

    def test_infer_status_error(self):
        """Diagnostics with errors → status 'error'"""
        from astrolabe.lean_lsp import infer_proof_status

        diagnostics = [
            {"severity": 1, "message": "type mismatch"},  # Error
        ]

        assert infer_proof_status(diagnostics) == "error"

    def test_infer_status_sorry(self):
        """Diagnostics with sorry → status 'sorry'"""
        from astrolabe.lean_lsp import infer_proof_status

        diagnostics = [
            {"severity": 2, "message": "declaration uses 'sorry'"},  # Warning
        ]

        assert infer_proof_status(diagnostics) == "sorry"

    def test_infer_status_sorry_variants(self):
        """Different sorry message formats"""
        from astrolabe.lean_lsp import infer_proof_status

        # Various sorry-related messages from Lean
        sorry_messages = [
            "declaration uses 'sorry'",
            "tactic 'sorry' is used",
            "contains sorry",
        ]

        for msg in sorry_messages:
            diagnostics = [{"severity": 2, "message": msg}]
            assert infer_proof_status(diagnostics) == "sorry", f"Failed for: {msg}"

    def test_infer_status_proven(self):
        """No errors, no sorry → status 'proven'"""
        from astrolabe.lean_lsp import infer_proof_status

        # Empty diagnostics
        assert infer_proof_status([]) == "proven"

        # Only info-level diagnostics (not errors or sorry)
        diagnostics = [
            {"severity": 3, "message": "some info"},  # Info
            {"severity": 4, "message": "some hint"},  # Hint
        ]
        assert infer_proof_status(diagnostics) == "proven"

    def test_error_takes_precedence_over_sorry(self):
        """If both error and sorry present, status is 'error'"""
        from astrolabe.lean_lsp import infer_proof_status

        diagnostics = [
            {"severity": 1, "message": "type mismatch"},
            {"severity": 2, "message": "declaration uses 'sorry'"},
        ]

        # Error is more severe, should take precedence
        assert infer_proof_status(diagnostics) == "error"


class TestLSPClientDiagnostics:
    """Integration tests for LSP client diagnostics collection"""

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
    async def test_collect_diagnostics_for_file(self, real_lean_project):
        """Test collecting diagnostics when opening a file"""
        from astrolabe.lean_lsp import LeanLSPClient

        client = LeanLSPClient(real_lean_project)
        await client.start()

        try:
            # Find a lean file
            lean_files = list(real_lean_project.rglob("*.lean"))
            lean_files = [f for f in lean_files if ".lake" not in str(f)]

            if not lean_files:
                pytest.skip("No .lean files found")

            test_file = lean_files[0]

            # Get diagnostics for file
            diagnostics = await client.get_file_diagnostics(test_file)

            print(f"\nDiagnostics for {test_file.name}:")
            print(f"  Count: {len(diagnostics)}")
            for d in diagnostics[:5]:
                severity = ["", "error", "warning", "info", "hint"][d.get("severity", 0)]
                line = d.get("range", {}).get("start", {}).get("line", 0) + 1
                print(f"  Line {line} [{severity}]: {d.get('message', '')[:60]}")

            # Should return a list (may be empty if file is clean)
            assert isinstance(diagnostics, list)

        finally:
            await client.stop()

    @pytest.mark.asyncio
    async def test_diagnostics_stored_in_cache(self, real_lean_project):
        """Test that diagnostics are stored in LSP cache"""
        from astrolabe.lsp_cache import build_lsp_cache

        # Find a few lean files
        lean_files = list(real_lean_project.rglob("*.lean"))
        lean_files = [f for f in lean_files if ".lake" not in str(f)][:2]

        if not lean_files:
            pytest.skip("No .lean files found")

        # Build cache
        cache = await build_lsp_cache(
            real_lean_project,
            [str(f) for f in lean_files],
            collect_diagnostics=True
        )

        print(f"\nCache built with {len(cache.files)} files")

        for file_path, file_data in cache.files.items():
            diagnostics = file_data.get("diagnostics", [])
            print(f"  {Path(file_path).name}: {len(diagnostics)} diagnostics")

            # Diagnostics should be a list (not None)
            assert isinstance(diagnostics, list)


class TestDiagnosticsSeverity:
    """Test LSP severity levels"""

    def test_severity_constants(self):
        """Verify severity level constants"""
        from astrolabe.lean_lsp import (
            SEVERITY_ERROR,
            SEVERITY_WARNING,
            SEVERITY_INFO,
            SEVERITY_HINT,
        )

        assert SEVERITY_ERROR == 1
        assert SEVERITY_WARNING == 2
        assert SEVERITY_INFO == 3
        assert SEVERITY_HINT == 4
