# Astrolabe

An open-source, AI-native interface framework for formal mathematics. Together with [OpenMath](https://openmath.shentu.org/), we are building infrastructure to accelerate the fusion of AI and mathematics — transforming mathematical knowledge into a universally accessible resource.

*The future of mathematics is formal. The future of mathematics is open. The future of mathematics is for everyone.*

[![Website](https://img.shields.io/badge/Website-astrolean.io-blue)](https://astrolean.io)
[![Whitepaper](https://img.shields.io/badge/Whitepaper-Read-green)](https://github.com/Xinze-Li-Bryan/Astrolabe-Whitepaper)
[![Join Us](https://img.shields.io/badge/Join%20Us-Apply-orange)](https://docs.google.com/forms/d/e/1FAIpQLSe5EfHnKQaxNcTpRCUsjVszAmJCcjH7xIOENo6H4ayeW5KgEQ/viewform)
[![YouTube](https://img.shields.io/badge/YouTube-Tutorial%20Series-red)](https://www.youtube.com/@xinzzzzz-v7i)

## Mission

We're creating opportunities for mathematicians, formalizers, developers, artists, philosophers of technology, and anyone curious about the future of mathematics — to explore what mathematical collaboration looks like in the age of AI, and to make formalization more accessible, enjoyable, and creative.

This includes:
- Customizable frameworks for new modes of mathematical activity
- AI-assisted reasoning and automated formalization
- Dynamic knowledge graphs generated from mathematical papers
- New interaction paradigms that spark broader interest in formal mathematics

## How to Contribute

We use an **AI-native open-source workflow**. No software engineering background required — bring ideas, AI handles code, we handle integration.

**Pick up a feature:**
1. Browse `feature/xxx` branches — each contains:
   - `PROMPT.md` — instructions for AI to implement the feature
   - `CONTEXT.md` — relevant code/architecture context
   - `ACCEPTANCE.md` — criteria for completion
2. Claim a feature, use your favorite AI (Claude, Cursor, GPT, etc.) to implement it
3. Submit a PR when done

**Propose your own ideas:**
- Open an issue describing what you'd like to see
- Or submit a PR directly — we'll help refine and integrate it

Not sure where to start? Just feed this entire README to your AI and ask it to help you contribute.

---

## What is Astrolabe?

<p align="center">
  <img src="docs/images/screenshot-1.jpg" width="80%" />
</p>

Astrolabe transforms your Lean 4 codebase into an explorable 3D universe. It parses theorems, lemmas, definitions, and their dependencies, presenting them as an interactive force-directed graph.

**Current features:** 3D visualization, dependency exploration, search & filtering, canvas management, code editor, markdown notes.

**Coming soon:** AI integration, LSP diagnostics, 2D view, more interaction modes.

## Explore with Astrolabe

Lean projects you can explore with Astrolabe:

| Project | Description |
|---------|-------------|
| [Strong PNT](https://github.com/Xinze-Li-Bryan/astrolabe-template-strongpnt) | Strong Prime Number Theorem (25k+ lines, 1.1k theorems) |
| [Sphere Eversion](https://github.com/Xinze-Li-Bryan/astrolabe-template-sphere-eversion) | Proof of sphere eversion existence |
| [Ramanujan-Nagell](https://github.com/Xinze-Li-Bryan/astrolabe-template-ramanujan-nagell) | Ramanujan-Nagell theorem formalization |
| [I Ching](https://github.com/alerad/iching_) | Mathematical formalization of the I Ching hexagram structure |
| [Polynomial Method](https://github.com/NickAdfor/The-polynomial-method-and-restricted-sums-of-congruence-classes) | Polynomial method and restricted sums of congruence classes |

## Why Astrolabe?

Lean 4 projects grow into thousands of interconnected theorems. Astrolabe parses your project, visualizes the dependency graph in 3D, and lets you explore it interactively—zoom, filter, trace paths, and understand structure at a glance.

## Features

- **3D Visualization** — Force-directed graph with physics-based layout and namespace clustering
- **Lean Integration** — Auto-parsing, file watching, sorry detection
- **Search & Navigation** — Fuzzy search, namespace browser, dependency explorer
- **Canvas Management** — Focused subgraphs, virtual nodes, position persistence
- **Code & Notes** — Monaco editor with Lean 4 syntax, markdown notes with KaTeX

## Tech Stack

Next.js, React, TypeScript, Three.js, Tauri (Rust), Python/FastAPI

## Installation

```bash
git clone https://github.com/Xinze-Li-Bryan/Astrolabe.git
cd Astrolabe
npm install
cd backend && pip install -e ".[dev]" && cd ..
```

## Usage

```bash
npm run dev:all    # Launch frontend + backend
```

## Contributors

Thanks to all contributors who help make Astrolabe better!

---

## About

**Created by [Xinze Li](https://lixinze.xyz/)**
Fields Institute Centre for Mathematical AI | University of Toronto

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
