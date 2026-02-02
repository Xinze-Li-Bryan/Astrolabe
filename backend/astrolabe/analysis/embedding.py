"""
Graph Embedding Module

Provides methods to embed graph nodes into low-dimensional vector spaces:
- Spectral Embedding: Based on Laplacian eigenvectors
- Node2Vec: Random walk + Skip-gram based embedding
- Diffusion Maps: Based on diffusion process on graph
- t-SNE/UMAP: For visualization of high-dimensional features

Embeddings can be used for:
- Visualization (2D/3D layout)
- Clustering
- Similarity search
- Machine learning on graphs
"""

from typing import Dict, List, Any, Optional, Tuple
import numpy as np
from scipy.sparse.linalg import eigsh
import networkx as nx

try:
    from sklearn.manifold import SpectralEmbedding, TSNE
    from sklearn.preprocessing import StandardScaler
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

try:
    import umap
    HAS_UMAP = True
except ImportError:
    HAS_UMAP = False

try:
    from node2vec import Node2Vec as N2V
    HAS_NODE2VEC = True
except ImportError:
    HAS_NODE2VEC = False


# =============================================================================
# Spectral Embedding
# =============================================================================

def compute_spectral_embedding(
    G: nx.Graph | nx.DiGraph,
    n_components: int = 3,
    normalized: bool = True
) -> Dict[str, Any]:
    """
    Compute spectral embedding using Laplacian eigenvectors.

    Uses the smallest non-trivial eigenvectors of the Laplacian.
    Preserves cluster structure and graph connectivity.

    Args:
        G: NetworkX graph
        n_components: Number of dimensions (default 3 for 3D viz)
        normalized: Whether to use normalized Laplacian

    Returns:
        Dict mapping node -> [x, y, z, ...] coordinates
    """
    if G.is_directed():
        G = G.to_undirected()

    nodes = list(G.nodes())
    n = len(nodes)

    if n < n_components + 1:
        return {"error": f"Graph too small (need at least {n_components + 1} nodes)"}

    if HAS_SKLEARN:
        # Use sklearn's implementation
        try:
            se = SpectralEmbedding(
                n_components=n_components,
                affinity='precomputed',
                random_state=42
            )

            # Get adjacency matrix
            A = nx.adjacency_matrix(G, nodelist=nodes).toarray()

            # Fit embedding
            embedding = se.fit_transform(A)

            # Create result
            result = {}
            for i, node in enumerate(nodes):
                result[node] = embedding[i].tolist()

            return {
                "n_components": n_components,
                "embedding": result,
                "method": "sklearn_spectral",
            }
        except Exception as e:
            return {"error": f"Spectral embedding failed: {str(e)}"}
    else:
        # Manual implementation using eigenvectors
        return _spectral_embedding_manual(G, nodes, n_components, normalized)


def _spectral_embedding_manual(
    G: nx.Graph,
    nodes: List[str],
    n_components: int,
    normalized: bool
) -> Dict[str, Any]:
    """Manual spectral embedding using scipy."""
    from .geometry import compute_laplacian

    L, _ = compute_laplacian(G, normalized=normalized)
    n = len(nodes)

    try:
        # Compute smallest k+1 eigenvalues (k+1 because first is trivial)
        k = min(n_components + 1, n - 1)
        eigenvalues, eigenvectors = eigsh(L, k=k, which='SM')

        # Sort by eigenvalue
        idx = np.argsort(eigenvalues)
        eigenvectors = eigenvectors[:, idx]

        # Skip first eigenvector (constant), use next n_components
        embedding = eigenvectors[:, 1:n_components+1]

        # Normalize
        embedding = embedding / np.linalg.norm(embedding, axis=0)

        result = {}
        for i, node in enumerate(nodes):
            result[node] = embedding[i].tolist()

        return {
            "n_components": n_components,
            "embedding": result,
            "method": "manual_spectral",
        }
    except Exception as e:
        return {"error": f"Manual spectral embedding failed: {str(e)}"}


# =============================================================================
# Node2Vec Embedding
# =============================================================================

def compute_node2vec_embedding(
    G: nx.Graph | nx.DiGraph,
    dimensions: int = 64,
    walk_length: int = 30,
    num_walks: int = 200,
    p: float = 1.0,
    q: float = 1.0,
    workers: int = 4
) -> Dict[str, Any]:
    """
    Compute Node2Vec embedding using random walks.

    Node2Vec learns node representations by:
    1. Performing biased random walks from each node
    2. Using Skip-gram to learn embeddings that predict walk context

    Parameters p and q control walk strategy:
    - p (return): Likelihood of immediately revisiting a node
    - q (in-out): Controls search: q > 1 = BFS-like, q < 1 = DFS-like

    Args:
        G: NetworkX graph
        dimensions: Embedding dimension
        walk_length: Length of each random walk
        num_walks: Number of walks per node
        p: Return parameter
        q: In-out parameter
        workers: Number of parallel workers

    Returns:
        Dict mapping node -> embedding vector
    """
    if not HAS_NODE2VEC:
        return {"error": "node2vec library not available"}

    if G.is_directed():
        G = G.to_undirected()

    if G.number_of_nodes() == 0:
        return {"error": "Empty graph"}

    try:
        # Initialize Node2Vec
        node2vec = N2V(
            G,
            dimensions=dimensions,
            walk_length=walk_length,
            num_walks=num_walks,
            p=p,
            q=q,
            workers=workers,
            quiet=True
        )

        # Fit model
        model = node2vec.fit(window=10, min_count=1, batch_words=4)

        # Extract embeddings
        embedding = {}
        for node in G.nodes():
            embedding[node] = model.wv[str(node)].tolist()

        return {
            "dimensions": dimensions,
            "walk_length": walk_length,
            "num_walks": num_walks,
            "p": p,
            "q": q,
            "embedding": embedding,
            "method": "node2vec",
        }
    except Exception as e:
        return {"error": f"Node2Vec embedding failed: {str(e)}"}


# =============================================================================
# Diffusion Maps
# =============================================================================

def compute_diffusion_map(
    G: nx.Graph | nx.DiGraph,
    n_components: int = 3,
    t: float = 1.0,
    alpha: float = 0.5
) -> Dict[str, Any]:
    """
    Compute diffusion map embedding.

    Diffusion maps embed nodes such that Euclidean distance
    approximates diffusion distance on the graph.

    Ψ_t(x) = (λ_1^t φ_1(x), λ_2^t φ_2(x), ..., λ_k^t φ_k(x))

    Args:
        G: NetworkX graph
        n_components: Number of embedding dimensions
        t: Diffusion time (larger = more global structure)
        alpha: Normalization parameter (0.5 = Fokker-Planck)

    Returns:
        Dict mapping node -> embedding vector
    """
    if G.is_directed():
        G = G.to_undirected()

    nodes = list(G.nodes())
    n = len(nodes)

    if n < n_components + 1:
        return {"error": f"Graph too small (need at least {n_components + 1} nodes)"}

    try:
        # Get adjacency matrix
        A = nx.adjacency_matrix(G, nodelist=nodes).toarray().astype(float)

        # Compute degree matrix
        degrees = A.sum(axis=1)

        # Avoid division by zero
        degrees[degrees == 0] = 1

        # Normalized transition matrix (alpha-normalized)
        if alpha > 0:
            D_alpha = np.diag(degrees ** (-alpha))
            K = D_alpha @ A @ D_alpha
            row_sums = K.sum(axis=1)
            row_sums[row_sums == 0] = 1
            P = K / row_sums[:, np.newaxis]
        else:
            P = A / degrees[:, np.newaxis]

        # Make symmetric for eigendecomposition
        D_sqrt = np.diag(np.sqrt(degrees))
        D_inv_sqrt = np.diag(1.0 / np.sqrt(degrees))
        M = D_sqrt @ P @ D_inv_sqrt

        # Compute eigenvectors
        k = min(n_components + 1, n - 1)
        eigenvalues, eigenvectors = eigsh(M, k=k, which='LM')

        # Sort by eigenvalue (descending)
        idx = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[idx]
        eigenvectors = eigenvectors[:, idx]

        # Transform eigenvectors back
        psi = D_inv_sqrt @ eigenvectors

        # Apply diffusion time
        coords = psi[:, 1:n_components+1] * (eigenvalues[1:n_components+1] ** t)

        # Normalize
        coords = coords / np.linalg.norm(coords, axis=0)

        result = {}
        for i, node in enumerate(nodes):
            result[node] = coords[i].tolist()

        return {
            "n_components": n_components,
            "t": t,
            "alpha": alpha,
            "embedding": result,
            "eigenvalues": eigenvalues[1:n_components+1].tolist(),
            "method": "diffusion_map",
        }
    except Exception as e:
        return {"error": f"Diffusion map failed: {str(e)}"}


# =============================================================================
# Dimensionality Reduction for Visualization
# =============================================================================

def reduce_to_visualization(
    embeddings: Dict[str, List[float]],
    method: str = "tsne",
    n_components: int = 3,
    perplexity: float = 30.0,
    n_neighbors: int = 15
) -> Dict[str, Any]:
    """
    Reduce high-dimensional embeddings to 2D/3D for visualization.

    Args:
        embeddings: Dict mapping node -> embedding vector
        method: "tsne" or "umap"
        n_components: Output dimensions (2 or 3)
        perplexity: t-SNE perplexity parameter
        n_neighbors: UMAP n_neighbors parameter

    Returns:
        Dict mapping node -> [x, y] or [x, y, z] coordinates
    """
    if not embeddings:
        return {"error": "No embeddings provided"}

    nodes = list(embeddings.keys())
    X = np.array([embeddings[n] for n in nodes])

    if X.shape[0] < n_components:
        return {"error": "Not enough nodes for reduction"}

    # Normalize input
    if HAS_SKLEARN:
        scaler = StandardScaler()
        X = scaler.fit_transform(X)

    if method == "tsne":
        if not HAS_SKLEARN:
            return {"error": "sklearn not available for t-SNE"}

        try:
            perplexity = min(perplexity, X.shape[0] - 1)
            tsne = TSNE(
                n_components=n_components,
                perplexity=perplexity,
                random_state=42,
                init='pca' if X.shape[1] >= n_components else 'random'
            )
            coords = tsne.fit_transform(X)

            result = {}
            for i, node in enumerate(nodes):
                result[node] = coords[i].tolist()

            return {
                "method": "tsne",
                "n_components": n_components,
                "perplexity": perplexity,
                "coordinates": result,
            }
        except Exception as e:
            return {"error": f"t-SNE failed: {str(e)}"}

    elif method == "umap":
        if not HAS_UMAP:
            return {"error": "umap-learn not available"}

        try:
            n_neighbors = min(n_neighbors, X.shape[0] - 1)
            reducer = umap.UMAP(
                n_components=n_components,
                n_neighbors=n_neighbors,
                random_state=42
            )
            coords = reducer.fit_transform(X)

            result = {}
            for i, node in enumerate(nodes):
                result[node] = coords[i].tolist()

            return {
                "method": "umap",
                "n_components": n_components,
                "n_neighbors": n_neighbors,
                "coordinates": result,
            }
        except Exception as e:
            return {"error": f"UMAP failed: {str(e)}"}

    else:
        return {"error": f"Unknown method: {method}"}


# =============================================================================
# Feature-Based Embedding
# =============================================================================

def compute_feature_embedding(
    G: nx.Graph | nx.DiGraph,
    metrics: Dict[str, Dict[str, float]],
    n_components: int = 3,
    method: str = "tsne"
) -> Dict[str, Any]:
    """
    Create embedding from node feature vectors.

    Uses pre-computed metrics (PageRank, degree, etc.) as features
    and reduces to visualization dimensions.

    Args:
        G: NetworkX graph
        metrics: Dict of metric name -> {node_id: value}
        n_components: Output dimensions
        method: Reduction method ("tsne" or "umap")

    Returns:
        Dict mapping node -> coordinates
    """
    if not metrics:
        return {"error": "No metrics provided"}

    # Get common nodes
    metric_names = list(metrics.keys())
    all_nodes = set.intersection(*[set(m.keys()) for m in metrics.values()])

    if len(all_nodes) < n_components + 1:
        return {"error": "Not enough common nodes"}

    # Build feature matrix
    nodes = sorted(all_nodes)
    embeddings = {}
    for node in nodes:
        embeddings[node] = [metrics[m][node] for m in metric_names]

    # Reduce dimensions
    result = reduce_to_visualization(
        embeddings,
        method=method,
        n_components=n_components
    )

    if "coordinates" in result:
        result["feature_names"] = metric_names
        result["input_dimensions"] = len(metric_names)

    return result


# =============================================================================
# Combined Analysis
# =============================================================================

def analyze_embedding(
    G: nx.Graph | nx.DiGraph,
    n_components: int = 3,
    methods: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Compute multiple embeddings for comparison.

    Args:
        G: NetworkX graph
        n_components: Output dimensions
        methods: List of methods to use (default: ["spectral", "diffusion"])

    Returns:
        Dict with embeddings from each method
    """
    if methods is None:
        methods = ["spectral", "diffusion"]

    result = {
        "graph_info": {
            "nodes": G.number_of_nodes(),
            "edges": G.number_of_edges(),
        },
        "n_components": n_components,
    }

    if "spectral" in methods:
        result["spectral"] = compute_spectral_embedding(G, n_components)

    if "diffusion" in methods:
        result["diffusion"] = compute_diffusion_map(G, n_components)

    if "node2vec" in methods and HAS_NODE2VEC:
        n2v = compute_node2vec_embedding(G, dimensions=64)
        if "embedding" in n2v:
            # Reduce to visualization dimensions
            reduced = reduce_to_visualization(
                n2v["embedding"],
                method="tsne" if HAS_SKLEARN else "umap",
                n_components=n_components
            )
            result["node2vec"] = {
                "full_embedding": n2v,
                "reduced": reduced,
            }
        else:
            result["node2vec"] = n2v

    return result
