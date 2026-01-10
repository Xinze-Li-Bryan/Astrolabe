from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Optional
import json


@dataclass
class ViewState:
    """Visualization view state"""

    camera_position: tuple[float, float, float] = (0.0, 0.0, 100.0)
    camera_target: tuple[float, float, float] = (0.0, 0.0, 0.0)
    selected_node_id: Optional[str] = None
    pinned_positions: dict[str, tuple[float, float, float]] = field(default_factory=dict)
    collapsed_groups: list[str] = field(default_factory=list)
    filters: dict[str, bool] = field(default_factory=dict)  # {"theorem": True, "lemma": False, ...}


@dataclass
class SessionState:
    """Complete session state"""

    project_path: str
    view: ViewState = field(default_factory=ViewState)
    last_opened: str = ""  # ISO timestamp

    def _get_state_file(self, state_dir: Path) -> Path:
        """Get state file path"""
        project_hash = sha256(self.project_path.encode()).hexdigest()[:16]
        return state_dir / "sessions" / f"{project_hash}.json"

    def save(self, state_dir: Path):
        """Save to ~/.astrolabe/sessions/{project_hash}.json"""
        self.last_opened = datetime.now(timezone.utc).isoformat()
        state_file = self._get_state_file(state_dir)
        state_file.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "project_path": self.project_path,
            "last_opened": self.last_opened,
            "view": asdict(self.view),
        }
        state_file.write_text(json.dumps(data, indent=2))

    @classmethod
    def load(cls, project_path: str, state_dir: Path) -> "SessionState":
        """Load existing state, return default if none exists"""
        project_hash = sha256(project_path.encode()).hexdigest()[:16]
        state_file = state_dir / "sessions" / f"{project_hash}.json"

        if not state_file.exists():
            return cls(project_path=project_path)

        try:
            data = json.loads(state_file.read_text())
            view_data = data.get("view", {})

            # Convert tuple fields
            view = ViewState(
                camera_position=tuple(view_data.get("camera_position", (0, 0, 100))),
                camera_target=tuple(view_data.get("camera_target", (0, 0, 0))),
                selected_node_id=view_data.get("selected_node_id"),
                pinned_positions={
                    k: tuple(v) for k, v in view_data.get("pinned_positions", {}).items()
                },
                collapsed_groups=view_data.get("collapsed_groups", []),
                filters=view_data.get("filters", {}),
            )

            return cls(
                project_path=data.get("project_path", project_path),
                view=view,
                last_opened=data.get("last_opened", ""),
            )
        except (json.JSONDecodeError, KeyError):
            return cls(project_path=project_path)

    def to_dict(self) -> dict:
        """Serialize for frontend"""
        return {
            "projectPath": self.project_path,
            "lastOpened": self.last_opened,
            "view": {
                "cameraPosition": list(self.view.camera_position),
                "cameraTarget": list(self.view.camera_target),
                "selectedNodeId": self.view.selected_node_id,
                "pinnedPositions": {
                    k: list(v) for k, v in self.view.pinned_positions.items()
                },
                "collapsedGroups": self.view.collapsed_groups,
                "filters": self.view.filters,
            },
        }
