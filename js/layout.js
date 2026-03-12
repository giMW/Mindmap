// Radial layout algorithm for mind map nodes

const DESKTOP_RADIUS = 160;
const MOBILE_RADIUS = 100;

/**
 * Compute subtree weight (leaf = 1, parent = sum of children, min 1).
 */
function computeWeight(node) {
  if (node.children.length === 0) return 1;
  let w = 0;
  for (const child of node.children) {
    w += computeWeight(child);
  }
  return w;
}

/**
 * Compute the radial layout positions for all nodes in the tree.
 *
 * @param {Object} root - The root node of the tree
 * @param {number} centerX - X center of the layout
 * @param {number} centerY - Y center of the layout
 * @param {boolean} isMobile - Whether to use mobile radius
 * @returns {Map<string, { x, y, depth, branchIndex, node }>}
 */
export function computeLayout(root, centerX, centerY, isMobile = false) {
  const radiusStep = isMobile ? MOBILE_RADIUS : DESKTOP_RADIUS;
  const positions = new Map();

  // Root at center
  positions.set(root.id, {
    x: centerX,
    y: centerY,
    depth: 0,
    branchIndex: 0,
    node: root,
  });

  if (root.children.length === 0) return positions;

  // Compute weights for root's children
  const weights = root.children.map(c => computeWeight(c));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Distribute angles among root's children
  let currentAngle = -Math.PI / 2; // Start from top

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    const sweep = (weights[i] / totalWeight) * 2 * Math.PI;
    const midAngle = currentAngle + sweep / 2;

    layoutSubtree(
      child,
      centerX,
      centerY,
      1,
      midAngle,
      currentAngle,
      currentAngle + sweep,
      i,
      radiusStep,
      positions
    );

    currentAngle += sweep;
  }

  return positions;
}

/**
 * Recursively lay out a subtree.
 */
function layoutSubtree(node, centerX, centerY, depth, angle, startAngle, endAngle, branchIndex, radiusStep, positions) {
  const x = centerX + depth * radiusStep * Math.cos(angle);
  const y = centerY + depth * radiusStep * Math.sin(angle);

  positions.set(node.id, {
    x,
    y,
    depth,
    branchIndex,
    node,
  });

  if (node.children.length === 0) return;

  const weights = node.children.map(c => computeWeight(c));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Subdivide the angular range
  let childAngle = startAngle;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const sweep = (weights[i] / totalWeight) * (endAngle - startAngle);
    const midAngle = childAngle + sweep / 2;

    layoutSubtree(
      child,
      centerX,
      centerY,
      depth + 1,
      midAngle,
      childAngle,
      childAngle + sweep,
      branchIndex,
      radiusStep,
      positions
    );

    childAngle += sweep;
  }
}

/**
 * Generate an SVG path (cubic Bezier) from parent to child with a nice curve.
 */
export function computeEdgePath(parentPos, childPos) {
  const dx = childPos.x - parentPos.x;
  const dy = childPos.y - parentPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Perpendicular offset for curvature (scales with distance)
  const curvature = 0.25;
  const perpX = -dy * curvature;
  const perpY = dx * curvature;

  // Two control points for a cubic Bezier — offset in the same perpendicular direction
  const c1x = parentPos.x + dx * 0.3 + perpX;
  const c1y = parentPos.y + dy * 0.3 + perpY;
  const c2x = parentPos.x + dx * 0.7 + perpX;
  const c2y = parentPos.y + dy * 0.7 + perpY;

  return `M ${parentPos.x} ${parentPos.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${childPos.x} ${childPos.y}`;
}
