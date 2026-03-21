// Firestore CRUD for mind map persistence

import { db, isFirebaseConfigured } from './firebase-config.js';
import { serializeTree, deserializeTree } from './mindmap.js';

let _debounceTimer = null;
let _pendingSave = null;
const DEBOUNCE_MS = 1500;

/**
 * Load the mind map for a user from Firestore.
 * @param {string} userId
 * @returns {Object|null} - deserialized tree root, or null if not found
 */
export async function loadMindMap(userId) {
  if (!isFirebaseConfigured || !userId) return null;

  const { doc, getDoc } = await import(
    'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js'
  );

  try {
    const docRef = doc(db, 'mindmaps', userId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      console.log('[MindMap] Loaded from Firestore', { children: data.rootNode?.children?.length });
      return deserializeTree(data.rootNode);
    }
    console.log('[MindMap] No saved data found in Firestore');
    return null;
  } catch (err) {
    console.error('[MindMap] Load FAILED:', err);
    return null;
  }
}

/**
 * Save the mind map for a user to Firestore.
 * @param {string} userId
 * @param {Object} root - tree root node
 */
export async function saveMindMap(userId, root) {
  if (!isFirebaseConfigured || !userId) return false;

  const { doc, setDoc, serverTimestamp } = await import(
    'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js'
  );

  try {
    const docRef = doc(db, 'mindmaps', userId);
    const data = serializeTree(root);
    console.log('[MindMap] Saving to Firestore...', { userId, children: data.children?.length });
    await setDoc(docRef, {
      ownerId: userId,
      rootNode: data,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log('[MindMap] Save successful');
    return true;
  } catch (err) {
    console.error('[MindMap] Save FAILED:', err);
    updateStatusError('Save failed — check Firestore rules');
    return false;
  }
}

/**
 * Debounced save — waits 1500ms after last call before writing.
 * @param {string} userId
 * @param {Object} root
 */
export function debouncedSave(userId, root) {
  if (!isFirebaseConfigured || !userId) return;

  if (_debounceTimer) clearTimeout(_debounceTimer);
  _pendingSave = { userId, root };
  _debounceTimer = setTimeout(async () => {
    _pendingSave = null;
    const ok = await saveMindMap(userId, root);
    if (ok) updateStatusSaved();
  }, DEBOUNCE_MS);
}

/**
 * Cancel any pending debounced save and immediately save the given tree.
 * Call before sign-out to avoid losing recent changes.
 * @param {string} userId
 * @param {Object} root - current tree root
 */
export async function flushSave(userId, root) {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  _pendingSave = null;
  if (userId && root) {
    await saveMindMap(userId, root);
  }
}

function updateStatusSaved() {
  const el = document.getElementById('status-right');
  if (el) {
    const original = el.textContent;
    el.textContent = 'Saved ✓';
    setTimeout(() => {
      if (el.textContent === 'Saved ✓') {
        el.textContent = original;
      }
    }, 2000);
  }
}

function updateStatusError(msg) {
  const el = document.getElementById('status-right');
  if (el) {
    el.textContent = msg;
    el.style.color = '#e74c3c';
    setTimeout(() => {
      el.style.color = '';
    }, 5000);
  }
}
