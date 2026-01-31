"""
Graph Entropy Measures

Computes various entropy measures for characterizing graph structure:
- Von Neumann entropy (quantum-inspired, based on graph Laplacian)
- Shannon entropy of degree distribution
- Structure entropy (based on community partition)
"""

from dataclasses import dataclass
from typing import Dict, List, Optional
import math
import networkx as nx
import numpy as np
from scipy import sparse
from scipy.sparse.linalg import eigsh


@dataclass
class EntropyResult:
    """Graph entropy computation results"""
    von_neumann: float
    degree_shannon: float
    structure_entropy: Optional[float]
    effective_dimension: float  # exp(von_neumann_entropy)
    top_eigenvalues: List[float]  # Top eigenvalues of normalized Laplacian

    def to_dict(self) -> dict:
        return {
            "vonNeumann": self.von_neumann,
            "degreeShannon": self.degree_shannon,
            "structureEntropy": self.structure_entropy,
            "effectiveDimension": self.effective_dimension,
            "topEigenvalues": self.top_eigenvalues,
        }


def compute_von_neumann_entropy(
    G: nx.DiGraph | nx.Graph,
    num_eigenvalues: int = 100,
) -> Dict:
    """
    Compute Von Neumann entropy of the graph.

    The Von Neumann entropy is defined as:
        S = -Tr(ρ log ρ)

    where ρ = L / Tr(L) is the normalized Laplacian matrix.

    This is a quantum-inspired measure that captures the "complexity" of
    the graph structure. Higher entropy = more uniform/random structure.
    Lower entropy = more structured/hierarchical.

    In the context of Lean proofs:
    - Low entropy might indicate a very hierarchical/tree-like dependency structure
    - High entropy might indicate a more interconnected/web-like structure

    Args:
        G: NetworkX graph
        num_eigenvalues: Number of eigenvalues to compute (for large graphs)

    Returns:
        Dictionary with entropy value and related statistics
    """
    # Work with undirected graph for Laplacian
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G

    n = G_undirected.number_of_nodes()

    if n == 0:
        return {
            "vonNeumannEntropy": 0.0,
            "effectiveDimension": 1.0,
            "eigenvalues": [],
        }

    if n == 1:
        return {
            "vonNeumannEntropy": 0.0,
            "effectiveDimension": 1.0,
            "eigenvalues": [0.0],
        }

    # Build normalized Laplacian matrix
    # L_norm = I - D^{-1/2} A D^{-1/2}
    L = nx.normalized_laplacian_matrix(G_undirected)

    # The trace of the normalized Laplacian equals n (number of nodes)
    # So ρ = L / n

    # Compute eigenvalues
    k = min(num_eigenvalues, n - 2)
    if k < 1:
        k = 1

    try:
        # Get largest eigenvalues (normalized Laplacian has eigenvalues in [0, 2])
        eigenvalues, _ = eigsh(L, k=k, which='LM')
        eigenvalues = np.sort(eigenvalues)[::-1]  # Sort descending
    except Exception:
        # Fall back to dense computation for small graphs
        L_dense = L.toarray()
        eigenvalues = np.linalg.eigvalsh(L_dense)
        eigenvalues = np.sort(eigenvalues)[::-1]

    # Normalize eigenvalues to form density matrix eigenvalues
    # ρ = L / Tr(L) = L / n
    rho_eigenvalues = eigenvalues / n

    # Filter out near-zero eigenvalues
    rho_eigenvalues = rho_eigenvalues[rho_eigenvalues > 1e-10]

    # Compute Von Neumann entropy: S = -Σ λ_i log(λ_i)
    if len(rho_eigenvalues) == 0:
        entropy = 0.0
    else:
        entropy = -np.sum(rho_eigenvalues * np.log(rho_eigenvalues))

    # Effective dimension = exp(S)
    effective_dim = np.exp(entropy)

    return {
        "vonNeumannEntropy": float(entropy),
        "effectiveDimension": float(effective_dim),
        "eigenvalues": eigenvalues.tolist()[:20],  # Return top 20
    }


def compute_structure_entropy(
    G: nx.DiGraph | nx.Graph,
    partition: Dict[str, int] = None,
) -> float:
    """
    Compute structure entropy based on community partition.

    Structure entropy measures the information needed to describe
    the community structure:
        H = -Σ (n_i / n) log(n_i / n)

    where n_i is the size of community i and n is total nodes.

    If no partition is provided, uses Louvain algorithm to detect communities.

    Args:
        G: NetworkX graph
        partition: Optional pre-computed partition (node_id -> community_id)

    Returns:
        Structure entropy value
    """
    from .community import detect_communities_louvain

    if G.number_of_nodes() == 0:
        return 0.0

    if partition is None:
        # Detect communities first
        result = detect_communities_louvain(G)
        partition = result.partition

    # Count community sizes
    community_sizes = {}
    for comm_id in partition.values():
        community_sizes[comm_id] = community_sizes.get(comm_id, 0) + 1

    n = len(partition)
    if n == 0:
        return 0.0

    # Compute entropy
    entropy = 0.0
    for size in community_sizes.values():
        if size > 0:
            p = size / n
            entropy -= p * math.log2(p)

    return entropy


def compute_all_entropies(
    G: nx.DiGraph | nx.Graph,
    partition: Dict[str, int] = None,
) -> EntropyResult:
    """
    Compute all entropy measures for the graph.

    Args:
        G: NetworkX graph
        partition: Optional pre-computed community partition

    Returns:
        EntropyResult with all entropy measures
    """
    from .degree import compute_degree_shannon_entropy

    # Von Neumann entropy
    vn_result = compute_von_neumann_entropy(G)

    # Degree Shannon entropy
    degree_entropy = compute_degree_shannon_entropy(G)

    # Structure entropy
    structure_entropy = compute_structure_entropy(G, partition)

    return EntropyResult(
        von_neumann=vn_result["vonNeumannEntropy"],
        degree_shannon=degree_entropy,
        structure_entropy=structure_entropy,
        effective_dimension=vn_result["effectiveDimension"],
        top_eigenvalues=vn_result["eigenvalues"],
    )


def compare_entropies(
    G1: nx.DiGraph | nx.Graph,
    G2: nx.DiGraph | nx.Graph,
    labels: tuple = ("Graph 1", "Graph 2"),
) -> Dict:
    """
    Compare entropy measures between two graphs.

    Useful for:
    - Comparing different Lean projects
    - Comparing before/after states (e.g., after adding new theorems)
    - Comparing subgraphs (e.g., different namespaces)

    Args:
        G1: First graph
        G2: Second graph
        labels: Labels for the graphs

    Returns:
        Comparison dictionary with entropy values for both graphs
    """
    e1 = compute_all_entropies(G1)
    e2 = compute_all_entropies(G2)

    return {
        labels[0]: e1.to_dict(),
        labels[1]: e2.to_dict(),
        "differences": {
            "vonNeumann": e2.von_neumann - e1.von_neumann,
            "degreeShannon": e2.degree_shannon - e1.degree_shannon,
            "structureEntropy": (e2.structure_entropy or 0) - (e1.structure_entropy or 0),
        }
    }


def compute_namespace_entropies(
    G: nx.DiGraph | nx.Graph,
    depth: int = 2,
) -> Dict[str, EntropyResult]:
    """
    Compute entropy for each namespace subgraph.

    Args:
        G: NetworkX graph
        depth: Namespace depth to group by

    Returns:
        Dictionary mapping namespace to EntropyResult
    """
    from .graph_builder import get_namespace_subgraph

    # Group nodes by namespace
    namespaces = set()
    for node_id in G.nodes():
        parts = node_id.split(".")
        if len(parts) >= depth:
            ns = ".".join(parts[:depth])
            namespaces.add(ns)

    results = {}
    for ns in namespaces:
        subgraph = get_namespace_subgraph(G, ns)
        if subgraph.number_of_nodes() >= 3:  # Need at least 3 nodes for meaningful entropy
            results[ns] = compute_all_entropies(subgraph)

    return results


def random_graph_baseline(
    n: int,
    m: int,
    num_samples: int = 10,
) -> Dict:
    """
    Compute baseline entropy for random graphs with same n, m.

    This provides a reference point for comparing with the actual graph.
    If actual entropy is close to random, the structure is random-like.
    If actual entropy is much lower, there's significant structure.

    Args:
        n: Number of nodes
        m: Number of edges
        num_samples: Number of random graphs to generate

    Returns:
        Mean and std of entropies for random graphs
    """
    vn_entropies = []
    degree_entropies = []

    for _ in range(num_samples):
        # Generate random graph with same n, m
        G_random = nx.gnm_random_graph(n, m)

        vn_result = compute_von_neumann_entropy(G_random)
        vn_entropies.append(vn_result["vonNeumannEntropy"])

        from .degree import compute_degree_shannon_entropy
        degree_entropies.append(compute_degree_shannon_entropy(G_random))

    return {
        "vonNeumann": {
            "mean": float(np.mean(vn_entropies)),
            "std": float(np.std(vn_entropies)),
        },
        "degreeShannon": {
            "mean": float(np.mean(degree_entropies)),
            "std": float(np.std(degree_entropies)),
        },
        "numSamples": num_samples,
    }
