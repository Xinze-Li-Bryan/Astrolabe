"""
Network Analysis Module for Astrolabe

Provides graph-theoretic analysis of Lean dependency graphs:
- Degree distribution and statistics
- Centrality measures (PageRank, Betweenness)
- Clustering coefficients
- Community detection (Louvain)
- Graph entropy (Von Neumann, Shannon)
"""

from .graph_builder import build_networkx_graph, GraphStats
from .degree import (
    compute_degree_distribution,
    compute_degree_statistics,
    compute_degree_shannon_entropy,
)
from .centrality import (
    compute_pagerank,
    compute_betweenness_centrality,
)
from .clustering import (
    compute_clustering_coefficients,
    compute_namespace_clustering,
)
from .community import (
    detect_communities_louvain,
    compute_modularity,
)
from .entropy import (
    compute_von_neumann_entropy,
    compute_structure_entropy,
)

__all__ = [
    # Graph builder
    "build_networkx_graph",
    "GraphStats",
    # Degree
    "compute_degree_distribution",
    "compute_degree_statistics",
    "compute_degree_shannon_entropy",
    # Centrality
    "compute_pagerank",
    "compute_betweenness_centrality",
    # Clustering
    "compute_clustering_coefficients",
    "compute_namespace_clustering",
    # Community
    "detect_communities_louvain",
    "compute_modularity",
    # Entropy
    "compute_von_neumann_entropy",
    "compute_structure_entropy",
]
