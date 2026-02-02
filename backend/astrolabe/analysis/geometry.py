"""
Discrete Differential Geometry Module

Provides geometric analysis methods based on the graph Laplacian:
- Heat Kernel and Heat Kernel Signature (HKS)
- Diffusion Distance
- Commute Time Distance
- Spectral methods

These methods provide multi-scale analysis of graph structure:
- Small time scale: Local neighborhood structure
- Large time scale: Global position in graph
"""

from typing import Dict, List, Any, Optional, Tuple
import numpy as np
from scipy import sparse
from scipy.sparse.linalg import eigsh, expm_multiply
import networkx as nx


# =============================================================================
# Graph Laplacian
# =============================================================================

def compute_laplacian(
    G: nx.Graph | nx.DiGraph,
    normalized: bool = True
) -> Tuple[np.ndarray, List[str]]:
    """
    Compute graph Laplacian matrix.

    Combinatorial Laplacian: L = D - A
    Normalized Laplacian: L_norm = I - D^{-1/2} A D^{-1/2}

    Args:
        G: NetworkX graph (will be converted to undirected)
        normalized: Whether to use normalized Laplacian

    Returns:
        Tuple of (Laplacian matrix, list of node IDs in order)
    """
    if G.is_directed():
        G = G.to_undirected()

    nodes = list(G.nodes())
    n = len(nodes)

    if n == 0:
        return np.array([]), []

    # Get adjacency matrix
    A = nx.adjacency_matrix(G, nodelist=nodes).toarray().astype(float)

    # Degree matrix
    degrees = np.array(A.sum(axis=1)).flatten()
    D = np.diag(degrees)

    if normalized:
        # Normalized Laplacian: L = I - D^{-1/2} A D^{-1/2}
        # Handle zero degrees
        degrees_inv_sqrt = np.zeros_like(degrees)
        nonzero = degrees > 0
        degrees_inv_sqrt[nonzero] = 1.0 / np.sqrt(degrees[nonzero])
        D_inv_sqrt = np.diag(degrees_inv_sqrt)

        L = np.eye(n) - D_inv_sqrt @ A @ D_inv_sqrt
    else:
        # Combinatorial Laplacian: L = D - A
        L = D - A

    return L, nodes


def compute_laplacian_spectrum(
    G: nx.Graph | nx.DiGraph,
    k: int = 10,
    normalized: bool = True
) -> Dict[str, Any]:
    """
    Compute eigenvalues and eigenvectors of the graph Laplacian.

    The spectrum reveals important structural properties:
    - λ_0 = 0 always (constant eigenvector)
    - λ_1 (Fiedler value): Algebraic connectivity
    - Spectral gap (λ_2 - λ_1): Community structure indicator
    - Multiplicity of 0: Number of connected components

    Args:
        G: NetworkX graph
        k: Number of eigenvalues to compute
        normalized: Whether to use normalized Laplacian

    Returns:
        Dict with eigenvalues, eigenvectors, and derived metrics
    """
    L, nodes = compute_laplacian(G, normalized)

    if len(nodes) == 0:
        return {"error": "Empty graph"}

    n = len(nodes)
    k = min(k, n - 1)  # Can't have more eigenvalues than nodes - 1

    if k < 1:
        return {"error": "Graph too small for spectral analysis"}

    try:
        # Compute smallest k eigenvalues/vectors
        eigenvalues, eigenvectors = eigsh(L, k=k, which='SM')

        # Sort by eigenvalue
        idx = np.argsort(eigenvalues)
        eigenvalues = eigenvalues[idx]
        eigenvectors = eigenvectors[:, idx]

        # Fiedler value and vector (second smallest eigenvalue)
        fiedler_value = float(eigenvalues[1]) if len(eigenvalues) > 1 else 0
        fiedler_vector = eigenvectors[:, 1].tolist() if eigenvectors.shape[1] > 1 else []

        # Spectral gap
        spectral_gap = float(eigenvalues[2] - eigenvalues[1]) if len(eigenvalues) > 2 else 0

        # Map Fiedler vector to nodes
        fiedler_by_node = {}
        if fiedler_vector:
            for i, node in enumerate(nodes):
                fiedler_by_node[node] = float(fiedler_vector[i])

        return {
            "eigenvalues": eigenvalues.tolist(),
            "fiedler_value": fiedler_value,
            "fiedler_vector": fiedler_by_node,
            "spectral_gap": spectral_gap,
            "normalized": normalized,
            "interpretation": {
                "algebraic_connectivity": (
                    "strongly_connected" if fiedler_value > 0.5 else
                    "moderately_connected" if fiedler_value > 0.1 else
                    "weakly_connected"
                ),
                "community_structure": (
                    "strong" if spectral_gap > 0.5 else
                    "moderate" if spectral_gap > 0.1 else
                    "weak"
                ),
            },
        }
    except Exception as e:
        return {"error": f"Spectral computation failed: {str(e)}"}


# =============================================================================
# Heat Kernel
# =============================================================================

def compute_heat_kernel(
    G: nx.Graph | nx.DiGraph,
    t: float = 1.0,
    normalized: bool = True
) -> np.ndarray:
    """
    Compute heat kernel matrix H_t = exp(-tL).

    The heat kernel describes how "heat" diffuses on the graph.
    H_t(x, y) gives the amount of heat at node y at time t
    if we start with unit heat at node x.

    Args:
        G: NetworkX graph
        t: Diffusion time
        normalized: Whether to use normalized Laplacian

    Returns:
        Heat kernel matrix (n x n)
    """
    L, nodes = compute_laplacian(G, normalized)

    if len(nodes) == 0:
        return np.array([])

    # H_t = exp(-tL)
    # For small graphs, compute directly
    if len(nodes) < 500:
        from scipy.linalg import expm
        H = expm(-t * L)
    else:
        # For large graphs, use sparse approximation
        # This computes exp(-tL) @ I using Krylov methods
        H = np.zeros_like(L)
        for i in range(len(nodes)):
            e_i = np.zeros(len(nodes))
            e_i[i] = 1.0
            H[:, i] = expm_multiply(-t * sparse.csr_matrix(L), e_i)

    return H


def compute_heat_kernel_signature(
    G: nx.Graph | nx.DiGraph,
    time_scales: Optional[List[float]] = None,
    k: int = 20
) -> Dict[str, Any]:
    """
    Compute Heat Kernel Signature (HKS) for all nodes.

    HKS is a multi-scale descriptor of local graph structure:
    h_t(x) = Σ_i exp(-t λ_i) φ_i(x)²

    where λ_i and φ_i are eigenvalues/eigenvectors of the Laplacian.

    - Small t: Captures local structure (high-frequency details)
    - Large t: Captures global position (low-frequency structure)

    Args:
        G: NetworkX graph
        time_scales: List of diffusion times (default: logarithmic scale)
        k: Number of eigenvalues to use

    Returns:
        Dict mapping node -> HKS vector at different time scales
    """
    L, nodes = compute_laplacian(G, normalized=True)

    if len(nodes) == 0:
        return {"error": "Empty graph"}

    n = len(nodes)
    k = min(k, n - 1)

    if k < 2:
        return {"error": "Graph too small for HKS"}

    # Default time scales (logarithmic)
    if time_scales is None:
        time_scales = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0]

    try:
        # Compute eigendecomposition
        eigenvalues, eigenvectors = eigsh(L, k=k, which='SM')

        # Sort by eigenvalue
        idx = np.argsort(eigenvalues)
        eigenvalues = eigenvalues[idx]
        eigenvectors = eigenvectors[:, idx]

        # Compute HKS for each node at each time scale
        hks = {}
        for i, node in enumerate(nodes):
            hks[node] = []
            for t in time_scales:
                # h_t(x) = Σ_i exp(-t λ_i) φ_i(x)²
                signature = np.sum(
                    np.exp(-t * eigenvalues) * (eigenvectors[i, :] ** 2)
                )
                hks[node].append(float(signature))

        # Compute statistics
        hks_matrix = np.array([hks[n] for n in nodes])

        return {
            "time_scales": time_scales,
            "hks_by_node": hks,
            "statistics": {
                "mean_by_scale": hks_matrix.mean(axis=0).tolist(),
                "std_by_scale": hks_matrix.std(axis=0).tolist(),
            },
            "interpretation": (
                "HKS provides multi-scale node fingerprints. "
                "Similar HKS vectors indicate structurally similar nodes."
            ),
        }
    except Exception as e:
        return {"error": f"HKS computation failed: {str(e)}"}


# =============================================================================
# Diffusion Distance
# =============================================================================

def compute_diffusion_distance(
    G: nx.Graph | nx.DiGraph,
    t: float = 1.0,
    k: int = 20
) -> Dict[str, Any]:
    """
    Compute diffusion distance between all pairs of nodes.

    Diffusion distance at time t:
    d_t(x, y) = ||H_t(x, ·) - H_t(y, ·)||

    This is a "smoother" distance than shortest path because it
    considers all paths, weighted by their lengths.

    Args:
        G: NetworkX graph
        t: Diffusion time
        k: Number of eigenvalues to use for approximation

    Returns:
        Dict with distance matrix and statistics
    """
    L, nodes = compute_laplacian(G, normalized=True)

    if len(nodes) == 0:
        return {"error": "Empty graph"}

    n = len(nodes)
    k = min(k, n - 1)

    try:
        # Compute eigendecomposition
        eigenvalues, eigenvectors = eigsh(L, k=k, which='SM')
        idx = np.argsort(eigenvalues)
        eigenvalues = eigenvalues[idx]
        eigenvectors = eigenvectors[:, idx]

        # Diffusion coordinates: Ψ_t(x)_i = exp(-t λ_i) φ_i(x)
        weights = np.exp(-t * eigenvalues)
        diffusion_coords = eigenvectors * weights[np.newaxis, :]

        # Compute pairwise distances
        # d(x, y)² = Σ_i (Ψ_t(x)_i - Ψ_t(y)_i)²
        # Use efficient matrix computation
        from scipy.spatial.distance import pdist, squareform
        distances = squareform(pdist(diffusion_coords, metric='euclidean'))

        # Create distance dict
        distance_matrix = {}
        for i, node_i in enumerate(nodes):
            distance_matrix[node_i] = {}
            for j, node_j in enumerate(nodes):
                distance_matrix[node_i][node_j] = float(distances[i, j])

        return {
            "t": t,
            "distances": distance_matrix,
            "statistics": {
                "mean": float(np.mean(distances)),
                "max": float(np.max(distances)),
                "std": float(np.std(distances)),
            },
        }
    except Exception as e:
        return {"error": f"Diffusion distance computation failed: {str(e)}"}


def compute_commute_time_distance(
    G: nx.Graph | nx.DiGraph,
    k: int = 20
) -> Dict[str, Any]:
    """
    Compute commute time distance between all pairs of nodes.

    Commute time = expected number of steps in a random walk from x to y and back.
    Commute time distance:
    d_CT(i, j) = vol(G) × Σ_k (1/λ_k) (φ_k(i) - φ_k(j))²

    This distance is inversely related to the number of paths between nodes.

    Args:
        G: NetworkX graph
        k: Number of eigenvalues to use

    Returns:
        Dict with distance matrix
    """
    L, nodes = compute_laplacian(G, normalized=False)  # Use combinatorial Laplacian

    if len(nodes) == 0:
        return {"error": "Empty graph"}

    n = len(nodes)
    k = min(k, n - 1)

    if G.is_directed():
        G = G.to_undirected()

    # Volume of graph (sum of all degrees)
    vol = sum(dict(G.degree()).values())

    try:
        # Compute eigendecomposition
        eigenvalues, eigenvectors = eigsh(L, k=k, which='SM')
        idx = np.argsort(eigenvalues)
        eigenvalues = eigenvalues[idx]
        eigenvectors = eigenvectors[:, idx]

        # Skip the zero eigenvalue (first one)
        eigenvalues = eigenvalues[1:]
        eigenvectors = eigenvectors[:, 1:]

        # Commute time coordinates: √(vol/λ_k) × φ_k(x)
        weights = np.sqrt(vol / eigenvalues)
        ct_coords = eigenvectors * weights[np.newaxis, :]

        # Compute pairwise distances
        from scipy.spatial.distance import pdist, squareform
        distances = squareform(pdist(ct_coords, metric='euclidean'))

        # Create distance dict (sample for large graphs)
        if n > 500:
            # For large graphs, only return statistics
            return {
                "statistics": {
                    "mean": float(np.mean(distances)),
                    "max": float(np.max(distances)),
                    "std": float(np.std(distances)),
                },
                "note": "Full distance matrix omitted for large graph",
            }

        distance_matrix = {}
        for i, node_i in enumerate(nodes):
            distance_matrix[node_i] = {}
            for j, node_j in enumerate(nodes):
                distance_matrix[node_i][node_j] = float(distances[i, j])

        return {
            "distances": distance_matrix,
            "statistics": {
                "mean": float(np.mean(distances)),
                "max": float(np.max(distances)),
                "std": float(np.std(distances)),
            },
        }
    except Exception as e:
        return {"error": f"Commute time distance computation failed: {str(e)}"}


# =============================================================================
# Combined Analysis
# =============================================================================

def analyze_geometry(
    G: nx.Graph | nx.DiGraph,
    time_scales: Optional[List[float]] = None
) -> Dict[str, Any]:
    """
    Comprehensive geometric analysis of graph.

    Args:
        G: NetworkX graph
        time_scales: Time scales for HKS

    Returns:
        Dict with all geometric analysis results
    """
    result = {
        "graph_info": {
            "nodes": G.number_of_nodes(),
            "edges": G.number_of_edges(),
        }
    }

    # Laplacian spectrum
    result["spectrum"] = compute_laplacian_spectrum(G)

    # Heat Kernel Signature
    if G.number_of_nodes() <= 2000:
        result["hks"] = compute_heat_kernel_signature(G, time_scales)
    else:
        result["hks"] = {"note": "Skipped for large graph (>2000 nodes)"}

    return result
