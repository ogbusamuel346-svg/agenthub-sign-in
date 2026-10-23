import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { FirebaseAdminConfigError, verifyFirebaseIdToken } from './firebaseAdmin';

export type AuthenticatedRequest = Request & { firebaseUser?: DecodedIdToken };

export function requireFirebaseUser(req: Request, res: Response, next: NextFunction) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'A Firebase ID token is required.' } });
    return;
  }

  verifyFirebaseIdToken(match[1])
    .then((firebaseUser) => {
      (req as AuthenticatedRequest).firebaseUser = firebaseUser;
      next();
    })
    .catch((error: unknown) => {
      if (error instanceof FirebaseAdminConfigError) {
        res.status(503).json({ error: { code: 'SERVER_AUTH_NOT_CONFIGURED', message: error.message } });
        return;
      }
      res.status(401).json({ error: { code: 'INVALID_FIREBASE_TOKEN', message: 'The Firebase session could not be verified.' } });
    });
}
