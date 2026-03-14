// Undo/redo history using lightweight JSON snapshots

import { serializeTree, deserializeTree } from './mindmap.js';

const MAX_HISTORY = 20;

let _undoStack = [];  // past snapshots (JSON strings)
let _redoStack = [];  // future snapshots (JSON strings)

/**
 * Save a snapshot of the current tree state.
 * Call this BEFORE each mutation.
 */
export function pushSnapshot(root) {
  _undoStack.push(JSON.stringify(serializeTree(root)));
  if (_undoStack.length > MAX_HISTORY) {
    _undoStack.shift();
  }
  _redoStack = [];
}

/**
 * Undo: returns the previous tree state, or null if nothing to undo.
 * @param {Object} currentRoot - the current tree (saved to redo stack)
 */
export function undo(currentRoot) {
  if (_undoStack.length === 0) return null;
  _redoStack.push(JSON.stringify(serializeTree(currentRoot)));
  return deserializeTree(JSON.parse(_undoStack.pop()));
}

/**
 * Redo: returns the next tree state, or null if nothing to redo.
 * @param {Object} currentRoot - the current tree (saved back to undo stack)
 */
export function redo(currentRoot) {
  if (_redoStack.length === 0) return null;
  _undoStack.push(JSON.stringify(serializeTree(currentRoot)));
  return deserializeTree(JSON.parse(_redoStack.pop()));
}

export function canUndo() {
  return _undoStack.length > 0;
}

export function canRedo() {
  return _redoStack.length > 0;
}

/**
 * Clear all history (e.g. when loading a new map).
 */
export function clearHistory() {
  _undoStack = [];
  _redoStack = [];
}
