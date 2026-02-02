"""
Lean Type System Analysis Module

Provides analysis specific to Lean's type system:
- Declaration kind distribution
- Namespace hierarchy
- Type class analysis (extracted from node kinds)

For mathematical dependency graphs in Lean 4.
"""

from typing import Dict, List, Any, Optional, Set, Tuple
from collections import Counter, defaultdict
import networkx as nx
import re


# =============================================================================
# Constants
# =============================================================================

# Declaration kinds in Lean 4
DECLARATION_KINDS = {
    "theorem", "lemma", "definition", "def", "structure", "class",
    "instance", "inductive", "axiom", "abbrev", "example", "opaque"
}

# Kinds that represent "proof obligations" (have statements to prove)
PROOF_KINDS = {"theorem", "lemma"}

# Kinds that define new types
TYPE_DEFINING_KINDS = {"structure", "class", "inductive"}

# Kinds that provide implementations
IMPLEMENTATION_KINDS = {"instance", "definition", "def", "abbrev"}


# =============================================================================
# Declaration Kind Analysis
# =============================================================================

def declaration_kind_distribution(
    nodes: List[Any],
) -> Dict[str, Any]:
    """
    Compute distribution of declaration kinds.

    Args:
        nodes: List of Node objects with 'kind' attribute

    Returns:
        Dict with:
        - counts: {kind: count}
        - percentages: {kind: percentage}
        - proof_ratio: ratio of theorems/lemmas to total
    """
    if not nodes:
        return {"error": "No nodes provided"}

    counts = Counter()
    for node in nodes:
        kind = getattr(node, 'kind', 'unknown')
        # Normalize kind names
        if kind in ('def', 'definition'):
            kind = 'definition'
        counts[kind] += 1

    total = sum(counts.values())
    percentages = {k: v / total for k, v in counts.items()}

    # Calculate proof ratio (theorems + lemmas)
    proof_count = counts.get('theorem', 0) + counts.get('lemma', 0)
    proof_ratio = proof_count / total if total > 0 else 0

    return {
        "counts": dict(counts),
        "percentages": percentages,
        "total": total,
        "proof_ratio": proof_ratio,
        "type_defining_count": sum(counts.get(k, 0) for k in TYPE_DEFINING_KINDS),
        "implementation_count": sum(counts.get(k, 0) for k in IMPLEMENTATION_KINDS),
    }


def kind_by_namespace(
    nodes: List[Any],
    depth: int = 2
) -> Dict[str, Dict[str, int]]:
    """
    Compute declaration kind distribution by namespace.

    Args:
        nodes: List of Node objects
        depth: Namespace depth to group by (e.g., 2 = "Mathlib.Algebra")

    Returns:
        Dict mapping namespace -> {kind: count}
    """
    namespace_kinds = defaultdict(Counter)

    for node in nodes:
        node_id = getattr(node, 'id', '')
        kind = getattr(node, 'kind', 'unknown')

        # Extract namespace at given depth
        parts = node_id.split('.')
        if len(parts) > depth:
            namespace = '.'.join(parts[:depth])
        else:
            namespace = '.'.join(parts[:-1]) if len(parts) > 1 else '_root'

        namespace_kinds[namespace][kind] += 1

    return {ns: dict(counts) for ns, counts in namespace_kinds.items()}


def kind_correlation_with_metrics(
    G: nx.DiGraph,
    nodes: List[Any]
) -> Dict[str, Dict[str, float]]:
    """
    Compute correlation between declaration kinds and graph metrics.

    Args:
        G: NetworkX graph
        nodes: List of Node objects

    Returns:
        Dict mapping kind -> {metric: average_value}
    """
    # Build node kind lookup
    node_kinds = {getattr(n, 'id', ''): getattr(n, 'kind', 'unknown') for n in nodes}

    # Compute metrics
    pagerank = nx.pagerank(G)
    in_degree = dict(G.in_degree())
    out_degree = dict(G.out_degree())

    # Aggregate by kind
    kind_metrics = defaultdict(lambda: {
        'pagerank': [], 'in_degree': [], 'out_degree': []
    })

    for node_id, kind in node_kinds.items():
        if node_id in G:
            kind_metrics[kind]['pagerank'].append(pagerank.get(node_id, 0))
            kind_metrics[kind]['in_degree'].append(in_degree.get(node_id, 0))
            kind_metrics[kind]['out_degree'].append(out_degree.get(node_id, 0))

    # Compute averages
    result = {}
    for kind, metrics in kind_metrics.items():
        result[kind] = {
            'avg_pagerank': sum(metrics['pagerank']) / len(metrics['pagerank']) if metrics['pagerank'] else 0,
            'avg_in_degree': sum(metrics['in_degree']) / len(metrics['in_degree']) if metrics['in_degree'] else 0,
            'avg_out_degree': sum(metrics['out_degree']) / len(metrics['out_degree']) if metrics['out_degree'] else 0,
            'count': len(metrics['pagerank']),
        }

    return result


# =============================================================================
# Instance Analysis
# =============================================================================

def instance_analysis(
    nodes: List[Any],
    G: nx.DiGraph
) -> Dict[str, Any]:
    """
    Analyze type class instances.

    Args:
        nodes: List of Node objects
        G: NetworkX graph

    Returns:
        Dict with instance statistics and patterns
    """
    instances = [n for n in nodes if getattr(n, 'kind', '') == 'instance']
    classes = [n for n in nodes if getattr(n, 'kind', '') == 'class']
    structures = [n for n in nodes if getattr(n, 'kind', '') == 'structure']

    # Count instances per namespace
    instance_by_ns = Counter()
    for inst in instances:
        parts = getattr(inst, 'id', '').split('.')
        if len(parts) > 1:
            ns = '.'.join(parts[:-1])
            instance_by_ns[ns] += 1

    # Find high-connectivity instances (bridge instances)
    instance_connectivity = []
    for inst in instances:
        inst_id = getattr(inst, 'id', '')
        if inst_id in G:
            in_deg = G.in_degree(inst_id)
            out_deg = G.out_degree(inst_id)
            instance_connectivity.append({
                'id': inst_id,
                'name': getattr(inst, 'name', ''),
                'in_degree': in_deg,
                'out_degree': out_deg,
                'total': in_deg + out_deg,
            })

    # Sort by total connectivity
    instance_connectivity.sort(key=lambda x: x['total'], reverse=True)

    return {
        'total_instances': len(instances),
        'total_classes': len(classes),
        'total_structures': len(structures),
        'instance_to_class_ratio': len(instances) / len(classes) if classes else 0,
        'top_namespaces': instance_by_ns.most_common(10),
        'most_connected_instances': instance_connectivity[:20],
    }


# =============================================================================
# Class/Structure Hierarchy
# =============================================================================

def extract_type_hierarchy(
    nodes: List[Any],
    G: nx.DiGraph
) -> Dict[str, Any]:
    """
    Extract type class and structure hierarchy.

    Args:
        nodes: List of Node objects
        G: NetworkX graph

    Returns:
        Dict with hierarchy information
    """
    # Get classes and structures
    type_nodes = {
        getattr(n, 'id', ''): n
        for n in nodes
        if getattr(n, 'kind', '') in ('class', 'structure')
    }

    # Build subgraph of type-defining nodes
    type_ids = set(type_nodes.keys())

    # Find inheritance edges (class/structure depending on another)
    hierarchy_edges = []
    for node_id in type_ids:
        if node_id in G:
            for target in G.successors(node_id):
                if target in type_ids:
                    hierarchy_edges.append((node_id, target))

    # Build hierarchy graph
    H = nx.DiGraph()
    H.add_nodes_from(type_ids)
    H.add_edges_from(hierarchy_edges)

    # Find roots (no outgoing edges to other types)
    roots = [n for n in H.nodes() if H.out_degree(n) == 0]

    # Compute depths
    depths = {}
    for root in roots:
        # BFS from root going backwards
        for source in nx.ancestors(H, root):
            if source not in depths:
                try:
                    depths[source] = nx.shortest_path_length(H, source, root)
                except nx.NetworkXNoPath:
                    depths[source] = 0
        depths[root] = 0

    return {
        'type_count': len(type_ids),
        'hierarchy_edges': len(hierarchy_edges),
        'root_types': roots[:20],  # Top-level types
        'max_depth': max(depths.values()) if depths else 0,
        'depths': depths,
    }


# =============================================================================
# Namespace Analysis
# =============================================================================

def namespace_tree(
    nodes: List[Any]
) -> Dict[str, Any]:
    """
    Build namespace tree structure.

    Args:
        nodes: List of Node objects

    Returns:
        Nested dict representing namespace hierarchy
    """
    tree = {}
    node_counts = Counter()

    for node in nodes:
        node_id = getattr(node, 'id', '')
        parts = node_id.split('.')

        # Build tree path
        current = tree
        for i, part in enumerate(parts[:-1]):  # Exclude declaration name
            if part not in current:
                current[part] = {}
            current = current[part]

            # Count nodes at each namespace level
            ns_path = '.'.join(parts[:i+1])
            node_counts[ns_path] += 1

    return {
        'tree': tree,
        'node_counts': dict(node_counts.most_common(50)),
        'total_namespaces': len(node_counts),
    }


def namespace_statistics(
    nodes: List[Any],
    G: nx.DiGraph
) -> List[Dict[str, Any]]:
    """
    Compute statistics for each namespace.

    Args:
        nodes: List of Node objects
        G: NetworkX graph

    Returns:
        List of namespace stats sorted by declaration count
    """
    # Group nodes by namespace
    ns_nodes = defaultdict(list)
    for node in nodes:
        node_id = getattr(node, 'id', '')
        parts = node_id.split('.')
        if len(parts) > 1:
            ns = '.'.join(parts[:-1])
        else:
            ns = '_root'
        ns_nodes[ns].append(node)

    # Compute stats for each namespace
    results = []
    for ns, ns_node_list in ns_nodes.items():
        # Count by kind
        kind_counts = Counter(getattr(n, 'kind', 'unknown') for n in ns_node_list)

        # Count sorry status
        sorry_count = sum(1 for n in ns_node_list
                         if getattr(n, 'status', None) and
                         getattr(n.status, 'value', '') == 'sorry')

        # Count internal vs external edges
        node_ids = {getattr(n, 'id', '') for n in ns_node_list}
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

        results.append({
            'namespace': ns,
            'total_declarations': len(ns_node_list),
            'theorem_count': kind_counts.get('theorem', 0),
            'lemma_count': kind_counts.get('lemma', 0),
            'definition_count': kind_counts.get('definition', 0),
            'instance_count': kind_counts.get('instance', 0),
            'sorry_count': sorry_count,
            'internal_edges': internal_edges,
            'external_in_edges': external_in,
            'external_out_edges': external_out,
            'cohesion': internal_edges / (internal_edges + external_out)
                       if (internal_edges + external_out) > 0 else 0,
        })

    # Sort by total declarations
    results.sort(key=lambda x: x['total_declarations'], reverse=True)
    return results


# =============================================================================
# Combined Analysis
# =============================================================================

def analyze_lean_types(
    nodes: List[Any],
    G: nx.DiGraph
) -> Dict[str, Any]:
    """
    Comprehensive Lean type system analysis.

    Args:
        nodes: List of Node objects
        G: NetworkX graph

    Returns:
        Dict with all type system analysis results
    """
    return {
        'kind_distribution': declaration_kind_distribution(nodes),
        'instance_analysis': instance_analysis(nodes, G),
        'type_hierarchy': extract_type_hierarchy(nodes, G),
        'namespace_tree': namespace_tree(nodes),
        'top_namespaces': namespace_statistics(nodes, G)[:20],
    }
