"""
File Watcher

Monitors .ilean file changes (Lean compilation output)
After user modifies .lean files, Lean auto-compiles and .ilean updates almost in real-time
"""

from pathlib import Path
from typing import Callable, Awaitable
import asyncio


class FileWatcher:
    """Monitors .ilean file changes"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self._running = False
        self._task: asyncio.Task | None = None

    @property
    def ilean_dir(self) -> Path:
        """Returns directory containing .ilean files"""
        return self.project_path / ".lake" / "build" / "lib"

    async def start(self, callback: Callable[[str], Awaitable[None]]):
        """
        Start monitoring .ilean file changes
        When file is modified, calls callback(file_path)
        """
        from watchfiles import awatch

        self._running = True

        # Monitor .ilean files in .lake/build/lib directory
        watch_path = self.ilean_dir
        if not watch_path.exists():
            print(f"[FileWatcher] Warning: {watch_path} does not exist, waiting for lake build...")

        async for changes in awatch(self.project_path):
            if not self._running:
                break
            for change_type, path in changes:
                if path.endswith(".ilean"):
                    await callback(path)

    async def stop(self):
        """Stop monitoring"""
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
