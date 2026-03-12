// SVG renderer for mind map nodes, edges, labels, and checkboxes

import { computeLayout, computeEdgePath } from './layout.js';
import { getNodeColors } from './colors.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const NODE_RADIUS_ROOT = 50;
const NODE_WIDTH_L1 = 120;
const NODE_HEIGHT_L1 = 70;
const NODE_WIDTH_L2 = 100;
const NODE_HEIGHT_L2 = 60;
const NODE_CORNER_RADIUS = 12;
const LINE_HEIGHT = 14;
const IMAGE_THUMB_SIZE = 30;

// URL detection patterns
const URL_REGEX = /https?:\/\/[^\s]+/g;
const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|svg|webp|bmp)(?:\?[^\s]*)?$/i;

// Store positions for drag access
let _currentPositions = null;

// Persisted position overrides from dragging (nodeId -> {x, y})
const _positionOverrides = new Map();

export function getCurrentPositions() {
  return _currentPositions;
}

export function setPositionOverride(nodeId, x, y) {
  _positionOverrides.set(nodeId, { x, y });
}

export function clearPositionOverrides() {
  _positionOverrides.clear();
}

/**
 * Render the mind map into the given SVG element.
 */
export function renderMindMap(svg, root, selectedId, callbacks = {}) {
  const rect = svg.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;
  const isMobile = width < 768;

  const centerX = width / 2;
  const centerY = height / 2;

  const positions = computeLayout(root, centerX, centerY, isMobile);

  // Apply any persisted drag overrides
  for (const [nodeId, override] of _positionOverrides) {
    const pos = positions.get(nodeId);
    if (pos) {
      pos.x = override.x;
      pos.y = override.y;
    }
  }

  _currentPositions = positions;

  let contentGroup = svg.querySelector('#mindmap-content');
  if (!contentGroup) {
    contentGroup = document.createElementNS(SVG_NS, 'g');
    contentGroup.id = 'mindmap-content';
    svg.appendChild(contentGroup);
  }

  contentGroup.innerHTML = '';

  const edgeLayer = document.createElementNS(SVG_NS, 'g');
  edgeLayer.classList.add('edge-layer');
  const nodeLayer = document.createElementNS(SVG_NS, 'g');
  nodeLayer.classList.add('node-layer');

  contentGroup.appendChild(edgeLayer);
  contentGroup.appendChild(nodeLayer);

  drawEdges(edgeLayer, root, positions);

  positions.forEach((pos, id) => {
    drawNode(nodeLayer, pos, id === selectedId, callbacks);
  });
}

/**
 * Re-draw only edges (used during drag to avoid full re-render).
 */
export function redrawEdges(svg, root, positions) {
  const contentGroup = svg.querySelector('#mindmap-content');
  if (!contentGroup) return;
  const oldEdgeLayer = contentGroup.querySelector('.edge-layer');
  if (!oldEdgeLayer) return;

  const edgeLayer = document.createElementNS(SVG_NS, 'g');
  edgeLayer.classList.add('edge-layer');
  drawEdges(edgeLayer, root, positions);
  contentGroup.replaceChild(edgeLayer, oldEdgeLayer);
}

/**
 * Recursively draw edges from parent to children.
 */
function drawEdges(layer, node, positions) {
  const parentPos = positions.get(node.id);
  if (!parentPos) return;

  for (const child of node.children) {
    const childPos = positions.get(child.id);
    if (!childPos) continue;

    const pathData = computeEdgePath(parentPos, childPos);
    const colors = getNodeColors(childPos.depth, childPos.branchIndex, false);

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', colors.stroke);
    path.setAttribute('stroke-width', childPos.depth === 1 ? '5' : '3.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('opacity', child.done ? 0.2 : 0.85);
    path.classList.add('edge');

    layer.appendChild(path);

    drawEdges(layer, child, positions);
  }
}

/**
 * Parse node text to detect URLs and image URLs.
 */
function parseContent(text) {
  const urls = [];
  const imageUrls = [];
  let plainText = text;

  const matches = text.match(URL_REGEX) || [];
  for (const url of matches) {
    if (IMAGE_URL_REGEX.test(url)) {
      imageUrls.push(url);
    } else {
      urls.push(url);
    }
  }

  // Remove URLs from display text for cleaner labels
  plainText = text.replace(URL_REGEX, '').trim();

  return { plainText, urls, imageUrls };
}

/**
 * Word-wrap text to fit within a given width (approximate character count).
 */
function wrapText(text, maxCharsPerLine) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word.length > maxCharsPerLine
        ? word.slice(0, maxCharsPerLine - 1) + '…'
        : word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

/**
 * Draw a single node.
 */
function drawNode(layer, pos, isSelected, callbacks) {
  const { x, y, depth, branchIndex, node } = pos;
  const colors = getNodeColors(depth, branchIndex, node.done);
  const { plainText, urls, imageUrls } = parseContent(node.text);

  const group = document.createElementNS(SVG_NS, 'g');
  group.classList.add('node-group');
  group.dataset.nodeId = node.id;
  group.setAttribute('opacity', colors.opacity);

  if (depth === 0) {
    // Root node stays as a circle
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', NODE_RADIUS_ROOT);
    circle.setAttribute('fill', colors.fill);
    circle.setAttribute('stroke', isSelected ? '#FFD700' : colors.stroke);
    circle.setAttribute('stroke-width', isSelected ? '4' : '2');
    circle.classList.add('node-circle');
    addNodeListeners(circle, node.id, callbacks);
    group.appendChild(circle);

    // Root label — title + date subtitle
    const maxChars = 16;
    const displayText = plainText.length > maxChars
      ? plainText.slice(0, maxChars - 1) + '…'
      : (plainText || node.text.slice(0, maxChars));

    const title = document.createElementNS(SVG_NS, 'text');
    title.setAttribute('x', x);
    title.setAttribute('y', y - 8);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('dominant-baseline', 'central');
    title.setAttribute('fill', colors.text);
    title.setAttribute('font-size', '14');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('pointer-events', 'none');
    title.classList.add('node-label');
    title.textContent = displayText;
    group.appendChild(title);

    // Date subtitle (Pacific Time)
    const dateStr = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const dateLbl = document.createElementNS(SVG_NS, 'text');
    dateLbl.setAttribute('x', x);
    dateLbl.setAttribute('y', y + 12);
    dateLbl.setAttribute('text-anchor', 'middle');
    dateLbl.setAttribute('dominant-baseline', 'central');
    dateLbl.setAttribute('fill', colors.text);
    dateLbl.setAttribute('font-size', '10');
    dateLbl.setAttribute('opacity', '0.75');
    dateLbl.setAttribute('pointer-events', 'none');
    dateLbl.classList.add('node-label');
    dateLbl.textContent = dateStr;
    group.appendChild(dateLbl);

  } else {
    // Non-root: rounded rectangle
    const nodeW = depth === 1 ? NODE_WIDTH_L1 : NODE_WIDTH_L2;
    const maxCharsPerLine = depth === 1 ? 16 : 14;
    const fontSize = depth === 1 ? 12 : 11;

    const displayStr = plainText || node.text;
    const lines = wrapText(displayStr, maxCharsPerLine);

    // Calculate dynamic height based on content
    const textBlockH = lines.length * LINE_HEIGHT;
    const hasImages = imageUrls.length > 0;
    const hasUrls = urls.length > 0;
    const imageRowH = hasImages ? IMAGE_THUMB_SIZE + 6 : 0;
    const urlRowH = hasUrls ? 14 : 0;
    const contentH = textBlockH + imageRowH + urlRowH;
    const basePad = 20;
    const nodeH = Math.max(depth === 1 ? NODE_HEIGHT_L1 : NODE_HEIGHT_L2, contentH + basePad);

    const rx = x - nodeW / 2;
    const ry = y - nodeH / 2;

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', rx);
    rect.setAttribute('y', ry);
    rect.setAttribute('width', nodeW);
    rect.setAttribute('height', nodeH);
    rect.setAttribute('rx', NODE_CORNER_RADIUS);
    rect.setAttribute('ry', NODE_CORNER_RADIUS);
    rect.setAttribute('fill', colors.fill);
    rect.setAttribute('stroke', isSelected ? '#FFD700' : colors.stroke);
    rect.setAttribute('stroke-width', isSelected ? '4' : '2');
    rect.classList.add('node-rect');
    addNodeListeners(rect, node.id, callbacks);
    group.appendChild(rect);

    // Multi-line text label
    let textY = y - (contentH / 2) + LINE_HEIGHT / 2;
    for (const line of lines) {
      const tspan = document.createElementNS(SVG_NS, 'text');
      tspan.setAttribute('x', x);
      tspan.setAttribute('y', textY);
      tspan.setAttribute('text-anchor', 'middle');
      tspan.setAttribute('dominant-baseline', 'central');
      tspan.setAttribute('fill', colors.text);
      tspan.setAttribute('font-size', fontSize);
      tspan.setAttribute('font-weight', 'bold');
      tspan.setAttribute('pointer-events', 'none');
      tspan.classList.add('node-label');
      tspan.textContent = line;
      group.appendChild(tspan);
      textY += LINE_HEIGHT;
    }

    // Embedded image thumbnails
    if (hasImages) {
      const imgStartX = x - (imageUrls.length * (IMAGE_THUMB_SIZE + 4)) / 2;
      imageUrls.forEach((url, i) => {
        const imgX = imgStartX + i * (IMAGE_THUMB_SIZE + 4);
        const imgY = textY + 2;

        // Clip to rounded rect
        const clipId = `clip-${node.id}-img${i}`;
        const defs = document.createElementNS(SVG_NS, 'defs');
        const clipPath = document.createElementNS(SVG_NS, 'clipPath');
        clipPath.setAttribute('id', clipId);
        const clipRect = document.createElementNS(SVG_NS, 'rect');
        clipRect.setAttribute('x', imgX);
        clipRect.setAttribute('y', imgY);
        clipRect.setAttribute('width', IMAGE_THUMB_SIZE);
        clipRect.setAttribute('height', IMAGE_THUMB_SIZE);
        clipRect.setAttribute('rx', '4');
        clipPath.appendChild(clipRect);
        defs.appendChild(clipPath);
        group.appendChild(defs);

        const img = document.createElementNS(SVG_NS, 'image');
        img.setAttributeNS(XLINK_NS, 'href', url);
        img.setAttribute('x', imgX);
        img.setAttribute('y', imgY);
        img.setAttribute('width', IMAGE_THUMB_SIZE);
        img.setAttribute('height', IMAGE_THUMB_SIZE);
        img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        img.setAttribute('clip-path', `url(#${clipId})`);
        img.setAttribute('pointer-events', 'none');
        group.appendChild(img);
      });
      textY += IMAGE_THUMB_SIZE + 6;
    }

    // URL indicator (link icon + truncated URL)
    if (hasUrls) {
      const linkY = textY + (hasImages ? 0 : 2);
      const linkText = document.createElementNS(SVG_NS, 'text');
      linkText.setAttribute('x', x);
      linkText.setAttribute('y', linkY);
      linkText.setAttribute('text-anchor', 'middle');
      linkText.setAttribute('dominant-baseline', 'central');
      linkText.setAttribute('fill', '#4A90D9');
      linkText.setAttribute('font-size', '10');
      linkText.setAttribute('font-weight', 'bold');
      linkText.setAttribute('pointer-events', 'none');
      linkText.classList.add('node-label');
      const shortUrl = urls[0].replace(/^https?:\/\//, '').slice(0, 20) + (urls[0].length > 27 ? '…' : '');
      linkText.textContent = '🔗 ' + shortUrl;
      group.appendChild(linkText);
    }

    // Checkbox (top-right corner of rectangle)
    const cbSize = 14;
    const cbX = rx + nodeW - 4;
    const cbY = ry - 4;

    const cbRect = document.createElementNS(SVG_NS, 'rect');
    cbRect.setAttribute('x', cbX - cbSize / 2);
    cbRect.setAttribute('y', cbY - cbSize / 2);
    cbRect.setAttribute('width', cbSize);
    cbRect.setAttribute('height', cbSize);
    cbRect.setAttribute('rx', '2');
    cbRect.setAttribute('fill', node.done ? colors.stroke : '#FFFFFF');
    cbRect.setAttribute('stroke', colors.stroke);
    cbRect.setAttribute('stroke-width', '1.5');
    cbRect.classList.add('node-checkbox');
    cbRect.style.cursor = 'pointer';

    if (callbacks.onCheckboxClick) {
      cbRect.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onCheckboxClick(node.id);
      });
    }
    group.appendChild(cbRect);

    if (node.done) {
      const check = document.createElementNS(SVG_NS, 'path');
      const ccx = cbX;
      const ccy = cbY;
      check.setAttribute('d', `M ${ccx - 4} ${ccy} L ${ccx - 1} ${ccy + 3} L ${ccx + 4} ${ccy - 3}`);
      check.setAttribute('fill', 'none');
      check.setAttribute('stroke', '#FFFFFF');
      check.setAttribute('stroke-width', '2');
      check.setAttribute('stroke-linecap', 'round');
      check.setAttribute('stroke-linejoin', 'round');
      check.setAttribute('pointer-events', 'none');
      group.appendChild(check);
    }
  }

  layer.appendChild(group);
}

function addNodeListeners(el, nodeId, callbacks) {
  if (callbacks.onNodeClick) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onNodeClick(nodeId);
    });
  }
  if (callbacks.onNodeDblClick) {
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      callbacks.onNodeDblClick(nodeId);
    });
  }
}
