export interface Session {
  userId: string;
  email: string;
  role: 'user' | 'admin';
  token: string;
}

export interface AuthProvider {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session>;
  signUp(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
}
