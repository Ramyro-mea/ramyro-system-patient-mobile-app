import { fireEvent, render } from '@testing-library/react-native';

import { FormField } from '@/src/components/ui/form-field';
import { lightColors as mockLightColors } from '@/src/theme/colors';

jest.mock('@/src/providers/theme-provider', () => ({
  useAppTheme: () => ({ mode: 'light', colors: mockLightColors, toggleTheme: jest.fn() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('FormField', () => {
  it('allows a patient to show and hide a password', () => {
    const screen = render(<FormField label="Password" value="secret" secureTextEntry />);
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);

    fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('Hide password')).toBeTruthy();
  });
});
