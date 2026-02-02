"""
Statistical Analysis Module

Provides statistical methods for graph analysis:
- Distribution fitting (power law, exponential, truncated power law)
- Correlation analysis between graph metrics
- Anomaly detection (z-score, Mahalanobis distance, LOF)
- Degree assortativity
"""

from typing import Dict, List, Any, Optional, Tuple
import numpy as np
from scipy import stats
from scipy.spatial.distance import mahalanobis
import networkx as nx

try:
    import powerlaw
    HAS_POWERLAW = True
except ImportError:
    HAS_POWERLAW = False

try:
    from sklearn.neighbors import LocalOutlierFactor
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False


# =============================================================================
# Distribution Fitting
# =============================================================================

def fit_degree_distribution(G: nx.Graph | nx.DiGraph) -> Dict[str, Any]:
    """
    Fit degree distribution to various models and find best fit.

    Models tested:
    - Power Law: P(k) ~ k^{-γ}
    - Exponential: P(k) ~ e^{-k/κ}
    - Truncated Power Law: P(k) ~ k^{-γ} e^{-k/κ}
    - Lognormal: P(k) ~ (1/k) e^{-(ln k - μ)²/2σ²}

    Args:
        G: NetworkX graph

    Returns:
        Dict with best model, parameters, and goodness of fit metrics
    """
    if G.number_of_nodes() == 0:
        return {"error": "Empty graph"}

    # Get degree sequence
    if G.is_directed():
        in_degrees = [d for n, d in G.in_degree()]
        out_degrees = [d for n, d in G.out_degree()]
        degrees = [d for n, d in G.degree()]
    else:
        degrees = [d for n, d in G.degree()]
        in_degrees = degrees
        out_degrees = degrees

    # Filter out zeros for power law fitting
    degrees_nonzero = [d for d in degrees if d > 0]

    if len(degrees_nonzero) < 10:
        return {"error": "Not enough non-zero degree nodes for fitting"}

    result = {
        "degree_stats": {
            "min": int(min(degrees)),
            "max": int(max(degrees)),
            "mean": float(np.mean(degrees)),
            "std": float(np.std(degrees)),
            "median": float(np.median(degrees)),
        }
    }

    if HAS_POWERLAW:
        result["fits"] = _fit_with_powerlaw(degrees_nonzero)
    else:
        result["fits"] = _fit_with_scipy(degrees_nonzero)

    return result


def _fit_with_powerlaw(degrees: List[int]) -> Dict[str, Any]:
    """Use powerlaw library for sophisticated fitting."""
    data = np.array(degrees, dtype=float)

    # Fit power law
    fit = powerlaw.Fit(data, discrete=True, verbose=False)

    # Compare distributions
    fits = {}

    # Power law
    fits["power_law"] = {
        "alpha": float(fit.power_law.alpha),
        "xmin": float(fit.power_law.xmin),
        "sigma": float(fit.power_law.sigma) if hasattr(fit.power_law, 'sigma') else None,
    }

    # Exponential comparison
    R, p = fit.distribution_compare('power_law', 'exponential', normalized_ratio=True)
    fits["power_law_vs_exponential"] = {
        "loglikelihood_ratio": float(R),
        "p_value": float(p),
        "better_fit": "power_law" if R > 0 else "exponential",
    }

    # Lognormal comparison
    R, p = fit.distribution_compare('power_law', 'lognormal', normalized_ratio=True)
    fits["power_law_vs_lognormal"] = {
        "loglikelihood_ratio": float(R),
        "p_value": float(p),
        "better_fit": "power_law" if R > 0 else "lognormal",
    }

    # Truncated power law comparison
    R, p = fit.distribution_compare('power_law', 'truncated_power_law', normalized_ratio=True)
    fits["power_law_vs_truncated"] = {
        "loglikelihood_ratio": float(R),
        "p_value": float(p),
        "better_fit": "power_law" if R > 0 else "truncated_power_law",
    }

    # Determine best model
    if fits["power_law_vs_exponential"]["p_value"] < 0.1:
        if fits["power_law_vs_exponential"]["better_fit"] == "exponential":
            fits["best_model"] = "exponential"
        elif fits["power_law_vs_truncated"]["p_value"] < 0.1 and \
             fits["power_law_vs_truncated"]["better_fit"] == "truncated_power_law":
            fits["best_model"] = "truncated_power_law"
        else:
            fits["best_model"] = "power_law"
    else:
        fits["best_model"] = "indeterminate"

    # Is it scale-free?
    fits["is_scale_free"] = fits["best_model"] in ["power_law", "truncated_power_law"]

    return fits


def _fit_with_scipy(degrees: List[int]) -> Dict[str, Any]:
    """Fallback fitting using scipy when powerlaw is not available."""
    data = np.array(degrees, dtype=float)

    fits = {}

    # Fit exponential
    loc, scale = stats.expon.fit(data)
    ks_stat, ks_p = stats.kstest(data, 'expon', args=(loc, scale))
    fits["exponential"] = {
        "scale": float(scale),
        "ks_statistic": float(ks_stat),
        "ks_p_value": float(ks_p),
    }

    # Fit lognormal
    shape, loc, scale = stats.lognorm.fit(data, floc=0)
    ks_stat, ks_p = stats.kstest(data, 'lognorm', args=(shape, loc, scale))
    fits["lognormal"] = {
        "shape": float(shape),
        "scale": float(scale),
        "ks_statistic": float(ks_stat),
        "ks_p_value": float(ks_p),
    }

    # Simple power law estimate using MLE
    # For discrete power law: α ≈ 1 + n / Σ ln(x_i / x_min)
    x_min = max(1, min(data))
    data_above_min = data[data >= x_min]
    if len(data_above_min) > 0:
        alpha = 1 + len(data_above_min) / np.sum(np.log(data_above_min / x_min + 0.5))
        fits["power_law_estimate"] = {
            "alpha": float(alpha),
            "x_min": float(x_min),
        }

    # Determine best based on KS test
    best_p = max(fits["exponential"]["ks_p_value"], fits["lognormal"]["ks_p_value"])
    if fits["exponential"]["ks_p_value"] == best_p:
        fits["best_model"] = "exponential"
    else:
        fits["best_model"] = "lognormal"

    fits["is_scale_free"] = False  # Can't determine without proper power law test

    return fits


# =============================================================================
# Correlation Analysis
# =============================================================================

def compute_metric_correlations(
    metrics: Dict[str, Dict[str, float]],
    method: str = "spearman"
) -> Dict[str, Any]:
    """
    Compute correlation matrix between different graph metrics.

    Args:
        metrics: Dict of metric name -> {node_id: value}
        method: "pearson" or "spearman"

    Returns:
        Dict with correlation matrix, p-values, and significant pairs
    """
    if not metrics or len(metrics) < 2:
        return {"error": "Need at least 2 metrics for correlation"}

    # Get common nodes
    metric_names = list(metrics.keys())
    all_nodes = set.intersection(*[set(m.keys()) for m in metrics.values()])

    if len(all_nodes) < 3:
        return {"error": "Not enough common nodes"}

    nodes = sorted(all_nodes)
    n_metrics = len(metric_names)

    # Build data matrix
    data = np.array([
        [metrics[m][n] for n in nodes]
        for m in metric_names
    ])

    # Compute correlations
    corr_matrix = np.zeros((n_metrics, n_metrics))
    p_matrix = np.zeros((n_metrics, n_metrics))

    corr_func = stats.spearmanr if method == "spearman" else stats.pearsonr

    for i in range(n_metrics):
        for j in range(n_metrics):
            if i == j:
                corr_matrix[i, j] = 1.0
                p_matrix[i, j] = 0.0
            elif i < j:
                corr, p = corr_func(data[i], data[j])
                corr_matrix[i, j] = corr
                corr_matrix[j, i] = corr
                p_matrix[i, j] = p
                p_matrix[j, i] = p

    # Find significant correlations
    significant_pairs = []
    for i in range(n_metrics):
        for j in range(i + 1, n_metrics):
            if p_matrix[i, j] < 0.05:
                significant_pairs.append({
                    "metrics": [metric_names[i], metric_names[j]],
                    "correlation": float(corr_matrix[i, j]),
                    "p_value": float(p_matrix[i, j]),
                    "strength": _correlation_strength(corr_matrix[i, j]),
                })

    # Sort by absolute correlation
    significant_pairs.sort(key=lambda x: abs(x["correlation"]), reverse=True)

    return {
        "method": method,
        "metric_names": metric_names,
        "correlation_matrix": corr_matrix.tolist(),
        "p_value_matrix": p_matrix.tolist(),
        "significant_pairs": significant_pairs,
        "num_nodes": len(nodes),
    }


def _correlation_strength(r: float) -> str:
    """Categorize correlation strength."""
    r = abs(r)
    if r >= 0.8:
        return "very_strong"
    elif r >= 0.6:
        return "strong"
    elif r >= 0.4:
        return "moderate"
    elif r >= 0.2:
        return "weak"
    else:
        return "negligible"


def compute_degree_assortativity(G: nx.Graph | nx.DiGraph) -> Dict[str, float]:
    """
    Compute degree assortativity coefficient.

    r > 0: Assortative (high-degree nodes connect to high-degree nodes)
    r < 0: Disassortative (high-degree nodes connect to low-degree nodes)
    r = 0: No correlation

    Args:
        G: NetworkX graph

    Returns:
        Dict with assortativity coefficient and interpretation
    """
    if G.number_of_edges() == 0:
        return {"error": "No edges in graph"}

    try:
        r = nx.degree_assortativity_coefficient(G)
    except Exception:
        return {"error": "Could not compute assortativity"}

    # Interpretation
    if r > 0.3:
        interpretation = "strongly_assortative"
    elif r > 0.1:
        interpretation = "weakly_assortative"
    elif r > -0.1:
        interpretation = "neutral"
    elif r > -0.3:
        interpretation = "weakly_disassortative"
    else:
        interpretation = "strongly_disassortative"

    return {
        "assortativity": float(r),
        "interpretation": interpretation,
        "description": (
            "High-degree nodes tend to connect to high-degree nodes"
            if r > 0 else
            "High-degree nodes tend to connect to low-degree nodes"
            if r < 0 else
            "No degree correlation in connections"
        ),
    }


# =============================================================================
# Anomaly Detection
# =============================================================================

def detect_zscore_anomalies(
    metrics: Dict[str, Dict[str, float]],
    threshold: float = 2.0
) -> Dict[str, Any]:
    """
    Detect anomalous nodes using z-score method.

    Args:
        metrics: Dict of metric name -> {node_id: value}
        threshold: Z-score threshold (default 2.0 = ~95% confidence)

    Returns:
        Dict with anomalous nodes per metric and combined anomalies
    """
    if not metrics:
        return {"error": "No metrics provided"}

    anomalies_by_metric = {}
    node_anomaly_counts = {}

    for metric_name, values in metrics.items():
        if not values:
            continue

        nodes = list(values.keys())
        data = np.array([values[n] for n in nodes])

        mean = np.mean(data)
        std = np.std(data)

        if std == 0:
            continue

        z_scores = (data - mean) / std

        metric_anomalies = []
        for i, node in enumerate(nodes):
            if abs(z_scores[i]) > threshold:
                metric_anomalies.append({
                    "node": node,
                    "value": float(data[i]),
                    "z_score": float(z_scores[i]),
                    "direction": "high" if z_scores[i] > 0 else "low",
                })
                node_anomaly_counts[node] = node_anomaly_counts.get(node, 0) + 1

        anomalies_by_metric[metric_name] = {
            "mean": float(mean),
            "std": float(std),
            "anomalies": sorted(metric_anomalies, key=lambda x: abs(x["z_score"]), reverse=True),
        }

    # Find nodes that are anomalous in multiple metrics
    multi_anomaly_nodes = [
        {"node": node, "anomaly_count": count}
        for node, count in node_anomaly_counts.items()
        if count >= 2
    ]
    multi_anomaly_nodes.sort(key=lambda x: x["anomaly_count"], reverse=True)

    return {
        "threshold": threshold,
        "by_metric": anomalies_by_metric,
        "multi_anomaly_nodes": multi_anomaly_nodes,
        "total_anomalous_nodes": len(node_anomaly_counts),
    }


def detect_mahalanobis_anomalies(
    metrics: Dict[str, Dict[str, float]],
    threshold: float = 3.0
) -> Dict[str, Any]:
    """
    Detect multivariate anomalies using Mahalanobis distance.

    Considers correlations between metrics, unlike z-score.

    Args:
        metrics: Dict of metric name -> {node_id: value}
        threshold: Mahalanobis distance threshold

    Returns:
        Dict with anomalous nodes and their distances
    """
    if len(metrics) < 2:
        return {"error": "Need at least 2 metrics for Mahalanobis distance"}

    # Get common nodes
    metric_names = list(metrics.keys())
    all_nodes = set.intersection(*[set(m.keys()) for m in metrics.values()])

    if len(all_nodes) < len(metrics) + 1:
        return {"error": "Not enough common nodes"}

    nodes = sorted(all_nodes)

    # Build data matrix (nodes x metrics)
    data = np.array([
        [metrics[m][n] for m in metric_names]
        for n in nodes
    ])

    # Compute mean and covariance
    mean = np.mean(data, axis=0)
    cov = np.cov(data.T)

    # Handle singular covariance matrix
    try:
        cov_inv = np.linalg.inv(cov)
    except np.linalg.LinAlgError:
        # Add small regularization
        cov_inv = np.linalg.inv(cov + 1e-6 * np.eye(len(metric_names)))

    # Compute Mahalanobis distance for each node
    distances = []
    for i, node in enumerate(nodes):
        d = mahalanobis(data[i], mean, cov_inv)
        distances.append((node, float(d)))

    # Find anomalies
    anomalies = [
        {"node": node, "mahalanobis_distance": d}
        for node, d in distances
        if d > threshold
    ]
    anomalies.sort(key=lambda x: x["mahalanobis_distance"], reverse=True)

    return {
        "threshold": threshold,
        "metric_names": metric_names,
        "anomalies": anomalies,
        "total_anomalies": len(anomalies),
        "mean_distance": float(np.mean([d for _, d in distances])),
        "max_distance": float(max(d for _, d in distances)) if distances else 0,
    }


def detect_lof_anomalies(
    metrics: Dict[str, Dict[str, float]],
    n_neighbors: int = 20,
    contamination: float = 0.1
) -> Dict[str, Any]:
    """
    Detect anomalies using Local Outlier Factor.

    LOF compares local density of a point to its neighbors.
    Points with substantially lower density are outliers.

    Args:
        metrics: Dict of metric name -> {node_id: value}
        n_neighbors: Number of neighbors for LOF
        contamination: Expected proportion of outliers

    Returns:
        Dict with anomalous nodes and their LOF scores
    """
    if not HAS_SKLEARN:
        return {"error": "sklearn not available"}

    if len(metrics) < 1:
        return {"error": "Need at least 1 metric"}

    # Get common nodes
    metric_names = list(metrics.keys())
    all_nodes = set.intersection(*[set(m.keys()) for m in metrics.values()])

    if len(all_nodes) < n_neighbors + 1:
        return {"error": f"Not enough nodes (need at least {n_neighbors + 1})"}

    nodes = sorted(all_nodes)

    # Build data matrix
    data = np.array([
        [metrics[m][n] for m in metric_names]
        for n in nodes
    ])

    # Normalize data
    scaler = StandardScaler()
    data_scaled = scaler.fit_transform(data)

    # Fit LOF
    lof = LocalOutlierFactor(n_neighbors=n_neighbors, contamination=contamination)
    predictions = lof.fit_predict(data_scaled)
    scores = -lof.negative_outlier_factor_  # Convert to positive (higher = more anomalous)

    # Collect results
    anomalies = []
    for i, node in enumerate(nodes):
        if predictions[i] == -1:  # Outlier
            anomalies.append({
                "node": node,
                "lof_score": float(scores[i]),
                "is_outlier": True,
            })

    anomalies.sort(key=lambda x: x["lof_score"], reverse=True)

    return {
        "n_neighbors": n_neighbors,
        "contamination": contamination,
        "metric_names": metric_names,
        "anomalies": anomalies,
        "total_anomalies": len(anomalies),
        "total_nodes": len(nodes),
    }


def detect_isolation_forest_anomalies(
    metrics: Dict[str, Dict[str, float]],
    contamination: float = 0.1,
    random_state: int = 42
) -> Dict[str, Any]:
    """
    Detect anomalies using Isolation Forest.

    Isolation Forest isolates observations by randomly selecting features
    and split values. Anomalies are easier to isolate (shorter paths).

    Args:
        metrics: Dict of metric name -> {node_id: value}
        contamination: Expected proportion of outliers
        random_state: Random seed for reproducibility

    Returns:
        Dict with anomalous nodes and their anomaly scores
    """
    if not HAS_SKLEARN:
        return {"error": "sklearn not available"}

    if len(metrics) < 1:
        return {"error": "Need at least 1 metric"}

    # Get common nodes
    metric_names = list(metrics.keys())
    all_nodes = set.intersection(*[set(m.keys()) for m in metrics.values()])

    if len(all_nodes) < 10:
        return {"error": "Not enough nodes (need at least 10)"}

    nodes = sorted(all_nodes)

    # Build data matrix
    data = np.array([
        [metrics[m][n] for m in metric_names]
        for n in nodes
    ])

    # Fit Isolation Forest
    iso = IsolationForest(contamination=contamination, random_state=random_state)
    predictions = iso.fit_predict(data)
    scores = -iso.score_samples(data)  # Convert to positive (higher = more anomalous)

    # Collect results
    anomalies = []
    for i, node in enumerate(nodes):
        if predictions[i] == -1:  # Outlier
            anomalies.append({
                "node": node,
                "anomaly_score": float(scores[i]),
                "is_outlier": True,
            })

    anomalies.sort(key=lambda x: x["anomaly_score"], reverse=True)

    return {
        "contamination": contamination,
        "metric_names": metric_names,
        "anomalies": anomalies,
        "total_anomalies": len(anomalies),
        "total_nodes": len(nodes),
    }


# =============================================================================
# Combined Analysis
# =============================================================================

def analyze_statistics(
    G: nx.Graph | nx.DiGraph,
    metrics: Optional[Dict[str, Dict[str, float]]] = None
) -> Dict[str, Any]:
    """
    Run comprehensive statistical analysis.

    Args:
        G: NetworkX graph
        metrics: Optional dict of precomputed metrics for correlation/anomaly detection

    Returns:
        Dict with all statistical analysis results
    """
    result = {}

    # Distribution fitting
    result["distribution"] = fit_degree_distribution(G)

    # Assortativity
    result["assortativity"] = compute_degree_assortativity(G)

    # If metrics provided, run correlation and anomaly detection
    if metrics and len(metrics) >= 2:
        result["correlations"] = compute_metric_correlations(metrics)
        result["zscore_anomalies"] = detect_zscore_anomalies(metrics)

        if len(metrics) >= 2:
            result["mahalanobis_anomalies"] = detect_mahalanobis_anomalies(metrics)

        if HAS_SKLEARN:
            result["lof_anomalies"] = detect_lof_anomalies(metrics)

    return result
