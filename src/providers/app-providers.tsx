import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useState } from 'react';
import { AuthProvider } from '@/src/providers/auth-provider';
import { AppThemeProvider } from '@/src/providers/theme-provider';
import { GuestReceiptProvider } from '@/src/providers/guest-receipt-provider';
import { NotificationProvider } from '@/src/providers/notification-provider';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false }, mutations: { retry: false } },
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <GuestReceiptProvider>
          <AuthProvider>
            <NotificationProvider>{children}</NotificationProvider>
          </AuthProvider>
        </GuestReceiptProvider>
      </AppThemeProvider>
    </QueryClientProvider>
  );
}
