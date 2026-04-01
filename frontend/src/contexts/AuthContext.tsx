import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser, signIn, signOut, fetchAuthSession } from 'aws-amplify/auth';

export type Role = 'admin' | 'editor' | 'viewer';

interface AuthState {
  loading: boolean;
  email: string | null;
  name: string | null;
  role: Role;
  idToken: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isEditor: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    email: null,
    name: null,
    role: 'viewer',
    idToken: null,
  });

  async function loadSession() {
    try {
      const user = await getCurrentUser();
      const session = await fetchAuthSession();
      const claims = session.tokens?.idToken?.payload ?? {};
      const role = (claims['custom:role'] as string | undefined) ?? 'viewer';
      const name = (claims['name'] as string | undefined) ?? null;
      const idToken = session.tokens?.idToken?.toString() ?? null;
      setState({ loading: false, email: user.signInDetails?.loginId ?? null, name, role: role as Role, idToken });
    } catch {
      setState({ loading: false, email: null, name: null, role: 'viewer', idToken: null });
    }
  }

  useEffect(() => { loadSession(); }, []);

  async function login(email: string, password: string) {
    await signIn({ username: email, password });
    await loadSession();
  }

  async function logout() {
    await signOut();
    setState({ loading: false, email: null, name: null, role: 'viewer', idToken: null });
  }

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      logout,
      refreshUser: loadSession,
      isAdmin:  state.role === 'admin',
      isEditor: state.role === 'editor' || state.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
