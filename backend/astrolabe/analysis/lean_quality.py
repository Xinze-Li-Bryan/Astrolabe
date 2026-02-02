"""
Lean Code Quality Analysis Module

Analyzes code quality aspects:
- API surface identification
- Refactoring candidates
- Breaking change impact analysis
- Structural anomalies
"""

from typing import Dict, List, Any, Optional, Set, Tuple
from collections import Counter, defaultdict
import networkx as nx
import numpy as np

from .lean_namespace import extract_namespace


def _simple_complexity_score(content: str) -> float:
    """
    Simple complexity score based on content length and structure.

    This is a basic proxy for proof complexity when tactic data is unavailable.
    """
    if not content:
        return 0.0

    lines = content.count('\n') + 1
    # Estimate nesting from indentation
    max_indent = 0
    for line in content.split('\n'):
        stripped = line.lstrip()
        if stripped:
            indent = len(line) - len(stripped)
            max_indent = max(max_indent, indent)

    nesting_bonus = max_indent / 4
    return lines / 5 + nesting_bonus


# =============================================================================
# API Surface Analysis
# =============================================================================

def identify_api_surface(
    nodes: List[Any],
    G: nx.DiGraph,
    min_dependents: int = 3
) -> Dict[str, Any]:
    """
    Identify public API (declarations used by many others).

    Args:
        nodes: List of Node objects
        G: NetworkX graph
        min_dependents: Minimum number of dependents to be considered API

    Returns:
        Dict with API surface analysis
    """
    node_ids = {getattr(n, 'id', '') for n in nodes}

    # Count dependents (nodes that depend on each node)
    dependent_counts = {}
    for node_id in node_ids:
        if node_id in G:
            dependents = list(G.predecessors(node_id))
            dependent_counts[node_id] = len(dependents)

    # Identify API (highly used declarations)
    api_nodes = []
    internal_nodes = []

    for node in nodes:
        node_id = getattr(node, 'id', '')
        dep_count = dependent_counts.get(node_id, 0)

        if dep_count >= min_dependents:
            api_nodes.append({
                'id': node_id,
                'name': getattr(node, 'name', ''),
                'kind': getattr(node, 'kind', ''),
                'dependent_count': dep_count,
            })
        else:
            internal_nodes.append(node_id)

    # Sort by dependent count
    api_nodes.sort(key=lambda x: x['dependent_count'], reverse=True)

    # Compute API stability score
    # Higher score = more declarations are API (less implementation detail)
    api_ratio = len(api_nodes) / len(nodes) if nodes else 0

    return {
        'api_declarations': api_nodes[:100],
        'api_count': len(api_nodes),
        'internal_count': len(internal_nodes),
        'api_ratio': api_ratio,
        'stability_score': 1.0 - api_ratio,  # Lower API ratio = more stable
    }


def breaking_change_impact(
    G: nx.DiGraph,
    declaration_id: str
) -> Dict[str, Any]:
    """
    Analyze impact of changing a specific declaration.

    Args:
        G: NetworkX graph
        declaration_id: ID of declaration to analyze

    Returns:
        Dict with impact analysis
    """
    if declaration_id not in G:
        return {'error': f'Declaration not found: {declaration_id}'}

    # Direct dependents (will be immediately affected)
    direct_dependents = list(G.predecessors(declaration_id))

    # Transitive dependents (all affected)
    all_dependents = list(nx.ancestors(G, declaration_id))

    # Group by namespace
    ns_impact = Counter()
    for dep in all_dependents:
        ns = extract_namespace(dep, depth=2)
        ns_impact[ns] += 1

    return {
        'declaration': declaration_id,
        'direct_impact_count': len(direct_dependents),
        'transitive_impact_count': len(all_dependents),
        'direct_dependents': direct_dependents[:50],
        'impacted_namespaces': dict(ns_impact.most_common(20)),
        'severity': 'high' if len(all_dependents) > 50 else
                   'medium' if len(all_dependents) > 10 else 'low',
    }


# =============================================================================
# Refactoring Candidates
# =============================================================================

def find_refactoring_candidates(
    nodes: List[Any],
    G: nx.DiGraph,
    complexity_threshold: float = 20.0,
    dependency_threshold: int = 10
) -> List[Dict[str, Any]]:
    """
    Identify declarations that might benefit from refactoring.

    Criteria:
    - High complexity + high usage
    - Very long dependency chains
    - High coupling to external namespaces

    Args:
        nodes: List of Node objects
        G: NetworkX graph
        complexity_threshold: Complexity score threshold
        dependency_threshold: Dependency count threshold

    Returns:
        List of refactoring candidates with reasons
    """
    candidates = []

    for node in nodes:
        node_id = getattr(node, 'id', '')
        if node_id not in G:
            continue

        content = getattr(node, '_full_content', '')
        complexity = _simple_complexity_score(content)

        # Count dependencies and dependents
        deps = list(G.successors(node_id))
        dependents = list(G.predecessors(node_id))

        # Check various refactoring criteria
        reasons = []

        # High complexity + high usage
        if complexity > complexity_threshold and len(dependents) > 5:
            reasons.append({
                'type': 'high_complexity_high_usage',
                'detail': f'Complexity {complexity:.1f}, used by {len(dependents)} declarations',
            })

        # Too many dependencies
        if len(deps) > dependency_threshold:
            reasons.append({
                'type': 'too_many_dependencies',
                'detail': f'Depends on {len(deps)} declarations',
            })

        # Cross-namespace coupling
        node_ns = extract_namespace(node_id, depth=2)
        external_deps = sum(1 for d in deps if extract_namespace(d, 2) != node_ns)
        if external_deps > 5:
            reasons.append({
                'type': 'high_external_coupling',
                'detail': f'{external_deps} external dependencies',
            })

        if reasons:
            candidates.append({
                'id': node_id,
                'name': getattr(node, 'name', ''),
                'kind': getattr(node, 'kind', ''),
                'complexity': complexity,
                'dependency_count': len(deps),
                'dependent_count': len(dependents),
                'reasons': reasons,
                'priority': len(reasons) * (complexity / 10) * (len(dependents) + 1),
            })

    # Sort by priority
    candidates.sort(key=lambda x: x['priority'], reverse=True)
    return candidates[:50]


def find_code_duplication(
    nodes: List[Any],
    G: nx.DiGraph,
    similarity_threshold: float = 0.8
) -> List[Dict[str, Any]]:
    """
    Find potentially duplicated proofs based on structural similarity.

    Uses dependency signature similarity as a proxy for proof similarity.

    Args:
        nodes: List of Node objects
        G: NetworkX graph
        similarity_threshold: Minimum Jaccard similarity

    Returns:
        List of similar pairs
    """
    proof_kinds = {'theorem', 'lemma'}
    proofs = [n for n in nodes if getattr(n, 'kind', '') in proof_kinds]

    # Build dependency signatures
    signatures = {}
    for node in proofs:
        node_id = getattr(node, 'id', '')
        if node_id in G:
            deps = frozenset(G.successors(node_id))
            if len(deps) >= 2:  # Only consider non-trivial proofs
                signatures[node_id] = deps

    # Find similar pairs
    similar_pairs = []
    node_ids = list(signatures.keys())

    for i, id1 in enumerate(node_ids):
        for id2 in node_ids[i+1:]:
            deps1 = signatures[id1]
            deps2 = signatures[id2]

            # Jaccard similarity
            intersection = len(deps1 & deps2)
            union = len(deps1 | deps2)
            similarity = intersection / union if union > 0 else 0

            if similarity >= similarity_threshold:
                similar_pairs.append({
                    'declaration1': id1,
                    'declaration2': id2,
                    'similarity': similarity,
                    'shared_deps': len(deps1 & deps2),
                })

    similar_pairs.sort(key=lambda x: x['similarity'], reverse=True)
    return similar_pairs[:30]


# =============================================================================
# Structural Anomalies
# =============================================================================

def detect_structural_anomalies(
    nodes: List[Any],
    G: nx.DiGraph
) -> List[Dict[str, Any]]:
    """
    Detect structural anomalies in the dependency graph.

    Anomaly types:
    - High in-degree but low PageRank (over-specialized)
    - Low in-degree but high PageRank (potentially misplaced)
    - Very long dependency chain
    - Isolated nodes

    Args:
        nodes: List of Node objects
        G: NetworkX graph

    Returns:
        List of anomalies with explanations
    """
    anomalies = []

    # Compute metrics
    pagerank = nx.pagerank(G)
    in_degree = dict(G.in_degree())
    out_degree = dict(G.out_degree())

    # Normalize for comparison
    pr_values = list(pagerank.values())
    pr_mean = np.mean(pr_values) if pr_values else 0
    pr_std = np.std(pr_values) if pr_values else 1

    in_values = list(in_degree.values())
    in_mean = np.mean(in_values) if in_values else 0
    in_std = np.std(in_values) if in_values else 1

    for node in nodes:
        node_id = getattr(node, 'id', '')
        if node_id not in G:
            continue

        pr = pagerank.get(node_id, 0)
        in_deg = in_degree.get(node_id, 0)
        out_deg = out_degree.get(node_id, 0)

        # Z-scores
        pr_z = (pr - pr_mean) / pr_std if pr_std > 0 else 0
        in_z = (in_deg - in_mean) / in_std if in_std > 0 else 0

        # High in-degree but low PageRank
        if in_z > 2 and pr_z < 0:
            anomalies.append({
                'id': node_id,
                'name': getattr(node, 'name', ''),
                'type': 'high_indegree_low_pagerank',
                'interpretation': 'Possibly over-specialized lemma used locally',
                'suggestion': 'Consider generalizing or merging with related lemmas',
                'in_degree': in_deg,
                'pagerank': pr,
            })

        # Very high out-degree (depends on too many things)
        if out_deg > 15:
            anomalies.append({
                'id': node_id,
                'name': getattr(node, 'name', ''),
                'type': 'too_many_dependencies',
                'interpretation': 'Complex proof with many dependencies',
                'suggestion': 'Consider breaking into smaller lemmas',
                'out_degree': out_deg,
            })

        # Isolated nodes (no in or out edges)
        if in_deg == 0 and out_deg == 0:
            anomalies.append({
                'id': node_id,
                'name': getattr(node, 'name', ''),
                'type': 'isolated',
                'interpretation': 'Unused declaration',
                'suggestion': 'Review if this is needed',
            })

    return anomalies[:50]


def find_bottlenecks(
    G: nx.DiGraph,
    top_k: int = 20
) -> List[Dict[str, Any]]:
    """
    Find bottleneck nodes that many paths go through.

    Args:
        G: NetworkX graph
        top_k: Number of bottlenecks to return

    Returns:
        List of bottleneck nodes
    """
    betweenness = nx.betweenness_centrality(G)

    bottlenecks = []
    for node_id, score in sorted(betweenness.items(), key=lambda x: -x[1])[:top_k]:
        in_deg = G.in_degree(node_id)
        out_deg = G.out_degree(node_id)

        bottlenecks.append({
            'id': node_id,
            'betweenness': score,
            'in_degree': in_deg,
            'out_degree': out_deg,
            'impact': f'On path of ~{int(score * G.number_of_nodes())} node pairs',
        })

    return bottlenecks


# =============================================================================
# Dependency Chain Analysis
# =============================================================================

def analyze_dependency_chains(
    G: nx.DiGraph,
    nodes: List[Any]
) -> Dict[str, Any]:
    """
    Analyze dependency chain lengths and patterns.

    Args:
        G: NetworkX graph
        nodes: List of Node objects

    Returns:
        Dict with chain analysis
    """
    if not nx.is_directed_acyclic_graph(G):
        return {'error': 'Graph contains cycles'}

    # Compute depths (longest path to each node from any source)
    depths = {}
    for node in nx.topological_sort(G):
        predecessors = list(G.successors(node))  # In our graph, successors are dependencies
        if not predecessors:
            depths[node] = 0
        else:
            depths[node] = max(depths.get(p, 0) for p in predecessors) + 1

    if not depths:
        return {'error': 'No nodes in graph'}

    # Depth distribution
    depth_counts = Counter(depths.values())

    # Find deepest nodes
    max_depth = max(depths.values())
    deepest_nodes = [
        {'id': n, 'depth': d}
        for n, d in sorted(depths.items(), key=lambda x: -x[1])[:20]
    ]

    # Find longest chain
    longest_chain = []
    if deepest_nodes:
        deepest = deepest_nodes[0]['id']
        # Trace back from deepest node
        current = deepest
        chain = [current]
        while True:
            deps = list(G.successors(current))
            if not deps:
                break
            # Pick the deepest dependency
            next_node = max(deps, key=lambda n: depths.get(n, 0))
            chain.append(next_node)
            current = next_node
        longest_chain = chain

    return {
        'max_depth': max_depth,
        'avg_depth': np.mean(list(depths.values())),
        'depth_distribution': dict(sorted(depth_counts.items())),
        'deepest_nodes': deepest_nodes,
        'longest_chain': longest_chain[:20],
        'all_depths': depths,
    }


# =============================================================================
# Combined Analysis
# =============================================================================

def analyze_lean_quality(
    nodes: List[Any],
    G: nx.DiGraph
) -> Dict[str, Any]:
    """
    Comprehensive code quality analysis.

    Args:
        nodes: List of Node objects
        G: NetworkX graph

    Returns:
        Dict with all quality analysis results
    """
    return {
        'api_surface': identify_api_surface(nodes, G),
        'refactoring_candidates': find_refactoring_candidates(nodes, G)[:20],
        'structural_anomalies': detect_structural_anomalies(nodes, G)[:20],
        'bottlenecks': find_bottlenecks(G, top_k=15),
        'dependency_chains': analyze_dependency_chains(G, nodes),
        'similar_proofs': find_code_duplication(nodes, G)[:10],
    }
