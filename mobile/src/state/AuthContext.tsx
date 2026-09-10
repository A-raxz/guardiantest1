import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadToken, saveToken, setUnauthorizedHandler } from '../api/client';
import * as endpoints from '../api/endpoints';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  mustResetPassword: boolean;
  isRestoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  completePasswordReset: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [mustResetPassword, setMustResetPassword] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  const signOut = useCallback(async () => {
    await saveToken(null);
    setUser(null);
    setMustResetPassword(false);
  }, []);

  // Restore a stored session on cold start so reps are not asked to sign in daily.
  useEffect(() => {
    let cancelled = false;
    setUnauthorizedHandler(() => {
      void signOut();
    });

    (async () => {
      const token = await loadToken();
      if (!token) {
        if (!cancelled) setIsRestoring(false);
        return;
      }
      try {
        const me = await endpoints.fetchMe();
        if (cancelled) return;
        setUser(me.user);
        setMustResetPassword(me.mustResetPassword);
      } catch {
        await saveToken(null);
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await endpoints.login(email.trim(), password);
    await saveToken(result.token);
    setUser(result.user);
    setMustResetPassword(result.mustResetPassword);
  }, []);

  const completePasswordReset = useCallback(async (currentPassword: string, newPassword: string) => {
    const result = await endpoints.changePassword(currentPassword, newPassword);
    await saveToken(result.token);
    setUser(result.user);
    setMustResetPassword(false);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await endpoints.fetchMe();
      setUser(me.user);
      setMustResetPassword(me.mustResetPassword);
    } catch {
      // A failed refresh is not worth interrupting the screen the user is on.
    }
  }, []);

  const value = useMemo(
    () => ({ user, mustResetPassword, isRestoring, signIn, signOut, completePasswordReset, refreshUser }),
    [user, mustResetPassword, isRestoring, signIn, signOut, completePasswordReset, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
