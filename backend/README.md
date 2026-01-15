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
├── unified_storage.py  # Meta storage (nodes, edges, canvas)
└── project.py   # Project container
```

## TODO

- [ ] KaTeX macros support in Markdown notes
  - Store custom LaTeX macros in meta.json
  - Pass macros to frontend MarkdownRenderer
  - Allow users to define shortcuts like `\R` -> `\mathbb{R}`
- [ ] Export canvas to image/SVG
- [ ] Multiple canvas views per project
- [ ] Collaborative editing support
