"""
Lean Namespace Analysis Module

Analyzes namespace structure and module coupling:
- Namespace hierarchy
- Module cohesion and coupling
- Import relationships
- Cross-namespace dependencies
"""

from typing import Dict, List, Any, Optional, Set, Tuple
from collections import Counter, defaultdict
import networkx as nx


# =============================================================================
# Namespace Extraction
# =============================================================================

def extract_namespace(node_id: str, depth: Optional[int] = None) -> str:
    """
    Extract namespace from a fully qualified node ID.

    Args:
        node_id: Full node ID (e.g., "Mathlib.Algebra.Group.Basic.mul_one")
        depth: Optional depth limit (e.g., 2 -> "Mathlib.Algebra")

    Returns:
        Namespace string
    """
    parts = node_id.split('.')
    if len(parts) <= 1:
        return '_root'

    # Exclude the declaration name (last part)
    ns_parts = parts[:-1]

    if depth is not None and depth < len(ns_parts):
        return '.'.join(ns_parts[:depth])
    return '.'.join(ns_parts)


def get_all_namespaces(
    nodes: List[Any],
    depth: Optional[int] = None
) -> Set[str]:
    """
    Get all unique namespaces from nodes.

    Args:
        nodes: List of Node objects
        depth: Optional depth limit

    Returns:
        Set of namespace strings
    """
    namespaces = set()
    for node in nodes:
        node_id = getattr(node, 'id', '')
        ns = extract_namespace(node_id, depth)
        namespaces.add(ns)
    return namespaces


# =============================================================================
# Namespace Hierarchy
# =============================================================================

def build_namespace_tree(
    nodes: List[Any]
) -> Dict[str, Any]:
    """
    Build hierarchical namespace tree.

    Args:
        nodes: List of Node objects

    Returns:
        Nested dict representing namespace tree with counts
    """
    tree = {}
    leaf_counts = Counter()  # Count declarations per full namespace

    for node in nodes:
        node_id = getattr(node, 'id', '')
        parts = node_id.split('.')

        # Count at full namespace (excluding decl name)
        if len(parts) > 1:
            full_ns = '.'.join(parts[:-1])
            leaf_counts[full_ns] += 1

        # Build tree
        current = tree
        for part in parts[:-1]:  # Exclude declaration name
            if part not in current:
                current[part] = {'_children': {}, '_count': 0}
            current[part]['_count'] += 1
            current = current[part]['_children']

    return {
        'tree': tree,
        'leaf_counts': dict(leaf_counts.most_common(100)),
    }


def namespace_depth_distribution(
    nodes: List[Any]
) -> Dict[int, int]:
    """
    Compute distribution of namespace depths.

    Args:
        nodes: List of Node objects

    Returns:
        Dict mapping depth -> count
    """
    depths = Counter()
    for node in nodes:
        node_id = getattr(node, 'id', '')
        parts = node_id.split('.')
        depth = len(parts) - 1  # Exclude declaration name
        depths[depth] += 1
    return dict(sorted(depths.items()))


# =============================================================================
# Module Coupling Analysis
# =============================================================================

def compute_namespace_coupling(
    nodes: List[Any],
    G: nx.DiGraph,
    depth: int = 2
) -> Dict[str, Any]:
    """
    Compute coupling and cohesion metrics between namespaces.

    Coupling: How much a namespace depends on external namespaces
    Cohesion: How much a namespace's internal declarations depend on each other

    Args:
        nodes: List of Node objects
        G: NetworkX graph
        depth: Namespace depth for grouping

    Returns:
        Dict with coupling metrics
    """
    # Group nodes by namespace
    ns_nodes = defaultdict(set)
    for node in nodes:
        node_id = getattr(node, 'id', '')
        ns = extract_namespace(node_id, depth)
        ns_nodes[ns].add(node_id)

    # Compute coupling matrix
    namespaces = sorted(ns_nodes.keys())
    ns_idx = {ns: i for i, ns in enumerate(namespaces)}

    import numpy as np
    coupling_matrix = np.zeros((len(namespaces), len(namespaces)))

    # Count edges between namespaces
    for source in G.nodes():
        source_ns = extract_namespace(source, depth)
        if source_ns not in ns_idx:
            continue

        for target in G.successors(source):
            target_ns = extract_namespace(target, depth)
            if target_ns not in ns_idx:
                continue

            i, j = ns_idx[source_ns], ns_idx[target_ns]
            coupling_matrix[i, j] += 1

    # Compute cohesion (internal edges / total edges from namespace)
    cohesion = {}
    coupling = {}

    for ns, nodes_set in ns_nodes.items():
        if ns not in ns_idx:
            continue

        i = ns_idx[ns]
        internal = coupling_matrix[i, i]
        external_out = coupling_matrix[i, :].sum() - internal
        external_in = coupling_matrix[:, i].sum() - internal

        total_out = internal + external_out
        total_in = internal + external_in

        cohesion[ns] = internal / total_out if total_out > 0 else 1.0
        coupling[ns] = {
            'in': external_in / total_in if total_in > 0 else 0.0,
            'out': external_out / total_out if total_out > 0 else 0.0,
        }

    # Find highly coupled pairs
    coupling_pairs = []
    for i, ns1 in enumerate(namespaces):
        for j, ns2 in enumerate(namespaces):
            if i != j and coupling_matrix[i, j] > 0:
                coupling_pairs.append({
                    'source': ns1,
                    'target': ns2,
                    'edge_count': int(coupling_matrix[i, j]),
                })

    coupling_pairs.sort(key=lambda x: x['edge_count'], reverse=True)

    return {
        'namespaces': namespaces,
        'cohesion': cohesion,
        'coupling': coupling,
        'coupling_matrix': coupling_matrix.tolist(),
        'top_dependencies': coupling_pairs[:50],
    }


def cross_namespace_dependencies(
    G: nx.DiGraph,
    depth: int = 2
) -> List[Dict[str, Any]]:
    """
    Analyze cross-namespace dependencies.

    Args:
        G: NetworkX graph
        depth: Namespace depth

    Returns:
        List of cross-namespace dependency info
    """
    cross_deps = Counter()

    for source in G.nodes():
        source_ns = extract_namespace(source, depth)
        for target in G.successors(source):
            target_ns = extract_namespace(target, depth)
            if source_ns != target_ns:
                cross_deps[(source_ns, target_ns)] += 1

    result = []
    for (source_ns, target_ns), count in cross_deps.most_common(100):
        result.append({
            'source_namespace': source_ns,
            'target_namespace': target_ns,
            'dependency_count': count,
        })

    return result


def find_namespace_bridges(
    nodes: List[Any],
    G: nx.DiGraph,
    depth: int = 2
) -> List[Dict[str, Any]]:
    """
    Find declarations that bridge multiple namespaces.

    Bridge declarations are those with dependencies from/to multiple namespaces.

    Args:
        nodes: List of Node objects
        G: NetworkX graph
        depth: Namespace depth

    Returns:
        List of bridge declarations
    """
    bridges = []

    for node in nodes:
        node_id = getattr(node, 'id', '')
        if node_id not in G:
            continue

        node_ns = extract_namespace(node_id, depth)

        # Get namespaces of dependencies
        dep_namespaces = set()
        for target in G.successors(node_id):
            target_ns = extract_namespace(target, depth)
            if target_ns != node_ns:
                dep_namespaces.add(target_ns)

        # Get namespaces of dependents
        dependent_namespaces = set()
        for source in G.predecessors(node_id):
            source_ns = extract_namespace(source, depth)
            if source_ns != node_ns:
                dependent_namespaces.add(source_ns)

        total_external = len(dep_namespaces) + len(dependent_namespaces)
        if total_external >= 2:
            bridges.append({
                'id': node_id,
                'name': getattr(node, 'name', ''),
                'namespace': node_ns,
                'depends_on_namespaces': list(dep_namespaces),
                'used_by_namespaces': list(dependent_namespaces),
                'bridge_score': total_external,
            })

    bridges.sort(key=lambda x: x['bridge_score'], reverse=True)
    return bridges[:50]


# =============================================================================
# Namespace Statistics
# =============================================================================

def namespace_size_distribution(
    nodes: List[Any],
    depth: int = 2
) -> Dict[str, int]:
    """
    Compute size distribution of namespaces.

    Args:
        nodes: List of Node objects
        depth: Namespace depth

    Returns:
        Dict mapping namespace -> declaration count
    """
    sizes = Counter()
    for node in nodes:
        node_id = getattr(node, 'id', '')
        ns = extract_namespace(node_id, depth)
        sizes[ns] += 1
    return dict(sizes.most_common())


def namespace_complexity(
    nodes: List[Any],
    G: nx.DiGraph,
    depth: int = 2
) -> List[Dict[str, Any]]:
    """
    Compute complexity metrics per namespace.

    Args:
        nodes: List of Node objects
        G: NetworkX graph
        depth: Namespace depth

    Returns:
        List of namespace complexity metrics
    """
    # Group by namespace
    ns_nodes = defaultdict(list)
    for node in nodes:
        node_id = getattr(node, 'id', '')
        ns = extract_namespace(node_id, depth)
        ns_nodes[ns].append(node)

    results = []
    for ns, ns_node_list in ns_nodes.items():
        node_ids = {getattr(n, 'id', '') for n in ns_node_list}

        # Count edges
        internal_edges = 0
        external_in = 0
        external_out = 0

        for node_id in node_ids:
            if node_id in G:
                for target in G.successors(node_id):
                    if target in node_ids:
                        internal_edges += 1
                    else:
                        external_out += 1
                for source in G.predecessors(node_id):
                    if source not in node_ids:
                        external_in += 1

        # Count by kind
        kinds = Counter(getattr(n, 'kind', 'unknown') for n in ns_node_list)

        # Count sorry
        sorry_count = sum(
            1 for n in ns_node_list
            if getattr(n, 'status', None) and
            getattr(n.status, 'value', '') == 'sorry'
        )

        n_nodes = len(ns_node_list)
        results.append({
            'namespace': ns,
            'declaration_count': n_nodes,
            'theorem_count': kinds.get('theorem', 0) + kinds.get('lemma', 0),
            'definition_count': kinds.get('definition', 0),
            'instance_count': kinds.get('instance', 0),
            'sorry_count': sorry_count,
            'internal_edges': internal_edges,
            'external_in_edges': external_in,
            'external_out_edges': external_out,
            'internal_density': internal_edges / (n_nodes * (n_nodes - 1))
                               if n_nodes > 1 else 0,
            'coupling_ratio': (external_in + external_out) / (internal_edges + external_in + external_out)
                             if (internal_edges + external_in + external_out) > 0 else 0,
        })

    results.sort(key=lambda x: x['declaration_count'], reverse=True)
    return results


# =============================================================================
# Circular Dependencies
# =============================================================================

def detect_circular_dependencies(
    G: nx.DiGraph,
    depth: int = 2
) -> List[List[str]]:
    """
    Detect circular dependencies between namespaces.

    Args:
        G: NetworkX graph
        depth: Namespace depth

    Returns:
        List of cycles (each cycle is a list of namespaces)
    """
    # Build namespace-level graph
    ns_graph = nx.DiGraph()

    for source in G.nodes():
        source_ns = extract_namespace(source, depth)
        for target in G.successors(source):
            target_ns = extract_namespace(target, depth)
            if source_ns != target_ns:
                ns_graph.add_edge(source_ns, target_ns)

    # Find cycles
    try:
        cycles = list(nx.simple_cycles(ns_graph))
        # Sort by length
        cycles.sort(key=len)
        return cycles[:20]  # Return top 20 shortest cycles
    except Exception:
        return []


# =============================================================================
# Combined Analysis
# =============================================================================

def analyze_lean_namespaces(
    nodes: List[Any],
    G: nx.DiGraph,
    depth: int = 2
) -> Dict[str, Any]:
    """
    Comprehensive namespace analysis.

    Args:
        nodes: List of Node objects
        G: NetworkX graph
        depth: Namespace depth for analysis

    Returns:
        Dict with all namespace analysis results
    """
    return {
        'namespace_tree': build_namespace_tree(nodes),
        'depth_distribution': namespace_depth_distribution(nodes),
        'size_distribution': dict(list(namespace_size_distribution(nodes, depth).items())[:30]),
        'coupling': compute_namespace_coupling(nodes, G, depth),
        'cross_dependencies': cross_namespace_dependencies(G, depth)[:30],
        'bridges': find_namespace_bridges(nodes, G, depth)[:20],
        'complexity': namespace_complexity(nodes, G, depth)[:30],
        'circular_dependencies': detect_circular_dependencies(G, depth),
    }
