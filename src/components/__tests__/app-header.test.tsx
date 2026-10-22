import { fireEvent, render } from '@testing-library/react-native';

import { AppHeader } from '@/src/components/app-header';
import { lightColors as mockColors } from '@/src/theme/colors';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/src/hooks/use-support', () => ({
  useSupportTickets: () => ({ data: { items: [], total: 0, unreadTotal: 7 } }),
}));
jest.mock('@/src/providers/auth-provider', () => ({ useAuth: () => ({ logout: jest.fn() }) }));
jest.mock('@/src/providers/theme-provider', () => ({
  useAppTheme: () => ({ mode: 'light', colors: mockColors, toggleTheme: jest.fn() }),
}));

describe('AppHeader support action', () => {
  it('shows the unread total and opens the protected support route', () => {
    const screen = render(<AppHeader />);

    expect(screen.getByText('7')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Technical support, 7 unread'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/support');
  });
});
