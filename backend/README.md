# Astrolabe Backend

Astrolabe: your Lean

## Setup

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run tests
pytest
```

## Structure

```
astrolabe/
├── models/      # Node, Edge dataclasses
├── lsp/         # Lean LSP client
└── project.py   # Project container
```
