import type { Request } from 'express';

export interface AuthTokenPayload {
  userId: number;
  username: string;
  isAdmin: boolean;
  id?: number; // backward compat alias
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}
