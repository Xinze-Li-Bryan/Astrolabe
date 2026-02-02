# Astrolabe

A 3D dependency graph visualization tool for Lean 4 formalization projects. Astrolabe parses your Lean codebase, builds a dependency graph, and renders it in an interactive 3D space.

[![Website](https://img.shields.io/badge/Website-astrolabe--lean.io-blue)](https://astrolabe-lean.io)
[![Docs](https://img.shields.io/badge/Docs-Read-green)](https://astrolabe-lean.io/docs)
[![YouTube](https://img.shields.io/badge/YouTube-Tutorial%20Series-red)](https://www.youtube.com/@xinzzzzz-v7i)

<p align="center">
  <img src="docs/images/screenshot-1.jpg" width="80%" />
</p>

## Features

- **3D Visualization** — Force-directed graph layout with physics simulation and namespace clustering
- **Lean 4 Integration** — Automatic parsing of `.ilean` files, file watching, sorry detection
- **Search & Navigation** — Fuzzy search, namespace browser, dependency explorer, Cmd+K lens picker
- **Canvas Management** — Focus subgraphs, virtual nodes, position persistence, undo/redo
- **Code Editing** — Monaco editor with Lean 4 syntax highlighting
- **Notes** — Markdown notes with KaTeX math rendering
- **Graph Analysis** — 30+ algorithms including PageRank, community detection, spectral clustering, Ricci curvature

## Sample Projects

| Project | Description |
|---------|-------------|
| [Strong PNT](https://github.com/Xinze-Li-Bryan/astrolabe-template-strongpnt) | Strong Prime Number Theorem (25k+ lines, 1.1k theorems) |
| [Sphere Eversion](https://github.com/Xinze-Li-Bryan/astrolabe-template-sphere-eversion) | Proof of sphere eversion existence |
| [Ramanujan-Nagell](https://github.com/Xinze-Li-Bryan/astrolabe-template-ramanujan-nagell) | Ramanujan-Nagell theorem formalization |
| [I Ching](https://github.com/alerad/iching_) | Mathematical formalization of the I Ching hexagram structure |

## Architecture

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Next.js, Three.js, TypeScript | 3D visualization, UI |
| Backend | Python, FastAPI | Graph analysis, file parsing |
| Desktop | Tauri (Rust) | Native app wrapper |

## Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **Lean 4** with a project that has `.ilean` files (run `lake build` first)

## Installation

```bash
git clone https://github.com/Xinze-Li-Bryan/Astrolabe.git
cd Astrolabe
npm install
cd backend && pip install -e ".[dev]" && cd ..
```

## Usage

```bash
npm run dev:all    # Start frontend + backend
```

Then open `http://localhost:3000`, click **Load Project**, and select your Lean 4 project directory.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:all` | Start frontend + backend together |
| `npm run dev` | Start Next.js development server |
| `npm run backend` | Start Python backend only |
| `npm run tauri dev` | Start Tauri desktop app |
| `npm run test` | Run tests |

## Contributing

Open an issue or submit a PR. See our [documentation](https://astrolabe-lean.io/docs) for details.

## Maintainers

**[Xinze Li](https://lixinze.xyz/)**  
**[Alejandro Radisic](https://github.com/alerad)**

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
