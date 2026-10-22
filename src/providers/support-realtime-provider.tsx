import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { env } from '@/src/config/env';
import { useAuth } from '@/src/providers/auth-provider';
import { supportKeys } from '@/src/services/support';
import type { SupportMessage, SupportMessageList } from '@/src/types/support';

export type SupportConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

const SupportRealtimeContext = createContext<{ status: SupportConnectionStatus }>({
  status: 'disconnected',
});

function addMessageToCache(
  current: InfiniteData<SupportMessageList, number | undefined> | undefined,
  message: SupportMessage,
) {
  if (!current || current.pages.some((page) => page.items.some((item) => item.id === message.id))) {
    return current;
  }
  return {
    ...current,
    pages: current.pages.map((page, index) => index === 0
      ? { ...page, items: [...page.items, message] }
      : page),
  };
}

export function SupportRealtimeProvider({ children }: PropsWithChildren) {
  const { status: authStatus, token } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SupportConnectionStatus>('disconnected');
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppIsActive(nextState === 'active');
      if (nextState === 'active') {
        void queryClient.invalidateQueries({ queryKey: supportKeys.all });
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !token || !appIsActive) {
      return;
    }

    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    let connection: HubConnection;

    const refresh = () => queryClient.invalidateQueries({ queryKey: supportKeys.all });
    const scheduleStart = () => {
      if (disposed || retryTimer) return;
      const delay = [0, 2000, 5000, 10000, 30000][Math.min(retryAttempt, 4)];
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void start();
      }, delay);
    };
    const start = async () => {
      if (disposed || connection.state !== HubConnectionState.Disconnected) return;
      setStatus(retryAttempt > 1 ? 'reconnecting' : 'connecting');
      try {
        await connection.start();
        if (disposed) {
          await connection.stop();
          return;
        }
        retryAttempt = 0;
        setStatus('connected');
        await refresh();
      } catch {
        if (!disposed) {
          setStatus('reconnecting');
          scheduleStart();
        }
      }
    };

    connection = new HubConnectionBuilder()
      .withUrl(env.chatHubUrl, { accessTokenFactory: () => token })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on('SupportTicketCreated', refresh);
    connection.on('SupportTicketUpdated', refresh);
    connection.on('SupportTicketClosed', refresh);
    connection.on('SupportRead', refresh);
    connection.on('SupportMessageReceived', (message: SupportMessage) => {
      queryClient.setQueryData<InfiniteData<SupportMessageList, number | undefined>>(
        supportKeys.messages(message.ticketId),
        (current) => addMessageToCache(current, message),
      );
      void refresh();
    });
    connection.onreconnecting(() => setStatus('reconnecting'));
    connection.onreconnected(() => {
      retryAttempt = 0;
      setStatus('connected');
      void refresh();
    });
    connection.onclose(() => {
      if (!disposed) {
        setStatus('reconnecting');
        scheduleStart();
      }
    });

    scheduleStart();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      setStatus('disconnected');
      void connection.stop();
    };
  }, [appIsActive, authStatus, queryClient, token]);

  const exposedStatus = authStatus === 'authenticated' && token && appIsActive
    ? status
    : 'disconnected';
  const value = useMemo(() => ({ status: exposedStatus }), [exposedStatus]);
  return <SupportRealtimeContext.Provider value={value}>{children}</SupportRealtimeContext.Provider>;
}

export function useSupportRealtime() {
  return useContext(SupportRealtimeContext);
}
