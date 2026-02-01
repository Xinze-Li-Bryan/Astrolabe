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

    Args:
        G: Directed graph (should be acyclic)

    Returns:
        Dict with all analysis results, or error info if not a DAG
    """
    # Check if DAG
    is_dag = nx.is_directed_acyclic_graph(G)

    if not is_dag:
        return {
            "is_dag": False,
            "error": "Graph contains cycles",
            "num_nodes": G.number_of_nodes(),
            "num_edges": G.number_of_edges(),
        }

    # Run all analyses
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
