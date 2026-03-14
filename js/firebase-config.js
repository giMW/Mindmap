// Firebase SDK initialization
//
// ============================================================
//  SETUP INSTRUCTIONS
// ============================================================
//  1. Go to https://console.firebase.google.com
//  2. Create a new project (or use an existing one)
//  3. Go to Project Settings > General > Your apps > Add app (Web)
//  4. Copy the firebaseConfig values and paste them below
//  5. In the Firebase console, enable:
//     - Authentication > Sign-in method > Google
//     - Firestore Database > Create database (start in test mode)
//  6. (Optional) Deploy to Firebase Hosting for a public URL
// ============================================================

// TODO: Replace with your Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyDz9vSXUKBuIOmMPGJPfYSbM-D3kagh9LE",
  authDomain: "mymindmap-b2dff.firebaseapp.com",
  projectId: "mymindmap-b2dff",
  storageBucket: "mymindmap-b2dff.firebasestorage.app",
  messagingSenderId: "912888131114",
  appId: "1:912888131114:web:e2b987b9e5c54004a95d53",
};

// Check if Firebase is configured
export const isFirebaseConfigured =
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";

export let app = null;
export let auth = null;
export let db = null;

/**
 * Initialize Firebase SDK (called once at app startup).
 * Uses dynamic imports so the app still works offline/locally without Firebase.
 */
export async function initFirebase() {
  if (!isFirebaseConfigured) return;

  try {
    const { initializeApp } = await import(
      'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js'
    );
    const { getAuth } = await import(
      'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js'
    );
    const { getFirestore } = await import(
      'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js'
    );

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.warn('Firebase SDK could not be loaded. Running in offline mode.', err);
  }
}
