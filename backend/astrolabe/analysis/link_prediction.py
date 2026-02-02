"""
Link Prediction Module

Provides methods to predict missing or potential links in the graph:
- Common Neighbors
- Adamic-Adar Index
- Jaccard Coefficient
- Resource Allocation Index
- Preferential Attachment

These can be used to:
- Discover potentially missing mathematical dependencies
- Suggest related theorems that might benefit from explicit connections
- Identify implicit relationships in the dependency graph
"""

from typing import Dict, List, Any, Set, Tuple, Optional
import networkx as nx
from heapq import nlargest


# =============================================================================
# Link Prediction Scores
# =============================================================================

def common_neighbors_score(
    G: nx.Graph | nx.DiGraph,
    u: str,
    v: str
) -> int:
    """
    Compute Common Neighbors score.

    score(u, v) = |N(u) ∩ N(v)|

    Higher score = more common neighbors = more likely to be connected.
    """
    if G.is_directed():
        # For directed graphs, use predecessors (nodes that depend on u and v)
        neighbors_u = set(G.predecessors(u)) | set(G.successors(u))
        neighbors_v = set(G.predecessors(v)) | set(G.successors(v))
    else:
        neighbors_u = set(G.neighbors(u))
        neighbors_v = set(G.neighbors(v))

    return len(neighbors_u & neighbors_v)


def adamic_adar_score(
    G: nx.Graph | nx.DiGraph,
    u: str,
    v: str
) -> float:
    """
    Compute Adamic-Adar Index.

    AA(u, v) = Σ_{z ∈ N(u) ∩ N(v)} 1 / log|N(z)|

    Gives more weight to common neighbors with fewer connections.
    A common neighbor that is a "hub" contributes less than a rare one.
    """
    if G.is_directed():
        neighbors_u = set(G.predecessors(u)) | set(G.successors(u))
        neighbors_v = set(G.predecessors(v)) | set(G.successors(v))
    else:
        neighbors_u = set(G.neighbors(u))
        neighbors_v = set(G.neighbors(v))

    common = neighbors_u & neighbors_v

    score = 0.0
    for z in common:
        if G.is_directed():
            degree_z = G.in_degree(z) + G.out_degree(z)
        else:
            degree_z = G.degree(z)

        if degree_z > 1:
            import math
            score += 1.0 / math.log(degree_z)

    return score


def jaccard_coefficient(
    G: nx.Graph | nx.DiGraph,
    u: str,
    v: str
) -> float:
    """
    Compute Jaccard Coefficient.

    J(u, v) = |N(u) ∩ N(v)| / |N(u) ∪ N(v)|

    Normalized version of common neighbors.
    Values in [0, 1], higher = more similar neighborhoods.
    """
    if G.is_directed():
        neighbors_u = set(G.predecessors(u)) | set(G.successors(u))
        neighbors_v = set(G.predecessors(v)) | set(G.successors(v))
    else:
        neighbors_u = set(G.neighbors(u))
        neighbors_v = set(G.neighbors(v))

    intersection = len(neighbors_u & neighbors_v)
    union = len(neighbors_u | neighbors_v)

    if union == 0:
        return 0.0

    return intersection / union


def resource_allocation_score(
    G: nx.Graph | nx.DiGraph,
    u: str,
    v: str
) -> float:
    """
    Compute Resource Allocation Index.

    RA(u, v) = Σ_{z ∈ N(u) ∩ N(v)} 1 / |N(z)|

    Similar to Adamic-Adar but uses degree instead of log(degree).
    Even stronger penalty for hub common neighbors.
    """
    if G.is_directed():
        neighbors_u = set(G.predecessors(u)) | set(G.successors(u))
        neighbors_v = set(G.predecessors(v)) | set(G.successors(v))
    else:
        neighbors_u = set(G.neighbors(u))
        neighbors_v = set(G.neighbors(v))

    common = neighbors_u & neighbors_v

    score = 0.0
    for z in common:
        if G.is_directed():
            degree_z = G.in_degree(z) + G.out_degree(z)
        else:
            degree_z = G.degree(z)

        if degree_z > 0:
            score += 1.0 / degree_z

    return score


def preferential_attachment_score(
    G: nx.Graph | nx.DiGraph,
    u: str,
    v: str
) -> int:
    """
    Compute Preferential Attachment score.

    PA(u, v) = |N(u)| × |N(v)|

    Based on the rich-get-richer principle: high-degree nodes
    are more likely to form new connections.
    """
    if G.is_directed():
        degree_u = G.in_degree(u) + G.out_degree(u)
        degree_v = G.in_degree(v) + G.out_degree(v)
    else:
        degree_u = G.degree(u)
        degree_v = G.degree(v)

    return degree_u * degree_v


# =============================================================================
# Batch Prediction
# =============================================================================

def predict_links(
    G: nx.Graph | nx.DiGraph,
    method: str = "adamic_adar",
    top_k: int = 100,
    exclude_existing: bool = True,
    candidate_pairs: Optional[List[Tuple[str, str]]] = None
) -> List[Dict[str, Any]]:
    """
    Predict missing links using specified method.

    Args:
        G: NetworkX graph
        method: One of "common_neighbors", "adamic_adar", "jaccard",
                "resource_allocation", "preferential_attachment"
        top_k: Number of top predictions to return
        exclude_existing: Whether to exclude pairs that already have edges
        candidate_pairs: Optional list of specific pairs to score.
                        If None, considers all non-adjacent pairs.

    Returns:
        List of dicts with (source, target, score) sorted by score descending
    """
    if G.number_of_nodes() < 2:
        return []

    # Select scoring function
    score_funcs = {
        "common_neighbors": common_neighbors_score,
        "adamic_adar": adamic_adar_score,
        "jaccard": jaccard_coefficient,
        "resource_allocation": resource_allocation_score,
        "preferential_attachment": preferential_attachment_score,
    }

    if method not in score_funcs:
        raise ValueError(f"Unknown method: {method}. Choose from {list(score_funcs.keys())}")

    score_func = score_funcs[method]

    # Generate candidate pairs
    if candidate_pairs is not None:
        pairs = candidate_pairs
    else:
        # For large graphs, limit candidates to nodes within 2-3 hops
        # This is a common optimization for link prediction
        nodes = list(G.nodes())

        if len(nodes) > 1000:
            # For large graphs, only consider pairs with at least one common neighbor
            pairs = _get_pairs_with_common_neighbors(G)
        else:
            # For smaller graphs, consider all pairs
            pairs = [(u, v) for i, u in enumerate(nodes) for v in nodes[i+1:]]

    # Filter existing edges if requested
    if exclude_existing:
        existing = set(G.edges())
        if G.is_directed():
            pairs = [(u, v) for u, v in pairs
                     if (u, v) not in existing and (v, u) not in existing]
        else:
            pairs = [(u, v) for u, v in pairs if (u, v) not in existing]

    # Score all pairs
    scored_pairs = []
    for u, v in pairs:
        if u in G and v in G:
            score = score_func(G, u, v)
            if score > 0:  # Only include non-zero scores
                scored_pairs.append({
                    "source": u,
                    "target": v,
                    "score": float(score),
                    "method": method,
                })

    # Return top-k by score
    return nlargest(top_k, scored_pairs, key=lambda x: x["score"])


def _get_pairs_with_common_neighbors(G: nx.Graph | nx.DiGraph) -> List[Tuple[str, str]]:
    """
    Get pairs of non-adjacent nodes that share at least one neighbor.
    This is much faster than considering all pairs for large graphs.
    """
    pairs = set()

    for node in G.nodes():
        if G.is_directed():
            neighbors = list(G.predecessors(node)) + list(G.successors(node))
        else:
            neighbors = list(G.neighbors(node))

        # For each pair of neighbors of this node
        for i, n1 in enumerate(neighbors):
            for n2 in neighbors[i+1:]:
                # If they're not already connected, add to candidates
                if not G.has_edge(n1, n2) and (not G.is_directed() or not G.has_edge(n2, n1)):
                    pairs.add((min(n1, n2), max(n1, n2)))

    return list(pairs)


def predict_links_for_node(
    G: nx.Graph | nx.DiGraph,
    node: str,
    method: str = "adamic_adar",
    top_k: int = 10,
    exclude_existing: bool = True
) -> List[Dict[str, Any]]:
    """
    Predict missing links for a specific node.

    Args:
        G: NetworkX graph
        node: The node to find potential connections for
        method: Scoring method
        top_k: Number of predictions to return
        exclude_existing: Whether to exclude existing connections

    Returns:
        List of dicts with predicted connections for this node
    """
    if node not in G:
        return []

    # Get candidate nodes (all other nodes, optionally excluding existing neighbors)
    if exclude_existing:
        if G.is_directed():
            existing = set(G.predecessors(node)) | set(G.successors(node))
        else:
            existing = set(G.neighbors(node))
        candidates = [n for n in G.nodes() if n != node and n not in existing]
    else:
        candidates = [n for n in G.nodes() if n != node]

    # Create pairs
    pairs = [(node, c) for c in candidates]

    return predict_links(G, method=method, top_k=top_k,
                        exclude_existing=False, candidate_pairs=pairs)


# =============================================================================
# Multi-Method Ensemble
# =============================================================================

def predict_links_ensemble(
    G: nx.Graph | nx.DiGraph,
    top_k: int = 100,
    methods: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Predict links using ensemble of multiple methods.

    Combines scores from multiple methods using rank aggregation.

    Args:
        G: NetworkX graph
        top_k: Number of predictions to return
        methods: List of methods to use (default: all methods)

    Returns:
        List of dicts with combined predictions
    """
    if methods is None:
        methods = ["adamic_adar", "jaccard", "resource_allocation"]

    # Get predictions from each method
    all_predictions = {}

    for method in methods:
        preds = predict_links(G, method=method, top_k=top_k * 2)
        for pred in preds:
            key = (pred["source"], pred["target"])
            if key not in all_predictions:
                all_predictions[key] = {
                    "source": pred["source"],
                    "target": pred["target"],
                    "scores": {},
                    "ranks": {},
                }
            all_predictions[key]["scores"][method] = pred["score"]

    # Compute ranks for each method
    for method in methods:
        # Get all pairs sorted by this method's score
        pairs_with_score = [
            (k, v["scores"].get(method, 0))
            for k, v in all_predictions.items()
        ]
        pairs_with_score.sort(key=lambda x: x[1], reverse=True)

        # Assign ranks
        for rank, (key, _) in enumerate(pairs_with_score, 1):
            all_predictions[key]["ranks"][method] = rank

    # Compute average rank for each pair
    for key, pred in all_predictions.items():
        ranks = list(pred["ranks"].values())
        pred["avg_rank"] = sum(ranks) / len(ranks) if ranks else float('inf')
        pred["num_methods"] = len(ranks)

    # Sort by average rank (lower is better)
    results = sorted(all_predictions.values(), key=lambda x: x["avg_rank"])

    return results[:top_k]


# =============================================================================
# Link Prediction Analysis
# =============================================================================

def analyze_link_prediction(
    G: nx.Graph | nx.DiGraph,
    top_k: int = 50
) -> Dict[str, Any]:
    """
    Comprehensive link prediction analysis.

    Args:
        G: NetworkX graph
        top_k: Number of predictions per method

    Returns:
        Dict with predictions from multiple methods and ensemble
    """
    result = {
        "graph_info": {
            "nodes": G.number_of_nodes(),
            "edges": G.number_of_edges(),
            "density": nx.density(G),
        }
    }

    # Individual method predictions
    methods = ["adamic_adar", "jaccard", "resource_allocation", "common_neighbors"]

    for method in methods:
        try:
            preds = predict_links(G, method=method, top_k=top_k)
            result[method] = {
                "predictions": preds,
                "count": len(preds),
            }
        except Exception as e:
            result[method] = {"error": str(e)}

    # Ensemble predictions
    try:
        ensemble = predict_links_ensemble(G, top_k=top_k, methods=methods[:3])
        result["ensemble"] = {
            "predictions": ensemble,
            "count": len(ensemble),
            "methods_used": methods[:3],
        }
    except Exception as e:
        result["ensemble"] = {"error": str(e)}

    return result
