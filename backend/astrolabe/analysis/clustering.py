"""
Clustering Coefficient Analysis

Computes local and global clustering coefficients.
"""

from dataclasses import dataclass
from typing import List, Dict, Tuple
import networkx as nx


@dataclass
class ClusteringResult:
    """Clustering coefficient results"""
    local: Dict[str, float]  # node_id -> local clustering coefficient
    global_coefficient: float  # Transitivity (global clustering)
    average_coefficient: float  # Average of local coefficients
    by_namespace: Dict[str, float]  # namespace -> average clustering

    def to_dict(self) -> dict:
        return {
            "local": self.local,
            "globalCoefficient": self.global_coefficient,
            "averageCoefficient": self.average_coefficient,
            "byNamespace": self.by_namespace,
        }


def compute_clustering_coefficients(
    G: nx.DiGraph | nx.Graph,
    include_local: bool = True,
) -> ClusteringResult:
    """
    Compute clustering coefficients.

    The clustering coefficient measures how much nodes tend to cluster together.
    - Local: For each node, what fraction of its neighbors are also connected?
    - Global (Transitivity): What fraction of possible triangles exist?

    In the context of Lean proofs:
    - High clustering = groups of lemmas that are tightly interconnected
    - These represent "cohesive" mathematical topics

    Args:
        G: NetworkX graph
        include_local: If True, compute local coefficients for each node

    Returns:
        ClusteringResult with local and global coefficients
    """
    # Clustering is defined for undirected graphs
    # For directed graphs, we convert to undirected
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G

    # Global clustering (transitivity)
    global_coef = nx.transitivity(G_undirected)

    # Local clustering coefficients
    if include_local:
        local_coef = nx.clustering(G_undirected)
    else:
        local_coef = {}

    # Average clustering coefficient
    avg_coef = nx.average_clustering(G_undirected) if G_undirected.number_of_nodes() > 0 else 0

    # Clustering by namespace
    namespace_clustering = compute_namespace_clustering(G_undirected, local_coef)

    return ClusteringResult(
        local=local_coef,
        global_coefficient=global_coef,
        average_coefficient=avg_coef,
        by_namespace=namespace_clustering,
    )


def compute_namespace_clustering(
    G: nx.Graph,
    local_coefficients: Dict[str, float] = None,
) -> Dict[str, float]:
    """
    Compute average clustering coefficient by namespace.

    Args:
        G: NetworkX graph (undirected)
        local_coefficients: Pre-computed local coefficients (optional)

    Returns:
        Dictionary mapping namespace to average clustering coefficient
    """
    if local_coefficients is None:
        local_coefficients = nx.clustering(G)

    # Group nodes by namespace
    namespace_nodes: Dict[str, List[str]] = {}
    for node_id in G.nodes():
        namespace = _extract_namespace(node_id)
        if namespace not in namespace_nodes:
            namespace_nodes[namespace] = []
        namespace_nodes[namespace].append(node_id)

    # Compute average for each namespace
    namespace_avg = {}
    for namespace, nodes in namespace_nodes.items():
        coefficients = [local_coefficients.get(n, 0) for n in nodes]
        namespace_avg[namespace] = sum(coefficients) / len(coefficients) if coefficients else 0

    return namespace_avg


def _extract_namespace(node_id: str) -> str:
    """Extract namespace from node ID"""
    parts = node_id.rsplit(".", 1)
    return parts[0] if len(parts) > 1 else ""


def get_triangles(G: nx.DiGraph | nx.Graph) -> Dict[str, int]:
    """
    Count triangles each node participates in.

    Args:
        G: NetworkX graph

    Returns:
        Dictionary mapping node_id to triangle count
    """
    if G.is_directed():
        G = G.to_undirected()
    return nx.triangles(G)


def find_highly_clustered_nodes(
    G: nx.DiGraph | nx.Graph,
    threshold: float = 0.5,
    min_degree: int = 3,
) -> List[Tuple[str, float]]:
    """
    Find nodes with high clustering coefficient.

    Args:
        G: NetworkX graph
        threshold: Minimum clustering coefficient
        min_degree: Minimum degree to consider (avoid trivial high-clustering nodes)

    Returns:
        List of (node_id, clustering_coefficient) tuples
    """
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G

    clustering = nx.clustering(G_undirected)
    degrees = dict(G_undirected.degree())

    highly_clustered = [
        (node, coef)
        for node, coef in clustering.items()
        if coef >= threshold and degrees.get(node, 0) >= min_degree
    ]

    return sorted(highly_clustered, key=lambda x: x[1], reverse=True)


def compute_clustering_by_kind(
    G: nx.DiGraph | nx.Graph,
    node_kinds: Dict[str, str],  # node_id -> kind
) -> Dict[str, float]:
    """
    Compute average clustering coefficient by node kind (theorem, lemma, def, etc.).

    Args:
        G: NetworkX graph
        node_kinds: Mapping of node_id to kind

    Returns:
        Dictionary mapping kind to average clustering
    """
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G

    clustering = nx.clustering(G_undirected)

    # Group by kind
    kind_coefficients: Dict[str, List[float]] = {}
    for node_id, coef in clustering.items():
        kind = node_kinds.get(node_id, "unknown")
        if kind not in kind_coefficients:
            kind_coefficients[kind] = []
        kind_coefficients[kind].append(coef)

    # Compute averages
    return {
        kind: sum(coeffs) / len(coeffs) if coeffs else 0
        for kind, coeffs in kind_coefficients.items()
    }
