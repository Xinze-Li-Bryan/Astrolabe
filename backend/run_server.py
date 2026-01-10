#!/usr/bin/env python3
"""
Entry point for PyInstaller build.
This script imports and runs the Astrolabe backend server.
"""

import sys
import os

# Add the backend directory to the path for imports
if getattr(sys, 'frozen', False):
    # Running as compiled executable
    application_path = os.path.dirname(sys.executable)
else:
    # Running as script
    application_path = os.path.dirname(os.path.abspath(__file__))

# Import and run the server
from astrolabe.server import app
import uvicorn

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)
