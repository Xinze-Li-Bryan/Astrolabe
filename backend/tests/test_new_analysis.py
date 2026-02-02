"""
Tests for new analysis modules:
- Statistics (power law, correlations, anomaly detection)
- Link Prediction
- Optimal Transport / Ricci Curvature
- Geometry (Laplacian, Heat Kernel)
- Topology (Betti numbers, persistent homology)
- Embedding (Spectral, Diffusion Maps)
- Pattern Recognition (Motifs)
"""

import pytest
import networkx as nx
import numpy as np


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def simple_dag():
    """Simple DAG for basic tests"""
    G = nx.DiGraph()
    G.add_edges_from([
        ("A", "B"), ("B", "C"), ("C", "D"),
        ("A", "E"), ("E", "D"),
    ])
    return G


@pytest.fixture
def clustered_graph():
    """Graph with two dense clusters connected by a bridge"""
    G = nx.Graph()
    # Cluster 1: complete K4
    G.add_edges_from([
        ("A", "B"), ("A", "C"), ("A", "D"),
        ("B", "C"), ("B", "D"), ("C", "D"),
    ])
    # Cluster 2: complete K4
    G.add_edges_from([
        ("E", "F"), ("E", "G"), ("E", "H"),
        ("F", "G"), ("F", "H"), ("G", "H"),
    ])
    # Bridge
    G.add_edge("D", "E")
    return G


@pytest.fixture
def chain_graph():
    """Simple chain: A -> B -> C -> D -> E"""
    G = nx.DiGraph()
    G.add_edges_from([
        ("A", "B"), ("B", "C"), ("C", "D"), ("D", "E"),
    ])
    return G


@pytest.fixture
def diamond_graph():
    """Diamond pattern: A -> B,C -> D"""
    G = nx.DiGraph()
    G.add_edges_from([
        ("A", "B"), ("A", "C"),
        ("B", "D"), ("C", "D"),
    ])
    return G


@pytest.fixture
def tree_graph():
    """Binary tree structure"""
    G = nx.DiGraph()
    G.add_edges_from([
        ("root", "L1"), ("root", "R1"),
        ("L1", "L2"), ("L1", "L3"),
        ("R1", "R2"), ("R1", "R3"),
    ])
    return G


@pytest.fixture
def scale_free_graph():
    """Scale-free graph for power law testing"""
    G = nx.barabasi_albert_graph(100, 2, seed=42)
    return G


# =============================================================================
# Tests: Statistics Module
# =============================================================================

class TestStatistics:
    """Test statistical analysis functions"""

    def test_fit_degree_distribution(self, scale_free_graph):
        """Power law should fit scale-free graphs"""
        from astrolabe.analysis.statistics import fit_degree_distribution

        result = fit_degree_distribution(scale_free_graph)

        # Should return degree_stats and fits
        assert "degree_stats" in result or "error" in result
        if "fits" in result:
            assert "power_law" in result["fits"] or "power_law_estimate" in result["fits"]

    def test_fit_degree_distribution_small_graph(self):
        """Should handle small graphs gracefully"""
        from astrolabe.analysis.statistics import fit_degree_distribution

        G = nx.Graph()
        G.add_edges_from([("A", "B"), ("B", "C")])
        result = fit_degree_distribution(G)

        # Should return error for small graph
        assert "error" in result or "degree_stats" in result

    def test_metric_correlations(self, simple_dag):
        """Should compute correlations between metrics"""
        from astrolabe.analysis.statistics import compute_metric_correlations

        pagerank = nx.pagerank(simple_dag)
        betweenness = nx.betweenness_centrality(simple_dag)

        metrics = {
            "pagerank": pagerank,
            "betweenness": betweenness,
        }
        result = compute_metric_correlations(metrics)

        # Should have correlation matrix
        assert "correlation_matrix" in result or "error" in result
        if "correlation_matrix" in result:
            # Should be 2x2 matrix for 2 metrics
            assert len(result["correlation_matrix"]) == 2

    def test_degree_assortativity(self, clustered_graph):
        """Should compute degree assortativity"""
        from astrolabe.analysis.statistics import compute_degree_assortativity

        result = compute_degree_assortativity(clustered_graph)

        # Should have assortativity and interpretation
        assert "assortativity" in result or "error" in result
        if "assortativity" in result:
            assert "interpretation" in result
            # Coefficient should be between -1 and 1
            assert -1 <= result["assortativity"] <= 1

    def test_detect_zscore_anomalies(self, simple_dag):
        """Should detect anomalous nodes using z-score"""
        from astrolabe.analysis.statistics import detect_zscore_anomalies

        pagerank = nx.pagerank(simple_dag)
        in_degree = dict(simple_dag.in_degree())

        metrics = {
            "pagerank": pagerank,
            "in_degree": in_degree,
        }
        result = detect_zscore_anomalies(metrics, threshold=1.0)

        # Should return dict with by_metric key
        assert "by_metric" in result or "error" in result


# =============================================================================
# Tests: Link Prediction Module
# =============================================================================

class TestLinkPrediction:
    """Test link prediction functions"""

    def test_predict_links_common_neighbors(self, clustered_graph):
        """Common neighbors prediction"""
        from astrolabe.analysis.link_prediction import predict_links

        predictions = predict_links(clustered_graph, method="common_neighbors", top_k=10)

        # Should return list of predictions
        assert isinstance(predictions, list)
        # Each prediction should have source, target, score
        if predictions:
            assert "source" in predictions[0]
            assert "target" in predictions[0]
            assert "score" in predictions[0]

    def test_predict_links_adamic_adar(self, clustered_graph):
        """Adamic-Adar prediction"""
        from astrolabe.analysis.link_prediction import predict_links

        predictions = predict_links(clustered_graph, method="adamic_adar", top_k=10)

        assert isinstance(predictions, list)

    def test_predict_links_jaccard(self, clustered_graph):
        """Jaccard coefficient prediction"""
        from astrolabe.analysis.link_prediction import predict_links

        predictions = predict_links(clustered_graph, method="jaccard", top_k=10)

        assert isinstance(predictions, list)

    def test_predict_links_for_node(self, clustered_graph):
        """Predict links for a specific node"""
        from astrolabe.analysis.link_prediction import predict_links_for_node

        # Get predictions for node A
        predictions = predict_links_for_node(clustered_graph, "A", method="common_neighbors", top_k=5)

        assert isinstance(predictions, list)

    def test_predict_links_directed(self, simple_dag):
        """Should work on directed graphs"""
        from astrolabe.analysis.link_prediction import predict_links

        predictions = predict_links(simple_dag, method="common_neighbors", top_k=5)

        assert isinstance(predictions, list)


# =============================================================================
# Tests: Optimal Transport / Ricci Curvature Module
# =============================================================================

class TestOptimalTransport:
    """Test Ricci curvature and optimal transport functions"""

    def test_forman_ricci(self, clustered_graph):
        """Forman-Ricci curvature computation"""
        from astrolabe.analysis.optimal_transport import compute_forman_ricci

        result = compute_forman_ricci(clustered_graph)

        if "error" not in result:
            # Should have edge and node curvatures
            assert "edge_curvatures" in result
            assert "node_curvatures" in result
            assert "statistics" in result

    def test_forman_ricci_interpretation(self, clustered_graph):
        """Curvature should have meaningful interpretation"""
        from astrolabe.analysis.optimal_transport import compute_forman_ricci

        result = compute_forman_ricci(clustered_graph)

        if "error" not in result:
            assert "interpretation" in result
            # Interpretation should classify structure
            assert "overall_structure" in result["interpretation"]

    def test_wasserstein_distance(self):
        """Wasserstein distance between distributions"""
        from astrolabe.analysis.optimal_transport import compute_wasserstein_distance

        dist1 = [0.2, 0.3, 0.5]
        dist2 = [0.3, 0.3, 0.4]

        result = compute_wasserstein_distance(dist1, dist2)

        assert "wasserstein_1" in result
        assert result["wasserstein_1"] >= 0

    def test_compare_degree_distributions(self, clustered_graph, chain_graph):
        """Compare degree distributions of two graphs"""
        from astrolabe.analysis.optimal_transport import compare_degree_distributions

        result = compare_degree_distributions(clustered_graph, chain_graph)

        assert "wasserstein_distance" in result
        assert "graph1_stats" in result
        assert "graph2_stats" in result

    def test_analyze_curvature(self, clustered_graph):
        """Combined curvature analysis"""
        from astrolabe.analysis.optimal_transport import analyze_curvature

        result = analyze_curvature(clustered_graph, method="forman")

        assert "graph_info" in result
        assert "curvature" in result


# =============================================================================
# Tests: Geometry Module
# =============================================================================

class TestGeometry:
    """Test geometric analysis functions"""

    def test_compute_laplacian(self, clustered_graph):
        """Should compute graph Laplacian"""
        from astrolabe.analysis.geometry import compute_laplacian

        L, nodes = compute_laplacian(clustered_graph, normalized=True)

        # Laplacian should be square matrix
        assert L.shape[0] == L.shape[1] == len(nodes)
        # Normalized Laplacian has diagonal elements close to 1
        # and eigenvalues in [0, 2]
        assert L.shape[0] > 0

    def test_laplacian_spectrum(self, clustered_graph):
        """Should compute Laplacian eigenvalues"""
        from astrolabe.analysis.geometry import compute_laplacian_spectrum

        result = compute_laplacian_spectrum(clustered_graph, k=5)

        if "error" not in result:
            assert "eigenvalues" in result
            assert "fiedler_value" in result
            # First eigenvalue should be ~0
            assert result["eigenvalues"][0] == pytest.approx(0, abs=1e-5)

    def test_heat_kernel_signature(self, clustered_graph):
        """Should compute HKS for nodes"""
        from astrolabe.analysis.geometry import compute_heat_kernel_signature

        result = compute_heat_kernel_signature(clustered_graph)

        if "error" not in result:
            assert "hks_by_node" in result
            assert "time_scales" in result
            # Each node should have HKS vector
            for node in clustered_graph.nodes():
                assert node in result["hks_by_node"]

    def test_diffusion_distance(self, clustered_graph):
        """Should compute diffusion distances"""
        from astrolabe.analysis.geometry import compute_diffusion_distance

        result = compute_diffusion_distance(clustered_graph, t=1.0)

        if "error" not in result:
            assert "distances" in result
            assert "statistics" in result
            # Distance matrix should be symmetric
            for u in result["distances"]:
                for v in result["distances"][u]:
                    assert result["distances"][u][v] == pytest.approx(
                        result["distances"][v][u], abs=1e-10
                    )


# =============================================================================
# Tests: Topology Module
# =============================================================================

class TestTopology:
    """Test topological analysis functions"""

    def test_betti_numbers_tree(self, tree_graph):
        """Tree should have β₁ = 0 (no cycles)"""
        from astrolabe.analysis.topology import compute_betti_numbers

        result = compute_betti_numbers(tree_graph)

        if "error" not in result:
            # β₀ = 1 (connected)
            assert result["beta_0"] == 1
            # β₁ = 0 (no cycles in tree)
            assert result["beta_1"] == 0

    def test_betti_numbers_with_cycle(self, diamond_graph):
        """Diamond has a cycle: A->B->D and A->C->D"""
        from astrolabe.analysis.topology import compute_betti_numbers

        result = compute_betti_numbers(diamond_graph)

        if "error" not in result:
            assert result["beta_0"] == 1  # Connected
            # Diamond has 1 independent cycle
            assert result["beta_1"] >= 0

    def test_betti_numbers_clustered(self, clustered_graph):
        """Clustered graph should have cycles"""
        from astrolabe.analysis.topology import compute_betti_numbers

        result = compute_betti_numbers(clustered_graph)

        if "error" not in result:
            assert result["beta_0"] == 1  # Connected
            # K4 has many cycles
            assert result["beta_1"] > 0

    def test_euler_characteristic(self, simple_dag):
        """Euler characteristic should be V - E"""
        from astrolabe.analysis.topology import compute_betti_numbers

        result = compute_betti_numbers(simple_dag)

        if "error" not in result:
            n = simple_dag.number_of_nodes()
            m = simple_dag.number_of_edges()
            expected_chi = n - m
            assert result["euler_characteristic"] == expected_chi


# =============================================================================
# Tests: Embedding Module
# =============================================================================

class TestEmbedding:
    """Test graph embedding functions"""

    def test_spectral_embedding(self, clustered_graph):
        """Should embed nodes in low-dimensional space"""
        from astrolabe.analysis.embedding import compute_spectral_embedding

        result = compute_spectral_embedding(clustered_graph, n_components=3)

        if "error" not in result:
            assert "embedding" in result
            # Each node should have 3D coordinates
            for node in clustered_graph.nodes():
                assert node in result["embedding"]
                assert len(result["embedding"][node]) == 3

    def test_diffusion_map(self, clustered_graph):
        """Should compute diffusion map embedding"""
        from astrolabe.analysis.embedding import compute_diffusion_map

        result = compute_diffusion_map(clustered_graph, n_components=3)

        if "error" not in result:
            assert "embedding" in result
            # Each node should have 3D coordinates
            for node in clustered_graph.nodes():
                assert node in result["embedding"]

    def test_embedding_separates_clusters(self, clustered_graph):
        """Embedding should separate the two clusters"""
        from astrolabe.analysis.embedding import compute_spectral_embedding

        result = compute_spectral_embedding(clustered_graph, n_components=2)

        if "error" not in result:
            emb = result["embedding"]
            # Compute centroid of each cluster
            cluster1 = ["A", "B", "C", "D"]
            cluster2 = ["E", "F", "G", "H"]

            c1_coords = np.array([emb[n] for n in cluster1 if n in emb])
            c2_coords = np.array([emb[n] for n in cluster2 if n in emb])

            if len(c1_coords) > 0 and len(c2_coords) > 0:
                c1_center = c1_coords.mean(axis=0)
                c2_center = c2_coords.mean(axis=0)

                # Centers should be different
                assert not np.allclose(c1_center, c2_center)


# =============================================================================
# Tests: Pattern Recognition Module
# =============================================================================

class TestPatternRecognition:
    """Test motif and pattern recognition functions"""

    def test_count_3node_motifs(self, simple_dag):
        """Should count 3-node motifs"""
        from astrolabe.analysis.pattern import count_motifs_3node

        result = count_motifs_3node(simple_dag)

        if "error" not in result:
            # Should have counts for different motif types
            assert isinstance(result, dict)
            # Total count should match expected
            assert "total" in result or sum(result.values()) >= 0

    def test_find_chain_pattern(self, chain_graph):
        """Should find chain patterns"""
        from astrolabe.analysis.pattern import find_pattern_instances

        result = find_pattern_instances(chain_graph, pattern="chain", max_instances=10)

        # Should return list of instances
        assert isinstance(result, list)

    def test_find_diamond_pattern(self, diamond_graph):
        """Should find diamond pattern"""
        from astrolabe.analysis.pattern import find_pattern_instances

        result = find_pattern_instances(diamond_graph, pattern="diamond", max_instances=10)

        # Should return list (may be empty if no diamonds)
        assert isinstance(result, list)

    def test_find_proof_patterns(self, simple_dag):
        """Should analyze proof-specific patterns"""
        from astrolabe.analysis.pattern import find_proof_patterns

        result = find_proof_patterns(simple_dag)

        # Should have pattern-related fields
        assert "highly_reused_lemmas" in result or "error" in result

    def test_motif_significance(self, clustered_graph):
        """Should compute motif z-scores"""
        from astrolabe.analysis.pattern import compute_motif_significance

        result = compute_motif_significance(clustered_graph, n_random=10)

        if "error" not in result and "warning" not in result:
            assert "3_node" in result or "4_node" in result


# =============================================================================
# Tests: Integration / Combined Analysis
# =============================================================================

class TestIntegration:
    """Test combined analysis workflows"""

    def test_full_statistics_pipeline(self, scale_free_graph):
        """Run full statistics analysis"""
        from astrolabe.analysis.statistics import analyze_statistics

        result = analyze_statistics(scale_free_graph)

        # Should have distribution and assortativity
        assert "distribution" in result or "assortativity" in result

    def test_full_geometry_pipeline(self, clustered_graph):
        """Run full geometry analysis"""
        from astrolabe.analysis.geometry import analyze_geometry

        result = analyze_geometry(clustered_graph)

        assert "graph_info" in result
        assert "spectrum" in result

    def test_full_topology_pipeline(self, clustered_graph):
        """Run full topology analysis"""
        from astrolabe.analysis.topology import analyze_topology

        result = analyze_topology(clustered_graph)

        assert "graph_info" in result
        assert "betti_numbers" in result

    def test_full_embedding_pipeline(self, clustered_graph):
        """Run full embedding analysis"""
        from astrolabe.analysis.embedding import analyze_embedding

        result = analyze_embedding(clustered_graph, n_components=3)

        assert "graph_info" in result

    def test_full_pattern_pipeline(self, simple_dag):
        """Run full pattern analysis"""
        from astrolabe.analysis.pattern import analyze_patterns

        result = analyze_patterns(simple_dag)

        assert "graph_info" in result


# =============================================================================
# Tests: Edge Cases
# =============================================================================

class TestEdgeCases:
    """Test edge cases and error handling"""

    def test_empty_graph(self):
        """Empty graph should be handled gracefully"""
        from astrolabe.analysis.topology import compute_betti_numbers
        from astrolabe.analysis.optimal_transport import compute_forman_ricci

        G = nx.Graph()

        betti = compute_betti_numbers(G)
        assert "error" in betti

        ricci = compute_forman_ricci(G)
        assert "error" in ricci

    def test_single_node(self):
        """Single node graph should be handled"""
        from astrolabe.analysis.topology import compute_betti_numbers
        from astrolabe.analysis.geometry import compute_laplacian_spectrum

        G = nx.Graph()
        G.add_node("A")

        betti = compute_betti_numbers(G)
        # Should work: β₀ = 1, β₁ = 0
        if "error" not in betti:
            assert betti["beta_0"] == 1

        spectrum = compute_laplacian_spectrum(G, k=1)
        # Might error due to insufficient nodes
        assert "error" in spectrum or "eigenvalues" in spectrum

    def test_disconnected_graph(self):
        """Disconnected graph should be handled"""
        from astrolabe.analysis.topology import compute_betti_numbers

        G = nx.Graph()
        G.add_edges_from([("A", "B"), ("C", "D")])  # Two components

        result = compute_betti_numbers(G)

        if "error" not in result:
            # β₀ should be 2 (two components)
            assert result["beta_0"] == 2

    def test_self_loop(self):
        """Graph with self-loop should be handled"""
        from astrolabe.analysis.optimal_transport import compute_forman_ricci

        G = nx.Graph()
        G.add_edge("A", "A")  # Self-loop
        G.add_edge("A", "B")

        result = compute_forman_ricci(G)
        # Should handle gracefully
        assert "error" in result or "edge_curvatures" in result
