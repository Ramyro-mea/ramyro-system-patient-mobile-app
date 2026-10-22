import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

import { SupportRealtimeProvider, useSupportRealtime } from '@/src/providers/support-realtime-provider';
import { supportKeys } from '@/src/services/support';
import type { SupportMessage } from '@/src/types/support';

const mockStart = jest.fn();
const mockStop = jest.fn();
const mockHandlers: Record<string, (...args: unknown[]) => void> = {};
const mockConnection = {
  state: 'Disconnected',
  start: mockStart,
  stop: mockStop,
  on: jest.fn((name: string, handler: (...args: unknown[]) => void) => { mockHandlers[name] = handler; }),
  onreconnecting: jest.fn(),
  onreconnected: jest.fn(),
  onclose: jest.fn(),
};
type MockBuilder = {
  withUrl: jest.Mock;
  withAutomaticReconnect: jest.Mock;
  configureLogging: jest.Mock;
  build: jest.Mock;
};
const mockBuilder = {} as MockBuilder;
mockBuilder.withUrl = jest.fn(() => mockBuilder);
mockBuilder.withAutomaticReconnect = jest.fn(() => mockBuilder);
mockBuilder.configureLogging = jest.fn(() => mockBuilder);
mockBuilder.build = jest.fn(() => mockConnection);

jest.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: jest.fn(() => mockBuilder),
  HubConnectionState: { Disconnected: 'Disconnected' },
  LogLevel: { Warning: 3 },
}));
jest.mock('@/src/providers/auth-provider', () => ({
  useAuth: () => ({ status: 'authenticated', token: 'patient-token' }),
}));

function Status() {
  return <Text>{useSupportRealtime().status}</Text>;
}

function supportMessage(id: number): SupportMessage {
  return {
    id,
    ticketId: 8,
    senderKind: 'Staff',
    senderId: '',
    senderDisplayName: 'Support',
    body: 'Hello',
    createdAtUtc: '2026-10-21T10:00:00Z',
    attachments: [],
  };
}

describe('SupportRealtimeProvider', () => {
  beforeEach(() => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.useFakeTimers();
    jest.clearAllMocks();
    for (const key of Object.keys(mockHandlers)) delete mockHandlers[key];
    mockStart.mockResolvedValue(undefined);
    mockStop.mockResolvedValue(undefined);
  });

  afterEach(() => jest.useRealTimers());

  it('connects, merges messages without duplicates, and stops on cleanup', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(supportKeys.messages(8), {
      pages: [{ items: [supportMessage(1)] }],
      pageParams: [undefined],
    });
    const screen = render(
      <QueryClientProvider client={queryClient}>
        <SupportRealtimeProvider><Status /></SupportRealtimeProvider>
      </QueryClientProvider>,
    );

    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(screen.getByText('connected')).toBeTruthy();

    act(() => {
      mockHandlers.SupportMessageReceived(supportMessage(2));
      mockHandlers.SupportMessageReceived(supportMessage(2));
    });
    const cached = queryClient.getQueryData<{ pages: { items: SupportMessage[] }[] }>(
      supportKeys.messages(8),
    );
    expect(cached?.pages[0].items.map((item) => item.id)).toEqual([1, 2]);

    screen.unmount();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('retries an initial connection failure and exposes reconnecting state', async () => {
    mockStart.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const queryClient = new QueryClient();
    const screen = render(
      <QueryClientProvider client={queryClient}>
        <SupportRealtimeProvider><Status /></SupportRealtimeProvider>
      </QueryClientProvider>,
    );

    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(screen.getByText('reconnecting')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(screen.getByText('connected')).toBeTruthy();
    screen.unmount();
  });
});
