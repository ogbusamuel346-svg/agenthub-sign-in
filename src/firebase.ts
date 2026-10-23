import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, initializeAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if valid Firebase configuration has been provided
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey.length > 10 &&
  !firebaseConfig.apiKey.includes('YOUR_') &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.includes('YOUR_')
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
export let firebaseInitializationErrorCode: string | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    try {
      auth = initializeAuth(app, { persistence: browserLocalPersistence });
    } catch (error) {
      // HMR or another Firebase module may already have initialized Auth for this app.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'auth/already-initialized') {
        auth = getAuth(app);
      } else {
        throw error;
      }
    }
  } catch (error) {
    firebaseInitializationErrorCode = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : error instanceof Error ? error.name : 'unknown';
    console.error('Failed to initialize Firebase:', error);
  }
}

export { app, auth, firebaseConfig };
