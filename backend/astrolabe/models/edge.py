from dataclasses import dataclass, field
from typing import Optional


@dataclass
class EdgeMeta:
    """
    User-editable edge properties via UI, stored in edges namespace of .astrolabe/meta.json
    """

    style: Optional[str] = None  # solid, dashed, dotted, wavy
    effect: Optional[str] = None
    notes: Optional[str] = None

    def to_dict(self) -> dict:
        """Output only non-empty fields"""
        result = {}
        if self.style:
            result["style"] = self.style
        if self.effect:
            result["effect"] = self.effect
        if self.notes:
            result["notes"] = self.notes
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "EdgeMeta":
        """Create EdgeMeta from dict (ignores old color/width fields for backward compatibility)"""
        return cls(
            style=data.get("style"),
            effect=data.get("effect"),
            notes=data.get("notes"),
        )


@dataclass
class Edge:
    """
    Astrolabe Edge

    Represents dependency relationship between nodes (from Lean analysis)
    """

    source: str
    target: str
    from_lean: bool = True
    visible: bool = True

    # === Default styles (set based on from_lean) ===
    # Green, consistent with green ring of proven nodes, indicates real dependencies in code
    default_color: str = "#2ecc71"
    default_width: float = 1.0
    default_style: str = "solid"  # solid, dashed, dotted

    # From .astrolabe/meta.json (user editable)
    meta: EdgeMeta = field(default_factory=EdgeMeta)

    @property
    def id(self) -> str:
        return f"{self.source}->{self.target}"

    def to_dict(self) -> dict:
        """Serialize for frontend"""
        return {
            "id": self.id,
            "source": self.source,
            "target": self.target,
            "fromLean": self.from_lean,
            "visible": self.visible,
            "defaultColor": self.default_color,
            "defaultWidth": self.default_width,
            "defaultStyle": self.default_style,
            "meta": self.meta.to_dict(),
        }
