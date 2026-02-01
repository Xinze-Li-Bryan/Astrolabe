"""
Lean 4 LSP Client

Communicates with Lean 4 language server to get semantic information
like namespace declarations, document symbols, etc.
"""

import asyncio
import json
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional


@dataclass
class NamespaceInfo:
    """Information about a namespace declaration"""
    name: str
    file_path: str
    line_number: int  # 1-indexed
    is_explicit: bool  # True if declared with 'namespace X', False if implicit (X.foo)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DocumentSymbol:
    """A symbol in a document (from LSP documentSymbol response)"""
    name: str
    kind: str  # "namespace", "function", "theorem", etc.
    line_start: int
    line_end: int
    children: list["DocumentSymbol"]


def format_lsp_request(method: str, params: dict, request_id: int) -> str:
    """Format an LSP JSON-RPC request"""
    request = {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
        "params": params
    }
    content = json.dumps(request)
    return f"Content-Length: {len(content)}\r\n\r\n{content}"


def parse_lsp_response(data: str) -> dict:
    """Parse an LSP JSON-RPC response"""
    # Find the JSON content after headers
    parts = data.split("\r\n\r\n", 1)
    if len(parts) < 2:
        raise ValueError("Invalid LSP response format")
    json_content = parts[1]
    return json.loads(json_content)


class LeanLSPClient:
    """
    Client for communicating with Lean 4 language server.

    Usage:
        client = LeanLSPClient(project_path)
        await client.start()
        symbols = await client.get_document_symbols(file_path)
        await client.stop()
    """

    def __init__(self, project_path: Path):
        self.project_path = Path(project_path)
        self.process: Optional[subprocess.Popen] = None
        self.is_initialized = False
        self._request_id = 0
        self._buffer = b""

    async def start(self) -> None:
        """Start the Lean language server"""
        if self.is_initialized:
            return

        # Start lean --server via lake env using sync subprocess in thread
        # This works more reliably than asyncio subprocess for LSP
        loop = asyncio.get_event_loop()
        self.process = await loop.run_in_executor(
            None,
            lambda: subprocess.Popen(
                ["lake", "env", "lean", "--server"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=self.project_path
            )
        )

        # Send initialize request
        await self._initialize()
        self.is_initialized = True

    async def stop(self) -> None:
        """Stop the Lean language server"""
        if self.process:
            self.process.terminate()
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self.process.wait)
            self.process = None

        self.is_initialized = False

    async def _initialize(self) -> dict:
        """Send LSP initialize request"""
        params = {
            "processId": None,
            "rootUri": f"file://{self.project_path}",
            "capabilities": {
                "textDocument": {
                    "documentSymbol": {
                        "hierarchicalDocumentSymbolSupport": True
                    }
                }
            }
        }
        result = await self._send_request("initialize", params)

        # Send initialized notification
        await self._send_notification("initialized", {})

        return result

    async def _send_request(self, method: str, params: dict) -> dict:
        """Send a request and wait for response"""
        self._request_id += 1
        request_id = self._request_id

        request = format_lsp_request(method, params, request_id)

        # Send request in executor to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: (
            self.process.stdin.write(request.encode()),
            self.process.stdin.flush()
        ))

        # Read response (handles interleaved server requests)
        response = await self._read_response(request_id)

        if "error" in response:
            raise Exception(response["error"].get("message", "LSP error"))

        return response.get("result")

    async def _send_response(self, request_id: int, result) -> None:
        """Send a response to a server request"""
        response = {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": result
        }
        content = json.dumps(response)
        message = f"Content-Length: {len(content)}\r\n\r\n{content}"

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: (
            self.process.stdin.write(message.encode()),
            self.process.stdin.flush()
        ))

    async def _send_notification(self, method: str, params: dict) -> None:
        """Send a notification (no response expected)"""
        notification = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        }
        content = json.dumps(notification)
        message = f"Content-Length: {len(content)}\r\n\r\n{content}"

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: (
            self.process.stdin.write(message.encode()),
            self.process.stdin.flush()
        ))

    async def _read_message(self) -> dict:
        """Read a single LSP message from the server"""
        loop = asyncio.get_event_loop()

        # Read header
        header = b""
        while not header.endswith(b"\r\n\r\n"):
            byte = await loop.run_in_executor(None, lambda: self.process.stdout.read(1))
            if not byte:
                raise Exception("LSP server closed connection")
            header += byte

        # Parse content length
        content_length = None
        for line in header.decode().split("\r\n"):
            if line.startswith("Content-Length:"):
                content_length = int(line.split(":")[1].strip())
                break

        if content_length is None:
            raise Exception("Missing Content-Length header")

        # Read content
        content = await loop.run_in_executor(
            None,
            lambda: self.process.stdout.read(content_length)
        )

        return json.loads(content.decode())

    async def _read_response(self, expected_id: int) -> dict:
        """Read messages until we get the response with expected_id"""
        while True:
            message = await self._read_message()

            # First check if this is a server-initiated message (has 'method' field)
            if "method" in message:
                # Handle server-to-client requests (need to respond)
                if "id" in message:
                    # This is a request from server, send empty response
                    await self._send_response(message["id"], None)
                # Notifications (method but no id) are just informational, ignore
                continue

            # This is a response to one of our requests
            if "id" in message and message["id"] == expected_id:
                return message

    async def get_document_symbols(
        self,
        file_path: Path,
        max_retries: int = 10,
        retry_delay: float = 1.0
    ) -> list[DocumentSymbol]:
        """
        Get document symbols from a Lean file.

        The Lean LSP may need time to process the file, so this method
        retries until symbols are found or max_retries is reached.
        """
        if not self.is_initialized:
            raise RuntimeError("LSP client not initialized")

        # Open the document first
        file_uri = f"file://{file_path}"
        content = file_path.read_text()

        await self._send_notification("textDocument/didOpen", {
            "textDocument": {
                "uri": file_uri,
                "languageId": "lean4",
                "version": 1,
                "text": content
            }
        })

        # Retry until we get symbols (file may need processing time)
        for attempt in range(max_retries):
            await asyncio.sleep(retry_delay)

            result = await self._send_request("textDocument/documentSymbol", {
                "textDocument": {"uri": file_uri}
            })

            if result:
                # Parse result into DocumentSymbol objects
                symbols = []
                for item in result:
                    symbol = self._parse_document_symbol(item)
                    if symbol:
                        symbols.append(symbol)
                return symbols

        # Return empty list if no symbols found after retries
        return []

    def _parse_document_symbol(self, item: dict) -> Optional[DocumentSymbol]:
        """Parse a document symbol from LSP response"""
        if not item:
            return None

        # Map LSP SymbolKind to our kind strings
        kind_map = {
            2: "module",
            3: "namespace",
            5: "class",
            6: "function",
            12: "function",  # Function
            23: "structure",
            # Add more as needed
        }

        kind_num = item.get("kind", 0)
        kind = kind_map.get(kind_num, "unknown")

        range_info = item.get("range", item.get("location", {}).get("range", {}))
        start = range_info.get("start", {})
        end = range_info.get("end", {})

        children = []
        for child in item.get("children", []):
            child_symbol = self._parse_document_symbol(child)
            if child_symbol:
                children.append(child_symbol)

        return DocumentSymbol(
            name=item.get("name", ""),
            kind=kind,
            line_start=start.get("line", 0) + 1,  # Convert to 1-indexed
            line_end=end.get("line", 0) + 1,
            children=children
        )

    async def get_namespaces(self, file_path: Path) -> dict[str, NamespaceInfo]:
        """
        Get namespace information from a Lean file.

        Returns a dict mapping namespace name to NamespaceInfo.
        Includes both explicit (namespace X) and implicit (X.foo) namespaces.
        """
        symbols = await self.get_document_symbols(file_path)
        namespaces = {}

        # Find explicit namespaces from document symbols
        for symbol in symbols:
            if symbol.kind == "namespace":
                namespaces[symbol.name] = NamespaceInfo(
                    name=symbol.name,
                    file_path=str(file_path),
                    line_number=symbol.line_start,
                    is_explicit=True
                )
            # Recurse into children
            self._find_namespaces_recursive(symbol.children, file_path, namespaces)

        # Also scan for implicit namespaces (definitions like Foo.bar without namespace block)
        await self._find_implicit_namespaces(file_path, namespaces)

        return namespaces

    def _find_namespaces_recursive(
        self,
        symbols: list[DocumentSymbol],
        file_path: Path,
        namespaces: dict[str, NamespaceInfo]
    ) -> None:
        """Recursively find namespaces in symbol tree"""
        for symbol in symbols:
            if symbol.kind == "namespace":
                namespaces[symbol.name] = NamespaceInfo(
                    name=symbol.name,
                    file_path=str(file_path),
                    line_number=symbol.line_start,
                    is_explicit=True
                )
            self._find_namespaces_recursive(symbol.children, file_path, namespaces)

    async def _find_implicit_namespaces(
        self,
        file_path: Path,
        namespaces: dict[str, NamespaceInfo]
    ) -> None:
        """
        Find implicit namespaces from definitions like `def Foo.bar`.
        These are namespaces that don't have explicit `namespace X` declarations.
        """
        content = file_path.read_text()
        lines = content.split("\n")

        # Pattern to match definitions with dotted names
        import re
        definition_pattern = re.compile(
            r'^(def|theorem|lemma|instance|structure|class|inductive)\s+(\w+(?:\.\w+)+)'
        )

        for line_num, line in enumerate(lines, start=1):
            match = definition_pattern.match(line.strip())
            if match:
                full_name = match.group(2)
                # Extract namespace part (everything before last dot)
                parts = full_name.rsplit(".", 1)
                if len(parts) == 2:
                    ns_name = parts[0]
                    if ns_name not in namespaces:
                        namespaces[ns_name] = NamespaceInfo(
                            name=ns_name,
                            file_path=str(file_path),
                            line_number=line_num,
                            is_explicit=False
                        )

    async def get_namespace_for_declaration(
        self,
        file_path: Path,
        declaration_name: str
    ) -> Optional[NamespaceInfo]:
        """
        Get the namespace info for a specific declaration.

        Args:
            file_path: Path to the Lean file
            declaration_name: Full name like "Foo.Bar.baz"

        Returns:
            NamespaceInfo if found, None otherwise
        """
        namespaces = await self.get_namespaces(file_path)

        # Try to find the most specific matching namespace
        parts = declaration_name.rsplit(".", 1)
        if len(parts) < 2:
            return None

        ns_name = parts[0]

        # Look for exact match first
        if ns_name in namespaces:
            return namespaces[ns_name]

        # Look for parent namespaces
        while "." in ns_name:
            ns_name = ns_name.rsplit(".", 1)[0]
            if ns_name in namespaces:
                return namespaces[ns_name]

        return None
