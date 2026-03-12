// Firestore CRUD for mind map persistence

import { db, isFirebaseConfigured } from './firebase-config.js';
import { serializeTree, deserializeTree } from './mindmap.js';

let _debounceTimer = null;
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
      return deserializeTree(data.rootNode);
    }
    return null;
  } catch (err) {
    console.error('Error loading mind map:', err);
    return null;
  }
}

/**
 * Save the mind map for a user to Firestore.
 * @param {string} userId
 * @param {Object} root - tree root node
 */
export async function saveMindMap(userId, root) {
  if (!isFirebaseConfigured || !userId) return;

  const { doc, setDoc, serverTimestamp } = await import(
    'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js'
  );

  try {
    const docRef = doc(db, 'mindmaps', userId);
    await setDoc(docRef, {
      ownerId: userId,
      rootNode: serializeTree(root),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error('Error saving mind map:', err);
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
  _debounceTimer = setTimeout(() => {
    saveMindMap(userId, root);
    updateStatusSaved();
  }, DEBOUNCE_MS);
}

function updateStatusSaved() {
  const el = document.getElementById('status-right');
  if (el) {
    const original = el.textContent;
    el.textContent = 'Saved ✓';
    setTimeout(() => {
      // Only revert if still showing "Saved"
      if (el.textContent === 'Saved ✓') {
        el.textContent = original;
      }
    }, 2000);
  }
}
