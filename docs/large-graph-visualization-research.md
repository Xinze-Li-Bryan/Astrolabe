# 大图可视化（Large Graph Visualization）调研报告

> 针对 Astrolabe 项目（形式化数学依赖图可视化）的技术调研
> 调研日期：2026-01-30

---

## 目录

1. [经典布局算法](#1-经典布局算法)
2. [交叉数最小化](#2-交叉数最小化crossing-minimization)
3. [大图优化技术](#3-大图优化技术)
4. [相关工具对比](#4-相关工具对比)
5. [重要论文](#5-重要论文)
6. [DAG / 依赖图可视化](#6-dag--依赖图可视化)
7. [针对 Astrolabe 的推荐方案](#7-针对-astrolabe-的推荐方案)

---

## 1. 经典布局算法

### 1.1 力导向布局（Force-Directed Layout）

力导向算法将图建模为物理系统：节点相互排斥，边如弹簧般吸引相连节点。

#### Fruchterman-Reingold (1991)

| 属性 | 说明 |
|------|------|
| **时间复杂度** | O(n²) 每次迭代 |
| **空间复杂度** | O(n + e) |
| **核心思想** | 结合吸引力（相邻节点）和排斥力（所有节点），引入"温度"概念逐步收敛 |

**优点：**
- 实现简单直观
- 产生美观的对称布局
- 边长相对均匀

**缺点：**
- 对大图（>5000 节点）效率低
- 可能陷入局部最优
- 不适合有层次结构的图

#### Kamada-Kawai (1989)

| 属性 | 说明 |
|------|------|
| **时间复杂度** | O(n³) |
| **空间复杂度** | O(n²)（需存储成对距离矩阵） |
| **核心思想** | 几何距离应尽量匹配图论距离，通过能量最小化求解 |

**优点：**
- 布局质量高，保持图的拓扑结构
- 数学定义清晰

**缺点：**
- 复杂度高，不适合大图
- 需要完整的距离矩阵

#### 推荐组合策略

实践中常用组合：先用 **Kamada-Kawai** 快速生成初始布局，再用 **Fruchterman-Reingold** 优化局部邻接关系。

---

### 1.2 层级布局（Hierarchical Layout）

#### Sugiyama 算法 (1981)

专为有向图设计的四阶段算法：

```
1. 去环（Cycle Removal）     → 处理反向边
2. 分层（Layer Assignment）  → 节点分配到水平层
3. 交叉最小化（Crossing Min） → 层内节点排序
4. 坐标分配（Coordinate Assignment） → 计算精确位置
```

| 属性 | 说明 |
|------|------|
| **时间复杂度** | 传统：O(\|V\|\|E\| log \|E\|)，优化后：O((\|V\|+\|E\|) log \|E\|) |
| **空间复杂度** | 传统：O(\|V\|\|E\|)，优化后：O(\|V\|+\|E\|) |

**优点：**
- 清晰展示流向和层次
- 非常适合 DAG 和依赖图
- 边方向一致（通常向下）

**缺点：**
- 对非层次结构图效果差
- 长边需要引入虚拟节点（dummy nodes）
- 交叉最小化是 NP-hard 问题

---

### 1.3 多层次方法（Multilevel Methods）

用于处理大规模图的加速技术。

#### FADE (Quigley & Eades, 2000)

基于 Barnes-Hut 空间分解的快速算法：

| 属性 | 说明 |
|------|------|
| **时间复杂度** | O(e + n log n) |
| **核心思想** | 用四叉树近似远距离节点的排斥力 |

**优点：**
- 显著加速大图布局
- 支持几何聚类和多层次抽象

#### FM³ (Hachul & Jünger, 2004)

结合多层次方案和势场快速求值：

| 属性 | 说明 |
|------|------|
| **时间复杂度** | O(n log n + e) |
| **核心思想** | "太阳系"分区 + 多极展开近似 |

**优点：**
- 可处理数十万节点
- GPU 实现可达 CPU 的 20-60 倍加速

#### 其他多层次算法

| 算法 | 粗化策略 | 特点 |
|------|----------|------|
| **GRIP** (Gajer et al.) | 最大独立集过滤 | 智能初始放置 |
| **Walshaw** | 最大独立边集匹配 | 递归折叠 |
| **sfdp** (Hu) | Barnes-Hut 近似 | Graphviz 内置 |

---

## 2. 交叉数最小化（Crossing Minimization）

### 2.1 问题复杂度

**交叉最小化是 NP-hard 问题**，即使只处理单层也是 NP-complete。

### 2.2 经典启发式方法

#### Barycenter 方法

```
将每个节点放置在其邻居位置的平均值处
```

- 时间复杂度：O(n)
- 实现简单，效果好

#### Median 方法

```
将每个节点放置在其邻居位置的中位数处
```

- 时间复杂度：O(n log n)
- **3-近似算法**，对异常值更鲁棒
- 若存在无交叉解，一定能找到

### 2.3 高级技术

#### 边捆绑（Edge Bundling）

将相似边聚合以减少视觉混乱：

| 方法 | 特点 |
|------|------|
| **层次边捆绑** (Holten, 2006) | 利用层次结构，适合树状数据 |
| **力导向边捆绑** (Holten & van Wijk, 2009) | 自组织，边作为弹簧相互吸引 |
| **墨水最小化捆绑** | 基于最小化绘制所需墨水量 |
| **MLS 边捆绑** | 移动最小二乘近似，可处理大图 |

#### Metro-line 技术

借鉴地铁线路图设计，在保持 Sugiyama 风格的同时减少捆绑内交叉。

### 2.4 2024 最新进展

GD 2024 论文 "Determining Sugiyama Topology with Model Order" 提出：
- 当节点已有预设顺序时，可完全跳过交叉最小化步骤
- 边的顺序由节点模型顺序确定
- 适合代码依赖图等有自然顺序的场景

---

## 3. 大图优化技术

### 3.1 GPU 加速

#### WebGPU 时代的新工具

| 项目 | 能力 | 技术特点 |
|------|------|----------|
| **[GraphWaGu](https://github.com/harp-lab/GraphWaGu)** | 10万节点 + 200万边 | WebGPU 计算着色器实现 FR + Barnes-Hut |
| **[GraphPU](https://github.com/latentcat/graphpu)** | 百万级节点 | Rust + WebGPU/Vulkan，1000行 compute shader |
| **ChartGPU** | 1000万数据点 @ 120fps | WebGPU 数据可视化 |

**为什么需要 GPU？**
- 传统工具（Gephi、Cytoscape）基于 CPU 多线程
- CPU-RAM-VRAM-GPU 数据传输是主要瓶颈
- GPU 并行化可将 Barnes-Hut 从 O(n log n) 实际加速数十倍

**GPU Barnes-Hut 挑战：**
- 标准实现依赖递归，GPU 不支持递归
- 需用循环和数据驱动方式模拟
- 实现复杂度高（GraphPU 用了 1000 行 compute shader）

### 3.2 聚类折叠（Clustering & Collapsing）

#### 社区检测算法

| 算法 | 复杂度 | 特点 |
|------|--------|------|
| **Louvain** | O(n log n) | 模块度优化，层次聚类 |
| **Infomap** | O(n log n) | 信息论方法，检测信息流 |
| **Label Propagation** | O(n + e) | 简单快速 |

#### 应用于图可视化

1. **语义缩放**：缩小时显示聚类，放大时展开细节
2. **按需加载**：只加载可见区域的详细数据
3. **超级节点**：将聚类表示为单个大节点

### 3.3 渐进式渲染（Progressive Rendering）

```
┌─────────────────────────────────────────┐
│  阶段 1: 快速粗略布局（几十毫秒）        │
│  阶段 2: 渲染骨架结构                    │
│  阶段 3: 逐步添加边和细节                │
│  阶段 4: 持续优化布局                    │
└─────────────────────────────────────────┘
```

#### 增量布局（Incremental Layout）

- 新增/删除节点时只重新计算受影响区域
- 保持用户"心理地图"（mental map）不变
- 适合流数据和动态网络

#### 层次细节（Level of Detail, LOD）

| 缩放级别 | 渲染内容 |
|----------|----------|
| 远视图 | 只显示聚类中心和主要边 |
| 中等 | 显示节点但简化标签 |
| 近视图 | 完整渲染所有细节 |

### 3.4 其他优化技术

| 技术 | 说明 |
|------|------|
| **Web Workers** | 后台线程计算布局，主线程保持响应 |
| **虚拟化** | 只渲染视口内可见的元素 |
| **空间索引** | R-tree/Quadtree 加速碰撞检测和范围查询 |
| **布局缓存** | 缓存计算结果，避免重复计算 |
| **Canvas/WebGL** | 替代 SVG 提升大量元素渲染性能 |

---

## 4. 相关工具对比

### 4.1 JavaScript 库对比

| 特性 | D3.js | Cytoscape.js | Sigma.js | yFiles |
|------|-------|--------------|----------|--------|
| **许可** | BSD | MIT | MIT | 商业付费 |
| **学习曲线** | 陡峭 | 中等 | 简单 | 中等 |
| **定制性** | 极高 | 中高 | 中等 | 极高 |
| **内置算法** | 少 | 多 | 中等 | 非常多 |
| **大图支持** | 差 (<1万) | 中等 (<5万) | 好 (<50万) | 优秀 |
| **框架集成** | 手动 | 手动 | 手动 | React/Angular |
| **适用场景** | 自定义可视化 | 网络分析/生物学 | 大图展示 | 企业级应用 |

#### D3.js
**优点：** 灵活性最高，社区活跃，模块化设计
**缺点：** 学习曲线陡峭，需要大量自定义代码，大图性能差

#### Cytoscape.js
**优点：** 图论库完整，支持复合节点，交互丰富
**缺点：** 主要面向科研用户，大图支持一般

#### Sigma.js
**优点：** 专为大图设计，WebGL 渲染，性能好
**缺点：** 功能相对单一，自定义能力有限

#### yFiles
**优点：** 功能最全面，算法最丰富，支持好
**缺点：** 昂贵的商业许可

### 4.2 桌面工具对比

| 特性 | Gephi | Graphviz | Cytoscape | Pajek |
|------|-------|----------|-----------|-------|
| **类型** | 交互式 GUI | 命令行 | 交互式 GUI | 交互式 |
| **大图能力** | ~10万节点 | ~1万节点 | ~5万节点 | 百万级 |
| **布局算法** | ForceAtlas2, OpenOrd | dot, neato, sfdp | 多种插件 | 多种 |
| **交互性** | 优秀 | 无 | 好 | 一般 |
| **编程集成** | 差 | 优秀 | 好 | 差 |
| **适用场景** | 探索分析 | 自动化生成 | 生物网络 | 社会网络 |

#### Gephi
**推荐组合：** OpenOrd（快速初始布局）→ Yifan-Hu（美化）
**注意：** 大数据集可能崩溃，内存消耗大

#### Graphviz
**dot 引擎：** 最佳层次布局，适合 DAG
**sfdp 引擎：** 大图力导向布局
**缺点：** 静态输出，无交互

### 4.3 Astrolabe 当前技术栈

根据 `package.json` 分析：

| 组件 | 用途 |
|------|------|
| **sigma** + **graphology** | 2D 图渲染和数据结构 |
| **@react-three/fiber** + **three** | 3D 渲染 |
| **graphology-layout-forceatlas2** | 力导向布局 |
| **dagre** + **elkjs** | 层级布局 |
| **d3** | 辅助可视化 |

---

## 5. 重要论文

### 5.1 经典奠基论文

| 年份 | 论文 | 贡献 |
|------|------|------|
| 1981 | Sugiyama et al. "Methods for Visual Understanding of Hierarchical System Structures" | Sugiyama 层级布局框架 |
| 1984 | Eades "A Heuristic for Graph Drawing" | 首个力导向算法 |
| 1989 | Kamada & Kawai "An Algorithm for Drawing General Undirected Graphs" | 基于图论距离的能量模型 |
| 1991 | Fruchterman & Reingold "Graph Drawing by Force-directed Placement" | 温度退火策略 |

### 5.2 多层次与加速算法

| 年份 | 论文 | 贡献 |
|------|------|------|
| 2000 | Quigley & Eades "[FADE: Graph Drawing, Clustering, and Visual Abstraction](https://link.springer.com/chapter/10.1007/3-540-44541-2_19)" | Barnes-Hut 加速 |
| 2004 | Hachul & Jünger "[Drawing Large Graphs with a Potential-Field-Based Multilevel Algorithm](https://link.springer.com/chapter/10.1007/978-3-540-31843-9_29)" | FM³ 算法 |
| 2005 | Hu "[Efficient and High Quality Force-Directed Graph Drawing](https://graphviz.org/Documentation/Hu05.pdf)" | sfdp 算法 |
| 2006 | Hachul & Jünger "[An Experimental Comparison of Fast Algorithms for Drawing General Large Graphs](https://link.springer.com/chapter/10.1007/11618058_23)" | 大图算法比较 |

### 5.3 边捆绑与视觉简化

| 年份 | 论文 | 贡献 |
|------|------|------|
| 2006 | Holten "[Hierarchical Edge Bundles](https://ieeexplore.ieee.org/document/4015425)" | 层次边捆绑 |
| 2009 | Holten & van Wijk "[Force-Directed Edge Bundling for Graph Visualization](https://ieeexplore.ieee.org/document/5290701)" | 力导向边捆绑 |
| 2011 | Pupyrev et al. "[Improving Layered Graph Layouts with Edge Bundling](https://link.springer.com/chapter/10.1007/978-3-642-18469-7_30)" | Sugiyama + 边捆绑 |

### 5.4 GPU 与 Web 可视化

| 年份 | 论文 | 贡献 |
|------|------|------|
| 2008 | Frishman & Tal "[Multi-level Graph Layout on the GPU](https://ieeexplore.ieee.org/document/4376156)" | 首个 GPU 图布局 |
| 2008 | Godiyal et al. "[Rapid Multipole Graph Drawing on the GPU](https://dl.acm.org/doi/10.5555/1413390.1413404)" | GPU 加速 FM³ |
| 2021 | Bae et al. "[BigGraphVis](https://arxiv.org/abs/2108.00529)" | 流式社区检测 + GPU |
| 2022 | Shen et al. "[GraphWaGu: GPU Powered Large Scale Graph Layout](https://par.nsf.gov/biblio/10384648)" | 首个 WebGPU 图系统 |

### 5.5 GD 2024 精选论文

| 论文 | 主题 |
|------|------|
| "[Determining Sugiyama Topology with Model Order](https://drops.dagstuhl.de/storage/00lipics/lipics-vol320-gd2024/LIPIcs.GD.2024.48/LIPIcs.GD.2024.48.pdf)" | 利用模型顺序优化 Sugiyama |
| "GraphTrials: Visual Proofs of Graph Properties" (Best Paper Track 2) | 图属性的可视化证明 |

### 5.6 综述与手册

| 资源 | 链接 |
|------|------|
| Graph Drawing Handbook - Force-Directed | [cs.brown.edu/...force-directed.pdf](https://cs.brown.edu/people/rtamassi/gdhandbook/chapters/force-directed.pdf) |
| Graph Drawing Handbook - Hierarchical | [cs.brown.edu/...hierarchical.pdf](https://cs.brown.edu/people/rtamassi/gdhandbook/chapters/hierarchical.pdf) |
| Kobourov "Spring Embedders and Force Directed Graph Drawing Algorithms" | [arXiv:1201.3011](https://arxiv.org/abs/1201.3011) |
| State of the Art in Edge Bundling | [lliquid.github.io/...ts13_edgebundle.pdf](https://lliquid.github.io/homepage/files/ts13_edgebundle.pdf) |

---

## 6. DAG / 依赖图可视化

### 6.1 依赖图的特殊性

形式化数学/代码依赖图具有以下特点：

| 特点 | 影响 |
|------|------|
| **严格 DAG 结构** | 可使用 Sugiyama 等层级算法 |
| **深度依赖链** | 可能达到 50-100+ 层 |
| **大量传递依赖** | 需要传递归约（transitive reduction） |
| **命名空间层次** | 可利用进行聚类 |
| **节点有类型** | 定理、引理、定义等需区分显示 |

### 6.2 Lean/Mathlib 依赖图

Stephen Wolfram 的分析显示：
- Mathlib 包含 ~36,000 定理 + ~16,000 定义
- 勾股定理的完整依赖图：2850 元素，深度 84 层
- 依赖图类似于软件函数调用图

#### 现有工具

| 工具 | 功能 |
|------|------|
| **[lean-graph](https://github.com/patrik-cihal/lean-graph)** | Lean 4 定理依赖提取与可视化 |
| **doc-gen4 + Neo4j** | 生成知识图谱存入图数据库 |
| **Loogle / LeanSearch** | 定理搜索工具 |

### 6.3 代码依赖可视化工具

| 工具 | 特点 |
|------|------|
| **[Emerge](https://github.com/glato/emerge)** | 多语言支持，Louvain 社区检测 |
| **NDepend** | .NET 专用，矩阵视图 |
| **CodeVisualizer** | VS Code 扩展，支持 TS/Python |
| **[Swark](https://github.com/swark-io/swark)** | LLM 驱动的架构图生成 |

### 6.4 推荐可视化策略

#### 层级视图（主要视图）

```
         ┌──────────────────┐
    L0   │     Axioms       │
         └────────┬─────────┘
                  ↓
         ┌──────────────────┐
    L1   │   Definitions    │
         └────────┬─────────┘
                  ↓
         ┌──────────────────┐
    L2   │     Lemmas       │
         └────────┬─────────┘
                  ↓
         ┌──────────────────┐
    L3   │    Theorems      │
         └──────────────────┘
```

- 使用 **Sugiyama** 或 **ELK** 算法
- 支持折叠/展开子图
- 高亮当前选中节点的依赖路径

#### 径向视图（探索视图）

```
                    [选中定理]
                   ╱    │    ╲
             [前提1] [前提2] [前提3]
            ╱  │  ╲
        [更深依赖...]
```

- 以选中节点为中心展开
- 支持按深度限制显示层数
- 适合探索单个定理的依赖

#### 矩阵视图（分析视图）

对于大规模分析，邻接矩阵视图可能更有效：
- 一眼看出循环依赖
- 发现模块边界
- 检测异常依赖模式

---

## 7. 针对 Astrolabe 的推荐方案

### 7.1 当前架构分析

Astrolabe 已有的技术栈：
- ✅ **Sigma.js + Graphology**: 2D 大图渲染能力强
- ✅ **ForceAtlas2**: 力导向布局
- ✅ **dagre + elkjs**: 层级布局支持
- ✅ **React Three Fiber**: 3D 渲染

### 7.2 短期优化建议

#### 1. 优化现有 Sugiyama/ELK 布局

```typescript
// 推荐 ELK 配置
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.layered.spacing.nodeNodeBetweenLayers': 50,
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  // 利用命名空间排序
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES'
};
```

**关键点：** 利用 Lean 命名空间的自然顺序，可以跳过复杂的交叉最小化（参考 GD 2024 论文）。

#### 2. 添加传递归约

```typescript
// 已有 transitiveReduction.test.ts，确保在可视化前应用
import { transitiveReduction } from '@/lib/transitiveReduction';
const reducedEdges = transitiveReduction(nodes, edges);
```

#### 3. 基于命名空间的聚类折叠

```
Mathlib.Analysis.Calculus.* → [Calculus] (折叠)
    ├── Deriv
    ├── FDeriv
    └── ContDiff
```

### 7.3 中期增强建议

#### 1. 添加 WebGPU 加速（可选）

如果需要支持 Mathlib 完整图（5万+ 节点）：

```typescript
// 参考 GraphWaGu 实现
// https://github.com/harp-lab/GraphWaGu
import { GPUForceLayout } from './webgpu/forceLayout';

// 在 Web Worker 中运行布局计算
const worker = new Worker('./layoutWorker.ts');
worker.postMessage({ nodes, edges, algorithm: 'barnes-hut' });
```

#### 2. 渐进式渲染

```typescript
interface RenderPhase {
  phase: 'skeleton' | 'nodes' | 'edges' | 'labels';
  progress: number;
}

async function* progressiveRender(graph: Graph) {
  // Phase 1: 快速显示骨架
  yield { phase: 'skeleton', progress: 0.2 };

  // Phase 2: 渲染重要节点
  yield { phase: 'nodes', progress: 0.5 };

  // Phase 3: 添加边
  yield { phase: 'edges', progress: 0.8 };

  // Phase 4: 添加标签
  yield { phase: 'labels', progress: 1.0 };
}
```

#### 3. 语义缩放

```typescript
const LOD_CONFIG = {
  far: { showLabels: false, showMinorEdges: false, clusterSize: 100 },
  medium: { showLabels: true, showMinorEdges: false, clusterSize: 20 },
  close: { showLabels: true, showMinorEdges: true, clusterSize: 1 }
};
```

### 7.4 长期架构建议

#### 混合布局引擎

```
┌────────────────────────────────────────────┐
│              Layout Engine                  │
├────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Sugiyama │  │ ForceAtlas│  │ Radial   │ │
│  │ (DAG)    │  │ (Explore) │  │ (Focus)  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       └─────────────┴─────────────┘       │
│              Layout Blending               │
└────────────────────────────────────────────┘
```

支持用户在不同布局间平滑切换，并允许混合使用（如顶层用 Sugiyama，展开的子图用 ForceAtlas）。

### 7.5 推荐工具/库

| 需求 | 推荐方案 |
|------|----------|
| 2D 大图渲染 | 保持 **Sigma.js** |
| 层级布局 | **ELK** (比 dagre 功能更强) |
| 力导向大图 | **graphology-layout-forceatlas2** + Web Worker |
| GPU 加速（如需要） | 参考 **GraphWaGu** 实现 |
| 边捆绑 | 考虑添加 **d3-force-bundle** |

### 7.6 性能目标参考

| 规模 | 目标帧率 | 建议技术 |
|------|----------|----------|
| < 1,000 节点 | 60 fps | 当前方案即可 |
| 1,000 - 10,000 节点 | 30 fps | + Web Worker + LOD |
| 10,000 - 100,000 节点 | 15 fps | + WebGPU + 聚类折叠 |
| > 100,000 节点 | 按需加载 | + 服务端预计算 + 流式加载 |

---

## 参考链接汇总

### 工具与库
- [Sigma.js](https://www.sigmajs.org/)
- [Graphology](https://graphology.github.io/)
- [ELK.js](https://github.com/kieler/elkjs)
- [GraphWaGu](https://github.com/harp-lab/GraphWaGu)
- [GraphPU](https://github.com/latentcat/graphpu)
- [lean-graph](https://github.com/patrik-cihal/lean-graph)
- [Emerge](https://github.com/glato/emerge)

### 学术资源
- [Graph Drawing Handbook](https://cs.brown.edu/people/rtamassi/gdhandbook/)
- [GD 2024 Proceedings](https://drops.dagstuhl.de/entities/volume/LIPIcs-volume-320)
- [Journal of Graph Algorithms and Applications](http://jgaa.info/)

### 教程与文章
- [Force-Directed Graph Drawing - Wikipedia](https://en.wikipedia.org/wiki/Force-directed_graph_drawing)
- [Layered Graph Drawing - Wikipedia](https://en.wikipedia.org/wiki/Layered_graph_drawing)
- [Building GraphPU](https://latentcat.com/en/blog/building-graphpu)

---

*报告完成。如有问题或需要深入研究某个方向，请随时提问。*
