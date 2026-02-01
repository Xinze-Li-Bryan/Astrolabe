"""
Tests for DAG-specific analysis algorithms

These algorithms are designed for Directed Acyclic Graphs (DAGs),
which is the natural structure of formal math dependency graphs.
"""

import pytest
import networkx as nx


# =============================================================================
# Test Fixtures - Sample DAG structures
# =============================================================================

@pytest.fixture
def simple_dag():
    """
    Simple linear DAG: A → B → C → D

    Depths: A=0, B=1, C=2, D=3
    Sources: [A]
    Sinks: [D]
    """
    G = nx.DiGraph()
    G.add_edges_from([("A", "B"), ("B", "C"), ("C", "D")])
    return G


@pytest.fixture
def diamond_dag():
    """
    Diamond DAG:
        A
       / \
      B   C
       \ /
        D

    Depths: A=0, B=1, C=1, D=2
    Sources: [A]
    Sinks: [D]
    """
    G = nx.DiGraph()
    G.add_edges_from([("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")])
    return G


@pytest.fixture
def multi_root_dag():
    """
    Multiple roots (axioms/definitions):
        A   B
        |   |
        C   D
         \ /
          E

    Depths: A=0, B=0, C=1, D=1, E=2
    Sources: [A, B]
    Sinks: [E]
    """
    G = nx.DiGraph()
    G.add_edges_from([("A", "C"), ("B", "D"), ("C", "E"), ("D", "E")])
    return G


@pytest.fixture
def wide_dag():
    """
    Wide DAG (one node depends on many):
        A   B   C   D
         \  |  /  /
           \|/  /
            E--/

    Depths: A=0, B=0, C=0, D=0, E=1
    Sources: [A, B, C, D]
    Sinks: [E]
    Proof width of E: 4
    """
    G = nx.DiGraph()
    G.add_edges_from([("A", "E"), ("B", "E"), ("C", "E"), ("D", "E")])
    return G


@pytest.fixture
def deep_dag():
    """
    Deep DAG with branches:
           A
          /|\
         B C D
         |   |
         E   F
          \ /
           G
           |
           H

    Depths: A=0, B=1, C=1, D=1, E=2, F=2, G=3, H=4
    """
    G = nx.DiGraph()
    G.add_edges_from([
        ("A", "B"), ("A", "C"), ("A", "D"),
        ("B", "E"), ("D", "F"),
        ("E", "G"), ("F", "G"),
        ("G", "H"),
    ])
    return G


@pytest.fixture
def bottleneck_dag():
    """
    DAG with clear bottleneck:
        A   B   C
         \  |  /
           \|/
            D  ← bottleneck (3 ancestors, 3 descendants)
           /|\
          E F G

    Bottleneck score of D: 3/3 = 1.0
    """
    G = nx.DiGraph()
    G.add_edges_from([
        ("A", "D"), ("B", "D"), ("C", "D"),
        ("D", "E"), ("D", "F"), ("D", "G"),
    ])
    return G


# =============================================================================
# Tests: Dependency Depth
# =============================================================================

class TestDependencyDepth:
    """Test dependency depth computation"""

    def test_linear_dag_depth(self, simple_dag):
        """Linear chain should have incremental depths"""
        from astrolabe.analysis.dag import compute_dependency_depth

        depths = compute_dependency_depth(simple_dag)

        assert depths["A"] == 0
        assert depths["B"] == 1
        assert depths["C"] == 2
        assert depths["D"] == 3

    def test_diamond_dag_depth(self, diamond_dag):
        """Diamond should use longest path for depth"""
        from astrolabe.analysis.dag import compute_dependency_depth

        depths = compute_dependency_depth(diamond_dag)

        assert depths["A"] == 0
        assert depths["B"] == 1
        assert depths["C"] == 1
        assert depths["D"] == 2  # max of paths through B and C

    def test_multi_root_depth(self, multi_root_dag):
        """Multiple roots should all have depth 0"""
        from astrolabe.analysis.dag import compute_dependency_depth

        depths = compute_dependency_depth(multi_root_dag)

        assert depths["A"] == 0
        assert depths["B"] == 0
        assert depths["C"] == 1
        assert depths["D"] == 1
        assert depths["E"] == 2

    def test_deep_dag_depth(self, deep_dag):
        """Deep DAG should compute correct max depths"""
        from astrolabe.analysis.dag import compute_dependency_depth

        depths = compute_dependency_depth(deep_dag)

        assert depths["A"] == 0
        assert depths["H"] == 4  # longest path: A → B → E → G → H

    def test_empty_graph(self):
        """Empty graph should return empty dict"""
        from astrolabe.analysis.dag import compute_dependency_depth

        G = nx.DiGraph()
        depths = compute_dependency_depth(G)

        assert depths == {}

    def test_single_node(self):
        """Single node should have depth 0"""
        from astrolabe.analysis.dag import compute_dependency_depth

        G = nx.DiGraph()
        G.add_node("A")
        depths = compute_dependency_depth(G)

        assert depths["A"] == 0


# =============================================================================
# Tests: Topological Layers
# =============================================================================

class TestTopologicalLayers:
    """Test topological layer assignment"""

    def test_linear_layers(self, simple_dag):
        """Linear chain: each node in its own layer"""
        from astrolabe.analysis.dag import compute_topological_layers

        layers = compute_topological_layers(simple_dag)

        # Each node should be in a different layer
        assert layers["A"] == 0
        assert layers["B"] == 1
        assert layers["C"] == 2
        assert layers["D"] == 3

    def test_diamond_layers(self, diamond_dag):
        """Diamond: B and C should be in same layer"""
        from astrolabe.analysis.dag import compute_topological_layers

        layers = compute_topological_layers(diamond_dag)

        assert layers["A"] == 0
        assert layers["B"] == layers["C"]  # same layer
        assert layers["D"] > layers["B"]

    def test_wide_dag_layers(self, wide_dag):
        """Wide DAG: all sources in layer 0"""
        from astrolabe.analysis.dag import compute_topological_layers

        layers = compute_topological_layers(wide_dag)

        # All sources in layer 0
        assert layers["A"] == 0
        assert layers["B"] == 0
        assert layers["C"] == 0
        assert layers["D"] == 0
        # E in layer 1
        assert layers["E"] == 1

    def test_get_layer_nodes(self, diamond_dag):
        """Should be able to get all nodes in a specific layer"""
        from astrolabe.analysis.dag import get_nodes_by_layer

        layer_nodes = get_nodes_by_layer(diamond_dag)

        assert set(layer_nodes[0]) == {"A"}
        assert set(layer_nodes[1]) == {"B", "C"}
        assert set(layer_nodes[2]) == {"D"}


# =============================================================================
# Tests: Source/Sink Analysis
# =============================================================================

class TestSourceSinkAnalysis:
    """Test identification of sources (axioms) and sinks (terminal theorems)"""

    def test_simple_sources_sinks(self, simple_dag):
        """Linear chain has one source and one sink"""
        from astrolabe.analysis.dag import find_sources, find_sinks

        sources = find_sources(simple_dag)
        sinks = find_sinks(simple_dag)

        assert sources == ["A"]
        assert sinks == ["D"]

    def test_diamond_sources_sinks(self, diamond_dag):
        """Diamond has one source and one sink"""
        from astrolabe.analysis.dag import find_sources, find_sinks

        sources = find_sources(diamond_dag)
        sinks = find_sinks(diamond_dag)

        assert sources == ["A"]
        assert sinks == ["D"]

    def test_multi_root_sources(self, multi_root_dag):
        """Multiple roots should all be identified as sources"""
        from astrolabe.analysis.dag import find_sources, find_sinks

        sources = find_sources(multi_root_dag)
        sinks = find_sinks(multi_root_dag)

        assert set(sources) == {"A", "B"}
        assert sinks == ["E"]

    def test_wide_dag_sources(self, wide_dag):
        """Wide DAG has many sources"""
        from astrolabe.analysis.dag import find_sources, find_sinks

        sources = find_sources(wide_dag)
        sinks = find_sinks(wide_dag)

        assert set(sources) == {"A", "B", "C", "D"}
        assert sinks == ["E"]

    def test_source_sink_stats(self, multi_root_dag):
        """Get comprehensive source/sink statistics"""
        from astrolabe.analysis.dag import compute_source_sink_stats

        stats = compute_source_sink_stats(multi_root_dag)

        assert stats["num_sources"] == 2
        assert stats["num_sinks"] == 1
        assert set(stats["sources"]) == {"A", "B"}
        assert stats["sinks"] == ["E"]


# =============================================================================
# Tests: Proof Width (direct dependency count)
# =============================================================================

class TestProofWidth:
    """Test proof width (number of direct dependencies)"""

    def test_linear_width(self, simple_dag):
        """Linear chain: each node has width 1 (except root)"""
        from astrolabe.analysis.dag import compute_proof_width

        widths = compute_proof_width(simple_dag)

        assert widths["A"] == 0  # root, no dependencies
        assert widths["B"] == 1
        assert widths["C"] == 1
        assert widths["D"] == 1

    def test_wide_dag_width(self, wide_dag):
        """Wide DAG: E depends on 4 nodes"""
        from astrolabe.analysis.dag import compute_proof_width

        widths = compute_proof_width(wide_dag)

        assert widths["A"] == 0
        assert widths["B"] == 0
        assert widths["C"] == 0
        assert widths["D"] == 0
        assert widths["E"] == 4  # depends on A, B, C, D

    def test_diamond_width(self, diamond_dag):
        """Diamond: D depends on 2 nodes"""
        from astrolabe.analysis.dag import compute_proof_width

        widths = compute_proof_width(diamond_dag)

        assert widths["D"] == 2  # depends on B and C


# =============================================================================
# Tests: Bottleneck Score
# =============================================================================

class TestBottleneckScore:
    """Test bottleneck score computation"""

    def test_bottleneck_dag(self, bottleneck_dag):
        """Clear bottleneck should have high score"""
        from astrolabe.analysis.dag import compute_bottleneck_scores

        scores = compute_bottleneck_scores(bottleneck_dag)

        # D is the bottleneck: 3 descendants / 3 ancestors = 1.0
        assert scores["D"] == pytest.approx(1.0)

        # Sources have infinite descendants/ancestors ratio (no ancestors)
        # We define sources as having score based on descendants only
        assert scores["A"] > 0

        # Sinks have 0 descendants
        assert scores["E"] == 0
        assert scores["F"] == 0
        assert scores["G"] == 0

    def test_linear_bottleneck(self, simple_dag):
        """Linear chain: middle nodes are moderate bottlenecks"""
        from astrolabe.analysis.dag import compute_bottleneck_scores

        scores = compute_bottleneck_scores(simple_dag)

        # A: 3 descendants, 0 ancestors → high score (source)
        # D: 0 descendants, 3 ancestors → 0 (sink)
        assert scores["A"] > scores["D"]
        assert scores["D"] == 0


# =============================================================================
# Tests: Reachability Count
# =============================================================================

class TestReachabilityCount:
    """Test reachability count (how many nodes depend on this one)"""

    def test_linear_reachability(self, simple_dag):
        """Linear chain: decreasing reachability"""
        from astrolabe.analysis.dag import compute_reachability_count

        reach = compute_reachability_count(simple_dag)

        assert reach["A"] == 3  # B, C, D reachable from A
        assert reach["B"] == 2  # C, D reachable from B
        assert reach["C"] == 1  # D reachable from C
        assert reach["D"] == 0  # nothing reachable from D

    def test_bottleneck_reachability(self, bottleneck_dag):
        """Bottleneck: D reaches all sinks"""
        from astrolabe.analysis.dag import compute_reachability_count

        reach = compute_reachability_count(bottleneck_dag)

        assert reach["D"] == 3  # E, F, G reachable from D
        assert reach["A"] == 4  # D, E, F, G reachable from A


# =============================================================================
# Tests: Critical Path Analysis
# =============================================================================

class TestCriticalPath:
    """Test critical path (longest dependency chain)"""

    def test_linear_critical_path(self, simple_dag):
        """Linear chain: the whole chain is the critical path"""
        from astrolabe.analysis.dag import find_critical_path

        path = find_critical_path(simple_dag)

        assert path == ["A", "B", "C", "D"]

    def test_deep_dag_critical_path(self, deep_dag):
        """Deep DAG: find longest path"""
        from astrolabe.analysis.dag import find_critical_path

        path = find_critical_path(deep_dag)

        # Longest path is A → B → E → G → H (length 5)
        # or A → D → F → G → H (length 5)
        assert len(path) == 5
        assert path[0] == "A"
        assert path[-1] == "H"

    def test_critical_path_to_target(self, deep_dag):
        """Find critical path to a specific target node"""
        from astrolabe.analysis.dag import find_critical_path_to

        path = find_critical_path_to(deep_dag, "G")

        # Longest path to G is A → B → E → G or A → D → F → G
        assert len(path) == 4
        assert path[0] == "A"
        assert path[-1] == "G"

    def test_critical_path_length(self, deep_dag):
        """Get the length of the critical path (graph depth)"""
        from astrolabe.analysis.dag import compute_graph_depth

        depth = compute_graph_depth(deep_dag)

        assert depth == 4  # 5 nodes, 4 edges in longest path


# =============================================================================
# Tests: Integration - DAGAnalysisResult
# =============================================================================

class TestDAGAnalysisResult:
    """Test the combined DAG analysis result"""

    def test_full_dag_analysis(self, deep_dag):
        """Run complete DAG analysis and get combined result"""
        from astrolabe.analysis.dag import analyze_dag

        result = analyze_dag(deep_dag)

        # Should have all components
        assert "depths" in result
        assert "layers" in result
        assert "sources" in result
        assert "sinks" in result
        assert "widths" in result
        assert "bottleneck_scores" in result
        assert "reachability" in result
        assert "critical_path" in result
        assert "graph_depth" in result

        # Verify some values
        assert result["depths"]["A"] == 0
        assert result["depths"]["H"] == 4
        assert "A" in result["sources"]
        assert "H" in result["sinks"]
        assert result["graph_depth"] == 4

    def test_dag_analysis_to_dict(self, diamond_dag):
        """Result should be JSON-serializable"""
        from astrolabe.analysis.dag import analyze_dag
        import json

        result = analyze_dag(diamond_dag)

        # Should not raise
        json_str = json.dumps(result)
        assert json_str is not None


# =============================================================================
# Tests: Non-DAG Handling
# =============================================================================

class TestNonDAGHandling:
    """Test behavior with cyclic graphs"""

    def test_cyclic_graph_raises(self):
        """Cyclic graph should raise ValueError"""
        from astrolabe.analysis.dag import compute_dependency_depth

        G = nx.DiGraph()
        G.add_edges_from([("A", "B"), ("B", "C"), ("C", "A")])  # cycle

        with pytest.raises(ValueError, match="not a DAG"):
            compute_dependency_depth(G)

    def test_analyze_dag_with_cycle(self):
        """analyze_dag should handle cycles gracefully"""
        from astrolabe.analysis.dag import analyze_dag

        G = nx.DiGraph()
        G.add_edges_from([("A", "B"), ("B", "C"), ("C", "A")])

        result = analyze_dag(G)

        # Should return error indicator
        assert result.get("is_dag") == False
        assert "error" in result
