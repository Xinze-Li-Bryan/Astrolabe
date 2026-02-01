"""
Advanced Analysis Module

Algorithms for advanced graph analysis:
- Transitive Reduction: minimal edge set preserving reachability
- Hierarchical Clustering: nested community structure
- Spectral Clustering: eigenvalue-based clustering
"""

from typing import Dict, List, Tuple, Any
import networkx as nx
import numpy as np
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.sparse.linalg import eigsh
from scipy.sparse import csr_matrix


# =============================================================================
# Transitive Reduction
# =============================================================================

def compute_transitive_reduction(G: nx.DiGraph) -> nx.DiGraph:
    """
    Compute the transitive reduction of a DAG.

    The transitive reduction is the minimal set of edges that preserves
    all reachability relationships. Removing transitive (redundant) edges
    simplifies visualization without losing dependency information.

    Args:
        G: Directed acyclic graph

    Returns:
        New DiGraph with transitive edges removed
    """
    if G.number_of_nodes() == 0:
        return nx.DiGraph()

    # NetworkX has built-in transitive reduction
    return nx.transitive_reduction(G)


def get_transitive_edges(G: nx.DiGraph) -> List[Tuple[str, str]]:
    """
    Identify which edges are transitive (redundant).

    A transitive edge (u, v) exists when there's also a path u -> ... -> v
    through other nodes.

    Args:
        G: Directed acyclic graph

    Returns:
        List of transitive edges as (source, target) tuples
    """
    if G.number_of_edges() == 0:
        return []

    reduced = compute_transitive_reduction(G)

    # Transitive edges = original edges - reduced edges
    original_edges = set(G.edges())
    reduced_edges = set(reduced.edges())

    return list(original_edges - reduced_edges)


# =============================================================================
# Hierarchical Clustering
# =============================================================================

def compute_hierarchical_clustering(
    G: nx.Graph | nx.DiGraph,
    method: str = "average",
) -> Dict[str, Any]:
    """
    Compute hierarchical (agglomerative) clustering.

    Uses the graph distance matrix to build a dendrogram showing
    nested community structure.

    Args:
        G: Graph (directed graphs are converted to undirected)
        method: Linkage method ('single', 'complete', 'average', 'ward')

    Returns:
        Dict with:
        - dendrogram: scipy linkage matrix
        - labels: node labels in order
    """
    # Convert to undirected if needed
    if G.is_directed():
        G = G.to_undirected()

    n = G.number_of_nodes()

    if n == 0:
        return {"dendrogram": np.array([]), "labels": []}

    if n == 1:
        return {"dendrogram": np.array([]), "labels": list(G.nodes())}

    # Get ordered list of nodes
    nodes = list(G.nodes())

    # Build distance matrix from shortest paths
    # Use 1 - similarity where similarity is based on common neighbors
    dist_matrix = np.zeros((n, n))

    for i, u in enumerate(nodes):
        for j, v in enumerate(nodes):
            if i < j:
                # Distance based on shortest path or structural dissimilarity
                if G.has_edge(u, v):
                    dist = 1.0
                elif nx.has_path(G, u, v):
                    dist = nx.shortest_path_length(G, u, v)
                else:
                    dist = n  # Max distance for disconnected nodes

                dist_matrix[i, j] = dist
                dist_matrix[j, i] = dist

    # Convert to condensed form for scipy
    from scipy.spatial.distance import squareform
    condensed = squareform(dist_matrix)

    # Compute linkage
    Z = linkage(condensed, method=method)

    return {
        "dendrogram": Z,
        "labels": nodes,
    }


def cut_dendrogram(
    dendrogram: np.ndarray,
    labels: List[str],
    n_clusters: int = 2,
) -> Dict[str, int]:
    """
    Cut dendrogram at a level to get flat clusters.

    Args:
        dendrogram: Linkage matrix from hierarchical clustering
        labels: Node labels in order
        n_clusters: Number of clusters to create

    Returns:
        Dict mapping node ID to cluster ID
    """
    if len(labels) == 0:
        return {}

    if len(labels) == 1:
        return {labels[0]: 0}

    # Cut the dendrogram
    cluster_ids = fcluster(dendrogram, n_clusters, criterion='maxclust')

    return {label: int(cid) for label, cid in zip(labels, cluster_ids)}


# =============================================================================
# Spectral Clustering
# =============================================================================

def compute_spectral_clustering(
    G: nx.Graph | nx.DiGraph,
    n_clusters: int = 2,
) -> Dict[Any, int]:
    """
    Perform spectral clustering on the graph.

    Uses the graph Laplacian eigenvectors to embed nodes in low-dimensional
    space, then clusters them.

    Args:
        G: Graph (directed graphs are converted to undirected)
        n_clusters: Number of clusters

    Returns:
        Dict mapping node ID to cluster ID
    """
    # Convert to undirected if needed
    if G.is_directed():
        G = G.to_undirected()

    n = G.number_of_nodes()

    if n == 0:
        return {}

    if n <= n_clusters:
        # Each node is its own cluster
        return {node: i for i, node in enumerate(G.nodes())}

    nodes = list(G.nodes())

    # Get normalized Laplacian
    L = nx.normalized_laplacian_matrix(G)

    # Compute smallest k eigenvectors (skip first which is all 1s)
    k = min(n_clusters + 1, n - 1)
    try:
        eigenvalues, eigenvectors = eigsh(L, k=k, which='SM')
    except Exception:
        # Fallback to dense computation for small graphs
        L_dense = L.toarray()
        eigenvalues, eigenvectors = np.linalg.eigh(L_dense)
        eigenvalues = eigenvalues[:k]
        eigenvectors = eigenvectors[:, :k]

    # Use eigenvectors 1 to k (skip first)
    embedding = eigenvectors[:, 1:n_clusters]

    # K-means clustering on the embedding
    from scipy.cluster.vq import kmeans2

    if embedding.shape[1] == 0:
        # Not enough eigenvectors, fall back to single cluster
        return {node: 0 for node in nodes}

    try:
        _, cluster_ids = kmeans2(embedding, n_clusters, minit='++')
    except Exception:
        # Fallback: assign based on sign of first non-trivial eigenvector
        if eigenvectors.shape[1] > 1:
            cluster_ids = (eigenvectors[:, 1] > 0).astype(int)
        else:
            cluster_ids = np.zeros(n, dtype=int)

    return {node: int(cid) for node, cid in zip(nodes, cluster_ids)}


def compute_fiedler_vector(G: nx.Graph | nx.DiGraph) -> Dict[Any, float]:
    """
    Compute the Fiedler vector (2nd smallest eigenvector of Laplacian).

    The Fiedler vector is useful for graph partitioning - the sign of
    each component indicates which partition a node belongs to.

    Args:
        G: Graph (directed graphs are converted to undirected)

    Returns:
        Dict mapping node ID to Fiedler vector component
    """
    # Convert to undirected if needed
    if G.is_directed():
        G = G.to_undirected()

    n = G.number_of_nodes()

    if n <= 1:
        return {node: 0.0 for node in G.nodes()}

    nodes = list(G.nodes())

    # Use NetworkX's built-in Fiedler vector computation
    try:
        fiedler = nx.fiedler_vector(G)
        return {node: float(val) for node, val in zip(nodes, fiedler)}
    except nx.NetworkXError:
        # Graph might be disconnected
        # Compute on largest connected component
        largest_cc = max(nx.connected_components(G), key=len)
        subgraph = G.subgraph(largest_cc)

        if len(largest_cc) <= 1:
            return {node: 0.0 for node in G.nodes()}

        fiedler = nx.fiedler_vector(subgraph)
        result = {node: 0.0 for node in G.nodes()}
        for node, val in zip(subgraph.nodes(), fiedler):
            result[node] = float(val)

        return result


# =============================================================================
# Combined Advanced Analysis
# =============================================================================

def analyze_advanced(
    G: nx.Graph | nx.DiGraph,
    n_clusters: int = 2,
) -> Dict[str, Any]:
    """
    Run comprehensive advanced analysis.

    Args:
        G: Graph
        n_clusters: Number of clusters for clustering algorithms

    Returns:
        Dict with all analysis results
    """
    result = {}

    # Spectral clustering
    spectral = compute_spectral_clustering(G, n_clusters=n_clusters)
    result["spectral_clusters"] = spectral
    result["num_spectral_clusters"] = len(set(spectral.values()))

    # Hierarchical clustering
    hierarchical = compute_hierarchical_clustering(G)
    result["hierarchical"] = {
        "labels": hierarchical["labels"],
        "has_dendrogram": len(hierarchical["dendrogram"]) > 0,
    }

    if len(hierarchical["labels"]) > 1:
        flat_clusters = cut_dendrogram(
            hierarchical["dendrogram"],
            hierarchical["labels"],
            n_clusters=n_clusters
        )
        result["hierarchical"]["clusters"] = flat_clusters

    # Transitive reduction (only for directed graphs)
    if G.is_directed():
        transitive = get_transitive_edges(G)
        result["transitive_edges"] = transitive
        result["num_transitive_edges"] = len(transitive)

    return result
