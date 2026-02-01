"""
Structural Analysis Module

Algorithms for detecting structural properties in dependency graphs:
- Bridge edges: edges whose removal disconnects the graph
- Articulation points: nodes whose removal disconnects the graph
- HITS algorithm: hub and authority scores
- Katz centrality: influence-based importance for DAGs
"""

from typing import Dict, List, Tuple, Any
import networkx as nx


# =============================================================================
# Bridge Detection
# =============================================================================

def find_bridges(G: nx.Graph | nx.DiGraph) -> List[Tuple[str, str]]:
    """
    Find all bridge edges in the graph.

    A bridge is an edge whose removal would disconnect the graph.
    In formal math: these are critical dependencies that cannot be bypassed.

    For directed graphs, this operates on the underlying undirected graph.

    Args:
        G: Graph (directed or undirected)

    Returns:
        List of bridge edges as (source, target) tuples
    """
    if G.number_of_edges() == 0:
        return []

    # Convert to undirected for bridge detection
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G

    # Use NetworkX's built-in bridge detection
    bridges = list(nx.bridges(G_undirected))

    return bridges


# =============================================================================
# Articulation Points
# =============================================================================

def find_articulation_points(G: nx.Graph | nx.DiGraph) -> List[str]:
    """
    Find all articulation points (cut vertices) in the graph.

    An articulation point is a node whose removal would disconnect the graph.
    In formal math: these are single points of failure in the proof structure.

    For directed graphs, this operates on the underlying undirected graph.

    Args:
        G: Graph (directed or undirected)

    Returns:
        List of articulation point node IDs
    """
    if G.number_of_nodes() == 0:
        return []

    # Convert to undirected for articulation point detection
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G

    # Use NetworkX's built-in articulation point detection
    ap = list(nx.articulation_points(G_undirected))

    return sorted(ap)


# =============================================================================
# HITS Algorithm (Hub/Authority)
# =============================================================================

def compute_hits(
    G: nx.DiGraph,
    max_iter: int = 100,
    tol: float = 1e-8,
    normalized: bool = True,
) -> Tuple[Dict[str, float], Dict[str, float]]:
    """
    Compute HITS hub and authority scores.

    HITS (Hyperlink-Induced Topic Search) identifies two types of important nodes:
    - Hubs: nodes that point to many good authorities (comprehensive proofs)
    - Authorities: nodes pointed to by many good hubs (fundamental theorems)

    Args:
        G: Directed graph
        max_iter: Maximum iterations for power method
        tol: Convergence tolerance
        normalized: Whether to normalize scores

    Returns:
        Tuple of (hub_scores, authority_scores) dicts
    """
    if G.number_of_nodes() == 0:
        return {}, {}

    # Use NetworkX's HITS implementation
    hubs, authorities = nx.hits(G, max_iter=max_iter, tol=tol, normalized=normalized)

    return hubs, authorities


def get_top_hubs(G: nx.DiGraph, k: int = 10) -> List[Tuple[str, float]]:
    """
    Get top k hub nodes.

    Args:
        G: Directed graph
        k: Number of top nodes to return

    Returns:
        List of (node_id, hub_score) tuples, sorted by score descending
    """
    hubs, _ = compute_hits(G)
    sorted_hubs = sorted(hubs.items(), key=lambda x: -x[1])
    return sorted_hubs[:k]


def get_top_authorities(G: nx.DiGraph, k: int = 10) -> List[Tuple[str, float]]:
    """
    Get top k authority nodes.

    Args:
        G: Directed graph
        k: Number of top nodes to return

    Returns:
        List of (node_id, authority_score) tuples, sorted by score descending
    """
    _, authorities = compute_hits(G)
    sorted_auth = sorted(authorities.items(), key=lambda x: -x[1])
    return sorted_auth[:k]


# =============================================================================
# Katz Centrality
# =============================================================================

def compute_katz_centrality(
    G: nx.DiGraph,
    alpha: float = 0.1,
    beta: float = 1.0,
    max_iter: int = 1000,
    tol: float = 1e-6,
    normalized: bool = True,
) -> Dict[str, float]:
    """
    Compute Katz centrality for each node.

    Katz centrality is similar to PageRank but better suited for DAGs.
    It measures influence based on the total number of walks from a node.

    x_i = alpha * sum_j(A_ij * x_j) + beta

    Args:
        G: Directed graph
        alpha: Attenuation factor (should be < 1/lambda_max)
        beta: Base centrality for all nodes
        max_iter: Maximum iterations
        tol: Convergence tolerance
        normalized: Whether to normalize scores

    Returns:
        Dict mapping node ID to Katz centrality score
    """
    if G.number_of_nodes() == 0:
        return {}

    try:
        # Use NetworkX's Katz centrality
        katz = nx.katz_centrality(
            G,
            alpha=alpha,
            beta=beta,
            max_iter=max_iter,
            tol=tol,
            normalized=normalized,
        )
        return katz
    except nx.PowerIterationFailedConvergence:
        # If convergence fails, try with smaller alpha
        try:
            katz = nx.katz_centrality(
                G,
                alpha=alpha / 2,
                beta=beta,
                max_iter=max_iter * 2,
                tol=tol,
                normalized=normalized,
            )
            return katz
        except nx.PowerIterationFailedConvergence:
            # Fall back to numpy-based computation
            katz = nx.katz_centrality_numpy(G, alpha=alpha / 4, beta=beta, normalized=normalized)
            return katz


# =============================================================================
# Combined Structural Analysis
# =============================================================================

def analyze_structure(G: nx.Graph | nx.DiGraph) -> Dict[str, Any]:
    """
    Compute comprehensive structural analysis.

    Args:
        G: Graph (directed or undirected)

    Returns:
        Dict with bridges, articulation points, and counts
    """
    bridges = find_bridges(G)
    ap = find_articulation_points(G)

    result = {
        "bridges": bridges,
        "articulation_points": ap,
        "num_bridges": len(bridges),
        "num_articulation_points": len(ap),
    }

    # Add HITS if directed
    if G.is_directed() and G.number_of_nodes() > 0:
        hubs, authorities = compute_hits(G)
        result["hubs"] = hubs
        result["authorities"] = authorities
        result["top_hubs"] = get_top_hubs(G, k=10)
        result["top_authorities"] = get_top_authorities(G, k=10)

    return result
