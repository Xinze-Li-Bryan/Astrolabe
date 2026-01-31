"""
Centrality Measures

Computes PageRank, Betweenness Centrality, and related metrics.
"""

from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
import networkx as nx


@dataclass
class CentralityResult:
    """Result of centrality computation"""
    values: Dict[str, float]  # node_id -> centrality value
    top_nodes: List[Tuple[str, float]]  # Top k nodes by centrality
    mean: float
    max_value: float
    min_value: float

    def to_dict(self) -> dict:
        return {
            "values": self.values,
            "topNodes": [{"nodeId": n, "value": v} for n, v in self.top_nodes],
            "mean": self.mean,
            "maxValue": self.max_value,
            "minValue": self.min_value,
        }


def _summarize_centrality(
    values: Dict[str, float],
    top_k: int = 10,
) -> CentralityResult:
    """Create CentralityResult from raw centrality values"""
    if not values:
        return CentralityResult(
            values={},
            top_nodes=[],
            mean=0,
            max_value=0,
            min_value=0,
        )

    sorted_nodes = sorted(values.items(), key=lambda x: x[1], reverse=True)
    vals = list(values.values())

    return CentralityResult(
        values=values,
        top_nodes=sorted_nodes[:top_k],
        mean=sum(vals) / len(vals),
        max_value=max(vals),
        min_value=min(vals),
    )


def compute_pagerank(
    G: nx.DiGraph | nx.Graph,
    alpha: float = 0.85,
    max_iter: int = 100,
    tol: float = 1e-6,
    top_k: int = 10,
) -> CentralityResult:
    """
    Compute PageRank centrality.

    PageRank measures the importance of nodes based on the structure of incoming links.
    Nodes that are linked to by other important nodes will have high PageRank.

    In the context of Lean proofs:
    - High PageRank = theorems/lemmas that are referenced by many important results
    - These are "foundational" results that the codebase builds upon

    Args:
        G: NetworkX graph (directed preferred)
        alpha: Damping factor (probability of following a link vs random jump)
        max_iter: Maximum iterations for convergence
        tol: Convergence tolerance
        top_k: Number of top nodes to return

    Returns:
        CentralityResult with PageRank values
    """
    if G.number_of_nodes() == 0:
        return _summarize_centrality({}, top_k)

    try:
        pagerank = nx.pagerank(G, alpha=alpha, max_iter=max_iter, tol=tol)
    except nx.PowerIterationFailedConvergence:
        # Fall back with more iterations
        pagerank = nx.pagerank(G, alpha=alpha, max_iter=500, tol=1e-4)

    return _summarize_centrality(pagerank, top_k)


def compute_betweenness_centrality(
    G: nx.DiGraph | nx.Graph,
    normalized: bool = True,
    k: Optional[int] = None,
    top_k: int = 10,
) -> CentralityResult:
    """
    Compute Betweenness centrality.

    Betweenness measures how often a node lies on the shortest path between other nodes.
    High betweenness = "bridge" nodes that connect different parts of the graph.

    In the context of Lean proofs:
    - High betweenness = lemmas that bridge different mathematical domains
    - These are "connector" results that link different areas

    Args:
        G: NetworkX graph
        normalized: If True, normalize by 2/((n-1)(n-2)) for directed graphs
        k: If specified, use k random samples for approximation (faster for large graphs)
        top_k: Number of top nodes to return

    Returns:
        CentralityResult with betweenness values
    """
    if G.number_of_nodes() == 0:
        return _summarize_centrality({}, top_k)

    # For large graphs, use sampling
    n = G.number_of_nodes()
    if k is None and n > 5000:
        k = min(1000, n // 5)  # Sample at most 1000 or 20% of nodes

    if k is not None:
        betweenness = nx.betweenness_centrality(G, normalized=normalized, k=k)
    else:
        betweenness = nx.betweenness_centrality(G, normalized=normalized)

    return _summarize_centrality(betweenness, top_k)


def compute_closeness_centrality(
    G: nx.DiGraph | nx.Graph,
    top_k: int = 10,
) -> CentralityResult:
    """
    Compute Closeness centrality.

    Closeness measures how close a node is to all other nodes (inverse of average distance).
    High closeness = nodes that can reach other nodes quickly.

    In the context of Lean proofs:
    - High closeness = results that are "central" and can be reached from many places
    - These are often utility lemmas used throughout the codebase

    Args:
        G: NetworkX graph
        top_k: Number of top nodes to return

    Returns:
        CentralityResult with closeness values
    """
    if G.number_of_nodes() == 0:
        return _summarize_centrality({}, top_k)

    closeness = nx.closeness_centrality(G)
    return _summarize_centrality(closeness, top_k)


def compute_eigenvector_centrality(
    G: nx.DiGraph | nx.Graph,
    max_iter: int = 1000,
    top_k: int = 10,
) -> CentralityResult:
    """
    Compute Eigenvector centrality.

    Similar to PageRank but without damping factor.
    Measures influence: a node is important if it's connected to other important nodes.

    Args:
        G: NetworkX graph
        max_iter: Maximum iterations for convergence
        top_k: Number of top nodes to return

    Returns:
        CentralityResult with eigenvector centrality values
    """
    if G.number_of_nodes() == 0:
        return _summarize_centrality({}, top_k)

    try:
        eigenvector = nx.eigenvector_centrality(G, max_iter=max_iter)
    except nx.PowerIterationFailedConvergence:
        # Graph may not have a well-defined eigenvector centrality
        # Fall back to PageRank
        return compute_pagerank(G, top_k=top_k)

    return _summarize_centrality(eigenvector, top_k)


def compute_all_centralities(
    G: nx.DiGraph | nx.Graph,
    top_k: int = 10,
    include_expensive: bool = False,
) -> Dict[str, CentralityResult]:
    """
    Compute all centrality measures at once.

    Args:
        G: NetworkX graph
        top_k: Number of top nodes to return for each metric
        include_expensive: If True, include betweenness (can be slow for large graphs)

    Returns:
        Dictionary with all centrality results
    """
    results = {
        "pagerank": compute_pagerank(G, top_k=top_k),
        "closeness": compute_closeness_centrality(G, top_k=top_k),
    }

    if include_expensive or G.number_of_nodes() < 5000:
        results["betweenness"] = compute_betweenness_centrality(G, top_k=top_k)

    return results
