// UI controller: DOM events, selection, modals, pan/zoom

import { renderMindMap, getCurrentPositions, redrawEdges, setPositionOverride, clearPositionOverrides } from './renderer.js';
import {
  addChild, updateNodeText, toggleDone, deleteNode,
  findNode, getNodeDepth,
} from './mindmap.js';
import { createVoiceController, isSpeechSupported } from './voice.js';
import { pushSnapshot, undo, redo, canUndo, canRedo, clearHistory } from './history.js';

let _root = null;
let _selectedId = null;
let _onChange = null; // callback when tree changes (for auto-save)

// Pan/zoom state
let _transform = { x: 0, y: 0, scale: 1 };
let _isPanning = false;
let _panStart = { x: 0, y: 0 };
let _lastTouches = null;

// DOM refs
const svg = document.getElementById('mindmap-svg');
const container = document.getElementById('canvas-container');
const btnAdd = document.getElementById('btn-add');
const btnEdit = document.getElementById('btn-edit');
const btnDelete = document.getElementById('btn-delete');
const btnFit = document.getElementById('btn-fit');
const btnPdf = document.getElementById('btn-pdf');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnMicToolbar = document.getElementById('btn-mic-toolbar');

// Edit modal
const editModal = document.getElementById('edit-modal');
const editInput = document.getElementById('edit-input');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalSave = document.getElementById('btn-modal-save');
const btnMicModal = document.getElementById('btn-mic-modal');

// Confirm dialog
const confirmOverlay = document.getElementById('confirm-dialog');
const confirmMessage = document.getElementById('confirm-message');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const btnConfirmOk = document.getElementById('btn-confirm-ok');

// Status bar
const statusLeft = document.getElementById('status-left');
const statusRight = document.getElementById('status-right');

// Voice
let _voiceModal = null;
let _voiceToolbar = null;

// Pending confirm callback
let _confirmCallback = null;

/**
 * Initialize the UI controller.
 * @param {Object} root - the mind map tree root
 * @param {Function} onChange - callback invoked when the tree is mutated
 */
export function initUI(root, onChange) {
  _root = root;
  _onChange = onChange;

  setupVoice();
  setupToolbarButtons();
  setupModal();
  setupConfirmDialog();
  setupPanZoom();
  setupNodeDrag();
  setupKeyboard();

  render();
}

/**
 * Replace the tree root (e.g., after loading from Firestore).
 */
export function setRoot(root) {
  _root = root;
  _selectedId = null;
  clearPositionOverrides();
  clearHistory();
  resetTransform();
  render();
}

/**
 * Get current root (for saving).
 */
export function getRoot() {
  return _root;
}

// ---- Rendering ----

function render() {
  renderMindMap(svg, _root, _selectedId, {
    onNodeClick: selectNode,
    onNodeDblClick: openEditModal,
    onCheckboxClick: handleCheckboxClick,
  });

  applyTransform();
  updateToolbarState();
  updateStatus();
}

function applyTransform() {
  const group = svg.querySelector('#mindmap-content');
  if (group) {
    group.setAttribute('transform',
      `translate(${_transform.x}, ${_transform.y}) scale(${_transform.scale})`
    );
  }
}

function resetTransform() {
  _transform = { x: 0, y: 0, scale: 1 };
}

// ---- Selection ----

function selectNode(id) {
  _selectedId = (_selectedId === id) ? null : id;
  render();
}

function deselectAll() {
  _selectedId = null;
  render();
}

// ---- Toolbar State ----

function updateToolbarState() {
  const hasSelection = _selectedId !== null;
  const isRoot = _selectedId && _root.id === _selectedId;

  btnAdd.disabled = !hasSelection;
  btnEdit.disabled = !hasSelection;
  btnDelete.disabled = !hasSelection || isRoot;
  btnUndo.disabled = !canUndo();
  btnRedo.disabled = !canRedo();
}

function updateStatus() {
  if (_selectedId) {
    const result = findNode(_root, _selectedId);
    if (result) {
      const depth = getNodeDepth(_root, _selectedId);
      statusLeft.textContent = `Selected: "${result.node.text}" (level ${depth})`;
    }
  } else {
    statusLeft.textContent = 'Click a node to select it';
  }

  // Count nodes
  let count = 0;
  function countNodes(n) { count++; n.children.forEach(countNodes); }
  countNodes(_root);
  statusRight.textContent = `${count} nodes`;
}

// ---- Toolbar Buttons ----

function setupToolbarButtons() {
  btnAdd.addEventListener('click', () => {
    if (!_selectedId) return;
    pushSnapshot(_root);
    const child = addChild(_root, _selectedId);
    if (child) {
      treeChanged();
      _selectedId = child.id;
      render();
      openEditModal(child.id);
    }
  });

  btnEdit.addEventListener('click', () => {
    if (_selectedId) openEditModal(_selectedId);
  });

  btnDelete.addEventListener('click', () => {
    if (!_selectedId || _selectedId === _root.id) return;
    const result = findNode(_root, _selectedId);
    if (!result) return;
    showConfirm(`Delete "${result.node.text}" and its children?`, () => {
      pushSnapshot(_root);
      deleteNode(_root, _selectedId);
      _selectedId = null;
      treeChanged();
      render();
    });
  });

  btnFit.addEventListener('click', () => {
    resetTransform();
    render();
  });

  btnPdf.addEventListener('click', exportPdf);

  btnUndo.addEventListener('click', performUndo);
  btnRedo.addEventListener('click', performRedo);
}

// ---- Edit Modal ----

let _editingNodeId = null;

function setupModal() {
  btnModalCancel.addEventListener('click', closeEditModal);
  btnModalSave.addEventListener('click', saveEditModal);

  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });

  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveEditModal();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeEditModal();
    }
  });
}

function openEditModal(nodeId) {
  const result = findNode(_root, nodeId);
  if (!result) return;

  _editingNodeId = nodeId;
  editInput.value = result.node.text;
  editModal.classList.add('active');

  requestAnimationFrame(() => {
    editInput.focus();
    editInput.select();
  });
}

function closeEditModal() {
  editModal.classList.remove('active');
  _editingNodeId = null;
  if (_voiceModal && _voiceModal.isListening()) {
    _voiceModal.stop();
    btnMicModal.classList.remove('recording');
  }
}

function saveEditModal() {
  if (!_editingNodeId) return;
  const text = editInput.value.trim();
  if (text) {
    pushSnapshot(_root);
    updateNodeText(_root, _editingNodeId, text);
    treeChanged();
  }
  closeEditModal();
  render();
}

// ---- Confirm Dialog ----

function setupConfirmDialog() {
  btnConfirmCancel.addEventListener('click', () => {
    confirmOverlay.classList.remove('active');
    _confirmCallback = null;
  });

  btnConfirmOk.addEventListener('click', () => {
    confirmOverlay.classList.remove('active');
    if (_confirmCallback) {
      _confirmCallback();
      _confirmCallback = null;
    }
  });

  confirmOverlay.addEventListener('click', (e) => {
    if (e.target === confirmOverlay) {
      confirmOverlay.classList.remove('active');
      _confirmCallback = null;
    }
  });
}

function showConfirm(message, onConfirm) {
  confirmMessage.textContent = message;
  _confirmCallback = onConfirm;
  confirmOverlay.classList.add('active');
}

// ---- Checkbox ----

function handleCheckboxClick(nodeId) {
  pushSnapshot(_root);
  toggleDone(_root, nodeId);
  treeChanged();
  render();
}

// ---- Pan/Zoom ----

function setupPanZoom() {
  // Click on empty canvas to deselect
  svg.addEventListener('click', (e) => {
    if (e.target === svg || e.target.id === 'mindmap-content') {
      deselectAll();
    }
  });

  // Mouse pan
  svg.addEventListener('mousedown', (e) => {
    if (e.target !== svg && !e.target.closest('.edge-layer') && e.target.id !== 'mindmap-content') return;
    _isPanning = true;
    _panStart = { x: e.clientX - _transform.x, y: e.clientY - _transform.y };
    svg.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!_isPanning) return;
    _transform.x = e.clientX - _panStart.x;
    _transform.y = e.clientY - _panStart.y;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    _isPanning = false;
    svg.style.cursor = 'grab';
  });

  // Wheel zoom
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(3, Math.max(0.3, _transform.scale * delta));

    // Zoom toward mouse position
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    _transform.x = mx - (mx - _transform.x) * (newScale / _transform.scale);
    _transform.y = my - (my - _transform.y) * (newScale / _transform.scale);
    _transform.scale = newScale;

    applyTransform();
  }, { passive: false });

  // Touch pan/pinch
  svg.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      _isPanning = true;
      _panStart = { x: t.clientX - _transform.x, y: t.clientY - _transform.y };
    }
    if (e.touches.length === 2) {
      _isPanning = false;
      _lastTouches = getTouchData(e.touches);
    }
  }, { passive: true });

  svg.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && _isPanning) {
      const t = e.touches[0];
      _transform.x = t.clientX - _panStart.x;
      _transform.y = t.clientY - _panStart.y;
      applyTransform();
    }
    if (e.touches.length === 2 && _lastTouches) {
      e.preventDefault();
      const curr = getTouchData(e.touches);
      const scaleDelta = curr.dist / _lastTouches.dist;
      const newScale = Math.min(3, Math.max(0.3, _transform.scale * scaleDelta));

      // Zoom toward pinch center
      const cx = curr.cx;
      const cy = curr.cy;
      const rect = svg.getBoundingClientRect();
      const mx = cx - rect.left;
      const my = cy - rect.top;

      _transform.x = mx - (mx - _transform.x) * (newScale / _transform.scale);
      _transform.y = my - (my - _transform.y) * (newScale / _transform.scale);
      _transform.scale = newScale;

      // Pan with pinch movement
      _transform.x += curr.cx - _lastTouches.cx;
      _transform.y += curr.cy - _lastTouches.cy;

      _lastTouches = curr;
      applyTransform();
    }
  }, { passive: false });

  svg.addEventListener('touchend', () => {
    _isPanning = false;
    _lastTouches = null;
  });

  // Resize (debounced to avoid excessive re-renders)
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => render(), 150);
  });
}

function getTouchData(touches) {
  const t1 = touches[0];
  const t2 = touches[1];
  const dx = t2.clientX - t1.clientX;
  const dy = t2.clientY - t1.clientY;
  return {
    cx: (t1.clientX + t2.clientX) / 2,
    cy: (t1.clientY + t2.clientY) / 2,
    dist: Math.sqrt(dx * dx + dy * dy),
  };
}

// ---- Node Dragging ----

let _dragNodeId = null;
let _dragOffset = { x: 0, y: 0 };
let _didDrag = false;

function setupNodeDrag() {
  svg.addEventListener('mousedown', onDragStart);
  svg.addEventListener('touchstart', onDragTouchStart, { passive: false });
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('touchmove', onDragTouchMove, { passive: false });
  window.addEventListener('mouseup', onDragEnd);
  window.addEventListener('touchend', onDragEnd);
}

function onDragStart(e) {
  const group = e.target.closest('.node-group');
  if (!group) return;
  const nodeId = group.dataset.nodeId;
  if (!nodeId || nodeId === _root.id) return; // Can't drag root

  const positions = getCurrentPositions();
  if (!positions) return;
  const pos = positions.get(nodeId);
  if (!pos) return;

  // Convert mouse to SVG coordinates accounting for transform
  const pt = svgPoint(e.clientX, e.clientY);
  _dragNodeId = nodeId;
  _dragOffset = { x: pt.x - pos.x, y: pt.y - pos.y };
  _didDrag = false;
  _isPanning = false;
}

function onDragTouchStart(e) {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (!el) return;
  const group = el.closest('.node-group');
  if (!group) return;
  const nodeId = group.dataset.nodeId;
  if (!nodeId || nodeId === _root.id) return;

  const positions = getCurrentPositions();
  if (!positions) return;
  const pos = positions.get(nodeId);
  if (!pos) return;

  const pt = svgPoint(touch.clientX, touch.clientY);
  _dragNodeId = nodeId;
  _dragOffset = { x: pt.x - pos.x, y: pt.y - pos.y };
  _didDrag = false;
  _isPanning = false;
  // Don't preventDefault here — it blocks the tap/click event on mobile
}

function onDragMove(e) {
  if (!_dragNodeId) return;
  const pt = svgPoint(e.clientX, e.clientY);
  moveDraggedNode(pt.x - _dragOffset.x, pt.y - _dragOffset.y);
}

function onDragTouchMove(e) {
  if (!_dragNodeId || e.touches.length !== 1) return;
  e.preventDefault();
  const touch = e.touches[0];
  const pt = svgPoint(touch.clientX, touch.clientY);
  moveDraggedNode(pt.x - _dragOffset.x, pt.y - _dragOffset.y);
}

function moveDraggedNode(newX, newY) {
  const positions = getCurrentPositions();
  if (!positions) return;
  const pos = positions.get(_dragNodeId);
  if (!pos) return;

  // Calculate delta from the original layout position
  const origX = pos._origX ?? pos.x;
  const origY = pos._origY ?? pos.y;
  if (pos._origX == null) { pos._origX = pos.x; pos._origY = pos.y; }

  // Only count as drag if moved more than 3px (avoid jitter on click)
  const movedDist = Math.sqrt((newX - origX) ** 2 + (newY - origY) ** 2);
  if (!_didDrag && movedDist < 3) return;
  _didDrag = true;

  pos.x = newX;
  pos.y = newY;

  // Translate the entire group element (much simpler than moving each child)
  const group = svg.querySelector(`.node-group[data-node-id="${_dragNodeId}"]`);
  if (group) {
    group.classList.add('dragging');
    group.setAttribute('transform', `translate(${newX - origX}, ${newY - origY})`);
  }

  // Redraw edges only (cheap)
  redrawEdges(svg, _root, positions);
}

function onDragEnd() {
  if (!_dragNodeId) return;
  if (_didDrag) {
    const positions = getCurrentPositions();
    if (positions) {
      const pos = positions.get(_dragNodeId);
      if (pos) {
        setPositionOverride(_dragNodeId, pos.x, pos.y);
      }
    }
    _dragNodeId = null;
    _didDrag = false;
    // Full re-render to clean up the transform hack and redraw properly
    render();
  } else {
    // Was just a tap, not a drag — select the node directly
    // (touch events don't always produce a reliable click event on mobile)
    const tappedId = _dragNodeId;
    _dragNodeId = null;
    selectNode(tappedId);
  }
}

function svgPoint(clientX, clientY) {
  // Convert client coords to SVG content-group coords (accounting for pan/zoom)
  return {
    x: (clientX - svg.getBoundingClientRect().left - _transform.x) / _transform.scale,
    y: (clientY - svg.getBoundingClientRect().top - _transform.y) / _transform.scale,
  };
}

// ---- Keyboard Shortcuts ----

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    // Don't handle shortcuts when typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (editModal.classList.contains('active') || confirmOverlay.classList.contains('active')) return;

    // Undo/Redo (works even without selection)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      performUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault();
      performRedo();
      return;
    }

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (_selectedId && _selectedId !== _root.id) {
          btnDelete.click();
        }
        break;
      case 'Enter':
        if (_selectedId) {
          openEditModal(_selectedId);
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (_selectedId) {
          btnAdd.click();
        }
        break;
      case 'Escape':
        deselectAll();
        break;
    }
  });
}

// ---- Voice ----

function setupVoice() {
  if (!isSpeechSupported()) {
    btnMicToolbar.classList.add('hidden');
    btnMicModal.classList.add('hidden');
    return;
  }

  // Modal mic button — dictate into text field
  _voiceModal = createVoiceController({
    onInterim(text) {
      editInput.value = text;
    },
    onFinal(text) {
      editInput.value = text;
      btnMicModal.classList.remove('recording');
    },
    onStart() {
      btnMicModal.classList.add('recording');
    },
    onEnd() {
      btnMicModal.classList.remove('recording');
    },
    onError() {
      btnMicModal.classList.remove('recording');
    },
  });

  btnMicModal.addEventListener('click', () => {
    if (_voiceModal.isListening()) {
      _voiceModal.stop();
    } else {
      _voiceModal.start();
    }
  });

  // Toolbar mic button — quick-add child via voice
  _voiceToolbar = createVoiceController({
    onFinal(text) {
      if (!_selectedId) return;
      pushSnapshot(_root);
      const child = addChild(_root, _selectedId, text);
      if (child) {
        treeChanged();
        _selectedId = child.id;
        render();
      }
      btnMicToolbar.classList.remove('recording');
    },
    onStart() {
      btnMicToolbar.classList.add('recording');
      statusLeft.textContent = 'Listening…';
    },
    onEnd() {
      btnMicToolbar.classList.remove('recording');
      updateStatus();
    },
    onError() {
      btnMicToolbar.classList.remove('recording');
      updateStatus();
    },
  });

  btnMicToolbar.addEventListener('click', () => {
    if (!_selectedId) {
      statusLeft.textContent = 'Select a node first, then use Voice';
      return;
    }
    if (_voiceToolbar.isListening()) {
      _voiceToolbar.stop();
    } else {
      _voiceToolbar.start();
    }
  });
}

// ---- Tree Change Notification ----

function treeChanged() {
  if (_onChange) _onChange(_root);
}

// ---- Undo / Redo ----

function performUndo() {
  const prev = undo(_root);
  if (!prev) return;
  _root = prev;
  _selectedId = null;
  treeChanged();
  render();
}

function performRedo() {
  const next = redo(_root);
  if (!next) return;
  _root = next;
  _selectedId = null;
  treeChanged();
  render();
}

// ---- PDF Export ----

function exportPdf() {
  // Reset view so the full map is visible
  resetTransform();
  render();

  requestAnimationFrame(() => {
    // Get the actual bounding box of all rendered content
    const content = svg.querySelector('#mindmap-content');
    if (!content) return;
    const bbox = content.getBBox();

    // Add padding around the content
    const pad = 40;
    const vx = bbox.x - pad;
    const vy = bbox.y - pad;
    const vw = bbox.width + pad * 2;
    const vh = bbox.height + pad * 2;

    // Clone the SVG and set a proper viewBox so everything is visible
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    clone.setAttribute('width', '100%');
    clone.setAttribute('height', '100%');
    // Remove the pan/zoom transform from the clone since viewBox handles framing
    const cloneContent = clone.querySelector('#mindmap-content');
    if (cloneContent) cloneContent.removeAttribute('transform');

    const svgData = new XMLSerializer().serializeToString(clone);

    // Open a new window with the SVG embedded, then trigger print
    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('Please allow pop-ups to export PDF.');
      return;
    }
    printWin.document.write(`<!DOCTYPE html>
<html><head><title>Mind Map</title>
<style>
  @page { size: landscape; margin: 0.5in; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
  svg { display: block; width: 100%; height: 100vh; }
</style></head><body>${svgData}</body></html>`);
    printWin.document.close();
    printWin.addEventListener('afterprint', () => printWin.close());
    // Give the window a moment to render, then print
    setTimeout(() => printWin.print(), 300);
  });
}

// ---- Loading ----

const loadingOverlay = document.getElementById('loading-overlay');

export function showLoading() {
  loadingOverlay.classList.add('active');
}

export function hideLoading() {
  loadingOverlay.classList.remove('active');
}
