"""
Community Detection

Detects communities/clusters in the graph using various algorithms.
"""

from dataclasses import dataclass
from typing import List, Dict, Set, Tuple
import networkx as nx

# python-louvain package
try:
    import community as community_louvain
    LOUVAIN_AVAILABLE = True
except ImportError:
    LOUVAIN_AVAILABLE = False


@dataclass
class CommunityResult:
    """Community detection results"""
    partition: Dict[str, int]  # node_id -> community_id
    communities: Dict[int, List[str]]  # community_id -> [node_ids]
    num_communities: int
    modularity: float
    sizes: List[int]  # Size of each community

    def to_dict(self) -> dict:
        return {
            "partition": self.partition,
            "communities": self.communities,
            "numCommunities": self.num_communities,
            "modularity": self.modularity,
            "sizes": self.sizes,
        }


def detect_communities_louvain(
    G: nx.DiGraph | nx.Graph,
    resolution: float = 1.0,
    random_state: int = 42,
) -> CommunityResult:
    """
    Detect communities using the Louvain algorithm.

    The Louvain algorithm optimizes modularity to find community structure.
    It's fast and works well for large graphs.

    In the context of Lean proofs:
    - Communities = groups of related mathematical concepts
    - Can be compared to manual namespace organization

    Args:
        G: NetworkX graph
        resolution: Resolution parameter (higher = more communities)
        random_state: Random seed for reproducibility

    Returns:
        CommunityResult with partition and statistics
    """
    if not LOUVAIN_AVAILABLE:
        raise ImportError("python-louvain package is required for Louvain algorithm. Install with: pip install python-louvain")

    # Louvain requires undirected graph
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G

    if G_undirected.number_of_nodes() == 0:
        return CommunityResult(
            partition={},
            communities={},
            num_communities=0,
            modularity=0,
            sizes=[],
        )

    # Run Louvain algorithm
    partition = community_louvain.best_partition(
        G_undirected,
        resolution=resolution,
        random_state=random_state,
    )

    # Build communities dict
    communities: Dict[int, List[str]] = {}
    for node_id, comm_id in partition.items():
        if comm_id not in communities:
            communities[comm_id] = []
        communities[comm_id].append(node_id)

    # Compute modularity
    modularity = community_louvain.modularity(partition, G_undirected)

    # Community sizes
    sizes = sorted([len(nodes) for nodes in communities.values()], reverse=True)

    return CommunityResult(
        partition=partition,
        communities=communities,
        num_communities=len(communities),
        modularity=modularity,
        sizes=sizes,
    )


def detect_communities_label_propagation(
    G: nx.DiGraph | nx.Graph,
) -> CommunityResult:
    """
    Detect communities using Label Propagation algorithm.

    Label propagation is fast but may produce different results on each run.

    Args:
        G: NetworkX graph

    Returns:
        CommunityResult with partition and statistics
    """
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G

    if G_undirected.number_of_nodes() == 0:
        return CommunityResult(
            partition={},
            communities={},
            num_communities=0,
            modularity=0,
            sizes=[],
        )

    # Run label propagation
    communities_generator = nx.community.label_propagation_communities(G_undirected)
    communities_list = list(communities_generator)

    # Build partition dict
    partition = {}
    communities = {}
    for i, community in enumerate(communities_list):
        communities[i] = list(community)
        for node_id in community:
            partition[node_id] = i

    # Compute modularity
    modularity = nx.community.modularity(G_undirected, communities_list)

    sizes = sorted([len(c) for c in communities_list], reverse=True)

    return CommunityResult(
        partition=partition,
        communities=communities,
        num_communities=len(communities),
        modularity=modularity,
        sizes=sizes,
    )


def compute_modularity(
    G: nx.DiGraph | nx.Graph,
    partition: Dict[str, int],
) -> float:
    """
    Compute modularity score for a given partition.

    Modularity measures how good a partition is:
    - Positive = more edges within communities than expected
    - Higher = better community structure

    Args:
        G: NetworkX graph
        partition: node_id -> community_id mapping

    Returns:
        Modularity score
    """
    if G.is_directed():
        G_undirected = G.to_undirected()
    else:
        G_undirected = G

    if LOUVAIN_AVAILABLE:
        return community_louvain.modularity(partition, G_undirected)
    else:
        # Convert partition to list of sets format
        communities_dict: Dict[int, Set[str]] = {}
        for node_id, comm_id in partition.items():
            if comm_id not in communities_dict:
                communities_dict[comm_id] = set()
            communities_dict[comm_id].add(node_id)

        communities_list = [c for c in communities_dict.values()]
        return nx.community.modularity(G_undirected, communities_list)


def compare_with_namespaces(
    partition: Dict[str, int],
    depth: int = 2,
) -> Dict[str, any]:
    """
    Compare detected communities with namespace structure.

    Args:
        partition: community partition (node_id -> community_id)
        depth: Namespace depth to use for comparison

    Returns:
        Comparison statistics
    """
    # Extract namespace for each node
    namespace_partition = {}
    namespaces_seen = {}
    ns_id = 0

    for node_id in partition.keys():
        namespace = _extract_namespace(node_id, depth)
        if namespace not in namespaces_seen:
            namespaces_seen[namespace] = ns_id
            ns_id += 1
        namespace_partition[node_id] = namespaces_seen[namespace]

    # Compute overlap/similarity metrics
    # Normalized Mutual Information (NMI) or Adjusted Rand Index (ARI)
    from sklearn.metrics import normalized_mutual_info_score, adjusted_rand_score

    nodes = list(partition.keys())
    community_labels = [partition[n] for n in nodes]
    namespace_labels = [namespace_partition[n] for n in nodes]

    nmi = normalized_mutual_info_score(namespace_labels, community_labels)
    ari = adjusted_rand_score(namespace_labels, community_labels)

    return {
        "normalizedMutualInfo": nmi,
        "adjustedRandIndex": ari,
        "numNamespaces": len(namespaces_seen),
        "numCommunities": len(set(partition.values())),
    }


def _extract_namespace(node_id: str, depth: int = -1) -> str:
    """Extract namespace from node ID at given depth"""
    parts = node_id.rsplit(".", 1)
    if len(parts) > 1:
        namespace = parts[0]
        if depth > 0:
            ns_parts = namespace.split(".")
            return ".".join(ns_parts[:depth])
        return namespace
    return ""


def get_community_summary(
    communities: Dict[int, List[str]],
    node_kinds: Dict[str, str] = None,
) -> List[Dict]:
    """
    Generate summary for each community.

    Args:
        communities: community_id -> [node_ids]
        node_kinds: node_id -> kind (optional)

    Returns:
        List of community summaries
    """
    summaries = []

    for comm_id, nodes in communities.items():
        summary = {
            "id": comm_id,
            "size": len(nodes),
            "nodes": nodes[:10],  # First 10 nodes as sample
        }

        # Find common namespace prefix
        if nodes:
            common_prefix = _find_common_prefix(nodes)
            if common_prefix:
                summary["commonNamespace"] = common_prefix

        # Count by kind if available
        if node_kinds:
            kind_counts = {}
            for node_id in nodes:
                kind = node_kinds.get(node_id, "unknown")
                kind_counts[kind] = kind_counts.get(kind, 0) + 1
            summary["kindDistribution"] = kind_counts

        summaries.append(summary)

    return sorted(summaries, key=lambda x: x["size"], reverse=True)


def _find_common_prefix(strings: List[str]) -> str:
    """Find common namespace prefix among node IDs"""
    if not strings:
        return ""

    # Extract namespaces
    namespaces = [s.rsplit(".", 1)[0] if "." in s else "" for s in strings]
    namespaces = [ns for ns in namespaces if ns]  # Filter empty

    if not namespaces:
        return ""

    # Find common prefix
    prefix = namespaces[0]
    for ns in namespaces[1:]:
        while not ns.startswith(prefix) and prefix:
            # Remove last component
            prefix = prefix.rsplit(".", 1)[0] if "." in prefix else ""

    return prefix
