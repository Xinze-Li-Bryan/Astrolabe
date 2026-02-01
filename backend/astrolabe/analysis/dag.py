"""
DAG Analysis Module

Specialized analysis algorithms for Directed Acyclic Graphs (DAGs),
designed for formal mathematics dependency structures.

Algorithms:
- Dependency Depth: longest path from any root to node
- Topological Layers: partition DAG into dependency-free layers
- Source/Sink Analysis: identify axioms (sources) and terminal theorems (sinks)
- Proof Width: direct dependency count
- Bottleneck Score: descendants/ancestors ratio
- Reachability Count: number of nodes reachable from each node
- Critical Path: longest dependency chain in the graph
"""

from typing import Dict, List, Optional, Any
from collections import defaultdict
import networkx as nx


def _ensure_dag(G: nx.DiGraph) -> None:
    """Raise ValueError if graph is not a DAG"""
    if not nx.is_directed_acyclic_graph(G):
        raise ValueError("Graph is not a DAG (contains cycles)")


# =============================================================================
# Dependency Depth
# =============================================================================

def compute_dependency_depth(G: nx.DiGraph) -> Dict[str, int]:
    """
    Compute dependency depth for each node.

    Depth is the longest path from any root (source) to the node.
    This represents how "deep" a theorem is in the abstraction hierarchy.

    depth(v) = max_{u in ancestors(v)} d(u, v)

    Args:
        G: Directed acyclic graph

    Returns:
        Dict mapping node ID to depth (0 for roots)

    Raises:
        ValueError: If graph contains cycles
    """
    if G.number_of_nodes() == 0:
        return {}

    _ensure_dag(G)

    depths: Dict[str, int] = {}

    # Process nodes in topological order
    for node in nx.topological_sort(G):
        predecessors = list(G.predecessors(node))
        if not predecessors:
            # Root node (source)
            depths[node] = 0
        else:
            # Depth = 1 + max depth of predecessors
            depths[node] = 1 + max(depths[pred] for pred in predecessors)

    return depths


# =============================================================================
# Topological Layers
# =============================================================================

def compute_topological_layers(G: nx.DiGraph) -> Dict[str, int]:
    """
    Assign each node to a topological layer.

    Nodes in the same layer have no dependencies between them.
    Layer 0 contains all sources (nodes with no predecessors).

    Args:
        G: Directed acyclic graph

    Returns:
        Dict mapping node ID to layer number
    """
    # Topological layers are the same as dependency depths
    # Nodes at the same depth form a layer
    return compute_dependency_depth(G)


def get_nodes_by_layer(G: nx.DiGraph) -> Dict[int, List[str]]:
    """
    Get nodes grouped by their topological layer.

    Args:
        G: Directed acyclic graph

    Returns:
        Dict mapping layer number to list of node IDs in that layer
    """
    layers = compute_topological_layers(G)
    result: Dict[int, List[str]] = defaultdict(list)

    for node, layer in layers.items():
        result[layer].append(node)

    return dict(result)


# =============================================================================
# Source/Sink Analysis
# =============================================================================

def find_sources(G: nx.DiGraph) -> List[str]:
    """
    Find all source nodes (nodes with no incoming edges).

    In formal math: these are axioms, definitions, or imports.

    Args:
        G: Directed graph

    Returns:
        List of source node IDs (sorted for consistency)
    """
    sources = [n for n in G.nodes() if G.in_degree(n) == 0]
    return sorted(sources)


def find_sinks(G: nx.DiGraph) -> List[str]:
    """
    Find all sink nodes (nodes with no outgoing edges).

    In formal math: these are terminal theorems (not used by others).

    Args:
        G: Directed graph

    Returns:
        List of sink node IDs (sorted for consistency)
    """
    sinks = [n for n in G.nodes() if G.out_degree(n) == 0]
    return sorted(sinks)


def compute_source_sink_stats(G: nx.DiGraph) -> Dict[str, Any]:
    """
    Compute comprehensive source/sink statistics.

    Args:
        G: Directed graph

    Returns:
        Dict with num_sources, num_sinks, sources, sinks
    """
    sources = find_sources(G)
    sinks = find_sinks(G)

    return {
        "num_sources": len(sources),
        "num_sinks": len(sinks),
        "sources": sources,
        "sinks": sinks,
    }


# =============================================================================
# Proof Width
# =============================================================================

def compute_proof_width(G: nx.DiGraph) -> Dict[str, int]:
    """
    Compute proof width for each node.

    Proof width is the number of direct dependencies (in-degree).
    High width = proof depends on many lemmas directly.

    width(v) = |{u : (u, v) in E}|

    Args:
        G: Directed graph

    Returns:
        Dict mapping node ID to proof width
    """
    return {node: G.in_degree(node) for node in G.nodes()}


# =============================================================================
# Bottleneck Score
# =============================================================================

def compute_bottleneck_scores(G: nx.DiGraph) -> Dict[str, float]:
    """
    Compute bottleneck score for each node.

    Bottleneck score = |descendants| / |ancestors|

    High score = foundational lemma (many depend on it, it depends on few).
    Score 0 = terminal theorem (no descendants).

    For sources (no ancestors), we use |descendants| as the score
    to indicate their foundational importance.

    Args:
        G: Directed acyclic graph

    Returns:
        Dict mapping node ID to bottleneck score
    """
    if G.number_of_nodes() == 0:
        return {}

    _ensure_dag(G)

    scores: Dict[str, float] = {}

    for node in G.nodes():
        descendants = nx.descendants(G, node)
        ancestors = nx.ancestors(G, node)

        num_descendants = len(descendants)
        num_ancestors = len(ancestors)

        if num_descendants == 0:
            # Sink node - no descendants
            scores[node] = 0.0
        elif num_ancestors == 0:
            # Source node - use descendants count as score
            scores[node] = float(num_descendants)
        else:
            scores[node] = num_descendants / num_ancestors

    return scores


# =============================================================================
# Reachability Count
# =============================================================================

def compute_reachability_count(G: nx.DiGraph) -> Dict[str, int]:
    """
    Compute reachability count for each node.

    Reachability = number of nodes reachable from this node.
    High reachability = foundational node that many depend on.

    reach(v) = |{u : u is reachable from v}|

    Args:
        G: Directed graph

    Returns:
        Dict mapping node ID to reachability count
    """
    return {node: len(nx.descendants(G, node)) for node in G.nodes()}


# =============================================================================
# Critical Path Analysis
# =============================================================================

def find_critical_path(G: nx.DiGraph) -> List[str]:
    """
    Find the critical path (longest path) in the DAG.

    This is the longest dependency chain in the entire graph.

    Args:
        G: Directed acyclic graph

    Returns:
        List of node IDs forming the critical path

    Raises:
        ValueError: If graph contains cycles
    """
    if G.number_of_nodes() == 0:
        return []

    _ensure_dag(G)

    # Find the longest path using dynamic programming
    # For DAGs, this is O(V + E)
    return nx.dag_longest_path(G)


def find_critical_path_to(G: nx.DiGraph, target: str) -> List[str]:
    """
    Find the longest path from any source to the target node.

    This answers: "What is the deepest dependency chain to understand this theorem?"

    Args:
        G: Directed acyclic graph
        target: Target node ID

    Returns:
        List of node IDs forming the longest path to target

    Raises:
        ValueError: If graph contains cycles or target not in graph
    """
    if target not in G:
        raise ValueError(f"Target node {target} not in graph")

    _ensure_dag(G)

    # Get all ancestors of target plus target itself
    ancestors = nx.ancestors(G, target)
    ancestors.add(target)

    # Create subgraph with only ancestors
    subgraph = G.subgraph(ancestors)

    # Find longest path in subgraph (it will end at target)
    return nx.dag_longest_path(subgraph)


def compute_graph_depth(G: nx.DiGraph) -> int:
    """
    Compute the depth of the graph (length of critical path).

    This is the number of edges in the longest path.

    Args:
        G: Directed acyclic graph

    Returns:
        Graph depth (0 for empty graph, 0 for single node)
    """
    if G.number_of_nodes() == 0:
        return 0

    _ensure_dag(G)

    critical_path = nx.dag_longest_path(G)
    # Depth = number of edges = number of nodes - 1
    return max(0, len(critical_path) - 1)


# =============================================================================
# Combined Analysis
# =============================================================================

def analyze_dag(G: nx.DiGraph) -> Dict[str, Any]:
    """
    Run comprehensive DAG analysis.

    If the graph contains small cycles (common in Lean dependency graphs due to
    structure/projection relationships), uses condensation to handle them.
    Nodes in the same SCC get the same depth/layer values.

    Args:
        G: Directed graph (may contain small cycles)

    Returns:
        Dict with all analysis results
    """
    is_dag = nx.is_directed_acyclic_graph(G)

    if is_dag:
        # Pure DAG - run analysis directly
        return _analyze_pure_dag(G)

    # Graph has cycles - use condensation approach
    return _analyze_with_condensation(G)


def _analyze_pure_dag(G: nx.DiGraph) -> Dict[str, Any]:
    """Run DAG analysis on a pure DAG (no cycles)."""
    depths = compute_dependency_depth(G)
    layers = compute_topological_layers(G)
    sources = find_sources(G)
    sinks = find_sinks(G)
    widths = compute_proof_width(G)
    bottleneck_scores = compute_bottleneck_scores(G)
    reachability = compute_reachability_count(G)
    critical_path = find_critical_path(G)
    graph_depth = compute_graph_depth(G)

    return {
        "is_dag": True,
        "depths": depths,
        "layers": layers,
        "sources": sources,
        "sinks": sinks,
        "widths": widths,
        "bottleneck_scores": bottleneck_scores,
        "reachability": reachability,
        "critical_path": critical_path,
        "graph_depth": graph_depth,
        "num_layers": max(layers.values()) + 1 if layers else 0,
        "num_sources": len(sources),
        "num_sinks": len(sinks),
    }


def _analyze_with_condensation(G: nx.DiGraph) -> Dict[str, Any]:
    """
    Analyze a graph with cycles using condensation.

    Strongly connected components are collapsed into super-nodes,
    then DAG analysis runs on the condensation graph.
    Results are mapped back to original nodes.
    """
    # Get SCCs and create mapping from node to SCC index
    sccs = list(nx.strongly_connected_components(G))
    node_to_scc: Dict[str, int] = {}
    for i, scc in enumerate(sccs):
        for node in scc:
            node_to_scc[node] = i

    # Create condensation graph
    C = nx.condensation(G, scc=sccs)

    # Run DAG analysis on condensation
    c_depths = compute_dependency_depth(C)
    c_layers = compute_topological_layers(C)

    # Map results back to original nodes
    depths: Dict[str, int] = {}
    layers: Dict[str, int] = {}
    for node in G.nodes():
        scc_idx = node_to_scc[node]
        depths[node] = c_depths.get(scc_idx, 0)
        layers[node] = c_layers.get(scc_idx, 0)

    # For other metrics, compute on original graph where possible
    # Sources: nodes with no predecessors from outside their SCC
    sources = []
    sinks = []
    for node in G.nodes():
        scc_idx = node_to_scc[node]
        preds_outside = [p for p in G.predecessors(node) if node_to_scc[p] != scc_idx]
        succs_outside = [s for s in G.successors(node) if node_to_scc[s] != scc_idx]
        if not preds_outside and c_depths.get(scc_idx, 0) == 0:
            sources.append(node)
        if not succs_outside and c_layers.get(scc_idx, 0) == max(c_layers.values(), default=0):
            sinks.append(node)

    # Widths can be computed directly
    widths = {node: G.in_degree(node) for node in G.nodes()}

    # Bottleneck and reachability are harder with cycles - use approximation
    # For now, compute on condensation and map back
    c_bottleneck = compute_bottleneck_scores(C)
    c_reachability = compute_reachability_count(C)

    bottleneck_scores: Dict[str, float] = {}
    reachability: Dict[str, int] = {}
    for node in G.nodes():
        scc_idx = node_to_scc[node]
        # Add SCC internal size to reachability
        scc_size = len(sccs[scc_idx])
        bottleneck_scores[node] = c_bottleneck.get(scc_idx, 0.0)
        reachability[node] = c_reachability.get(scc_idx, 0) + scc_size - 1

    # Critical path on condensation, then expand
    c_critical_path = find_critical_path(C)
    # Map back to original nodes (pick one representative per SCC)
    critical_path = []
    for scc_idx in c_critical_path:
        # Pick a representative node from this SCC
        representative = next(iter(sccs[scc_idx]))
        critical_path.append(representative)

    graph_depth = max(depths.values(), default=0)

    return {
        "is_dag": True,  # Treated as DAG via condensation
        "has_cycles": True,  # Flag that original graph had cycles
        "num_sccs_with_cycles": sum(1 for scc in sccs if len(scc) > 1),
        "depths": depths,
        "layers": layers,
        "sources": sources,
        "sinks": sinks,
        "widths": widths,
        "bottleneck_scores": bottleneck_scores,
        "reachability": reachability,
        "critical_path": critical_path,
        "graph_depth": graph_depth,
        "num_layers": max(layers.values()) + 1 if layers else 0,
        "num_sources": len(sources),
        "num_sinks": len(sinks),
    }
