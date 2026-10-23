import { auth } from '../firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';

export class ApiClientError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

type ErrorFactory = (message: string, status: number, code: string) => Error;

type ApiRequestOptions = {
  authenticated?: boolean;
  errorMessage?: string;
  errorCode?: string;
  createError?: ErrorFactory;
};

function makeError(options: ApiRequestOptions, message: string, status: number, code: string) {
  return (options.createError || ((defaultMessage, defaultStatus, defaultCode) => new ApiClientError(defaultMessage, defaultStatus, defaultCode)))
    (message, status, code);
}

async function getFirebaseUser(): Promise<User | null> {
  const authInstance = auth;
  if (!authInstance) return null;
  if (authInstance.currentUser) return authInstance.currentUser;
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | undefined;
    let shouldUnsubscribe = false;
    let settled = false;
    let nullStateTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (nullStateTimer) clearTimeout(nullStateTimer);
      clearTimeout(timeout);
      if (unsubscribe) unsubscribe();
      else shouldUnsubscribe = true;
    };
    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(user);
    };
    const timeout = setTimeout(() => finish(authInstance.currentUser || null), 10_000);
    unsubscribe = onAuthStateChanged(authInstance, (user) => {
      if (user) {
        finish(user);
        return;
      }
      // Firebase can emit its initial signed-out state while a just-completed
      // sign-in is still propagating. Give that state change a brief chance to arrive.
      if (!nullStateTimer) {
        nullStateTimer = setTimeout(() => finish(authInstance.currentUser || null), 1_500);
      }
    }, () => finish(authInstance.currentUser || null));
    if (shouldUnsubscribe) unsubscribe();
  });
}

export async function apiRequest<T>(url: string, init?: RequestInit, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  if (options.authenticated) {
    const firebaseUser = await getFirebaseUser();
    if (!firebaseUser) {
      throw makeError(options, 'Your Firebase session is no longer available. Please sign in again.', 401, 'AUTHENTICATION_REQUIRED');
    }
    headers.set('Authorization', `Bearer ${await firebaseUser.getIdToken()}`);
  }

  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => null) as ({ error?: { code?: string; message?: string } } & T) | null;
  if (!response.ok) {
    throw makeError(
      options,
      payload?.error?.message || options.errorMessage || 'The service request could not be completed.',
      response.status,
      payload?.error?.code || options.errorCode || 'API_ERROR',
    );
  }
  return payload as T;
}
