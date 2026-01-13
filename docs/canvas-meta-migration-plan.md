# Canvas to Meta Migration Plan

This document describes the investigation results and migration plan for merging `canvas.json` into `meta.json`.

---

## 1. canvas.json Usage

### Backend Files

| File | Line | Function/Class | Description |
|------|------|----------------|-------------|
| `backend/astrolabe/canvas.py` | 1-201 | `CanvasStore`, `CanvasData`, `ViewportData` | Core canvas management classes |
| `backend/astrolabe/server.py` | 25 | import | `from .canvas import CanvasStore, CanvasData` |
| `backend/astrolabe/server.py` | 380-395 | `save_positions()` | Save node 3D positions to canvas.json |
| `backend/astrolabe/server.py` | 561-569 | `get_canvas()` | GET `/api/canvas` - Load canvas state |
| `backend/astrolabe/server.py` | 573-582 | `save_canvas()` | POST `/api/canvas` - Save canvas state |
| `backend/astrolabe/server.py` | 586-595 | `add_to_canvas()` | POST `/api/canvas/add` - Add node to canvas |
| `backend/astrolabe/server.py` | 599-608 | `add_batch_to_canvas()` | POST `/api/canvas/add-batch` - Batch add nodes |
| `backend/astrolabe/server.py` | 612-621 | `remove_from_canvas()` | POST `/api/canvas/remove` - Remove node |
| `backend/astrolabe/server.py` | 625-634 | `update_canvas_positions()` | POST `/api/canvas/positions` - Update positions |
| `backend/astrolabe/server.py` | 638-648 | `clear_canvas()` | POST `/api/canvas/clear` - Clear canvas |
| `backend/astrolabe/server.py` | 696-711 | `get_viewport()` | GET `/api/canvas/viewport` - Get viewport |
| `backend/astrolabe/server.py` | 715-728 | `update_viewport()` | PATCH `/api/canvas/viewport` - Update viewport |
| `backend/astrolabe/project.py` | 442 | comment | Note about position data in canvas.json |

### Backend Test Files

| File | Lines | Description |
|------|-------|-------------|
| `backend/tests/test_canvas.py` | 1-450+ | Full canvas store tests |
| `backend/tests/test_canvas_3d.py` | 1-230+ | 3D position tests |
| `backend/tests/test_canvas_api.py` | 1-280+ | Canvas API endpoint tests |
| `backend/tests/test_graph_selection.py` | 11-280+ | Uses CanvasStore |
| `backend/tests/test_reset_all_data.py` | 37-39 | Creates test canvas.json |

### Frontend Files

| File | Line | Function/Variable | Description |
|------|------|-------------------|-------------|
| `src/lib/canvasStore.ts` | 124 | `loadCanvas` | Interface definition |
| `src/lib/canvasStore.ts` | 125 | `saveCanvas` | Interface definition |
| `src/lib/canvasStore.ts` | 155 | `useCanvasStore` | Zustand store creation |
| `src/lib/canvasStore.ts` | 168-198 | `loadCanvas()` | Fetches GET `/api/canvas` |
| `src/lib/canvasStore.ts` | 200-220 | `saveCanvas()` | Fetches POST `/api/canvas` |
| `src/lib/canvasStore.ts` | 226 | `addNode()` | POST `/api/canvas/add` |
| `src/lib/canvasStore.ts` | 250 | `removeNode()` | POST `/api/canvas/remove` |
| `src/lib/canvasStore.ts` | 274 | `clearCanvas()` | POST `/api/canvas/clear` |
| `src/lib/canvasStore.ts` | 307 | `updatePositions()` | POST `/api/canvas/positions` |
| `src/lib/canvasStore.ts` | 412 | `addNodes()` | POST `/api/canvas/add-batch` |
| `src/lib/api.ts` | 479 | `getViewport()` | GET `/api/canvas/viewport` |
| `src/lib/api.ts` | 501 | `updateViewport()` | PATCH `/api/canvas/viewport` |
| `src/app/local/edit/page.tsx` | 160-172 | destructure | Uses `loadCanvas`, `saveCanvas` from store |
| `src/app/local/edit/page.tsx` | 536-542 | useEffect | Initializes canvasStore |
| `src/app/local/edit/page.tsx` | 653 | sendBeacon | Saves viewport on page unload |
| `src/components/graph3d/ForceGraph3D.tsx` | 547-548 | `canvasPositions` | Reads positions from store |
| `src/components/graph3d/ForceGraph3D.tsx` | 575-622 | layout logic | Uses saved positions |
| `src/components/SearchPanel.tsx` | 91 | destructure | Uses canvas store functions |

### Frontend Test Files

| File | Lines | Description |
|------|-------|-------------|
| `src/lib/__tests__/canvasStore.test.ts` | 16-170+ | Canvas store unit tests |

---

## 2. meta.json Usage

### Backend Files

| File | Line | Function/Class | Description |
|------|------|----------------|-------------|
| `backend/astrolabe/unified_storage.py` | 1-575 | `UnifiedStorage` | Core meta management class |
| `backend/astrolabe/project.py` | 15 | import | `from .unified_storage import UnifiedStorage` |
| `backend/astrolabe/project.py` | 84 | attribute | `self.storage: Optional[UnifiedStorage]` |
| `backend/astrolabe/project.py` | 158-165 | `load()` | Creates UnifiedStorage with meta_path |
| `backend/astrolabe/project.py` | 170-179 | `load()` | Applies meta to nodes/edges |
| `backend/astrolabe/project.py` | 300-328 | `reload_meta()` | Reloads meta.json |
| `backend/astrolabe/project.py` | 345-365 | `update_node_meta()` | Updates node meta |
| `backend/astrolabe/project.py` | 374-396 | `update_edge_meta()` | Updates edge meta |
| `backend/astrolabe/server.py` | 232 | endpoint | GET `/api/project/node/{id}` |
| `backend/astrolabe/server.py` | 294 | endpoint | PATCH `/api/project/node/{id}/meta` |
| `backend/astrolabe/server.py` | 321 | endpoint | DELETE `/api/project/node/{id}/meta` |
| `backend/astrolabe/server.py` | 792 | endpoint | POST `/api/project/user-node` |
| `backend/astrolabe/server.py` | 836 | endpoint | GET `/api/project/user-nodes` |
| `backend/astrolabe/server.py` | 854 | endpoint | PATCH `/api/project/user-node/{id}` |
| `backend/astrolabe/server.py` | 889 | endpoint | DELETE `/api/project/user-node/{id}` |
| `backend/astrolabe/server.py` | 916 | endpoint | POST `/api/project/user-edge` |
| `backend/astrolabe/server.py` | 954 | endpoint | GET `/api/project/user-edges` |
| `backend/astrolabe/server.py` | 972 | endpoint | DELETE `/api/project/user-edge/{id}` |
| `backend/astrolabe/server.py` | 1376 | file watch | Calls `reload_meta()` on meta.json change |

### Backend Test Files

| File | Lines | Description |
|------|-------|-------------|
| `backend/tests/test_unified_storage.py` | 1-730+ | Full unified storage tests |
| `backend/tests/test_reset_all_data.py` | 33-34 | Creates test meta.json |
| `backend/tests/test_models.py` | 5-80+ | Node meta tests |

### Frontend Files

| File | Line | Function/Variable | Description |
|------|------|-------------------|-------------|
| `src/lib/api.ts` | 196-225 | `updateNodeMeta()` | PATCH `/api/project/node/{id}/meta` |
| `src/lib/api.ts` | 241+ | `updateEdgeMeta()` | Similar pattern |
| `src/lib/canvasStore.ts` | 176-177 | `loadCanvas()` | Fetches user-nodes and user-edges |
| `src/lib/canvasStore.ts` | 365 | `getNodeDeps()` | GET `/api/project/node/{id}/deps` |
| `src/lib/canvasStore.ts` | 440 | `addCustomNode()` | POST `/api/project/user-node` |
| `src/lib/canvasStore.ts` | 481 | `updateCustomNode()` | PATCH `/api/project/user-node/{id}` |
| `src/lib/canvasStore.ts` | 516 | `removeCustomNode()` | DELETE `/api/project/user-node/{id}` |
| `src/lib/canvasStore.ts` | 552 | `addCustomEdge()` | POST `/api/project/user-edge` |
| `src/lib/canvasStore.ts` | 592 | `removeCustomEdge()` | DELETE `/api/project/user-edge/{id}` |
| `src/lib/canvasStore.ts` | 616 | `deleteNodeWithMeta()` | DELETE `/api/project/node/{id}/meta` |
| `src/hooks/useGraphData.ts` | 195 | `reloadMeta()` | Refreshes meta data |
| `src/app/local/edit/page.tsx` | 41 | import | `updateNodeMeta`, `updateEdgeMeta` |
| `src/app/local/edit/page.tsx` | 204 | destructure | `reloadMeta` from useGraphData |
| `src/app/local/edit/page.tsx` | 375-450 | handlers | Call updateNodeMeta/updateEdgeMeta |

---

## 3. Data Flow

### canvas.json Lifecycle

```
Created:
  - First time a node is added to canvas (POST /api/canvas/add)
  - Or when positions are saved (POST /api/canvas/positions)

Updated:
  - Add/remove nodes from canvas
  - Update node positions (on physics stable or manual drag)
  - Update viewport (camera position, selected node)
  - Clear canvas

Read:
  - On page load (GET /api/canvas)
  - ForceGraph3D reads positions for initial layout
  - Get viewport state
```

### meta.json Lifecycle

```
Created:
  - First time a node meta is updated (notes, color, size, effect)
  - Or when a custom node/edge is created

Updated:
  - Update node meta (notes, color, size, effect)
  - Update edge meta (color, width, style, effect)
  - Add/update/delete custom nodes
  - Add/update/delete custom edges
  - Update macros

Read:
  - On project load (merged with graph.json nodes/edges)
  - On meta refresh (file watch triggers reload)
  - Get user nodes/edges separately
```

---

## 4. Current Field Structures

### canvas.json Fields

```typescript
{
  "version": "1.1",                    // string - schema version
  "updated_at": "2026-01-13T...",      // string - ISO timestamp
  "visible_nodes": ["node1", "node2"], // string[] - node IDs on canvas
  "positions": {                        // Record<string, {x,y,z}>
    "node1": {"x": 1.0, "y": 2.0, "z": 3.0}
  },
  "viewport": {                         // ViewportData
    "camera_position": [x, y, z],       // [number, number, number]
    "camera_target": [x, y, z],         // [number, number, number]
    "zoom": 1.0,                        // number
    "selected_node_id": "node1",        // string | null
    "selected_edge_id": "edge1"         // string | null
  }
}
```

### meta.json Fields

```typescript
{
  "nodes": {
    "<node_id>": {
      // For custom nodes (custom-xxx):
      "name": "Node Name",              // string (required)
      "kind": "custom",                 // string (required)
      "references": ["target_id"],      // string[] - dependencies

      // For all nodes (style overrides):
      "notes": "# Markdown",            // string - markdown notes
      "color": "#ff0000",               // string - hex color
      "size": 1.2,                       // number - size multiplier
      "effect": "pulse-glow"            // string - effect ID
    }
  },
  "edges": {
    "<source>-><target>": {
      "source": "source_id",            // string
      "target": "target_id",            // string
      "type": "custom",                 // "custom" | "reference"
      "notes": "Edge notes",            // string
      "color": "#00ff00",               // string
      "width": 2.0,                      // number
      "style": "dashed",                // string - line style
      "effect": "data-stream"           // string - effect ID
    }
  },
  "macros": {                           // KaTeX macros
    "\\R": "\\mathbb{R}"
  }
}
```

---

## 5. Migration Plan

### Fields to Migrate from canvas.json to meta.json

| Field | Current Location | New Location | Notes |
|-------|------------------|--------------|-------|
| `visible_nodes` | `canvas.visible_nodes` | `meta.canvas.visible_nodes` | Array of node IDs |
| `positions` | `canvas.positions` | `meta.canvas.positions` | Map of {x,y,z} |
| `viewport` | `canvas.viewport` | `meta.canvas.viewport` | Camera state |

### Fields to Delete

| Field | Reason |
|-------|--------|
| `canvas.version` | Will use meta.json version |
| `canvas.updated_at` | Not essential, can be removed |

### Proposed New meta.json Structure

```typescript
{
  "version": "2.0",

  // Existing fields (unchanged)
  "nodes": { ... },
  "edges": { ... },
  "macros": { ... },

  // New: merged from canvas.json
  "canvas": {
    "visible_nodes": ["node1", "node2"],
    "positions": {
      "node1": {"x": 1.0, "y": 2.0, "z": 3.0}
    },
    "viewport": {
      "camera_position": [0, 0, 20],
      "camera_target": [0, 0, 0],
      "zoom": 1.0,
      "selected_node_id": null,
      "selected_edge_id": null
    }
  }
}
```

---

## 6. Files Requiring Modification

### Backend Files to Modify

| File | Changes |
|------|---------|
| `backend/astrolabe/unified_storage.py` | Add canvas field support, migrate methods |
| `backend/astrolabe/canvas.py` | **DELETE** - Move logic to UnifiedStorage |
| `backend/astrolabe/server.py` | Update all `/api/canvas/*` endpoints to use UnifiedStorage |
| `backend/astrolabe/project.py` | Remove canvas.json references |

### Backend Test Files to Modify

| File | Changes |
|------|---------|
| `backend/tests/test_canvas.py` | Rewrite to test UnifiedStorage canvas methods |
| `backend/tests/test_canvas_3d.py` | Rewrite to test UnifiedStorage |
| `backend/tests/test_canvas_api.py` | Update API endpoint tests |
| `backend/tests/test_unified_storage.py` | Add canvas migration tests |
| `backend/tests/test_graph_selection.py` | Update to use UnifiedStorage |
| `backend/tests/test_reset_all_data.py` | Remove canvas.json creation |

### Frontend Files to Modify

| File | Changes |
|------|---------|
| `src/lib/canvasStore.ts` | Update API endpoints (if changed) |
| `src/lib/api.ts` | Update viewport API calls (if endpoints change) |

### Files to Delete

| File | Reason |
|------|--------|
| `backend/astrolabe/canvas.py` | Logic moved to UnifiedStorage |
| `.astrolabe/canvas.json` | Data moved to meta.json (migration script) |

---

## 7. Migration Strategy

### Phase 1: Write Tests First
1. Write new tests for canvas functionality in UnifiedStorage
2. Write migration tests (old format → new format)
3. Ensure all existing tests pass

### Phase 2: Backend Changes
1. Add canvas methods to UnifiedStorage
2. Add migration logic (detect old canvas.json, merge into meta.json)
3. Update server.py endpoints
4. Delete canvas.py

### Phase 3: Frontend Changes
1. Update API calls if endpoints changed
2. Test with both old and new projects

### Phase 4: Cleanup
1. Migration script to convert existing projects
2. Remove canvas.json after successful migration
3. Update documentation

---

## 8. API Endpoint Changes

### Option A: Keep Same Endpoints (Recommended)
Keep all `/api/canvas/*` endpoints but internally use UnifiedStorage.
- Minimal frontend changes
- Backwards compatible

### Option B: New Unified Endpoints
Create new endpoints under `/api/meta/canvas/*`.
- Cleaner API design
- Requires frontend updates

**Recommendation**: Option A for simpler migration.

---

## 9. Risks and Considerations

1. **Data Loss**: Need careful migration to not lose existing canvas data
2. **File Size**: meta.json will grow larger with positions
3. **Write Frequency**: Positions update frequently; may need throttling
4. **Backward Compatibility**: Old projects need migration path
5. **Concurrent Access**: Merging means more potential for conflicts

---

## Next Steps

1. **Write tests** for the new UnifiedStorage canvas methods (BEFORE implementation)
2. Review this plan and adjust as needed
3. Implement migration in phases
