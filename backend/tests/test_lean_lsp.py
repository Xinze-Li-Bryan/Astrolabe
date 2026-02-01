"""
Tests for Lean LSP Integration

Tests the LSP client that communicates with Lean 4 language server
to get namespace declarations and other semantic information.
"""

import pytest
import asyncio
from pathlib import Path
from unittest.mock import Mock, AsyncMock, patch

# Will import from astrolabe.lean_lsp once implemented
# from astrolabe.lean_lsp import LeanLSPClient, NamespaceInfo


class TestLeanLSPClient:
    """Test the Lean LSP client"""

    @pytest.fixture
    def mock_project_path(self, tmp_path):
        """Create a mock Lean project structure"""
        # Create lakefile.lean
        (tmp_path / "lakefile.lean").write_text("-- lakefile")
        # Create a sample .lean file
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        (src_dir / "Example.lean").write_text("""
namespace Foo

def bar : Nat := 42

theorem baz : bar = 42 := rfl

end Foo

def Implicit.test : Nat := 1
""")
        return tmp_path

    @pytest.mark.asyncio
    async def test_client_initialization(self, mock_project_path):
        """Test that LSP client can be initialized"""
        from astrolabe.lean_lsp import LeanLSPClient

        client = LeanLSPClient(mock_project_path)
        assert client.project_path == mock_project_path
        assert not client.is_initialized

    @pytest.mark.asyncio
    async def test_find_implicit_namespaces(self, mock_project_path):
        """Test finding implicit namespaces from definitions like def Foo.bar"""
        from astrolabe.lean_lsp import LeanLSPClient

        client = LeanLSPClient(mock_project_path)

        # Test the _find_implicit_namespaces method directly (doesn't need LSP)
        file_path = mock_project_path / "src" / "Example.lean"
        namespaces = {}
        await client._find_implicit_namespaces(file_path, namespaces)

        # Should find "Implicit" from "def Implicit.test"
        assert "Implicit" in namespaces
        assert namespaces["Implicit"].is_explicit == False


class TestNamespaceInfo:
    """Test the NamespaceInfo data class"""

    def test_namespace_info_creation(self):
        """Test creating NamespaceInfo"""
        from astrolabe.lean_lsp import NamespaceInfo

        ns = NamespaceInfo(
            name="Foo.Bar",
            file_path="/path/to/file.lean",
            line_number=10,
            is_explicit=True
        )

        assert ns.name == "Foo.Bar"
        assert ns.file_path == "/path/to/file.lean"
        assert ns.line_number == 10
        assert ns.is_explicit == True

    def test_namespace_info_to_dict(self):
        """Test converting NamespaceInfo to dict"""
        from astrolabe.lean_lsp import NamespaceInfo

        ns = NamespaceInfo(
            name="Foo",
            file_path="/path/to/file.lean",
            line_number=5,
            is_explicit=False
        )

        d = ns.to_dict()
        assert d["name"] == "Foo"
        assert d["file_path"] == "/path/to/file.lean"
        assert d["line_number"] == 5
        assert d["is_explicit"] == False


class TestLSPProtocol:
    """Test LSP protocol message formatting"""

    def test_format_initialize_request(self):
        """Test formatting LSP initialize request"""
        from astrolabe.lean_lsp import format_lsp_request

        request = format_lsp_request("initialize", {
            "processId": 123,
            "rootUri": "file:///path/to/project",
            "capabilities": {}
        }, request_id=1)

        assert "Content-Length:" in request
        assert '"method": "initialize"' in request
        assert '"id": 1' in request

    def test_format_document_symbol_request(self):
        """Test formatting textDocument/documentSymbol request"""
        from astrolabe.lean_lsp import format_lsp_request

        request = format_lsp_request("textDocument/documentSymbol", {
            "textDocument": {
                "uri": "file:///path/to/file.lean"
            }
        }, request_id=2)

        assert '"method": "textDocument/documentSymbol"' in request
        assert "file:///path/to/file.lean" in request

    def test_parse_lsp_response(self):
        """Test parsing LSP response"""
        from astrolabe.lean_lsp import parse_lsp_response

        response = 'Content-Length: 52\r\n\r\n{"jsonrpc":"2.0","id":1,"result":{"capabilities":{}}}'

        parsed = parse_lsp_response(response)
        assert parsed["id"] == 1
        assert "result" in parsed
        assert "capabilities" in parsed["result"]


class TestIntegrationWithProject:
    """Integration tests with actual Lean project (if available)"""

    @pytest.fixture
    def real_project_path(self):
        """Get a real Lean project path for integration testing"""
        test_paths = [
            Path.home() / "LeanAnalysis1" / "analysis",
            Path.home() / "mathlib4",
        ]
        for path in test_paths:
            if (path / "lakefile.lean").exists() or (path / "lakefile.toml").exists():
                return path
        pytest.skip("No real Lean project found for integration testing")

    @pytest.mark.asyncio
    async def test_client_start_and_stop(self, real_project_path):
        """Test starting and stopping the LSP server with real project"""
        from astrolabe.lean_lsp import LeanLSPClient

        client = LeanLSPClient(real_project_path)

        await client.start()
        assert client.is_initialized

        await client.stop()
        assert not client.is_initialized

    @pytest.mark.asyncio
    async def test_get_document_symbols(self, real_project_path):
        """Test getting document symbols from a real Lean file"""
        from astrolabe.lean_lsp import LeanLSPClient

        client = LeanLSPClient(real_project_path)
        await client.start()

        try:
            # Find a .lean file with content
            lean_files = list(real_project_path.rglob("*.lean"))
            lean_file = None
            for f in lean_files:
                if f.stat().st_size > 100 and "lakefile" not in f.name.lower():
                    lean_file = f
                    break

            if not lean_file:
                pytest.skip("No suitable .lean file found")

            symbols = await client.get_document_symbols(lean_file)
            # Should return a list (may have symbols)
            assert isinstance(symbols, list)
        finally:
            await client.stop()

    @pytest.mark.asyncio
    async def test_get_namespaces(self, real_project_path):
        """Test extracting namespace information from real project"""
        from astrolabe.lean_lsp import LeanLSPClient, NamespaceInfo

        client = LeanLSPClient(real_project_path)
        await client.start()

        try:
            # Find a .lean file
            lean_files = list(real_project_path.rglob("*.lean"))
            lean_file = None
            for f in lean_files:
                if f.stat().st_size > 100 and "lakefile" not in f.name.lower():
                    lean_file = f
                    break

            if not lean_file:
                pytest.skip("No suitable .lean file found")

            namespaces = await client.get_namespaces(lean_file)

            # Should return a dict
            assert isinstance(namespaces, dict)

            # If there are namespaces, they should be NamespaceInfo objects
            for name, ns in namespaces.items():
                assert isinstance(ns, NamespaceInfo)
                assert ns.line_number > 0
        finally:
            await client.stop()

    @pytest.mark.asyncio
    async def test_explicit_namespace_detection(self, real_project_path):
        """Test that explicit namespaces are detected correctly"""
        from astrolabe.lean_lsp import LeanLSPClient

        client = LeanLSPClient(real_project_path)
        await client.start()

        try:
            # Use a specific file we know has namespaces
            test_file = real_project_path / "Analysis" / "Section_11_2.lean"
            if not test_file.exists():
                pytest.skip("Test file not found")

            namespaces = await client.get_namespaces(test_file)

            # Should find Chapter11 as explicit namespace
            assert "Chapter11" in namespaces
            assert namespaces["Chapter11"].is_explicit == True
            assert namespaces["Chapter11"].line_number > 0
        finally:
            await client.stop()


class TestNamespaceAPI:
    """Test the namespace declaration API endpoint"""

    @pytest.fixture
    def real_project_path(self):
        """Get a real Lean project path for integration testing"""
        test_paths = [
            Path.home() / "LeanAnalysis1" / "analysis",
            Path.home() / "mathlib4",
        ]
        for path in test_paths:
            if (path / "lakefile.lean").exists() or (path / "lakefile.toml").exists():
                return path
        pytest.skip("No real Lean project found for integration testing")

    @pytest.mark.asyncio
    async def test_get_namespace_declaration_endpoint(self, real_project_path):
        """Test the /api/project/namespace-declaration endpoint"""
        from fastapi.testclient import TestClient
        from astrolabe.server import app

        client = TestClient(app)

        # First load the project
        response = client.post("/api/project/load", json={"path": str(real_project_path)})
        assert response.status_code == 200

        # Request namespace declaration for Chapter11
        response = client.get(
            "/api/project/namespace-declaration",
            params={
                "path": str(real_project_path),
                "namespace": "Chapter11"
            }
        )

        # Should return file path and line number
        assert response.status_code == 200
        data = response.json()
        assert "file_path" in data
        assert "line_number" in data
        assert data["line_number"] > 0
        assert data["file_path"].endswith(".lean")

    @pytest.mark.asyncio
    async def test_namespace_not_found(self, real_project_path):
        """Test 404 when namespace doesn't exist"""
        from fastapi.testclient import TestClient
        from astrolabe.server import app

        client = TestClient(app)

        # First load the project
        response = client.post("/api/project/load", json={"path": str(real_project_path)})
        assert response.status_code == 200

        # Request non-existent namespace
        response = client.get(
            "/api/project/namespace-declaration",
            params={
                "path": str(real_project_path),
                "namespace": "NonExistentNamespace12345"
            }
        )

        # Should return 404
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_all_namespaces_endpoint(self, real_project_path):
        """Test the /api/project/namespaces endpoint that returns all namespaces"""
        from fastapi.testclient import TestClient
        from astrolabe.server import app

        client = TestClient(app)

        # First load the project
        response = client.post("/api/project/load", json={"path": str(real_project_path)})
        assert response.status_code == 200

        # Request all namespaces
        response = client.get(
            "/api/project/namespaces",
            params={"path": str(real_project_path)}
        )

        assert response.status_code == 200
        data = response.json()
        assert "namespaces" in data
        assert isinstance(data["namespaces"], list)

        # Each namespace should have name, file_path, line_number, is_explicit
        if len(data["namespaces"]) > 0:
            ns = data["namespaces"][0]
            assert "name" in ns
            assert "file_path" in ns
            assert "line_number" in ns
            assert "is_explicit" in ns
