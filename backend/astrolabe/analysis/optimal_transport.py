"""
Optimal Transport and Ricci Curvature Module

Provides geometric analysis using optimal transport theory:
- Forman-Ricci Curvature (fast, O(E))
- Ollivier-Ricci Curvature (slower but more accurate, O(V·E))
- Wasserstein distance for distribution comparison

Geometric interpretation for mathematical dependency graphs:
- Positive curvature (κ > 0): Tightly clustered theorems, well-connected regions
- Negative curvature (κ < 0): Branching points, fundamental lemmas that diverge
- Zero curvature (κ ≈ 0): Linear chains, sequential dependencies
"""

from typing import Dict, List, Any, Optional, Tuple
import numpy as np
import networkx as nx

try:
    from GraphRicciCurvature.FormanRicci import FormanRicci
    from GraphRicciCurvature.OllivierRicci import OllivierRicci
    HAS_RICCI = True
except ImportError:
    HAS_RICCI = False

try:
    import ot
    HAS_POT = True
except ImportError:
    HAS_POT = False


# =============================================================================
# Forman-Ricci Curvature (Fast)
# =============================================================================

def compute_forman_ricci(G: nx.Graph | nx.DiGraph) -> Dict[str, Any]:
    """
    Compute Forman-Ricci curvature for all edges.

    Forman-Ricci is a combinatorial analog of Ricci curvature.
    It's computed locally for each edge based on the degrees of
    incident vertices and edges.

    Formula (simplified):
    F(e) = 4 - d(v₁) - d(v₂)

    where d(v) is the degree of vertex v.

    Complexity: O(E) - very fast

    Args:
        G: NetworkX graph (will be converted to undirected)

    Returns:
        Dict with edge curvatures, node curvatures, and statistics
    """
    if G.number_of_edges() == 0:
        return {"error": "No edges in graph"}

    # Forman-Ricci requires undirected graph
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G.copy()

    if HAS_RICCI:
        return _compute_forman_ricci_library(G_undirected)
    else:
        return _compute_forman_ricci_manual(G_undirected)


def _compute_forman_ricci_library(G: nx.Graph) -> Dict[str, Any]:
    """Use GraphRicciCurvature library for Forman-Ricci."""
    frc = FormanRicci(G)
    frc.compute_ricci_curvature()

    # Extract edge curvatures
    edge_curvatures = {}
    for (u, v), data in frc.G.edges(data=True):
        key = f"{u}--{v}"
        edge_curvatures[key] = {
            "source": u,
            "target": v,
            "curvature": float(data.get("formanCurvature", 0)),
        }

    # Compute node curvatures (average of incident edge curvatures)
    node_curvatures = _aggregate_node_curvatures(edge_curvatures)

    # Statistics
    curvatures = [e["curvature"] for e in edge_curvatures.values()]

    return {
        "method": "forman_ricci",
        "edge_curvatures": edge_curvatures,
        "node_curvatures": node_curvatures,
        "statistics": _curvature_statistics(curvatures),
        "interpretation": _interpret_curvatures(curvatures),
    }


def _compute_forman_ricci_manual(G: nx.Graph) -> Dict[str, Any]:
    """
    Manual computation of Forman-Ricci curvature.

    For an edge e = (v₁, v₂):
    F(e) = 4 - d(v₁) - d(v₂) + 3 * |triangles containing e|

    Simplified version without edge weights:
    F(e) = 4 - d(v₁) - d(v₂)
    """
    edge_curvatures = {}

    for u, v in G.edges():
        d_u = G.degree(u)
        d_v = G.degree(v)

        # Count triangles containing this edge
        neighbors_u = set(G.neighbors(u))
        neighbors_v = set(G.neighbors(v))
        triangles = len(neighbors_u & neighbors_v)

        # Forman-Ricci curvature
        curvature = 4 - d_u - d_v + 3 * triangles

        key = f"{u}--{v}"
        edge_curvatures[key] = {
            "source": u,
            "target": v,
            "curvature": float(curvature),
        }

    node_curvatures = _aggregate_node_curvatures(edge_curvatures)
    curvatures = [e["curvature"] for e in edge_curvatures.values()]

    return {
        "method": "forman_ricci_manual",
        "edge_curvatures": edge_curvatures,
        "node_curvatures": node_curvatures,
        "statistics": _curvature_statistics(curvatures),
        "interpretation": _interpret_curvatures(curvatures),
    }


# =============================================================================
# Ollivier-Ricci Curvature (More Accurate)
# =============================================================================

def compute_ollivier_ricci(
    G: nx.Graph | nx.DiGraph,
    alpha: float = 0.5,
    method: str = "OTD"
) -> Dict[str, Any]:
    """
    Compute Ollivier-Ricci curvature for all edges.

    Ollivier-Ricci curvature is defined using optimal transport:
    κ(x, y) = 1 - W₁(μₓ, μᵧ) / d(x, y)

    where:
    - W₁ is the Wasserstein-1 distance (Earth Mover's Distance)
    - μₓ is a probability measure around node x
    - d(x, y) is the graph distance between x and y

    Complexity: O(V × E) - slower for large graphs

    Args:
        G: NetworkX graph
        alpha: Laziness parameter (0.5 = standard, higher = more local)
        method: "OTD" (optimal transport) or "ATD" (average transport)

    Returns:
        Dict with edge curvatures, node curvatures, and statistics
    """
    if not HAS_RICCI:
        return {"error": "GraphRicciCurvature library not available"}

    if G.number_of_edges() == 0:
        return {"error": "No edges in graph"}

    # Ollivier-Ricci requires undirected graph
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G.copy()

    # For large graphs, warn about computation time
    if G_undirected.number_of_nodes() > 2000:
        return {
            "warning": "Graph too large for Ollivier-Ricci (>2000 nodes). Use Forman-Ricci instead.",
            "recommendation": "forman_ricci",
        }

    try:
        orc = OllivierRicci(G_undirected, alpha=alpha, method=method, verbose="ERROR")
        orc.compute_ricci_curvature()

        # Extract edge curvatures
        edge_curvatures = {}
        for (u, v), data in orc.G.edges(data=True):
            key = f"{u}--{v}"
            edge_curvatures[key] = {
                "source": u,
                "target": v,
                "curvature": float(data.get("ricciCurvature", 0)),
            }

        # Compute node curvatures
        node_curvatures = _aggregate_node_curvatures(edge_curvatures)

        # Statistics
        curvatures = [e["curvature"] for e in edge_curvatures.values()]

        return {
            "method": "ollivier_ricci",
            "alpha": alpha,
            "edge_curvatures": edge_curvatures,
            "node_curvatures": node_curvatures,
            "statistics": _curvature_statistics(curvatures),
            "interpretation": _interpret_curvatures(curvatures),
        }
    except Exception as e:
        return {"error": f"Ollivier-Ricci computation failed: {str(e)}"}


# =============================================================================
# Wasserstein Distance
# =============================================================================

def compute_wasserstein_distance(
    dist1: List[float],
    dist2: List[float]
) -> Dict[str, float]:
    """
    Compute Wasserstein (Earth Mover's) distance between two distributions.

    W_p(μ, ν) = (inf_{γ ∈ Γ(μ, ν)} ∫ d(x, y)^p dγ(x, y))^{1/p}

    Args:
        dist1: First distribution (histogram or density)
        dist2: Second distribution (must have same length)

    Returns:
        Dict with Wasserstein-1 and Wasserstein-2 distances
    """
    if not HAS_POT:
        # Fallback to scipy
        from scipy.stats import wasserstein_distance
        w1 = wasserstein_distance(range(len(dist1)), range(len(dist2)), dist1, dist2)
        return {"wasserstein_1": float(w1), "library": "scipy"}

    # Normalize to probability distributions
    dist1 = np.array(dist1, dtype=float)
    dist2 = np.array(dist2, dtype=float)

    dist1 = dist1 / dist1.sum() if dist1.sum() > 0 else dist1
    dist2 = dist2 / dist2.sum() if dist2.sum() > 0 else dist2

    # Cost matrix (1D case: |i - j|)
    n = len(dist1)
    m = len(dist2)
    M = np.abs(np.arange(n)[:, np.newaxis] - np.arange(m)[np.newaxis, :])
    M = M.astype(float)

    # Compute Wasserstein distance
    w1 = ot.emd2(dist1, dist2, M)

    return {
        "wasserstein_1": float(w1),
        "library": "POT",
    }


def compare_degree_distributions(
    G1: nx.Graph | nx.DiGraph,
    G2: nx.Graph | nx.DiGraph
) -> Dict[str, Any]:
    """
    Compare degree distributions of two graphs using Wasserstein distance.

    Args:
        G1: First graph
        G2: Second graph

    Returns:
        Dict with Wasserstein distances and statistics
    """
    # Get degree sequences
    degrees1 = [d for n, d in G1.degree()]
    degrees2 = [d for n, d in G2.degree()]

    # Create histograms with same bins
    max_degree = max(max(degrees1) if degrees1 else 0,
                     max(degrees2) if degrees2 else 0)
    bins = range(max_degree + 2)

    hist1, _ = np.histogram(degrees1, bins=bins, density=True)
    hist2, _ = np.histogram(degrees2, bins=bins, density=True)

    # Compute distance
    dist = compute_wasserstein_distance(hist1.tolist(), hist2.tolist())

    return {
        "wasserstein_distance": dist,
        "graph1_stats": {
            "nodes": G1.number_of_nodes(),
            "edges": G1.number_of_edges(),
            "mean_degree": float(np.mean(degrees1)) if degrees1 else 0,
        },
        "graph2_stats": {
            "nodes": G2.number_of_nodes(),
            "edges": G2.number_of_edges(),
            "mean_degree": float(np.mean(degrees2)) if degrees2 else 0,
        },
    }


# =============================================================================
# Helper Functions
# =============================================================================

def _aggregate_node_curvatures(
    edge_curvatures: Dict[str, Dict[str, Any]]
) -> Dict[str, float]:
    """Compute node curvature as average of incident edge curvatures."""
    node_sums = {}
    node_counts = {}

    for edge_data in edge_curvatures.values():
        u, v = edge_data["source"], edge_data["target"]
        curv = edge_data["curvature"]

        for node in [u, v]:
            node_sums[node] = node_sums.get(node, 0) + curv
            node_counts[node] = node_counts.get(node, 0) + 1

    return {
        node: node_sums[node] / node_counts[node]
        for node in node_sums
    }


def _curvature_statistics(curvatures: List[float]) -> Dict[str, float]:
    """Compute statistics for curvature values."""
    if not curvatures:
        return {}

    arr = np.array(curvatures)
    return {
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "mean": float(np.mean(arr)),
        "std": float(np.std(arr)),
        "median": float(np.median(arr)),
        "positive_count": int(np.sum(arr > 0)),
        "negative_count": int(np.sum(arr < 0)),
        "zero_count": int(np.sum(arr == 0)),
        "positive_ratio": float(np.mean(arr > 0)),
        "negative_ratio": float(np.mean(arr < 0)),
    }


def _interpret_curvatures(curvatures: List[float]) -> Dict[str, str]:
    """Provide interpretation of curvature distribution."""
    if not curvatures:
        return {}

    arr = np.array(curvatures)
    mean_curv = np.mean(arr)
    pos_ratio = np.mean(arr > 0)
    neg_ratio = np.mean(arr < 0)

    # Overall structure interpretation
    if mean_curv > 0.5:
        overall = "highly_clustered"
        description = "The graph has strong clustering with tightly connected groups"
    elif mean_curv > 0:
        overall = "moderately_clustered"
        description = "The graph has moderate clustering"
    elif mean_curv > -0.5:
        overall = "tree_like"
        description = "The graph has tree-like branching structure"
    else:
        overall = "highly_branching"
        description = "The graph has extensive branching with many diverging paths"

    # For mathematical dependency graphs
    if pos_ratio > 0.6:
        math_interpretation = "Many theorems are tightly interconnected in clusters"
    elif neg_ratio > 0.6:
        math_interpretation = "Many fundamental lemmas branch into multiple directions"
    else:
        math_interpretation = "Mixed structure with both clusters and branching points"

    return {
        "overall_structure": overall,
        "description": description,
        "math_interpretation": math_interpretation,
    }


# =============================================================================
# Combined Analysis
# =============================================================================

def analyze_curvature(
    G: nx.Graph | nx.DiGraph,
    method: str = "forman"
) -> Dict[str, Any]:
    """
    Comprehensive curvature analysis.

    Args:
        G: NetworkX graph
        method: "forman" (fast) or "ollivier" (accurate)

    Returns:
        Dict with curvature analysis results
    """
    result = {
        "graph_info": {
            "nodes": G.number_of_nodes(),
            "edges": G.number_of_edges(),
        }
    }

    if method == "forman" or not HAS_RICCI:
        result["curvature"] = compute_forman_ricci(G)
    else:
        result["curvature"] = compute_ollivier_ricci(G)

    # Identify interesting regions
    if "edge_curvatures" in result["curvature"]:
        edge_curvs = result["curvature"]["edge_curvatures"]

        # Most positive edges (tight clusters)
        positive_edges = sorted(
            [(k, v["curvature"]) for k, v in edge_curvs.items()],
            key=lambda x: x[1],
            reverse=True
        )[:10]

        # Most negative edges (branching points)
        negative_edges = sorted(
            [(k, v["curvature"]) for k, v in edge_curvs.items()],
            key=lambda x: x[1]
        )[:10]

        result["highlights"] = {
            "most_clustered_edges": [
                {"edge": e, "curvature": c} for e, c in positive_edges if c > 0
            ],
            "most_branching_edges": [
                {"edge": e, "curvature": c} for e, c in negative_edges if c < 0
            ],
        }

    # If node curvatures available, find extreme nodes
    if "node_curvatures" in result["curvature"]:
        node_curvs = result["curvature"]["node_curvatures"]

        sorted_nodes = sorted(node_curvs.items(), key=lambda x: x[1])

        result["highlights"]["most_clustered_nodes"] = [
            {"node": n, "curvature": c}
            for n, c in sorted_nodes[-10:] if c > 0
        ][::-1]

        result["highlights"]["most_branching_nodes"] = [
            {"node": n, "curvature": c}
            for n, c in sorted_nodes[:10] if c < 0
        ]

    return result
