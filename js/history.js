// Undo/redo history for tree snapshots

import { cloneTree } from './mindmap.js';

const MAX_HISTORY = 50;

let _undoStack = [];  // past snapshots
let _redoStack = [];  // future snapshots (after undo)

/**
 * Save a snapshot of the current tree state.
 * Call this BEFORE each mutation.
 */
export function pushSnapshot(root) {
  _undoStack.push(cloneTree(root));
  if (_undoStack.length > MAX_HISTORY) {
    _undoStack.shift();
  }
  // Any new action clears the redo stack
  _redoStack = [];
}

/**
 * Undo: returns the previous tree state, or null if nothing to undo.
 * @param {Object} currentRoot - the current tree (saved to redo stack)
 */
export function undo(currentRoot) {
  if (_undoStack.length === 0) return null;
  _redoStack.push(cloneTree(currentRoot));
  return _undoStack.pop();
}

/**
 * Redo: returns the next tree state, or null if nothing to redo.
 * @param {Object} currentRoot - the current tree (saved back to undo stack)
 */
export function redo(currentRoot) {
  if (_redoStack.length === 0) return null;
  _undoStack.push(cloneTree(currentRoot));
  return _redoStack.pop();
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
