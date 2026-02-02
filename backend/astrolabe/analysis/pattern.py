"""
Pattern Recognition Module

Provides methods to identify structural patterns in graphs:
- Motif Analysis: Count and identify over-represented subgraph patterns
- Common structural patterns in dependency graphs

For mathematical dependency graphs, common patterns include:
- Chain: A → B → C (sequential proofs)
- Fork: A → B, A → C (theorem with multiple corollaries)
- Join: A → C, B → C (theorem depending on multiple lemmas)
- Diamond: A → B, A → C, B → D, C → D (parallel proof paths)
"""

from typing import Dict, List, Any, Optional, Set, Tuple
from collections import Counter
import networkx as nx
import numpy as np


# =============================================================================
# Basic Motif Definitions
# =============================================================================

# 3-node motifs for directed graphs
MOTIF_3_PATTERNS = {
    "chain": [(0, 1), (1, 2)],  # A → B → C
    "fork": [(0, 1), (0, 2)],  # A → B, A → C
    "join": [(0, 2), (1, 2)],  # A → C, B → C
    "cycle": [(0, 1), (1, 2), (2, 0)],  # A → B → C → A
    "mutual": [(0, 1), (1, 0), (0, 2)],  # A ↔ B, A → C
}

# 4-node motifs for directed graphs
MOTIF_4_PATTERNS = {
    "diamond": [(0, 1), (0, 2), (1, 3), (2, 3)],  # Diamond pattern
    "feed_forward_loop": [(0, 1), (0, 2), (1, 2)],  # A → B → C, A → C
    "bifan": [(0, 2), (0, 3), (1, 2), (1, 3)],  # Two sources, two sinks
    "long_chain": [(0, 1), (1, 2), (2, 3)],  # A → B → C → D
}


# =============================================================================
# Motif Counting
# =============================================================================

def count_motifs_3node(G: nx.DiGraph) -> Dict[str, int]:
    """
    Count 3-node motifs in directed graph.

    This is a sampling-based approach for larger graphs.

    Args:
        G: Directed graph

    Returns:
        Dict mapping motif name to count
    """
    if not G.is_directed():
        return {"error": "Motif counting requires directed graph"}

    counts = Counter()
    nodes = list(G.nodes())
    n = len(nodes)

    if n < 3:
        return {"error": "Graph too small for 3-node motifs"}

    # For small graphs, enumerate all triples
    if n <= 500:
        for i, a in enumerate(nodes):
            for j, b in enumerate(nodes[i+1:], i+1):
                for c in nodes[j+1:]:
                    motif = _identify_3node_motif(G, a, b, c)
                    if motif:
                        counts[motif] += 1
    else:
        # For larger graphs, use sampling
        import random
        samples = min(100000, n * (n-1) * (n-2) // 6)

        for _ in range(samples):
            triple = random.sample(nodes, 3)
            motif = _identify_3node_motif(G, *triple)
            if motif:
                counts[motif] += 1

        # Estimate total counts
        total_triples = n * (n-1) * (n-2) // 6
        for motif in counts:
            counts[motif] = int(counts[motif] * total_triples / samples)

    return dict(counts)


def _identify_3node_motif(G: nx.DiGraph, a: str, b: str, c: str) -> Optional[str]:
    """Identify the motif type formed by three nodes."""
    edges = set()
    for u, v in [(a, b), (b, a), (a, c), (c, a), (b, c), (c, b)]:
        if G.has_edge(u, v):
            edges.add((u, v))

    if not edges:
        return None

    # Map to canonical form
    nodes = [a, b, c]
    edge_count = len(edges)

    if edge_count == 2:
        # Could be chain, fork, or join
        out_degrees = {n: sum(1 for e in edges if e[0] == n) for n in nodes}
        in_degrees = {n: sum(1 for e in edges if e[1] == n) for n in nodes}

        # Fork: one node has out-degree 2
        if 2 in out_degrees.values():
            return "fork"
        # Join: one node has in-degree 2
        if 2 in in_degrees.values():
            return "join"
        # Chain: otherwise
        return "chain"

    elif edge_count == 3:
        # Could be feed-forward loop or cycle
        # Check for cycle
        for n in nodes:
            if G.has_edge(n, nodes[(nodes.index(n) + 1) % 3]):
                visited = set()
                current = n
                for _ in range(3):
                    next_nodes = [v for v in nodes if G.has_edge(current, v) and v not in visited]
                    if not next_nodes:
                        break
                    visited.add(current)
                    current = next_nodes[0]
                if current == n:
                    return "cycle"

        return "feed_forward_loop"

    return None


def count_motifs_4node(G: nx.DiGraph) -> Dict[str, int]:
    """
    Count 4-node motifs (specifically diamond pattern).

    Diamond pattern is common in proof dependencies:
    A → B, A → C, B → D, C → D

    Args:
        G: Directed graph

    Returns:
        Dict mapping motif name to count
    """
    if not G.is_directed():
        return {"error": "Motif counting requires directed graph"}

    counts = Counter()
    nodes = list(G.nodes())
    n = len(nodes)

    if n < 4:
        return {"error": "Graph too small for 4-node motifs"}

    # Focus on finding diamond patterns (most relevant for proofs)
    # For each node with out-degree >= 2, check if children share a common child
    for source in nodes:
        children = list(G.successors(source))
        if len(children) < 2:
            continue

        # For each pair of children
        for i, child1 in enumerate(children):
            for child2 in children[i+1:]:
                # Check for common grandchild
                grandchildren1 = set(G.successors(child1))
                grandchildren2 = set(G.successors(child2))
                common = grandchildren1 & grandchildren2

                counts["diamond"] += len(common)

    # Count feed-forward loops
    for a in nodes:
        for b in G.successors(a):
            for c in G.successors(a):
                if b != c and G.has_edge(b, c):
                    counts["feed_forward_loop"] += 1

    return dict(counts)


# =============================================================================
# Motif Significance
# =============================================================================

def compute_motif_significance(
    G: nx.DiGraph,
    n_random: int = 100
) -> Dict[str, Any]:
    """
    Compute statistical significance of motifs using random graph comparison.

    Z-score: Z = (N_real - μ_random) / σ_random

    Args:
        G: Directed graph
        n_random: Number of random graphs for comparison

    Returns:
        Dict with motif counts, z-scores, and p-values
    """
    if G.number_of_nodes() > 1000:
        return {
            "warning": "Graph too large for significance testing",
            "recommendation": "Use sampling-based approach"
        }

    # Count motifs in real graph
    real_counts_3 = count_motifs_3node(G)
    real_counts_4 = count_motifs_4node(G)

    # Generate random graphs and count motifs
    random_counts_3 = {motif: [] for motif in MOTIF_3_PATTERNS}
    random_counts_4 = {motif: [] for motif in MOTIF_4_PATTERNS}

    for _ in range(n_random):
        # Configuration model preserves degree sequence
        try:
            G_random = nx.directed_configuration_model(
                list(dict(G.in_degree()).values()),
                list(dict(G.out_degree()).values()),
                create_using=nx.DiGraph()
            )
            # Remove self-loops and multi-edges
            G_random = nx.DiGraph(G_random)
            G_random.remove_edges_from(nx.selfloop_edges(G_random))

            counts_3 = count_motifs_3node(G_random)
            counts_4 = count_motifs_4node(G_random)

            for motif in random_counts_3:
                random_counts_3[motif].append(counts_3.get(motif, 0))
            for motif in random_counts_4:
                random_counts_4[motif].append(counts_4.get(motif, 0))
        except:
            continue

    # Compute z-scores
    results = {"3_node": {}, "4_node": {}}

    for motif in MOTIF_3_PATTERNS:
        if random_counts_3[motif]:
            mean = np.mean(random_counts_3[motif])
            std = np.std(random_counts_3[motif])
            real = real_counts_3.get(motif, 0)

            z_score = (real - mean) / std if std > 0 else 0

            results["3_node"][motif] = {
                "count": real,
                "random_mean": float(mean),
                "random_std": float(std),
                "z_score": float(z_score),
                "significant": abs(z_score) > 2,
                "interpretation": (
                    "over-represented" if z_score > 2 else
                    "under-represented" if z_score < -2 else
                    "not significant"
                ),
            }

    for motif in MOTIF_4_PATTERNS:
        if random_counts_4[motif]:
            mean = np.mean(random_counts_4[motif])
            std = np.std(random_counts_4[motif])
            real = real_counts_4.get(motif, 0)

            z_score = (real - mean) / std if std > 0 else 0

            results["4_node"][motif] = {
                "count": real,
                "random_mean": float(mean),
                "random_std": float(std),
                "z_score": float(z_score),
                "significant": abs(z_score) > 2,
                "interpretation": (
                    "over-represented" if z_score > 2 else
                    "under-represented" if z_score < -2 else
                    "not significant"
                ),
            }

    return results


# =============================================================================
# Pattern Finding
# =============================================================================

def find_pattern_instances(
    G: nx.DiGraph,
    pattern: str,
    max_instances: int = 100
) -> List[Dict[str, Any]]:
    """
    Find specific instances of a pattern in the graph.

    Args:
        G: Directed graph
        pattern: Pattern name ("chain", "fork", "join", "diamond", etc.)
        max_instances: Maximum number of instances to return

    Returns:
        List of dicts with node assignments for each instance
    """
    instances = []

    if pattern == "chain":
        # A → B → C
        for b in G.nodes():
            preds = list(G.predecessors(b))
            succs = list(G.successors(b))
            for a in preds:
                for c in succs:
                    if a != c:
                        instances.append({
                            "nodes": [a, b, c],
                            "pattern": "chain",
                            "description": f"{a} → {b} → {c}",
                        })
                        if len(instances) >= max_instances:
                            return instances

    elif pattern == "fork":
        # A → B, A → C
        for a in G.nodes():
            succs = list(G.successors(a))
            if len(succs) >= 2:
                for i, b in enumerate(succs):
                    for c in succs[i+1:]:
                        instances.append({
                            "nodes": [a, b, c],
                            "pattern": "fork",
                            "source": a,
                            "targets": [b, c],
                        })
                        if len(instances) >= max_instances:
                            return instances

    elif pattern == "join":
        # A → C, B → C
        for c in G.nodes():
            preds = list(G.predecessors(c))
            if len(preds) >= 2:
                for i, a in enumerate(preds):
                    for b in preds[i+1:]:
                        instances.append({
                            "nodes": [a, b, c],
                            "pattern": "join",
                            "sources": [a, b],
                            "target": c,
                        })
                        if len(instances) >= max_instances:
                            return instances

    elif pattern == "diamond":
        # A → B, A → C, B → D, C → D
        for a in G.nodes():
            children = list(G.successors(a))
            if len(children) < 2:
                continue

            for i, b in enumerate(children):
                for c in children[i+1:]:
                    grandchildren_b = set(G.successors(b))
                    grandchildren_c = set(G.successors(c))
                    common = grandchildren_b & grandchildren_c

                    for d in common:
                        instances.append({
                            "nodes": [a, b, c, d],
                            "pattern": "diamond",
                            "source": a,
                            "intermediates": [b, c],
                            "sink": d,
                        })
                        if len(instances) >= max_instances:
                            return instances

    elif pattern == "feed_forward_loop":
        # A → B, B → C, A → C
        for a in G.nodes():
            for b in G.successors(a):
                for c in G.successors(b):
                    if G.has_edge(a, c):
                        instances.append({
                            "nodes": [a, b, c],
                            "pattern": "feed_forward_loop",
                            "regulator": a,
                            "intermediate": b,
                            "target": c,
                        })
                        if len(instances) >= max_instances:
                            return instances

    return instances


# =============================================================================
# Proof-Specific Patterns
# =============================================================================

def find_proof_patterns(G: nx.DiGraph) -> Dict[str, Any]:
    """
    Find patterns specific to mathematical proof dependencies.

    Patterns:
    - Lemma chains: Sequential dependencies
    - Lemma fans: One theorem used by many
    - Convergent proofs: Multiple lemmas combine to one result
    - Parallel proofs: Diamond patterns indicating alternative paths

    Args:
        G: Directed dependency graph

    Returns:
        Dict with pattern analysis
    """
    results = {}

    # Find highly reused lemmas (sources of large fans)
    reuse_counts = dict(G.out_degree())
    highly_reused = [
        {"node": n, "reuse_count": c}
        for n, c in sorted(reuse_counts.items(), key=lambda x: x[1], reverse=True)[:20]
        if c >= 3
    ]
    results["highly_reused_lemmas"] = highly_reused

    # Find convergent proofs (nodes with many predecessors)
    convergent_counts = dict(G.in_degree())
    convergent_proofs = [
        {"node": n, "dependency_count": c}
        for n, c in sorted(convergent_counts.items(), key=lambda x: x[1], reverse=True)[:20]
        if c >= 3
    ]
    results["convergent_proofs"] = convergent_proofs

    # Find long chains (sequences without branching)
    chains = []
    visited = set()
    for node in G.nodes():
        if G.in_degree(node) == 0 and node not in visited:
            # Start of potential chain
            chain = [node]
            current = node
            while G.out_degree(current) == 1:
                next_node = list(G.successors(current))[0]
                if G.in_degree(next_node) != 1:
                    break
                chain.append(next_node)
                current = next_node
                visited.add(current)

            if len(chain) >= 3:
                chains.append({
                    "start": chain[0],
                    "end": chain[-1],
                    "length": len(chain),
                    "nodes": chain[:5] + (["..."] if len(chain) > 5 else []),
                })

    results["long_chains"] = sorted(chains, key=lambda x: x["length"], reverse=True)[:10]

    # Count pattern types
    counts_3 = count_motifs_3node(G)
    counts_4 = count_motifs_4node(G)

    results["motif_summary"] = {
        "3_node_motifs": counts_3,
        "4_node_motifs": counts_4,
        "interpretation": {
            "fork_ratio": counts_3.get("fork", 0) / max(sum(counts_3.values()), 1),
            "join_ratio": counts_3.get("join", 0) / max(sum(counts_3.values()), 1),
            "chain_ratio": counts_3.get("chain", 0) / max(sum(counts_3.values()), 1),
        },
    }

    return results


# =============================================================================
# Combined Analysis
# =============================================================================

def analyze_patterns(
    G: nx.DiGraph,
    compute_significance: bool = False
) -> Dict[str, Any]:
    """
    Comprehensive pattern analysis.

    Args:
        G: Directed graph
        compute_significance: Whether to compute statistical significance

    Returns:
        Dict with all pattern analysis results
    """
    result = {
        "graph_info": {
            "nodes": G.number_of_nodes(),
            "edges": G.number_of_edges(),
        }
    }

    # Basic motif counts
    result["motif_counts"] = {
        "3_node": count_motifs_3node(G),
        "4_node": count_motifs_4node(G),
    }

    # Proof-specific patterns
    result["proof_patterns"] = find_proof_patterns(G)

    # Pattern instances (samples)
    result["pattern_instances"] = {
        "diamond": find_pattern_instances(G, "diamond", max_instances=10),
        "feed_forward_loop": find_pattern_instances(G, "feed_forward_loop", max_instances=10),
    }

    # Significance testing (expensive)
    if compute_significance and G.number_of_nodes() <= 500:
        result["significance"] = compute_motif_significance(G, n_random=50)

    return result
