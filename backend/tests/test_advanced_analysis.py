"""
Tests for advanced analysis algorithms

- Transitive Reduction: minimal edge set preserving reachability
- Hierarchical Clustering: nested community structure
- Spectral Clustering: eigenvalue-based clustering
"""

import pytest
import networkx as nx


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def transitive_dag():
    """
    DAG with transitive edges:

        A --> B --> C
        |           ^
        +-----------+  (transitive edge A->C)

    Transitive reduction should remove A->C
    """
    G = nx.DiGraph()
    G.add_edges_from([
        ("A", "B"), ("B", "C"), ("A", "C"),  # A->C is transitive
    ])
    return G


@pytest.fixture
def complex_transitive_dag():
    """
    More complex DAG with multiple transitive edges:

        A --> B --> C --> D
        |     |           ^
        |     +-----+     |
        |           v     |
        +---------> E ----+

    Transitive edges: A->E (via B), B->D (via C or E)
    """
    G = nx.DiGraph()
    G.add_edges_from([
        ("A", "B"), ("B", "C"), ("C", "D"),
        ("B", "E"), ("E", "D"),
        ("A", "E"),  # transitive via B
    ])
    return G


@pytest.fixture
def hierarchical_graph():
    """
    Graph with clear hierarchical community structure:

    Community 1: A-B-C (densely connected)
    Community 2: D-E-F (densely connected)
    Bridge: C-D (sparse connection)

        A---B       D---E
         \ /         \ /
          C-----------D
                       \
                        F
    """
    G = nx.Graph()
    # Community 1
    G.add_edges_from([("A", "B"), ("A", "C"), ("B", "C")])
    # Community 2
    G.add_edges_from([("D", "E"), ("D", "F"), ("E", "F")])
    # Bridge
    G.add_edge("C", "D")
    return G


@pytest.fixture
def spectral_graph():
    """
    Graph suitable for spectral clustering:

    Two well-separated clusters connected by one edge.

        1---2       5---6
        |\ /|       |\ /|
        | X |       | X |
        |/ \|       |/ \|
        3---4-------7---8
    """
    G = nx.Graph()
    # Cluster 1: 1,2,3,4 (complete subgraph)
    G.add_edges_from([
        (1, 2), (1, 3), (1, 4),
        (2, 3), (2, 4),
        (3, 4),
    ])
    # Cluster 2: 5,6,7,8 (complete subgraph)
    G.add_edges_from([
        (5, 6), (5, 7), (5, 8),
        (6, 7), (6, 8),
        (7, 8),
    ])
    # Single bridge
    G.add_edge(4, 7)
    return G


# =============================================================================
# Tests: Transitive Reduction
# =============================================================================

class TestTransitiveReduction:
    """Test transitive reduction computation"""

    def test_simple_transitive_reduction(self, transitive_dag):
        """Should remove transitive edge A->C"""
        from astrolabe.analysis.advanced import compute_transitive_reduction

        reduced = compute_transitive_reduction(transitive_dag)

        # A->C should be removed
        assert not reduced.has_edge("A", "C")
        # Essential edges remain
        assert reduced.has_edge("A", "B")
        assert reduced.has_edge("B", "C")

    def test_complex_transitive_reduction(self, complex_transitive_dag):
        """Should remove all transitive edges"""
        from astrolabe.analysis.advanced import compute_transitive_reduction

        reduced = compute_transitive_reduction(complex_transitive_dag)

        # A->E is transitive (via B)
        assert not reduced.has_edge("A", "E")
        # Essential edges remain
        assert reduced.has_edge("A", "B")
        assert reduced.has_edge("B", "E")

    def test_reduction_preserves_reachability(self, complex_transitive_dag):
        """Reduced graph should have same reachability"""
        from astrolabe.analysis.advanced import compute_transitive_reduction

        reduced = compute_transitive_reduction(complex_transitive_dag)

        # Check reachability is preserved
        for source in complex_transitive_dag.nodes():
            original_reach = nx.descendants(complex_transitive_dag, source)
            reduced_reach = nx.descendants(reduced, source)
            assert original_reach == reduced_reach

    def test_reduction_is_minimal(self, transitive_dag):
        """Reduced graph should have minimum edges"""
        from astrolabe.analysis.advanced import compute_transitive_reduction

        reduced = compute_transitive_reduction(transitive_dag)

        # Original has 3 edges, reduced should have 2
        assert reduced.number_of_edges() < transitive_dag.number_of_edges()

    def test_get_transitive_edges(self, transitive_dag):
        """Should identify which edges are transitive"""
        from astrolabe.analysis.advanced import get_transitive_edges

        transitive = get_transitive_edges(transitive_dag)

        # A->C is transitive
        assert ("A", "C") in transitive
        # A->B and B->C are not transitive
        assert ("A", "B") not in transitive
        assert ("B", "C") not in transitive

    def test_empty_graph(self):
        """Empty graph should return empty"""
        from astrolabe.analysis.advanced import compute_transitive_reduction

        G = nx.DiGraph()
        reduced = compute_transitive_reduction(G)

        assert reduced.number_of_nodes() == 0
        assert reduced.number_of_edges() == 0


# =============================================================================
# Tests: Hierarchical Clustering
# =============================================================================

class TestHierarchicalClustering:
    """Test hierarchical (agglomerative) clustering"""

    def test_hierarchical_basic(self, hierarchical_graph):
        """Should produce dendrogram structure"""
        from astrolabe.analysis.advanced import compute_hierarchical_clustering

        result = compute_hierarchical_clustering(hierarchical_graph)

        # Should have dendrogram
        assert "dendrogram" in result
        assert "labels" in result

    def test_hierarchical_cut_levels(self, hierarchical_graph):
        """Should be able to cut at different levels"""
        from astrolabe.analysis.advanced import (
            compute_hierarchical_clustering,
            cut_dendrogram,
        )

        result = compute_hierarchical_clustering(hierarchical_graph)

        # Cut into 2 clusters
        clusters_2 = cut_dendrogram(result["dendrogram"], result["labels"], n_clusters=2)
        assert len(set(clusters_2.values())) == 2

        # Cut into 3 clusters
        clusters_3 = cut_dendrogram(result["dendrogram"], result["labels"], n_clusters=3)
        assert len(set(clusters_3.values())) <= 3

    def test_hierarchical_communities(self, hierarchical_graph):
        """Should identify the two main communities"""
        from astrolabe.analysis.advanced import (
            compute_hierarchical_clustering,
            cut_dendrogram,
        )

        result = compute_hierarchical_clustering(hierarchical_graph)
        clusters = cut_dendrogram(result["dendrogram"], result["labels"], n_clusters=2)

        # A, B, C should be in same cluster
        assert clusters["A"] == clusters["B"] == clusters["C"]
        # D, E, F should be in same cluster
        assert clusters["D"] == clusters["E"] == clusters["F"]
        # The two groups should be different
        assert clusters["A"] != clusters["D"]

    def test_hierarchical_single_node(self):
        """Single node graph should work"""
        from astrolabe.analysis.advanced import compute_hierarchical_clustering

        G = nx.Graph()
        G.add_node("A")

        result = compute_hierarchical_clustering(G)
        assert "labels" in result


# =============================================================================
# Tests: Spectral Clustering
# =============================================================================

class TestSpectralClustering:
    """Test spectral clustering"""

    def test_spectral_basic(self, spectral_graph):
        """Should cluster nodes into groups"""
        from astrolabe.analysis.advanced import compute_spectral_clustering

        clusters = compute_spectral_clustering(spectral_graph, n_clusters=2)

        # All nodes should be assigned
        assert len(clusters) == 8

    def test_spectral_identifies_communities(self, spectral_graph):
        """Should correctly identify the two clusters"""
        from astrolabe.analysis.advanced import compute_spectral_clustering

        clusters = compute_spectral_clustering(spectral_graph, n_clusters=2)

        # Nodes 1,2,3,4 should be in same cluster
        cluster_1 = clusters[1]
        assert clusters[2] == cluster_1
        assert clusters[3] == cluster_1
        assert clusters[4] == cluster_1

        # Nodes 5,6,7,8 should be in same cluster
        cluster_2 = clusters[5]
        assert clusters[6] == cluster_2
        assert clusters[7] == cluster_2
        assert clusters[8] == cluster_2

        # Two clusters should be different
        assert cluster_1 != cluster_2

    def test_spectral_with_different_k(self, spectral_graph):
        """Should work with different number of clusters"""
        from astrolabe.analysis.advanced import compute_spectral_clustering

        clusters_2 = compute_spectral_clustering(spectral_graph, n_clusters=2)
        clusters_4 = compute_spectral_clustering(spectral_graph, n_clusters=4)

        assert len(set(clusters_2.values())) == 2
        assert len(set(clusters_4.values())) <= 4

    def test_spectral_directed_graph(self, transitive_dag):
        """Should work on directed graphs (converted to undirected)"""
        from astrolabe.analysis.advanced import compute_spectral_clustering

        clusters = compute_spectral_clustering(transitive_dag, n_clusters=2)

        assert len(clusters) == 3  # A, B, C

    def test_spectral_fiedler_vector(self, spectral_graph):
        """Should compute Fiedler vector (2nd eigenvector)"""
        from astrolabe.analysis.advanced import compute_fiedler_vector

        fiedler = compute_fiedler_vector(spectral_graph)

        # Should have value for each node
        assert len(fiedler) == 8

        # Sign of Fiedler vector separates clusters
        # Nodes in same cluster should have same sign
        signs_cluster1 = [fiedler[i] > 0 for i in [1, 2, 3, 4]]
        signs_cluster2 = [fiedler[i] > 0 for i in [5, 6, 7, 8]]

        # All in cluster 1 should have same sign
        assert all(signs_cluster1) or not any(signs_cluster1)
        # All in cluster 2 should have same sign
        assert all(signs_cluster2) or not any(signs_cluster2)


# =============================================================================
# Tests: Combined Advanced Analysis
# =============================================================================

class TestAdvancedAnalysis:
    """Test combined advanced analysis"""

    def test_analyze_advanced(self, hierarchical_graph):
        """Should run all advanced analyses"""
        from astrolabe.analysis.advanced import analyze_advanced

        result = analyze_advanced(hierarchical_graph, n_clusters=2)

        assert "spectral_clusters" in result
        assert "hierarchical" in result

    def test_analyze_advanced_dag(self, transitive_dag):
        """Should include transitive reduction for DAGs"""
        from astrolabe.analysis.advanced import analyze_advanced

        result = analyze_advanced(transitive_dag, n_clusters=2)

        assert "transitive_edges" in result
        assert "num_transitive_edges" in result
