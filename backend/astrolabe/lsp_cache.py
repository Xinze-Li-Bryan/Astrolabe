"""
LSP Cache - Complete storage for Lean LSP information

This module provides functionality to:
1. Build and cache all LSP information (symbols, diagnostics, etc.)
2. Save to .astrolabe/lsp.json
3. Load cached data for fast lookups

File format (.astrolabe/lsp.json):
{
    "version": 2,
    "built_at": "2026-02-01T16:00:00Z",
    "files": {
        "/path/to/file.lean": {
            "symbols": [...],      // Document symbols with hierarchy
            "diagnostics": [...]   // Errors, warnings, etc.
        }
    },
    "namespaces": {
        "Foo.Bar": {"file_path": "...", "line_number": 10, "is_explicit": true}
    }
}
"""

import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass, field

from .lean_lsp import LeanLSPClient


LSP_CACHE_VERSION = 2

# LSP Symbol kinds (from LSP spec)
SYMBOL_KIND_NAMESPACE = 3
SYMBOL_KIND_CLASS = 5
SYMBOL_KIND_FUNCTION = 12


@dataclass
class LSPCache:
    """In-memory representation of LSP cache"""
    version: int = LSP_CACHE_VERSION
    built_at: Optional[str] = None
    files: dict = field(default_factory=dict)  # file_path -> {symbols, diagnostics}
    namespaces: dict = field(default_factory=dict)  # namespace -> location info

    def add_file_symbols(self, file_path: str, symbols: list) -> None:
        """Add document symbols for a file"""
        if file_path not in self.files:
            self.files[file_path] = {"symbols": [], "diagnostics": []}
        self.files[file_path]["symbols"] = symbols

    def add_file_diagnostics(self, file_path: str, diagnostics: list) -> None:
        """Add diagnostics for a file"""
        if file_path not in self.files:
            self.files[file_path] = {"symbols": [], "diagnostics": []}
        self.files[file_path]["diagnostics"] = diagnostics

    def get_file_symbols(self, file_path: str) -> list:
        """Get symbols for a file"""
        return self.files.get(file_path, {}).get("symbols", [])

    def get_file_diagnostics(self, file_path: str) -> list:
        """Get diagnostics for a file"""
        return self.files.get(file_path, {}).get("diagnostics", [])

    def rebuild_namespace_index(self) -> None:
        """Rebuild namespace index from symbols"""
        self.namespaces = {}

        for file_path, file_data in self.files.items():
            symbols = file_data.get("symbols", [])
            self._extract_namespaces_from_symbols(file_path, symbols, "")

    def _extract_namespaces_from_symbols(
        self,
        file_path: str,
        symbols: list,
        parent_namespace: str
    ) -> None:
        """Recursively extract namespaces from symbol tree"""
        for symbol in symbols:
            kind = symbol.get("kind", 0)
            name = symbol.get("name", "")

            # Check if it's a namespace (kind=3) or section
            is_namespace = kind == SYMBOL_KIND_NAMESPACE
            is_section = name == "<section>"

            if is_namespace and not is_section:
                # Build full namespace path
                full_name = f"{parent_namespace}.{name}" if parent_namespace else name

                # Get line number (convert from 0-indexed to 1-indexed)
                selection_range = symbol.get("selectionRange", symbol.get("range", {}))
                line = selection_range.get("start", {}).get("line", 0) + 1

                self.namespaces[full_name] = {
                    "name": full_name,
                    "file_path": file_path,
                    "line_number": line,
                    "is_explicit": True
                }

                # Recurse into children with updated parent
                children = symbol.get("children", [])
                if children:
                    self._extract_namespaces_from_symbols(file_path, children, full_name)
            else:
                # For non-namespace symbols, continue with same parent
                children = symbol.get("children", [])
                if children:
                    self._extract_namespaces_from_symbols(file_path, children, parent_namespace)

    def save(self, cache_path: Path) -> None:
        """Save cache to JSON file"""
        cache_path.parent.mkdir(parents=True, exist_ok=True)

        self.built_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        data = {
            "version": self.version,
            "built_at": self.built_at,
            "files": self.files,
            "namespaces": self.namespaces
        }

        with open(cache_path, "w") as f:
            json.dump(data, f, indent=2)

    @classmethod
    def load(cls, cache_path: Path) -> "LSPCache":
        """Load cache from JSON file"""
        cache = cls()

        if not cache_path.exists():
            return cache

        try:
            with open(cache_path, "r") as f:
                data = json.load(f)

            version = data.get("version", 1)

            if version == 1:
                # Migrate from v1 (only namespaces)
                cache.namespaces = data.get("namespaces", {})
                cache.version = LSP_CACHE_VERSION
            else:
                # v2 format
                cache.version = data.get("version", LSP_CACHE_VERSION)
                cache.built_at = data.get("built_at")
                cache.files = data.get("files", {})
                cache.namespaces = data.get("namespaces", {})

            return cache

        except (json.JSONDecodeError, IOError):
            return cache


def get_lsp_cache_path(project_path: Path) -> Path:
    """Get the path to the LSP cache file for a project"""
    return Path(project_path) / ".astrolabe" / "lsp.json"


async def build_lsp_cache(
    project_path: Path,
    file_paths: list[str],
    collect_diagnostics: bool = True
) -> LSPCache:
    """
    Build complete LSP cache for given files.

    Args:
        project_path: Root path of the Lean project
        file_paths: List of .lean files to process
        collect_diagnostics: Whether to collect diagnostics (may slow down)

    Returns:
        LSPCache with symbols and diagnostics for all files
    """
    project_path = Path(project_path)
    cache = LSPCache()

    # Start LSP client
    client = LeanLSPClient(project_path)
    await client.start()

    # Storage for diagnostics received via notifications
    diagnostics_store: dict[str, list] = {}

    try:
        for file_path in file_paths:
            file_path_obj = Path(file_path)
            if not file_path_obj.exists() or not file_path_obj.suffix == ".lean":
                continue

            try:
                # Get document symbols (this also triggers diagnostics collection)
                symbols = await client.get_document_symbols(
                    file_path_obj,
                    max_retries=5,
                    retry_delay=0.5
                )

                # Convert DocumentSymbol objects to dicts
                symbol_dicts = [_symbol_to_dict(s) for s in symbols]
                cache.add_file_symbols(file_path, symbol_dicts)

                # Get diagnostics collected during symbol fetching
                # Diagnostics come via publishDiagnostics notifications
                file_uri = f"file://{file_path_obj}"
                diagnostics = client._diagnostics.get(file_uri, [])
                cache.add_file_diagnostics(file_path, diagnostics)

            except Exception as e:
                print(f"Warning: Failed to process {file_path}: {e}")
                continue

    finally:
        await client.stop()

    # Rebuild namespace index from collected symbols
    cache.rebuild_namespace_index()

    # Set build timestamp
    cache.built_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    return cache


def _symbol_to_dict(symbol) -> dict:
    """Convert DocumentSymbol dataclass to dict for JSON serialization"""
    result = {
        "name": symbol.name,
        "kind": _kind_string_to_number(symbol.kind),
        "range": {
            "start": {"line": symbol.line_start - 1, "character": 0},
            "end": {"line": symbol.line_end - 1, "character": 0}
        },
        "selectionRange": {
            "start": {"line": symbol.line_start - 1, "character": 0},
            "end": {"line": symbol.line_start - 1, "character": len(symbol.name)}
        }
    }

    if symbol.children:
        result["children"] = [_symbol_to_dict(c) for c in symbol.children]

    return result


def _kind_string_to_number(kind: str) -> int:
    """Convert kind string to LSP SymbolKind number"""
    kind_map = {
        "module": 2,
        "namespace": 3,
        "class": 5,
        "function": 12,
        "structure": 23,
        "unknown": 0
    }
    return kind_map.get(kind, 0)


# Backward compatibility exports
async def build_namespace_index_from_nodes(project_path: Path, nodes: dict) -> dict:
    """Build namespace index (backward compatible function)"""
    # Collect unique files
    files = set()
    for node in nodes.values():
        if node.file_path:
            files.add(node.file_path)

    cache = await build_lsp_cache(project_path, list(files))
    return cache.namespaces
