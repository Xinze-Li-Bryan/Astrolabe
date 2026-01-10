from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ProofStatus(Enum):
    PROVEN = "proven"
    SORRY = "sorry"
    ERROR = "error"
    UNKNOWN = "unknown"


@dataclass
class NodeMeta:
    """User-editable properties via UI, stored in .astrolabe/meta.json"""

    # Display
    label: Optional[str] = None
    color: Optional[str] = None
    size: Optional[float] = None
    shape: Optional[str] = None
    effect: Optional[str] = None

    # Position related (pinned still kept, as it's a node property, not position data)
    # Note: Actual position data is stored in canvas.json, not in meta.json
    pinned: bool = False

    # Content
    notes: Optional[str] = None
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Output only non-empty fields"""
        result = {}
        if self.label:
            result["label"] = self.label
        if self.color:
            result["color"] = self.color
        if self.size is not None:
            result["size"] = self.size
        if self.shape:
            result["shape"] = self.shape
        if self.effect:
            result["effect"] = self.effect
        if self.pinned:
            result["pinned"] = self.pinned
        if self.notes:
            result["notes"] = self.notes
        if self.tags:
            result["tags"] = self.tags
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "NodeMeta":
        """Create NodeMeta from dict

        Note: For backward compatibility, ignores old texStatement/texProof fields
        """
        return cls(
            label=data.get("label"),
            color=data.get("color"),
            size=data.get("size"),
            shape=data.get("shape"),
            effect=data.get("effect"),
            pinned=data.get("pinned", False),
            notes=data.get("notes"),
            tags=data.get("tags", []),
        )


@dataclass
class Node:
    """
    Astrolabe Node

    Data sources:
    - Lean files (via .ilean parsing): id, name, kind, file_path, line_number, status, references
    - .astrolabe/meta.json (user edited): meta

    Note: Source code content is fetched on-demand via readFile API, not stored in node
    """

    # === From Lean (source of truth, read-only) ===
    id: str
    name: str
    kind: str  # theorem, def, lemma, structure...
    file_path: str
    line_number: int
    status: ProofStatus = ProofStatus.UNKNOWN
    references: list[str] = field(default_factory=list)

    # === Statistics fields (computed) ===
    depends_on_count: int = 0  # How many nodes this node depends on
    used_by_count: int = 0     # How many nodes reference this node
    depth: int = 0             # Dependency chain depth (0=leaf node)

    # === Default styles (set based on kind) ===
    default_color: str = "#888888"
    default_size: float = 1.0
    default_shape: str = "sphere"

    # === Internal use (not serialized) ===
    _full_content: str = ""  # Full content, for dependency analysis and sorry detection

    # === From .astrolabe/meta.json (user editable) ===
    meta: NodeMeta = field(default_factory=NodeMeta)

    def to_dict(self) -> dict:
        """Serialize for frontend"""
        result = {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "filePath": self.file_path,
            "lineNumber": self.line_number,
            "status": self.status.value,
            "references": self.references,
            "dependsOnCount": self.depends_on_count,
            "usedByCount": self.used_by_count,
            "depth": self.depth,
            "defaultColor": self.default_color,
            "defaultSize": self.default_size,
            "defaultShape": self.default_shape,
            "meta": self.meta.to_dict(),
        }
        return result
