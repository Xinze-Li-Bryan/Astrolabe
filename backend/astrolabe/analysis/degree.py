"""
Degree Distribution Analysis

Computes degree statistics, distributions, and Shannon entropy.
"""

from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
from collections import Counter
import math
import networkx as nx


@dataclass
class DegreeDistribution:
    """Degree distribution data"""
    histogram: Dict[int, int]  # degree -> count
    max_degree: int
    min_degree: int
    mean_degree: float
    median_degree: float
    std_degree: float

    def to_dict(self) -> dict:
        return {
            "histogram": self.histogram,
            "maxDegree": self.max_degree,
            "minDegree": self.min_degree,
            "meanDegree": self.mean_degree,
            "medianDegree": self.median_degree,
            "stdDegree": self.std_degree,
        }


@dataclass
class DegreeStatistics:
    """Complete degree statistics for a graph"""
    in_degree: DegreeDistribution
    out_degree: DegreeDistribution
    total_degree: DegreeDistribution  # in + out for directed graphs
    top_in_degree: List[Tuple[str, int]]  # [(node_id, degree), ...]
    top_out_degree: List[Tuple[str, int]]
    shannon_entropy: float  # Entropy of degree distribution

    def to_dict(self) -> dict:
        return {
            "inDegree": self.in_degree.to_dict(),
            "outDegree": self.out_degree.to_dict(),
            "totalDegree": self.total_degree.to_dict(),
            "topInDegree": [{"nodeId": n, "degree": d} for n, d in self.top_in_degree],
            "topOutDegree": [{"nodeId": n, "degree": d} for n, d in self.top_out_degree],
            "shannonEntropy": self.shannon_entropy,
        }


def _compute_distribution(degrees: List[int]) -> DegreeDistribution:
    """Compute distribution statistics from a list of degrees"""
    if not degrees:
        return DegreeDistribution(
            histogram={},
            max_degree=0,
            min_degree=0,
            mean_degree=0,
            median_degree=0,
            std_degree=0,
        )

    histogram = dict(Counter(degrees))
    sorted_degrees = sorted(degrees)
    n = len(degrees)

    mean = sum(degrees) / n
    median = sorted_degrees[n // 2] if n % 2 == 1 else (sorted_degrees[n // 2 - 1] + sorted_degrees[n // 2]) / 2
    variance = sum((d - mean) ** 2 for d in degrees) / n
    std = math.sqrt(variance)

    return DegreeDistribution(
        histogram=histogram,
        max_degree=max(degrees),
        min_degree=min(degrees),
        mean_degree=mean,
        median_degree=median,
        std_degree=std,
    )


def compute_degree_distribution(G: nx.DiGraph | nx.Graph) -> Dict[str, DegreeDistribution]:
    """
    Compute degree distributions for the graph.

    Args:
        G: NetworkX graph

    Returns:
        Dictionary with 'in', 'out', and 'total' degree distributions
    """
    if G.is_directed():
        in_degrees = [d for _, d in G.in_degree()]
        out_degrees = [d for _, d in G.out_degree()]
        total_degrees = [in_d + out_d for (_, in_d), (_, out_d) in zip(G.in_degree(), G.out_degree())]
    else:
        degrees = [d for _, d in G.degree()]
        in_degrees = degrees
        out_degrees = degrees
        total_degrees = degrees

    return {
        "in": _compute_distribution(in_degrees),
        "out": _compute_distribution(out_degrees),
        "total": _compute_distribution(total_degrees),
    }


def compute_degree_statistics(
    G: nx.DiGraph | nx.Graph,
    top_k: int = 10,
) -> DegreeStatistics:
    """
    Compute comprehensive degree statistics.

    Args:
        G: NetworkX graph
        top_k: Number of top nodes to return

    Returns:
        DegreeStatistics with distributions and top nodes
    """
    distributions = compute_degree_distribution(G)

    # Get top nodes by in-degree and out-degree
    if G.is_directed():
        in_degrees = sorted(G.in_degree(), key=lambda x: x[1], reverse=True)
        out_degrees = sorted(G.out_degree(), key=lambda x: x[1], reverse=True)
    else:
        degrees = sorted(G.degree(), key=lambda x: x[1], reverse=True)
        in_degrees = degrees
        out_degrees = degrees

    top_in = [(n, d) for n, d in in_degrees[:top_k]]
    top_out = [(n, d) for n, d in out_degrees[:top_k]]

    # Compute Shannon entropy
    entropy = compute_degree_shannon_entropy(G)

    return DegreeStatistics(
        in_degree=distributions["in"],
        out_degree=distributions["out"],
        total_degree=distributions["total"],
        top_in_degree=top_in,
        top_out_degree=top_out,
        shannon_entropy=entropy,
    )


def compute_degree_shannon_entropy(G: nx.DiGraph | nx.Graph) -> float:
    """
    Compute Shannon entropy of the degree distribution.

    H = -Σ p(k) * log2(p(k))

    Higher entropy means more uniform degree distribution.
    Lower entropy means more skewed (e.g., power-law) distribution.

    Args:
        G: NetworkX graph

    Returns:
        Shannon entropy value
    """
    if G.number_of_nodes() == 0:
        return 0.0

    # Use total degree for directed graphs
    if G.is_directed():
        degrees = [d_in + d_out for (_, d_in), (_, d_out) in zip(G.in_degree(), G.out_degree())]
    else:
        degrees = [d for _, d in G.degree()]

    # Count degree frequencies
    degree_counts = Counter(degrees)
    total = sum(degree_counts.values())

    # Compute entropy
    entropy = 0.0
    for count in degree_counts.values():
        if count > 0:
            p = count / total
            entropy -= p * math.log2(p)

    return entropy


def get_degree_centrality(G: nx.DiGraph | nx.Graph) -> Dict[str, float]:
    """
    Compute normalized degree centrality for each node.

    Degree centrality = degree / (n - 1)

    Args:
        G: NetworkX graph

    Returns:
        Dictionary mapping node_id to centrality value
    """
    return nx.degree_centrality(G)


def bin_degrees(
    degrees: List[int],
    num_bins: int = 20,
    log_scale: bool = False,
) -> List[Dict]:
    """
    Bin degrees into histogram buckets for visualization.

    Args:
        degrees: List of degree values
        num_bins: Number of bins
        log_scale: If True, use logarithmic binning (for power-law distributions)

    Returns:
        List of bin dictionaries with 'min', 'max', 'count'
    """
    if not degrees:
        return []

    min_d = min(degrees)
    max_d = max(degrees)

    if min_d == max_d:
        return [{"min": min_d, "max": max_d, "count": len(degrees)}]

    bins = []
    if log_scale and min_d > 0:
        # Logarithmic binning
        import numpy as np
        bin_edges = np.logspace(np.log10(min_d), np.log10(max_d + 1), num_bins + 1)
    else:
        # Linear binning
        bin_width = (max_d - min_d + 1) / num_bins
        bin_edges = [min_d + i * bin_width for i in range(num_bins + 1)]

    for i in range(len(bin_edges) - 1):
        bin_min = bin_edges[i]
        bin_max = bin_edges[i + 1]
        count = sum(1 for d in degrees if bin_min <= d < bin_max)
        bins.append({
            "min": float(bin_min),
            "max": float(bin_max),
            "count": count,
        })

    return bins
