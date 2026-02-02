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

# New analysis modules (P0/P1/P2)
from .statistics import (
    fit_degree_distribution,
    compute_metric_correlations,
    compute_degree_assortativity,
    detect_zscore_anomalies,
    detect_mahalanobis_anomalies,
    detect_lof_anomalies,
    detect_isolation_forest_anomalies,
    analyze_statistics,
)
from .link_prediction import (
    predict_links,
    predict_links_for_node,
    predict_links_ensemble,
    analyze_link_prediction,
)
from .optimal_transport import (
    compute_forman_ricci,
    compute_ollivier_ricci,
    compute_wasserstein_distance,
    compare_degree_distributions,
    analyze_curvature,
)
from .geometry import (
    compute_laplacian,
    compute_laplacian_spectrum,
    compute_heat_kernel,
    compute_heat_kernel_signature,
    compute_diffusion_distance,
    compute_commute_time_distance,
    analyze_geometry,
)
from .topology import (
    compute_betti_numbers,
    compute_persistent_homology,
    compute_persistence_entropy,
    compute_persistence_landscape,
    compute_mapper,
    analyze_topology,
)
from .embedding import (
    compute_spectral_embedding,
    compute_node2vec_embedding,
    compute_diffusion_map,
    reduce_to_visualization,
    compute_feature_embedding,
    analyze_embedding,
)
from .pattern import (
    count_motifs_3node,
    count_motifs_4node,
    compute_motif_significance,
    find_pattern_instances,
    find_proof_patterns,
    analyze_patterns,
)

# Lean-specific analysis modules
from .lean_types import (
    declaration_kind_distribution,
    kind_by_namespace,
    kind_correlation_with_metrics,
    instance_analysis,
    extract_type_hierarchy,
    namespace_tree,
    namespace_statistics,
    analyze_lean_types,
)
from .lean_namespace import (
    extract_namespace,
    get_all_namespaces,
    build_namespace_tree,
    namespace_depth_distribution,
    compute_namespace_coupling,
    cross_namespace_dependencies,
    find_namespace_bridges,
    namespace_size_distribution,
    namespace_complexity,
    detect_circular_dependencies,
    analyze_lean_namespaces,
)
from .lean_quality import (
    identify_api_surface,
    breaking_change_impact,
    find_refactoring_candidates,
    find_code_duplication,
    detect_structural_anomalies,
    find_bottlenecks,
    analyze_dependency_chains,
    analyze_lean_quality,
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
    # Statistics
    "fit_degree_distribution",
    "compute_metric_correlations",
    "compute_degree_assortativity",
    "detect_zscore_anomalies",
    "detect_mahalanobis_anomalies",
    "detect_lof_anomalies",
    "detect_isolation_forest_anomalies",
    "analyze_statistics",
    # Link prediction
    "predict_links",
    "predict_links_for_node",
    "predict_links_ensemble",
    "analyze_link_prediction",
    # Optimal transport / Ricci curvature
    "compute_forman_ricci",
    "compute_ollivier_ricci",
    "compute_wasserstein_distance",
    "compare_degree_distributions",
    "analyze_curvature",
    # Geometry
    "compute_laplacian",
    "compute_laplacian_spectrum",
    "compute_heat_kernel",
    "compute_heat_kernel_signature",
    "compute_diffusion_distance",
    "compute_commute_time_distance",
    "analyze_geometry",
    # Topology
    "compute_betti_numbers",
    "compute_persistent_homology",
    "compute_persistence_entropy",
    "compute_persistence_landscape",
    "compute_mapper",
    "analyze_topology",
    # Embedding
    "compute_spectral_embedding",
    "compute_node2vec_embedding",
    "compute_diffusion_map",
    "reduce_to_visualization",
    "compute_feature_embedding",
    "analyze_embedding",
    # Pattern recognition
    "count_motifs_3node",
    "count_motifs_4node",
    "compute_motif_significance",
    "find_pattern_instances",
    "find_proof_patterns",
    "analyze_patterns",
    # Lean-specific: Types
    "declaration_kind_distribution",
    "kind_by_namespace",
    "kind_correlation_with_metrics",
    "instance_analysis",
    "extract_type_hierarchy",
    "namespace_tree",
    "namespace_statistics",
    "analyze_lean_types",
    # Lean-specific: Namespaces
    "extract_namespace",
    "get_all_namespaces",
    "build_namespace_tree",
    "namespace_depth_distribution",
    "compute_namespace_coupling",
    "cross_namespace_dependencies",
    "find_namespace_bridges",
    "namespace_size_distribution",
    "namespace_complexity",
    "detect_circular_dependencies",
    "analyze_lean_namespaces",
    # Lean-specific: Quality
    "identify_api_surface",
    "breaking_change_impact",
    "find_refactoring_candidates",
    "find_code_duplication",
    "detect_structural_anomalies",
    "find_bottlenecks",
    "analyze_dependency_chains",
    "analyze_lean_quality",
]
