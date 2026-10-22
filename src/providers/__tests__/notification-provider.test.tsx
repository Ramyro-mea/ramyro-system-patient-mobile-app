import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { NotificationProvider } from '@/src/providers/notification-provider';

const mockPush = jest.fn();
const mockGetLastResponse = jest.fn();
const mockClearLastResponse = jest.fn();
let mockResponseListener: ((response: unknown) => void) | null = null;

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: (...args: unknown[]) => mockGetLastResponse(...args),
  clearLastNotificationResponseAsync: (...args: unknown[]) => mockClearLastResponse(...args),
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
    mockResponseListener = listener;
    return { remove: jest.fn() };
  },
}));
jest.mock('@/src/providers/auth-provider', () => ({
  useAuth: () => ({ status: 'authenticated', token: 'patient-token' }),
}));
jest.mock('@/src/services/push-notifications', () => ({
  registerPatientPushNotifications: jest.fn().mockResolvedValue(undefined),
  addPatientPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));

function response(identifier: string, ticketId: number) {
  return {
    notification: {
      request: {
        identifier,
        content: { data: { category: 'patient-support', ticketId } },
      },
    },
  };
}

describe('NotificationProvider support navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResponseListener = null;
    mockGetLastResponse.mockResolvedValue(null);
    mockClearLastResponse.mockResolvedValue(undefined);
  });

  it('opens and clears a cold-start patient support response after authentication', async () => {
    mockGetLastResponse.mockResolvedValue(response('cold-1', 27));
    render(<NotificationProvider><Text>App</Text></NotificationProvider>);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/support', params: { ticketId: '27' },
    }));
    expect(mockClearLastResponse).toHaveBeenCalledTimes(1);
  });

  it('handles warm taps once and ignores unrelated categories', async () => {
    render(<NotificationProvider><Text>App</Text></NotificationProvider>);
    await waitFor(() => expect(mockResponseListener).not.toBeNull());

    const warm = response('warm-1', 31);
    act(() => {
      mockResponseListener?.(warm);
      mockResponseListener?.(warm);
      mockResponseListener?.({
        notification: { request: { identifier: 'visit', content: { data: { category: 'visit-admission', ticketId: 31 } } } },
      });
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/support', params: { ticketId: '31' } });
  });
});
