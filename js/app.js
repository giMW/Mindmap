// Entry point: wires together all modules

import { createDefaultTree } from './mindmap.js';
import { initUI, setRoot, getRoot, showLoading, hideLoading } from './ui.js';
import { initAuth, signIn, signOut } from './auth.js';
import { loadMindMap, debouncedSave, flushSave } from './store.js';
import { isFirebaseConfigured, initFirebase } from './firebase-config.js';

let _currentUser = null;

// DOM refs
const btnAuth = document.getElementById('btn-auth');
const authLabel = document.getElementById('auth-label');
const userName = document.getElementById('user-name');
const statusRight = document.getElementById('status-right');

// ---- Bootstrap ----

async function main() {
  // Start with a default tree (works offline / without Firebase)
  const defaultRoot = createDefaultTree();

  // Initialize UI with default tree and auto-save handler
  initUI(defaultRoot, onTreeChange);

  // Initialize Firebase (async, no-op if not configured)
  await initFirebase();

  // Setup auth button
  btnAuth.addEventListener('click', async () => {
    if (_currentUser) {
      await flushSave(_currentUser.uid, getRoot());
      signOut();
    } else {
      signIn();
    }
  });

  // Listen for auth state changes
  initAuth(async ({ user }) => {
    _currentUser = user;
    updateAuthUI(user);

    if (user) {
      // Load saved map from Firestore
      showLoading();
      try {
        const saved = await loadMindMap(user.uid);
        if (saved) {
          setRoot(saved);
        }
      } catch (err) {
        console.error('Failed to load:', err);
      } finally {
        hideLoading();
      }
    } else {
      // Signed out — reset to default
      setRoot(createDefaultTree());
    }
  });

  if (!isFirebaseConfigured) {
    statusRight.textContent = 'Offline mode (Firebase not configured)';
  }
}

// ---- Auth UI ----

function updateAuthUI(user) {
  const label = document.getElementById('auth-label');
  const name = document.getElementById('user-name');
  if (user) {
    if (label) label.textContent = 'Sign Out';
    if (name) name.textContent = user.displayName || user.email || '';
  } else {
    if (label) label.textContent = 'Sign In';
    if (name) name.textContent = '';
  }
}

// ---- Auto-Save ----

function onTreeChange(root) {
  if (_currentUser) {
    debouncedSave(_currentUser.uid, root);
  }
}

// ---- Start ----
main();
