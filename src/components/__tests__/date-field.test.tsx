import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { DateField } from '@/src/components/ui/date-field';
import { lightColors as mockLightColors } from '@/src/theme/colors';

jest.mock('@/src/providers/theme-provider', () => ({
  useAppTheme: () => ({ mode: 'light', colors: mockLightColors, toggleTheme: jest.fn() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
}));

describe('DateField', () => {
  it('commits the displayed default date when iOS Done is pressed without a wheel change', () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const onChange = jest.fn();

    try {
      const screen = render(
        <DateField
          label="Date of birth"
          value=""
          open
          onOpen={jest.fn()}
          onClose={jest.fn()}
          onChange={onChange}
        />,
      );

      fireEvent.press(screen.getByText('Done'));
      expect(onChange).toHaveBeenCalledWith('1990-01-01');
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });
});
