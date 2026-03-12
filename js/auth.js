// Google sign-in/out and auth state observer

import { auth, isFirebaseConfigured } from './firebase-config.js';

let _onAuthChange = null;

/**
 * Initialize auth and listen for state changes.
 * @param {Function} callback - receives { user } or { user: null }
 */
export async function initAuth(callback) {
  _onAuthChange = callback;

  if (!isFirebaseConfigured) {
    callback({ user: null });
    return;
  }

  const { onAuthStateChanged } = await import(
    'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js'
  );

  onAuthStateChanged(auth, (user) => {
    callback({ user: user || null });
  });
}

/**
 * Sign in with Google popup.
 */
export async function signIn() {
  if (!isFirebaseConfigured) {
    console.warn('Firebase not configured. Please add your config to firebase-config.js');
    return;
  }

  const { GoogleAuthProvider, signInWithPopup } = await import(
    'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js'
  );

  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      console.error('Sign-in error:', err);
    }
  }
}

/**
 * Sign out.
 */
export async function signOut() {
  if (!isFirebaseConfigured) return;

  const { signOut: fbSignOut } = await import(
    'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js'
  );
  await fbSignOut(auth);
}
