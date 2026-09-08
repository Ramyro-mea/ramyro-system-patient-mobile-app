import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppThemeProvider, useAppTheme } from '@/src/providers/theme-provider';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

function ThemeConsumer() {
  const { mode, toggleTheme } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={toggleTheme}><Text>{mode}</Text></Pressable>;
}

describe('AppThemeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('light');
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('restores and persists the selected theme', async () => {
    const screen = render(<AppThemeProvider><ThemeConsumer /></AppThemeProvider>);
    await waitFor(() => expect(screen.getByText('light')).toBeTruthy());
    fireEvent.press(screen.getByRole('button'));
    expect(screen.getByText('dark')).toBeTruthy();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('patient_portal_theme', 'dark');
  });
});
