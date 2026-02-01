"""
Graph Builder: Convert Astrolabe Node/Edge to NetworkX graph

This is the foundation for all network analysis operations.
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import networkx as nx

from ..models.node import Node
from ..models.edge import Edge


@dataclass
class GraphStats:
    """Basic graph statistics"""
    num_nodes: int
    num_edges: int
    density: float
    is_dag: bool  # Directed Acyclic Graph
    num_weakly_connected_components: int
    num_strongly_connected_components: int
    largest_wcc_size: int  # Largest Weakly Connected Component
    largest_scc_size: int  # Largest Strongly Connected Component

    def to_dict(self) -> dict:
        return {
            "numNodes": self.num_nodes,
            "numEdges": self.num_edges,
            "density": self.density,
            "isDAG": self.is_dag,
            "numWeaklyConnectedComponents": self.num_weakly_connected_components,
            "numStronglyConnectedComponents": self.num_strongly_connected_components,
            "largestWCCSize": self.largest_wcc_size,
            "largestSCCSize": self.largest_scc_size,
        }


def build_networkx_graph(
    nodes: List[Node],
    edges: List[Edge],
    directed: bool = True,
    include_node_attrs: bool = True,
) -> nx.DiGraph | nx.Graph:
    """
    Convert Astrolabe nodes and edges to a NetworkX graph.

    Args:
        nodes: List of Astrolabe Node objects
        edges: List of Astrolabe Edge objects
        directed: If True, return DiGraph; if False, return undirected Graph
        include_node_attrs: If True, include node attributes (kind, status, etc.)

    Returns:
        NetworkX graph (DiGraph or Graph)
    """
    if directed:
        G = nx.DiGraph()
    else:
        G = nx.Graph()

    # Add nodes with attributes
    for node in nodes:
        attrs = {}
        if include_node_attrs:
            attrs = {
                "name": node.name,
                "kind": node.kind,
                "status": node.status.value,
                "file_path": node.file_path,
                "line_number": node.line_number,
                "namespace": _extract_namespace(node.id),
            }
        G.add_node(node.id, **attrs)

    # Add edges
    node_ids = set(n.id for n in nodes)
    for edge in edges:
        # Only add edges where both endpoints exist
        if edge.source in node_ids and edge.target in node_ids:
            G.add_edge(
                edge.source,
                edge.target,
                from_lean=edge.from_lean,
            )

    return G


def build_undirected_graph(nodes: List[Node], edges: List[Edge]) -> nx.Graph:
    """Convenience function to build undirected graph (needed for some algorithms)"""
    return build_networkx_graph(nodes, edges, directed=False)


def compute_basic_stats(G: nx.DiGraph | nx.Graph) -> GraphStats:
    """
    Compute basic graph statistics.

    Args:
        G: NetworkX graph

    Returns:
        GraphStats dataclass with basic metrics
    """
    num_nodes = G.number_of_nodes()
    num_edges = G.number_of_edges()

    # Density: ratio of actual edges to possible edges
    if num_nodes > 1:
        if G.is_directed():
            max_edges = num_nodes * (num_nodes - 1)
        else:
            max_edges = num_nodes * (num_nodes - 1) / 2
        density = num_edges / max_edges if max_edges > 0 else 0
    else:
        density = 0

    # Check if DAG (only for directed graphs)
    is_dag = nx.is_directed_acyclic_graph(G) if G.is_directed() else False

    # Connected components
    if G.is_directed():
        wccs = list(nx.weakly_connected_components(G))
        sccs = list(nx.strongly_connected_components(G))
        num_wcc = len(wccs)
        num_scc = len(sccs)
        largest_wcc = max(len(c) for c in wccs) if wccs else 0
        largest_scc = max(len(c) for c in sccs) if sccs else 0
    else:
        ccs = list(nx.connected_components(G))
        num_wcc = len(ccs)
        num_scc = len(ccs)  # Same for undirected
        largest_wcc = max(len(c) for c in ccs) if ccs else 0
        largest_scc = largest_wcc

    return GraphStats(
        num_nodes=num_nodes,
        num_edges=num_edges,
        density=density,
        is_dag=is_dag,
        num_weakly_connected_components=num_wcc,
        num_strongly_connected_components=num_scc,
        largest_wcc_size=largest_wcc,
        largest_scc_size=largest_scc,
    )


def _extract_namespace(node_id: str, depth: int = -1) -> str:
    """
    Extract namespace from node ID.

    Example: "Mathlib.Algebra.Group.Basic.my_lemma" -> "Mathlib.Algebra.Group.Basic"

    Args:
        node_id: Full node ID
        depth: Namespace depth (-1 for full, 1 for top-level, etc.)

    Returns:
        Namespace string
    """
    parts = node_id.rsplit(".", 1)
    if len(parts) > 1:
        namespace = parts[0]
        if depth > 0:
            ns_parts = namespace.split(".")
            return ".".join(ns_parts[:depth])
        return namespace
    return ""


def get_subgraph(
    G: nx.DiGraph | nx.Graph,
    node_ids: List[str],
    include_neighbors: bool = False,
) -> nx.DiGraph | nx.Graph:
    """
    Extract a subgraph containing only specified nodes.

    Args:
        G: Original graph
        node_ids: List of node IDs to include
        include_neighbors: If True, also include direct neighbors

    Returns:
        Subgraph
    """
    nodes_to_include = set(node_ids)

    if include_neighbors:
        for node_id in node_ids:
            if node_id in G:
                nodes_to_include.update(G.neighbors(node_id))
                if G.is_directed():
                    nodes_to_include.update(G.predecessors(node_id))

    return G.subgraph(nodes_to_include).copy()


def get_namespace_subgraph(
    G: nx.DiGraph | nx.Graph,
    namespace: str,
) -> nx.DiGraph | nx.Graph:
    """
    Extract subgraph containing only nodes from a specific namespace.

    Args:
        G: Original graph
        namespace: Namespace prefix to filter by

    Returns:
        Subgraph with only nodes matching the namespace
    """
    matching_nodes = [
        n for n in G.nodes()
        if n.startswith(namespace + ".") or n == namespace
    ]
    return G.subgraph(matching_nodes).copy()
