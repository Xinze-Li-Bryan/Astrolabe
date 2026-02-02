"""
Topological Data Analysis (TDA) Module

Provides topological methods for graph analysis:
- Betti Numbers: Count of connected components and cycles
- Persistent Homology: Track topological features through filtration
- Simplicial complex construction from graphs

These methods capture global structural properties that are
invariant under continuous deformations.
"""

from typing import Dict, List, Any, Optional, Tuple
import numpy as np
import networkx as nx

try:
    import gudhi
    HAS_GUDHI = True
except ImportError:
    HAS_GUDHI = False


# =============================================================================
# Betti Numbers (Simple)
# =============================================================================

def compute_betti_numbers(G: nx.Graph | nx.DiGraph) -> Dict[str, Any]:
    """
    Compute Betti numbers of the graph.

    Betti numbers are topological invariants:
    - β_0 = number of connected components
    - β_1 = number of independent cycles (holes)

    For a graph:
    - β_0 = number of connected components
    - β_1 = |E| - |V| + β_0 (by Euler's formula)

    Args:
        G: NetworkX graph

    Returns:
        Dict with Betti numbers and interpretation
    """
    if G.is_directed():
        G = G.to_undirected()

    n = G.number_of_nodes()
    m = G.number_of_edges()

    if n == 0:
        return {"error": "Empty graph"}

    # β_0 = number of connected components
    beta_0 = nx.number_connected_components(G)

    # β_1 = |E| - |V| + β_0 (Euler characteristic χ = V - E + F, for planar F=1+β_1)
    # For graphs embedded as 1-dimensional simplicial complex:
    # χ = β_0 - β_1, and χ = V - E
    # So β_1 = β_0 - (V - E) = E - V + β_0
    beta_1 = m - n + beta_0

    # Cyclomatic complexity (related to β_1)
    cyclomatic = m - n + 2 * beta_0

    return {
        "beta_0": beta_0,
        "beta_1": beta_1,
        "euler_characteristic": n - m,
        "cyclomatic_complexity": cyclomatic,
        "interpretation": {
            "components": f"{beta_0} connected component(s)",
            "cycles": f"{beta_1} independent cycle(s)",
            "description": (
                "Tree-like structure" if beta_1 == 0 else
                f"Graph has {beta_1} independent cycles (non-trivial topology)"
            ),
        },
    }


# =============================================================================
# Persistent Homology (Advanced)
# =============================================================================

def compute_persistent_homology(
    G: nx.Graph | nx.DiGraph,
    filtration: str = "degree",
    max_dimension: int = 1
) -> Dict[str, Any]:
    """
    Compute persistent homology of the graph.

    Persistent homology tracks how topological features (components, cycles)
    appear and disappear as we filter the graph by some measure.

    Filtration types:
    - "degree": Filter by node degree (high-degree nodes appear first)
    - "centrality": Filter by PageRank centrality
    - "distance": Filter by distance from a central node

    Args:
        G: NetworkX graph
        filtration: Type of filtration to use
        max_dimension: Maximum homology dimension (1 = cycles)

    Returns:
        Dict with persistence diagrams and barcodes
    """
    if not HAS_GUDHI:
        # Fallback to simple Betti numbers
        return {
            "warning": "gudhi not available, returning simple Betti numbers",
            "betti": compute_betti_numbers(G),
        }

    if G.is_directed():
        G = G.to_undirected()

    nodes = list(G.nodes())
    n = len(nodes)

    if n == 0:
        return {"error": "Empty graph"}

    # Compute filtration values for nodes
    if filtration == "degree":
        # Higher degree = earlier in filtration (lower value)
        max_degree = max(dict(G.degree()).values()) if G.number_of_edges() > 0 else 1
        node_values = {
            node: 1.0 - G.degree(node) / max_degree
            for node in nodes
        }
    elif filtration == "centrality":
        pagerank = nx.pagerank(G)
        max_pr = max(pagerank.values()) if pagerank else 1
        node_values = {
            node: 1.0 - pagerank.get(node, 0) / max_pr
            for node in nodes
        }
    else:  # distance from center
        # Use node with highest betweenness as center
        bc = nx.betweenness_centrality(G)
        center = max(bc, key=bc.get) if bc else nodes[0]
        distances = nx.single_source_shortest_path_length(G, center)
        max_dist = max(distances.values()) if distances else 1
        node_values = {
            node: distances.get(node, max_dist) / max_dist
            for node in nodes
        }

    # Build Rips complex filtration
    try:
        # Create simplex tree
        st = gudhi.SimplexTree()

        # Add vertices with their filtration values
        node_to_idx = {node: i for i, node in enumerate(nodes)}
        for node in nodes:
            st.insert([node_to_idx[node]], filtration=node_values[node])

        # Add edges with filtration = max of endpoint values
        for u, v in G.edges():
            idx_u, idx_v = node_to_idx[u], node_to_idx[v]
            edge_filtration = max(node_values[u], node_values[v])
            st.insert([idx_u, idx_v], filtration=edge_filtration)

        # Add triangles (for higher homology)
        if max_dimension >= 2:
            for node in nodes:
                neighbors = list(G.neighbors(node))
                for i, n1 in enumerate(neighbors):
                    for n2 in neighbors[i+1:]:
                        if G.has_edge(n1, n2):
                            # Found a triangle
                            indices = sorted([node_to_idx[node], node_to_idx[n1], node_to_idx[n2]])
                            tri_filtration = max(node_values[node], node_values[n1], node_values[n2])
                            st.insert(indices, filtration=tri_filtration)

        # Compute persistence
        st.compute_persistence()

        # Extract persistence pairs
        persistence = st.persistence()

        # Organize by dimension
        diagrams = {d: [] for d in range(max_dimension + 1)}
        for dim, (birth, death) in persistence:
            if dim <= max_dimension:
                diagrams[dim].append({
                    "birth": float(birth),
                    "death": float(death) if death != float('inf') else None,
                    "persistence": float(death - birth) if death != float('inf') else float('inf'),
                })

        # Sort by persistence (longest-lived features first)
        for dim in diagrams:
            diagrams[dim].sort(
                key=lambda x: x["persistence"] if x["persistence"] != float('inf') else 1e10,
                reverse=True
            )

        # Compute Betti numbers at different thresholds
        betti_curve = []
        for threshold in np.linspace(0, 1, 11):
            betti = [0] * (max_dimension + 1)
            for dim, pairs in diagrams.items():
                for pair in pairs:
                    if pair["birth"] <= threshold:
                        if pair["death"] is None or pair["death"] > threshold:
                            betti[dim] += 1
            betti_curve.append({"threshold": float(threshold), "betti": betti})

        return {
            "filtration": filtration,
            "max_dimension": max_dimension,
            "persistence_diagrams": diagrams,
            "betti_curve": betti_curve,
            "summary": {
                "total_features": sum(len(d) for d in diagrams.values()),
                "long_lived_features": sum(
                    1 for d in diagrams.values()
                    for p in d if p["persistence"] > 0.5 or p["death"] is None
                ),
            },
            "interpretation": (
                "Persistent features (high persistence) indicate "
                "robust topological structure. Dimension 0 = components, "
                "Dimension 1 = cycles."
            ),
        }

    except Exception as e:
        return {"error": f"Persistent homology computation failed: {str(e)}"}


# =============================================================================
# Persistence-Based Metrics
# =============================================================================

def compute_persistence_entropy(diagrams: Dict[int, List[Dict]]) -> Dict[str, float]:
    """
    Compute persistence entropy from persistence diagrams.

    Persistence entropy measures the "complexity" of the topological features.
    Higher entropy = more diverse feature lifespans.

    Args:
        diagrams: Persistence diagrams from compute_persistent_homology

    Returns:
        Dict with entropy for each dimension
    """
    entropies = {}

    for dim, pairs in diagrams.items():
        # Filter finite persistence values
        persistences = [
            p["persistence"] for p in pairs
            if p["persistence"] != float('inf') and p["persistence"] > 0
        ]

        if not persistences:
            entropies[f"dim_{dim}"] = 0.0
            continue

        # Normalize to probability distribution
        total = sum(persistences)
        probs = [p / total for p in persistences]

        # Compute entropy
        entropy = -sum(p * np.log(p) for p in probs if p > 0)
        entropies[f"dim_{dim}"] = float(entropy)

    return entropies


def compute_persistence_landscape(
    diagrams: Dict[int, List[Dict]],
    dimension: int = 1,
    num_landscapes: int = 5,
    resolution: int = 100
) -> Dict[str, Any]:
    """
    Compute persistence landscape from persistence diagrams.

    Persistence landscapes are a stable vectorization of persistence diagrams,
    useful for statistical analysis and machine learning.

    Args:
        diagrams: Persistence diagrams
        dimension: Homology dimension to use
        num_landscapes: Number of landscape functions
        resolution: Number of sample points

    Returns:
        Dict with landscape functions
    """
    if dimension not in diagrams or not diagrams[dimension]:
        return {"error": f"No features in dimension {dimension}"}

    pairs = diagrams[dimension]

    # Filter finite pairs
    finite_pairs = [
        (p["birth"], p["death"])
        for p in pairs
        if p["death"] is not None
    ]

    if not finite_pairs:
        return {"error": "No finite persistence pairs"}

    # Determine range
    min_val = min(p[0] for p in finite_pairs)
    max_val = max(p[1] for p in finite_pairs)

    # Sample points
    t_values = np.linspace(min_val, max_val, resolution)

    # Compute tent functions for each pair
    def tent(t, birth, death):
        mid = (birth + death) / 2
        if t < birth or t > death:
            return 0
        elif t <= mid:
            return t - birth
        else:
            return death - t

    # For each t, collect all tent values and sort
    landscapes = np.zeros((num_landscapes, resolution))

    for i, t in enumerate(t_values):
        values = sorted([tent(t, b, d) for b, d in finite_pairs], reverse=True)
        for k in range(min(num_landscapes, len(values))):
            landscapes[k, i] = values[k]

    return {
        "t_values": t_values.tolist(),
        "landscapes": landscapes.tolist(),
        "num_landscapes": num_landscapes,
        "dimension": dimension,
    }


# =============================================================================
# Mapper Algorithm
# =============================================================================

def compute_mapper(
    G: nx.Graph | nx.DiGraph,
    filter_func: str = "degree",
    num_intervals: int = 10,
    overlap: float = 0.3,
    clustering: str = "components"
) -> Dict[str, Any]:
    """
    Compute Mapper graph - a simplified topological skeleton.

    Mapper creates a simplified representation of the data by:
    1. Applying a filter function to create a 1D projection
    2. Covering the projection with overlapping intervals
    3. Clustering within each interval
    4. Connecting clusters that share points

    This reveals the "shape" of the dependency graph at different scales.

    Args:
        G: NetworkX graph
        filter_func: Filter function ("degree", "pagerank", "closeness", "depth")
        num_intervals: Number of intervals to cover the filter range
        overlap: Fraction of overlap between adjacent intervals (0-0.5)
        clustering: Clustering method ("components" or "louvain")

    Returns:
        Dict with Mapper graph structure
    """
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G.copy()

    nodes = list(G.nodes())
    n = len(nodes)

    if n < 10:
        return {"error": "Graph too small for Mapper (need at least 10 nodes)"}

    # Step 1: Compute filter function values
    if filter_func == "degree":
        values = {node: G.degree(node) for node in nodes}
    elif filter_func == "pagerank":
        values = nx.pagerank(G)
    elif filter_func == "closeness":
        values = nx.closeness_centrality(G_undirected)
    elif filter_func == "depth":
        # Use topological depth for DAGs
        if G.is_directed() and nx.is_directed_acyclic_graph(G):
            # Find sources and compute depths
            sources = [n for n in G.nodes() if G.in_degree(n) == 0]
            depths = {}
            for source in sources:
                for node, depth in nx.single_source_shortest_path_length(G, source).items():
                    if node not in depths or depth > depths[node]:
                        depths[node] = depth
            values = depths
        else:
            # Fallback to degree
            values = {node: G.degree(node) for node in nodes}
    else:
        values = {node: G.degree(node) for node in nodes}

    # Normalize filter values to [0, 1]
    min_val = min(values.values())
    max_val = max(values.values())
    val_range = max_val - min_val if max_val > min_val else 1

    normalized = {node: (values[node] - min_val) / val_range for node in nodes}

    # Step 2: Create overlapping intervals
    interval_width = 1.0 / num_intervals
    step = interval_width * (1 - overlap)

    intervals = []
    start = 0.0
    while start < 1.0:
        end = min(start + interval_width, 1.0)
        intervals.append((start, end))
        start += step

    # Step 3: Cluster within each interval
    mapper_nodes = []  # List of (interval_idx, cluster_idx, members)
    node_to_mapper = {}  # Map original node -> list of mapper node indices

    for interval_idx, (low, high) in enumerate(intervals):
        # Get nodes in this interval
        interval_nodes = [
            node for node in nodes
            if low <= normalized[node] <= high
        ]

        if not interval_nodes:
            continue

        # Cluster the nodes in this interval
        if clustering == "components":
            # Use connected components
            subgraph = G_undirected.subgraph(interval_nodes)
            components = list(nx.connected_components(subgraph))
        else:
            # Simple single-linkage clustering based on graph distance
            subgraph = G_undirected.subgraph(interval_nodes)
            components = list(nx.connected_components(subgraph))

        for cluster_idx, cluster in enumerate(components):
            mapper_node_idx = len(mapper_nodes)
            mapper_nodes.append({
                "id": mapper_node_idx,
                "interval": interval_idx,
                "interval_range": [low, high],
                "cluster": cluster_idx,
                "members": list(cluster),
                "size": len(cluster),
                "filter_mean": np.mean([normalized[m] for m in cluster]),
            })

            # Track which mapper nodes each original node belongs to
            for member in cluster:
                if member not in node_to_mapper:
                    node_to_mapper[member] = []
                node_to_mapper[member].append(mapper_node_idx)

    # Step 4: Create Mapper edges (connect clusters sharing nodes)
    mapper_edges = []
    for original_node, mapper_indices in node_to_mapper.items():
        if len(mapper_indices) > 1:
            # This node appears in multiple mapper nodes -> connect them
            for i, idx1 in enumerate(mapper_indices):
                for idx2 in mapper_indices[i+1:]:
                    edge_key = tuple(sorted([idx1, idx2]))
                    if edge_key not in [tuple(sorted([e["source"], e["target"]])) for e in mapper_edges]:
                        mapper_edges.append({
                            "source": idx1,
                            "target": idx2,
                        })

    # Build Mapper graph for further analysis
    mapper_graph = nx.Graph()
    for node in mapper_nodes:
        mapper_graph.add_node(node["id"], **node)
    for edge in mapper_edges:
        mapper_graph.add_edge(edge["source"], edge["target"])

    # Analyze Mapper graph structure
    mapper_components = list(nx.connected_components(mapper_graph))
    mapper_betti_1 = mapper_graph.number_of_edges() - mapper_graph.number_of_nodes() + len(mapper_components)

    return {
        "filter_function": filter_func,
        "num_intervals": num_intervals,
        "overlap": overlap,
        "mapper_nodes": mapper_nodes,
        "mapper_edges": mapper_edges,
        "summary": {
            "num_mapper_nodes": len(mapper_nodes),
            "num_mapper_edges": len(mapper_edges),
            "num_components": len(mapper_components),
            "betti_1": mapper_betti_1,
            "avg_cluster_size": np.mean([n["size"] for n in mapper_nodes]) if mapper_nodes else 0,
            "max_cluster_size": max([n["size"] for n in mapper_nodes]) if mapper_nodes else 0,
        },
        "interpretation": (
            f"Mapper creates a {len(mapper_nodes)}-node simplified graph with "
            f"{len(mapper_components)} component(s) and {mapper_betti_1} loop(s). "
            "Each Mapper node represents a cluster of similar original nodes."
        ),
    }


# =============================================================================
# Combined Analysis
# =============================================================================

def analyze_topology(
    G: nx.Graph | nx.DiGraph,
    filtration: str = "degree",
    include_mapper: bool = True
) -> Dict[str, Any]:
    """
    Comprehensive topological analysis.

    Args:
        G: NetworkX graph
        filtration: Filtration type for persistent homology
        include_mapper: Whether to compute Mapper graph

    Returns:
        Dict with all topological analysis results
    """
    result = {
        "graph_info": {
            "nodes": G.number_of_nodes(),
            "edges": G.number_of_edges(),
        }
    }

    # Simple Betti numbers (always available)
    result["betti_numbers"] = compute_betti_numbers(G)

    # Persistent homology (if gudhi available)
    if HAS_GUDHI and G.number_of_nodes() <= 2000:
        ph_result = compute_persistent_homology(G, filtration=filtration)
        result["persistent_homology"] = ph_result

        # Persistence entropy
        if "persistence_diagrams" in ph_result:
            result["persistence_entropy"] = compute_persistence_entropy(
                ph_result["persistence_diagrams"]
            )
    else:
        result["persistent_homology"] = {
            "note": "Skipped (gudhi not available or graph too large)"
        }

    # Mapper (simplified topological skeleton)
    if include_mapper and G.number_of_nodes() >= 10:
        result["mapper"] = compute_mapper(G, filter_func=filtration)

    return result
