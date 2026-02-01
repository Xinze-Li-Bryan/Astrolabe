/**
 * Namespace Bubble Visual Styles
 *
 * Different depth levels of namespace bubbles have distinct visual appearances:
 * - Different shapes (from assets/nodes/shapes)
 * - Different colors (gradual color palette)
 * - Different sizes (top-level largest)
 */

export interface NamespaceBubbleStyle {
  shape: string       // Shape ID from assets (sphere, dodecahedron, octahedron, etc.)
  color: string       // Hex color
  sizeMultiplier: number  // Multiplier for base size calculation
}

/**
 * Bubble styles by depth level
 * Index 0 = top level (e.g., "Mathlib")
 * Index 1 = first sub-level (e.g., "Mathlib.Algebra")
 * etc.
 *
 * Colors are completely different for easy distinction.
 * Sizes decrease significantly with depth.
 */
export const NAMESPACE_BUBBLE_STYLES: NamespaceBubbleStyle[] = [
  // Depth 0: Top level - largest, most distinctive
  { shape: 'dodecahedron', color: '#f59e0b', sizeMultiplier: 3.0 },  // Amber/Gold, 12-sided

  // Depth 1: First sub-level
  { shape: 'octahedron', color: '#10b981', sizeMultiplier: 2.2 },    // Emerald/Green, 8-sided

  // Depth 2: Second sub-level
  { shape: 'icosahedron', color: '#3b82f6', sizeMultiplier: 1.6 },   // Blue, 20-sided

  // Depth 3: Third sub-level
  { shape: 'tetrahedron', color: '#8b5cf6', sizeMultiplier: 1.2 },   // Purple, 4-sided

  // Depth 4+: Deeper levels - simple sphere
  { shape: 'sphere', color: '#ec4899', sizeMultiplier: 1.0 },        // Pink
]

/**
 * Get the visual style for a namespace bubble at a given depth
 * @param depth - The namespace depth (0 = top level)
 * @returns The visual style configuration
 */
export function getNamespaceBubbleStyle(depth: number): NamespaceBubbleStyle {
  const index = Math.min(depth, NAMESPACE_BUBBLE_STYLES.length - 1)
  return NAMESPACE_BUBBLE_STYLES[index]
}

/**
 * Calculate the size for a namespace bubble
 * @param nodeCount - Number of nodes in this namespace
 * @param depth - The namespace depth
 * @returns The calculated size
 */
export function calculateBubbleSize(nodeCount: number, depth: number): number {
  const style = getNamespaceBubbleStyle(depth)
  // Base size from node count (log scale), multiplied by depth-based multiplier
  // Larger base and multiplier for more visible size differences
  const baseSize = 1.5 + Math.log10(Math.max(1, nodeCount)) * 0.8
  return Math.min(8.0, baseSize * style.sizeMultiplier)
}
