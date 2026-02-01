
# Astrolabe 可直接集成的优化方案

## 概述

以下优化可以**直接使用现有依赖**或**添加少量代码**实现，无需大规模重构。

---

## 1. ForceAtlas2 Web Worker (最高优先级)

### 现状
- 当前 `ForceLayout.tsx` 在主线程运行物理计算
- 已有 `graphology-layout-forceatlas2` 依赖，但未使用其 Worker 版本

### 优化方案？

**直接使用 graphology-layout-forceatlas2 的 Web Worker 版本：**

```typescript
// src/lib/layout/ForceAtlas2Worker.ts
import Graph from 'graphology'
import FA2Layout from 'graphology-layout-forceatlas2/worker'
import type { Node, Edge } from '@/lib/store'

export class ForceAtlas2LayoutWorker {
  private graph: Graph
  private layout: FA2Layout | null = null
  private onUpdate: (positions: Map<string, [number, number, number]>) => void

  constructor(onUpdate: (positions: Map<string, [number, number, number]>) => void) {
    this.graph = new Graph()
    this.onUpdate = onUpdate
  }

  init(nodes: Node[], edges: Edge[]) {
    this.graph.clear()

    // Add nodes with random initial positions
    nodes.forEach((node, i) => {
      // Fibonacci sphere for 3D → project to 2D for FA2
      const phi = Math.acos(1 - 2 * (i + 0.5) / nodes.length)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      this.graph.addNode(node.id, {
        x: Math.sin(phi) * Math.cos(theta) * 100,
        y: Math.sin(phi) * Math.sin(theta) * 100,
        size: node.defaultSize || 1,
      })
    })

    // Add edges
    edges.forEach(edge => {
      if (this.graph.hasNode(edge.source) && this.graph.hasNode(edge.target)) {
        this.graph.addEdge(edge.source, edge.target)
      }
    })
  }

  start(settings?: Partial<FA2Settings>) {
    if (this.layout) this.layout.kill()

    this.layout = new FA2Layout(this.graph, {
      settings: {
        gravity: 1,
        scalingRatio: 2,
        barnesHutOptimize: true,      // O(n log n) - 关键优化!
        barnesHutTheta: 0.5,
        strongGravityMode: false,
        adjustSizes: true,
        ...settings,
      },
      getEdgeWeight: 'weight',
    })

    this.layout.start()
    this.startPositionSync()
  }

  stop() {
    this.layout?.stop()
  }

  kill() {
    this.layout?.kill()
  }

  private startPositionSync() {
    const sync = () => {
      if (!this.layout?.isRunning()) return

      const positions = new Map<string, [number, number, number]>()
      this.graph.forEachNode((id, attrs) => {
        // FA2 is 2D, add z=0 or use existing z
        positions.set(id, [attrs.x, attrs.y, 0])
      })
      this.onUpdate(positions)

      requestAnimationFrame(sync)
    }
    sync()
  }
}

interface FA2Settings {
  gravity: number
  scalingRatio: number
  barnesHutOptimize: boolean
  barnesHutTheta: number
  strongGravityMode: boolean
  adjustSizes: boolean
}
```

### 集成到现有组件

```typescript
// 在 SigmaGraph.tsx 或新建 2D 布局组件中使用
import { ForceAtlas2LayoutWorker } from '@/lib/layout/ForceAtlas2Worker'

// 创建 worker
const layoutWorker = new ForceAtlas2LayoutWorker((positions) => {
  // 更新 positionsRef
  positionsRef.current = positions
})

// 初始化
layoutWorker.init(nodes, edges)
layoutWorker.start({ gravity: 0.5, scalingRatio: 10 })

// 清理
useEffect(() => () => layoutWorker.kill(), [])
```

### 效果
- **主线程释放**：物理计算移到 Worker，UI 保持 60fps
- **大图支持**：10,000+ 节点流畅运行
- **Barnes-Hut 内置**：O(n log n) 排斥力计算

---

## 2. inferSettings 自动调参

### 现状
物理参数是硬编码的，不同规模图需要手动调整

### 优化方案

```typescript
import { inferSettings } from 'graphology-layout-forceatlas2'

// 根据图规模自动推断最佳参数
const settings = inferSettings(graph)
// 返回类似: { barnesHutOptimize: true, gravity: 0.05, scalingRatio: 10 }

layoutWorker.start(settings)
```

---

## 3. Sigma.js 内置大图渲染优化

### 现状
已使用 Sigma.js，但可能未启用全部优化

### 优化方案

```typescript
// src/components/graph/SigmaGraph.tsx
import { Sigma } from 'sigma'

const sigma = new Sigma(graph, container, {
  // 性能优化选项
  renderLabels: true,
  labelRenderedSizeThreshold: 6,  // 节点太小时不渲染标签

  // 边的渲染优化
  hideEdgesOnMove: true,          // 拖动时隐藏边
  hideLabelsOnMove: true,         // 拖动时隐藏标签

  // 大图必备
  enableEdgeClickEvents: false,   // 禁用边点击减少计算
  enableEdgeWheelEvents: false,
  enableEdgeHoverEvents: false,

  // WebGL 渲染设置
  allowInvalidContainer: true,
  zIndex: true,
})
```

---

## 4. 3D 布局 Web Worker 化

### 现状
`ForceLayout.tsx` 的 3D 物理计算在主线程的 `useFrame` 中运行

### 优化方案

**创建独立的 Web Worker：**

```typescript
// src/workers/forceLayout.worker.ts
import { calculateBarnesHutRepulsion } from '@/lib/graphProcessing'

interface WorkerMessage {
  type: 'init' | 'step' | 'stop'
  nodes?: Array<{ id: string; x: number; y: number; z: number }>
  edges?: Array<{ source: string; target: string }>
  physics?: PhysicsParams
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, nodes, edges, physics } = e.data

  switch (type) {
    case 'init':
      initSimulation(nodes!, edges!)
      break
    case 'step':
      const positions = simulateStep(physics!)
      self.postMessage({ type: 'positions', positions })
      break
    case 'stop':
      running = false
      break
  }
}

// ... 将 simulateStep 逻辑移到这里
```

**在组件中使用：**

```typescript
// src/components/graph3d/ForceLayoutWorker.tsx
const workerRef = useRef<Worker | null>(null)

useEffect(() => {
  workerRef.current = new Worker(
    new URL('@/workers/forceLayout.worker.ts', import.meta.url)
  )

  workerRef.current.onmessage = (e) => {
    if (e.data.type === 'positions') {
      // 更新位置
      for (const [id, pos] of e.data.positions) {
        positionsRef.current.set(id, pos)
      }
    }
  }

  return () => workerRef.current?.terminate()
}, [])

// 初始化
workerRef.current?.postMessage({ type: 'init', nodes, edges })

// 每帧请求更新（但计算在 worker 中）
useFrame(() => {
  workerRef.current?.postMessage({ type: 'step', physics })
})
```

---

## 5. 节点聚类折叠（已有部分实现）

### 现状
- 已有 `groupNodesByNamespace` 函数
- 已有命名空间聚类力

### 可直接添加的优化

**交互式折叠/展开：**

```typescript
// src/lib/clustering.ts
export function collapseNamespace(
  nodes: Node[],
  edges: Edge[],
  namespace: string
): { nodes: Node[]; edges: Edge[] } {
  const childNodes = nodes.filter(n => n.name.startsWith(namespace + '.'))
  const otherNodes = nodes.filter(n => !n.name.startsWith(namespace + '.'))

  // 创建聚合节点
  const groupNode: Node = {
    id: `group:${namespace}`,
    name: namespace,
    kind: 'custom',
    status: 'unknown',
    defaultColor: '#888',
    defaultSize: Math.sqrt(childNodes.length) * 2,
    defaultShape: 'sphere',
    pinned: false,
    visible: true,
  }

  // 重新连接边
  const newEdges = edges.map(e => ({
    ...e,
    source: childNodes.some(n => n.id === e.source) ? groupNode.id : e.source,
    target: childNodes.some(n => n.id === e.target) ? groupNode.id : e.target,
  })).filter((e, i, arr) =>
    // 去重
    arr.findIndex(x => x.source === e.source && x.target === e.target) === i
  )

  return {
    nodes: [...otherNodes, groupNode],
    edges: newEdges,
  }
}
```

---

## 6. 增量布局（动态更新）

### 现状
每次数据变化都重新计算完整布局

### 优化方案

```typescript
// 只更新变化的部分
export function incrementalLayout(
  prevPositions: Map<string, [number, number, number]>,
  addedNodes: Node[],
  removedNodeIds: Set<string>
): Map<string, [number, number, number]> {
  const newPositions = new Map(prevPositions)

  // 删除已移除的节点
  for (const id of removedNodeIds) {
    newPositions.delete(id)
  }

  // 新节点放在其邻居的平均位置附近
  for (const node of addedNodes) {
    const neighborPositions = edges
      .filter(e => e.source === node.id || e.target === node.id)
      .map(e => prevPositions.get(e.source === node.id ? e.target : e.source))
      .filter(Boolean) as [number, number, number][]

    if (neighborPositions.length > 0) {
      const avg = neighborPositions.reduce(
        (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
        [0, 0, 0]
      ).map(v => v / neighborPositions.length) as [number, number, number]

      // 添加小随机偏移避免重叠
      newPositions.set(node.id, [
        avg[0] + (Math.random() - 0.5) * 2,
        avg[1] + (Math.random() - 0.5) * 2,
        avg[2] + (Math.random() - 0.5) * 2,
      ])
    }
  }

  return newPositions
}
```

---

## 7. ELK 配置优化

### 现状
使用 dagre 进行层级布局

### 优化：切换到 ELK 并优化配置

```typescript
// src/lib/layout/elkLayout.ts
import ELK from 'elkjs/lib/elk.bundled'

const elk = new ELK()

export async function computeElkLayout(
  nodes: Node[],
  edges: Edge[]
): Promise<Map<string, [number, number, number]>> {
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      // 利用 Lean 命名空间的自然顺序减少交叉
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      // 紧凑布局
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      // 间距
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.spacing.nodeNode': '50',
    },
    children: nodes.map(n => ({
      id: n.id,
      width: 30,
      height: 30,
    })),
    edges: edges.map(e => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  }

  const result = await elk.layout(graph)

  const positions = new Map<string, [number, number, number]>()
  for (const node of result.children || []) {
    positions.set(node.id, [node.x || 0, node.y || 0, 0])
  }

  return positions
}
```

---

## ✅ 已实现的优化

以下优化已经完成实现和测试（34 个测试全部通过）：

### 新增文件

```
src/lib/layout/
├── ForceAtlas2Layout.ts    # ForceAtlas2 Web Worker 布局
├── ElkLayout.ts            # ELK 层级布局（优化配置）
├── index.ts                # 导出
└── __tests__/
    ├── ForceAtlas2Worker.test.ts (12 tests)
    └── ElkLayout.test.ts (11 tests)

src/hooks/
├── useLayout.ts            # 统一布局管理 Hook
└── __tests__/
    └── useLayout.test.ts (11 tests)
```

### 使用方法

#### 1. 在组件中使用 useLayout Hook

```typescript
import { useLayout } from '@/hooks'

function GraphView({ nodes, edges }) {
  const {
    mode,           // 当前模式: 'force' | 'hierarchical'
    setMode,        // 切换模式
    positionsRef,   // 位置 Map ref (不触发重渲染)
    start,          // 启动力导向布局
    stop,           // 停止力导向布局
    isRunning,      // 是否在运行
    recompute,      // 重新计算布局
  } = useLayout(nodes, edges, {
    initialMode: 'auto',  // 自动选择最佳模式
    autoStart: true,
  })

  return (
    <div>
      <button onClick={() => setMode('hierarchical')}>层级视图</button>
      <button onClick={() => setMode('force')}>力导向视图</button>
      {/* 渲染图形... */}
    </div>
  )
}
```

#### 2. 直接使用 ForceAtlas2Layout

```typescript
import { ForceAtlas2Layout } from '@/lib/layout'

const layout = new ForceAtlas2Layout((positions) => {
  // positions: Map<string, [x, y, z]>
  console.log('Positions updated!')
})

layout.init(nodes, edges)
layout.start({
  barnesHutOptimize: true,  // O(n log n) 优化
  gravity: 1,
})

// 获取自动推断的参数
const settings = layout.getInferredSettings()

// 停止/清理
layout.stop()
layout.kill()
```

#### 3. 直接使用 ElkLayout

```typescript
import { ElkLayout } from '@/lib/layout'

const layout = new ElkLayout({
  direction: 'DOWN',
  useModelOrder: true,  // 利用 Lean 命名空间顺序减少交叉
  nodeSpacing: 50,
  layerSpacing: 80,
})

const positions = await layout.compute(nodes, edges)
// positions: Map<string, [x, y, z]>
```

## 快速实施顺序

| 优先级 | 优化项 | 工作量 | 收益 |
|--------|--------|--------|------|
| ✅ **完成** | ForceAtlas2 Web Worker | - | 主线程释放，支持 10k+ 节点 |
| ✅ **完成** | inferSettings 自动调参 | - | 不同规模图自动适配 |
| ✅ **完成** | ELK 层级布局 | - | 更好的 DAG 展示 |
| 🟡 **P1** | Sigma.js 渲染优化 | 1 小时 | 大图交互更流畅 |
| 🟢 **P2** | 3D Worker 化 | 4-6 小时 | 3D 视图支持更大图 |
| 🟢 **P2** | 命名空间折叠 | 3-4 小时 | 大图交互式探索 |

---

## 立即可用的 npm 包

已在 `package.json` 中存在，可直接使用：

```json
{
  "graphology": "^0.26.0",
  "graphology-layout-forceatlas2": "^0.10.1",  // 含 Web Worker
  "sigma": "^3.0.2",
  "elkjs": "^0.11.0",
  "dagre": "^0.8.5"
}
```

无需安装新依赖！
