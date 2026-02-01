"""
Network Analysis Module for Astrolabe

Provides graph-theoretic analysis of Lean dependency graphs:
- Degree distribution and statistics
- Centrality measures (PageRank, Betweenness)
- Clustering coefficients
- Community detection (Louvain)
- Graph entropy (Von Neumann, Shannon)
- DAG-specific analysis (depth, layers, bottlenecks, critical path)
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
from .dag import (
    compute_dependency_depth,
    compute_topological_layers,
    get_nodes_by_layer,
    find_sources,
    find_sinks,
    compute_source_sink_stats,
    compute_proof_width,
    compute_bottleneck_scores,
    compute_reachability_count,
    find_critical_path,
    find_critical_path_to,
    compute_graph_depth,
    analyze_dag,
)
from .structural import (
    find_bridges,
    find_articulation_points,
    compute_hits,
    get_top_hubs,
    get_top_authorities,
    compute_katz_centrality,
    analyze_structure,
)
from .advanced import (
    compute_transitive_reduction,
    get_transitive_edges,
    compute_hierarchical_clustering,
    cut_dendrogram,
    compute_spectral_clustering,
    compute_fiedler_vector,
    analyze_advanced,
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
    # DAG analysis
    "compute_dependency_depth",
    "compute_topological_layers",
    "get_nodes_by_layer",
    "find_sources",
    "find_sinks",
    "compute_source_sink_stats",
    "compute_proof_width",
    "compute_bottleneck_scores",
    "compute_reachability_count",
    "find_critical_path",
    "find_critical_path_to",
    "compute_graph_depth",
    "analyze_dag",
    # Structural analysis
    "find_bridges",
    "find_articulation_points",
    "compute_hits",
    "get_top_hubs",
    "get_top_authorities",
    "compute_katz_centrality",
    "analyze_structure",
    # Advanced analysis
    "compute_transitive_reduction",
    "get_transitive_edges",
    "compute_hierarchical_clustering",
    "cut_dendrogram",
    "compute_spectral_clustering",
    "compute_fiedler_vector",
    "analyze_advanced",
]
