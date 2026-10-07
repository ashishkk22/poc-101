/** The server-resolved identity. Never constructed from client input. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface ResolvedSession {
  user: AuthenticatedUser;
  sessionId: string;
  expiresAt: Date;
}
