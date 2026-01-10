/**
 * Astrolabe UI Colors
 *
 * Contains only UI-related color constants (brand colors, neutral colors, semantic colors)
 * Chart-related colors (node types, status, edges) are loaded from assets/themes
 *
 * @see hooks/useAssets.ts - Chart colors
 * @see public/assets/themes/default.json - Theme configuration
 */

// ============================================
// UI Color Palette
// ============================================

export const UIColors = {
  // Core Brand Colors
  core: {
    deepRed: "#7a0101",
    red: "#be1420",
    cream: "#fbf0d9",
    deepBlue: "#012f48",
    steelBlue: "#669aba",
  },

  // Neutral Colors
  neutral: {
    black: "#000000",
    deepSpace: "#0a0a0f",   // Deep space background
    panel: "#111118",        // Panel background
    border: "#1a1a22",       // Border
    darkGray: "#2c3e50",     // Dark gray
    midGray: "#636e72",      // Mid gray
    lightGray: "#95a5a6",    // Light gray
    silver: "#bdc3c7",       // Silver
    cloud: "#ecf0f1",        // Cloud white
    cream: "#fbf0d9",        // Cream
  },

  // Semantic Colors
  semantic: {
    error: "#e74c3c",
    warning: "#e67e22",
    success: "#2ecc71",
    info: "#3498db",
  },
};

// ============================================
// Background Colors
// ============================================

export const BackgroundColors = {
  main: UIColors.neutral.deepSpace,
  panel: UIColors.neutral.panel,
  card: "#111118",
  dots: "#374151",
};

// ============================================
// Particle Background Colors
// ============================================

export const ParticleColors = [
  UIColors.core.red,
  UIColors.core.steelBlue,
  UIColors.core.cream,
  "#ffffff",
  "#a8d4f0",
  "#ff9f43",
  "#ffcc80",
  "#7ec8e3",
];

// ============================================
// Backward compatibility aliases (gradually deprecated)
// ============================================

/** @deprecated Use UIColors instead */
export const AstrolabePalette = {
  core: UIColors.core,
  neutral: UIColors.neutral,
  semantic: UIColors.semantic,
  // Chart colors moved to assets, empty objects kept here to prevent errors in old code
  // Use useAssets hook to get chart colors
  status: {} as Record<string, string>,
  nodeTypes: {} as Record<string, string>,
  edges: {} as Record<string, string>,
  extended: {
    red: ["#4a0000", "#7a0101", "#be1420", "#e74c3c", "#f5a89a"],
    blue: ["#001a2e", "#012f48", "#3498db", "#669aba", "#a8d4f0"],
    green: ["#0a3d2a", "#1e8449", "#27ae60", "#2ecc71", "#a9dfbf"],
    purple: ["#2c1a4a", "#6c3483", "#9b59b6", "#bb8fce", "#e8daef"],
    orange: ["#7e5109", "#d68910", "#e67e22", "#f1c40f", "#f9e79f"],
    cyan: ["#0a3d3d", "#148f77", "#1abc9c", "#76d7c4", "#d1f2eb"],
  },
};
