"""
Project status detection module

Detects Lean project status:
- Whether it's a Lean project
- Whether it has build cache
- Whether it needs initialization
"""

from pathlib import Path
from dataclasses import dataclass
from typing import Optional
import re


@dataclass
class ProjectStatus:
    """Project status"""
    is_lean_project: bool  # Whether it's a Lean project (has lakefile.lean)
    has_lake_dir: bool  # Whether it has .lake directory
    has_build_cache: bool  # Whether it has build cache (.lake/build)
    has_ilean_files: bool  # Whether it has .ilean index files
    uses_mathlib: bool  # Whether it depends on Mathlib
    lean_version: Optional[str]  # Lean version
    needs_init: bool  # Whether it needs initialization

    def to_dict(self) -> dict:
        return {
            "is_lean_project": self.is_lean_project,
            "has_lake_dir": self.has_lake_dir,
            "has_build_cache": self.has_build_cache,
            "has_ilean_files": self.has_ilean_files,
            "uses_mathlib": self.uses_mathlib,
            "lean_version": self.lean_version,
            "needs_init": self.needs_init,
        }


def check_project_status(project_path: str) -> ProjectStatus:
    """
    Detect project status

    Args:
        project_path: Project path

    Returns:
        ProjectStatus object
    """
    path = Path(project_path)

    # 1. Check if it's a Lean project
    lakefile_lean = path / "lakefile.lean"
    lakefile_toml = path / "lakefile.toml"
    is_lean_project = lakefile_lean.exists() or lakefile_toml.exists()

    # 2. Check .lake directory
    lake_dir = path / ".lake"
    has_lake_dir = lake_dir.exists() and lake_dir.is_dir()

    # 3. Check build cache
    build_dir = path / ".lake" / "build"
    has_build_cache = build_dir.exists() and build_dir.is_dir()

    # 4. Check .ilean files
    has_ilean_files = False
    if has_build_cache:
        lib_dir = build_dir / "lib"
        if lib_dir.exists():
            # Recursively search for .ilean files
            ilean_files = list(lib_dir.rglob("*.ilean"))
            has_ilean_files = len(ilean_files) > 0

    # 5. Check if depends on Mathlib
    uses_mathlib = False
    if lakefile_lean.exists():
        try:
            content = lakefile_lean.read_text()
            # Check for require mathlib or similar dependency declaration
            uses_mathlib = bool(re.search(r'require\s+.*mathlib', content, re.IGNORECASE))
        except Exception:
            pass
    elif lakefile_toml.exists():
        try:
            content = lakefile_toml.read_text()
            uses_mathlib = "mathlib" in content.lower()
        except Exception:
            pass

    # 6. Read Lean version
    lean_version = None
    toolchain_file = path / "lean-toolchain"
    if toolchain_file.exists():
        try:
            lean_version = toolchain_file.read_text().strip()
        except Exception:
            pass

    # 7. Determine if initialization is needed
    # Initialization needed if: it's a Lean project but has no .ilean files
    needs_init = is_lean_project and not has_ilean_files

    return ProjectStatus(
        is_lean_project=is_lean_project,
        has_lake_dir=has_lake_dir,
        has_build_cache=has_build_cache,
        has_ilean_files=has_ilean_files,
        uses_mathlib=uses_mathlib,
        lean_version=lean_version,
        needs_init=needs_init,
    )
