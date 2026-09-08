import * as SecureStore from 'expo-secure-store';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setUnauthorizedHandler } from '@/src/lib/api-client';
import { isTokenUsable } from '@/src/lib/jwt';
import { clearReportCache } from '@/src/lib/report-files';
import { patientPortalService } from '@/src/services/patient-portal';
import { unregisterPatientPushNotifications } from '@/src/services/push-notifications';
import type { LoginRequest, RegistrationRequest } from '@/src/types/api';

const TOKEN_KEY = 'patient_portal_auth_token';
type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
interface AuthContextValue {
  status: AuthStatus; token: string | null; sessionMessage: string | null;
  login: (request: LoginRequest) => Promise<void>;
  register: (request: RegistrationRequest) => Promise<void>;
  logout: () => Promise<void>; expireSession: () => Promise<void>;
  clearSessionMessage: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const clearLocalSession = useCallback(async () => {
    setToken(null); setStatus('unauthenticated'); queryClient.clear(); clearReportCache();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, [queryClient]);

  const expireSession = useCallback(async () => {
    setSessionMessage('Your session has expired. Please sign in again.');
    await clearLocalSession();
  }, [clearLocalSession]);

  useEffect(() => {
    setUnauthorizedHandler(expireSession);
    return () => setUnauthorizedHandler(null);
  }, [expireSession]);

  useEffect(() => {
    let mounted = true;
    SecureStore.getItemAsync(TOKEN_KEY).then(async (storedToken) => {
      if (!mounted) return;
      if (storedToken && isTokenUsable(storedToken)) {
        setToken(storedToken); setStatus('authenticated'); return;
      }
      if (storedToken) {
        setSessionMessage('Your session has expired. Please sign in again.');
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
      setStatus('unauthenticated');
    }).catch(() => { if (mounted) setStatus('unauthenticated'); });
    return () => { mounted = false; };
  }, []);

  const saveAuthentication = useCallback(async (accessToken: string) => {
    if (!isTokenUsable(accessToken)) throw new Error('The server returned an invalid access token.');
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    queryClient.clear(); setSessionMessage(null); setToken(accessToken); setStatus('authenticated');
  }, [queryClient]);

  const login = useCallback(async (request: LoginRequest) => {
    const response = await patientPortalService.login(request);
    await saveAuthentication(response.token);
  }, [saveAuthentication]);

  const register = useCallback(async (request: RegistrationRequest) => {
    const response = await patientPortalService.register(request);
    await saveAuthentication(response.token);
  }, [saveAuthentication]);

  const logout = useCallback(async () => {
    setSessionMessage(null);
    setStatus('loading');
    if (token) {
      try {
        await unregisterPatientPushNotifications(token);
      } catch {
        // Logout must still complete when token cleanup cannot reach the server.
      }
    }
    await clearLocalSession();
  }, [clearLocalSession, token]);
  const clearSessionMessage = useCallback(() => setSessionMessage(null), []);
  const value = useMemo(() => ({ status, token, sessionMessage, login, register, logout, expireSession, clearSessionMessage }),
    [status, token, sessionMessage, login, register, logout, expireSession, clearSessionMessage]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
