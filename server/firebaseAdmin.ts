import { applicationDefault, cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';
import { readFileSync } from 'node:fs';

export class FirebaseAdminConfigError extends Error {
  constructor(message = 'Firebase Admin server credentials are not configured.') {
    super(message);
    this.name = 'FirebaseAdminConfigError';
  }
}

let adminAuth: Auth | null = null;

type ServiceAccountFile = {
  project_id?: unknown;
  client_email?: unknown;
  private_key?: unknown;
};

function getServiceAccountFromFile() {
  const filePath = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH?.trim();
  if (!filePath) return null;

  try {
    const account = JSON.parse(readFileSync(filePath, 'utf8')) as ServiceAccountFile;
    const projectId = typeof account.project_id === 'string' ? account.project_id.trim() : '';
    const clientEmail = typeof account.client_email === 'string' ? account.client_email.trim() : '';
    const privateKey = typeof account.private_key === 'string' ? account.private_key.replace(/\\n/g, '\n').trim() : '';

    if (!projectId || !clientEmail || !privateKey) {
      throw new FirebaseAdminConfigError('The Firebase service-account file is missing project_id, client_email, or private_key.');
    }

    return { projectId, clientEmail, privateKey };
  } catch (error) {
    if (error instanceof FirebaseAdminConfigError) throw error;
    throw new FirebaseAdminConfigError('The Firebase service-account file could not be read or parsed.');
  }
}

function getProjectId() {
  return process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '';
}

function getAdminApp(): App {
  if (getApps().length > 0) return getApp();

  const serviceAccount = getServiceAccountFromFile();
  const projectId = getProjectId() || serviceAccount?.projectId || '';
  const databaseUrl = process.env.FIREBASE_DATABASE_URL?.trim();
  if (process.env.FIREBASE_ADMIN_USE_APPLICATION_DEFAULT === 'true') {
    if (!projectId) throw new FirebaseAdminConfigError('FIREBASE_ADMIN_PROJECT_ID is required when using application default credentials.');
    return initializeApp({ projectId, credential: applicationDefault(), ...(databaseUrl ? { databaseURL: databaseUrl } : {}) });
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() || serviceAccount?.clientEmail;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() || serviceAccount?.privateKey;
  if (!projectId || !clientEmail || !privateKey) throw new FirebaseAdminConfigError();

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), ...(databaseUrl ? { databaseURL: databaseUrl } : {}) });
}

export function getFirebaseAdminApp() {
  return getAdminApp();
}

export function getFirebaseAdminAuth() {
  if (!adminAuth) adminAuth = getAuth(getFirebaseAdminApp());
  return adminAuth;
}

export function getFirebaseAdminDatabase(): Database {
  const databaseUrl = process.env.FIREBASE_DATABASE_URL?.trim();
  if (!databaseUrl) throw new FirebaseAdminConfigError('FIREBASE_DATABASE_URL is not configured for the Realtime Database.');
  return getDatabase(getFirebaseAdminApp());
}

export function isFirebaseAdminConfigured() {
  if (process.env.FIREBASE_ADMIN_USE_APPLICATION_DEFAULT === 'true') return Boolean(getProjectId());
  return Boolean(
    (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) ||
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH
  );
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken> {
  return getFirebaseAdminAuth().verifyIdToken(token);
}
