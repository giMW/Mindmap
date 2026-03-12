// Branch color palette — 10 curated colors for mind map branches
// Each color has a base (level 1 fill), light (level 2+ fill), and dark (text on light)

const BRANCH_COLORS = [
  { name: 'blue',    base: '#4A90D9', light: '#D6E4F0', dark: '#1B3A5C' },
  { name: 'green',   base: '#27AE60', light: '#D4EFDF', dark: '#145A32' },
  { name: 'orange',  base: '#E67E22', light: '#FDEBD0', dark: '#784212' },
  { name: 'purple',  base: '#8E44AD', light: '#E8DAEF', dark: '#4A235A' },
  { name: 'red',     base: '#E74C3C', light: '#FADBD8', dark: '#78281F' },
  { name: 'teal',    base: '#16A085', light: '#D1F2EB', dark: '#0E6655' },
  { name: 'pink',    base: '#E84393', light: '#FDEDF4', dark: '#7B1A4A' },
  { name: 'amber',   base: '#F39C12', light: '#FEF5E7', dark: '#7D5A00' },
  { name: 'indigo',  base: '#5C6BC0', light: '#E0E3F7', dark: '#283593' },
  { name: 'cyan',    base: '#00ACC1', light: '#D1F5FA', dark: '#005662' },
];

const ROOT_COLOR = {
  fill: '#2C3E50',
  text: '#FFFFFF',
  stroke: '#1A252F',
};

/**
 * Get the color set for a branch based on which child index of root it belongs to.
 * @param {number} branchIndex — the index of the root-level child (0-based)
 * @returns {{ base: string, light: string, dark: string }}
 */
export function getBranchColor(branchIndex) {
  return BRANCH_COLORS[branchIndex % BRANCH_COLORS.length];
}

/**
 * Get fill and text color for a node at the given depth and branch index.
 * @param {number} depth — 0 = root, 1 = first level, 2+ = deeper
 * @param {number} branchIndex — which root-child branch this node belongs to
 * @param {boolean} done — whether the node is marked done
 * @returns {{ fill: string, text: string, stroke: string }}
 */
export function getNodeColors(depth, branchIndex, done) {
  let fill, text, stroke;

  if (depth === 0) {
    fill = ROOT_COLOR.fill;
    text = ROOT_COLOR.text;
    stroke = ROOT_COLOR.stroke;
  } else {
    const branch = getBranchColor(branchIndex);
    if (depth === 1) {
      fill = branch.base;
      text = '#FFFFFF';
      stroke = branch.dark;
    } else {
      fill = branch.light;
      text = branch.dark;
      stroke = branch.base;
    }
  }

  if (done) {
    // Use opaque washed-out colors instead of group opacity so edges
    // behind the node shape stay fully hidden (no line-through effect).
    return {
      fill: blendWithWhite(fill, 0.55),
      text: blendWithWhite(text, 0.5),
      stroke: blendWithWhite(stroke, 0.5),
      opacity: 1,
    };
  }
  return { fill, text, stroke, opacity: 1 };
}

/**
 * Blend a hex colour toward white.
 * @param {string} hex - e.g. '#2C3E50'
 * @param {number} amount - 0 = original, 1 = pure white
 */
function blendWithWhite(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.round(r + (255 - r) * amount);
  const ng = Math.round(g + (255 - g) * amount);
  const nb = Math.round(b + (255 - b) * amount);
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

export { BRANCH_COLORS, ROOT_COLOR };
