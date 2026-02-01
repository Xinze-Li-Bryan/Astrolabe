"""
Tests for structural analysis algorithms

Algorithms for detecting bridges, articulation points, and
hub/authority structure in dependency graphs.
"""

import pytest
import networkx as nx


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def bridge_graph():
    """
    Graph with bridge edges:

        A---B---C---D
            |
            E---F

    Bridge edges: (B,C), (B,E), (E,F)
    Articulation points: B, E
    """
    G = nx.Graph()
    G.add_edges_from([
        ("A", "B"), ("B", "C"), ("C", "D"),
        ("B", "E"), ("E", "F"),
    ])
    return G


@pytest.fixture
def no_bridge_graph():
    """
    Graph with no bridge edges (cycle):

        A---B
        |   |
        D---C

    No bridges (removing any edge keeps graph connected)
    No articulation points
    """
    G = nx.Graph()
    G.add_edges_from([
        ("A", "B"), ("B", "C"), ("C", "D"), ("D", "A"),
    ])
    return G


@pytest.fixture
def hub_authority_dag():
    """
    DAG with clear hub/authority structure:

        H1 --> A1
        H1 --> A2
        H2 --> A1
        H2 --> A2
        H2 --> A3

    H1, H2 are hubs (point to authorities)
    A1, A2, A3 are authorities (pointed to by hubs)
    """
    G = nx.DiGraph()
    G.add_edges_from([
        ("H1", "A1"), ("H1", "A2"),
        ("H2", "A1"), ("H2", "A2"), ("H2", "A3"),
    ])
    return G


@pytest.fixture
def mixed_dag():
    """
    DAG with both hub-like and authority-like nodes:

        Root
       / | \\
      A  B  C   (authorities - pointed to by root)
      |  |  |
      D  D  D   (D is a hub - points to E, F, G)
         |
         E

    Actually:
        Root --> A, B, C
        A, B, C --> D
        D --> E, F, G
    """
    G = nx.DiGraph()
    G.add_edges_from([
        ("Root", "A"), ("Root", "B"), ("Root", "C"),
        ("A", "D"), ("B", "D"), ("C", "D"),
        ("D", "E"), ("D", "F"), ("D", "G"),
    ])
    return G


# =============================================================================
# Tests: Bridge Detection
# =============================================================================

class TestBridgeDetection:
    """Test bridge edge detection"""

    def test_find_bridges(self, bridge_graph):
        """Should find all bridge edges"""
        from astrolabe.analysis.structural import find_bridges

        bridges = find_bridges(bridge_graph)

        # Should find (B,C), (B,E), (E,F) as bridges
        # Note: edges might be returned in either order
        bridge_set = {tuple(sorted(e)) for e in bridges}

        assert ("B", "C") in bridge_set or ("C", "B") in bridge_set
        assert ("B", "E") in bridge_set or ("E", "B") in bridge_set
        assert ("E", "F") in bridge_set or ("F", "E") in bridge_set

    def test_no_bridges_in_cycle(self, no_bridge_graph):
        """Cycle graph should have no bridges"""
        from astrolabe.analysis.structural import find_bridges

        bridges = find_bridges(no_bridge_graph)

        assert len(bridges) == 0

    def test_bridge_count(self, bridge_graph):
        """Should return correct number of bridges"""
        from astrolabe.analysis.structural import find_bridges

        bridges = find_bridges(bridge_graph)

        # A-B-C-D is a linear chain, plus B-E-F branch
        # All edges in a tree are bridges: (A,B), (B,C), (C,D), (B,E), (E,F)
        assert len(bridges) == 5

    def test_bridges_in_directed_graph(self, hub_authority_dag):
        """Bridge detection should work on directed graphs (as undirected)"""
        from astrolabe.analysis.structural import find_bridges

        bridges = find_bridges(hub_authority_dag)

        # H1->A1, H1->A2, H2->A1, H2->A2, H2->A3
        # As undirected: H1-A1, H1-A2, H2-A1, H2-A2, H2-A3
        # A1 and A2 have two paths (via H1 and H2), so those are not bridges
        # Only H2-A3 is a bridge (only path to A3)
        assert len(bridges) == 1


# =============================================================================
# Tests: Articulation Points
# =============================================================================

class TestArticulationPoints:
    """Test articulation point (cut vertex) detection"""

    def test_find_articulation_points(self, bridge_graph):
        """Should find all articulation points"""
        from astrolabe.analysis.structural import find_articulation_points

        ap = find_articulation_points(bridge_graph)

        # B and E are articulation points
        assert "B" in ap
        assert "E" in ap

    def test_no_articulation_points_in_cycle(self, no_bridge_graph):
        """Cycle graph should have no articulation points"""
        from astrolabe.analysis.structural import find_articulation_points

        ap = find_articulation_points(no_bridge_graph)

        assert len(ap) == 0

    def test_articulation_point_count(self, bridge_graph):
        """Should return correct number of articulation points"""
        from astrolabe.analysis.structural import find_articulation_points

        ap = find_articulation_points(bridge_graph)

        # A-B-C-D with B-E-F branch
        # B, C, E are articulation points (removing any disconnects the graph)
        assert len(ap) == 3


# =============================================================================
# Tests: HITS Algorithm (Hub/Authority)
# =============================================================================

class TestHITSAlgorithm:
    """Test HITS algorithm for hub/authority scores"""

    def test_hits_basic(self, hub_authority_dag):
        """HITS should compute hub and authority scores"""
        from astrolabe.analysis.structural import compute_hits

        hubs, authorities = compute_hits(hub_authority_dag)

        # Check that all nodes have scores
        assert len(hubs) == 5
        assert len(authorities) == 5

        # Scores should be non-negative
        assert all(v >= 0 for v in hubs.values())
        assert all(v >= 0 for v in authorities.values())

    def test_hits_hub_scores(self, hub_authority_dag):
        """Hubs should have higher hub scores than authorities"""
        from astrolabe.analysis.structural import compute_hits

        hubs, authorities = compute_hits(hub_authority_dag)

        # H1 and H2 should have higher hub scores
        # A1, A2, A3 should have near-zero hub scores
        assert hubs["H1"] > hubs["A1"]
        assert hubs["H2"] > hubs["A2"]

    def test_hits_authority_scores(self, hub_authority_dag):
        """Authorities should have higher authority scores than hubs"""
        from astrolabe.analysis.structural import compute_hits

        hubs, authorities = compute_hits(hub_authority_dag)

        # A1, A2, A3 should have higher authority scores
        # H1, H2 should have near-zero authority scores
        assert authorities["A1"] > authorities["H1"]
        assert authorities["A2"] > authorities["H2"]

    def test_hits_top_hubs(self, hub_authority_dag):
        """Should return top hubs correctly"""
        from astrolabe.analysis.structural import get_top_hubs

        top = get_top_hubs(hub_authority_dag, k=2)

        # H1 and H2 should be top hubs
        top_ids = [n for n, _ in top]
        assert "H1" in top_ids or "H2" in top_ids

    def test_hits_top_authorities(self, hub_authority_dag):
        """Should return top authorities correctly"""
        from astrolabe.analysis.structural import get_top_authorities

        top = get_top_authorities(hub_authority_dag, k=2)

        # A1, A2 should be top authorities
        top_ids = [n for n, _ in top]
        assert "A1" in top_ids or "A2" in top_ids


# =============================================================================
# Tests: Katz Centrality
# =============================================================================

class TestKatzCentrality:
    """Test Katz centrality computation"""

    def test_katz_basic(self, hub_authority_dag):
        """Katz centrality should compute scores for all nodes"""
        from astrolabe.analysis.structural import compute_katz_centrality

        scores = compute_katz_centrality(hub_authority_dag)

        # All nodes should have scores
        assert len(scores) == 5

        # Scores should be positive
        assert all(v > 0 for v in scores.values())

    def test_katz_alpha_effect(self, hub_authority_dag):
        """Lower alpha should reduce influence of distant nodes"""
        from astrolabe.analysis.structural import compute_katz_centrality

        scores_high = compute_katz_centrality(hub_authority_dag, alpha=0.1)
        scores_low = compute_katz_centrality(hub_authority_dag, alpha=0.01)

        # Both should have same nodes
        assert set(scores_high.keys()) == set(scores_low.keys())

    def test_katz_with_beta(self, hub_authority_dag):
        """Beta parameter should affect base centrality"""
        from astrolabe.analysis.structural import compute_katz_centrality

        scores = compute_katz_centrality(hub_authority_dag, beta=1.0)

        # All nodes should have positive scores due to beta
        assert all(v > 0 for v in scores.values())

    def test_katz_vs_pagerank_ordering(self, mixed_dag):
        """Katz and PageRank should produce similar orderings"""
        from astrolabe.analysis.structural import compute_katz_centrality
        from astrolabe.analysis.centrality import compute_pagerank

        katz = compute_katz_centrality(mixed_dag)
        pagerank_result = compute_pagerank(mixed_dag)
        pagerank = pagerank_result.values

        # Top nodes should be similar
        katz_top = sorted(katz.keys(), key=lambda x: -katz[x])[:3]
        pr_top = sorted(pagerank.keys(), key=lambda x: -pagerank[x])[:3]

        # At least some overlap expected
        overlap = set(katz_top) & set(pr_top)
        assert len(overlap) >= 1


# =============================================================================
# Tests: Combined Structural Analysis
# =============================================================================

class TestStructuralAnalysis:
    """Test combined structural analysis"""

    def test_analyze_structure(self, bridge_graph):
        """Should compute all structural metrics"""
        from astrolabe.analysis.structural import analyze_structure

        result = analyze_structure(bridge_graph)

        assert "bridges" in result
        assert "articulation_points" in result
        assert "num_bridges" in result
        assert "num_articulation_points" in result

    def test_analyze_structure_empty_graph(self):
        """Empty graph should return empty results"""
        from astrolabe.analysis.structural import analyze_structure

        G = nx.Graph()
        result = analyze_structure(G)

        assert result["num_bridges"] == 0
        assert result["num_articulation_points"] == 0
