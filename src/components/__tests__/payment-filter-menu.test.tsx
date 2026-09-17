import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { PaymentFilterMenu } from '@/src/components/reservations/payment-filter-menu';
import { lightColors as mockLightColors } from '@/src/theme/colors';

jest.mock('@/src/providers/theme-provider', () => ({
  useAppTheme: () => ({ mode: 'light', colors: mockLightColors, toggleTheme: jest.fn() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/ui/community/menu', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    MenuView: ({ actions, children, onPressAction }: {
      actions: { id: string; title: string }[];
      children: ReactNode;
      onPressAction: (event: { nativeEvent: { event: string } }) => void;
    }) => React.createElement(
      View,
      null,
      children,
      ...actions.map((action) => React.createElement(
        Pressable,
        {
          key: action.id,
          accessibilityLabel: `Select ${action.title}`,
          onPress: () => onPressAction({ nativeEvent: { event: action.id } }),
        },
        React.createElement(Text, null, action.title),
      )),
    ),
  };
});

describe('PaymentFilterMenu', () => {
  it('shows the current value and returns a native menu selection', () => {
    const onChange = jest.fn();
    const screen = render(<PaymentFilterMenu value="paid" onChange={onChange} />);

    expect(screen.getByLabelText('Payment filter: Paid')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Select Partially paid'));
    expect(onChange).toHaveBeenCalledWith('partially-paid');
  });

  it('maps the All menu action to the empty filter value', () => {
    const onChange = jest.fn();
    const screen = render(<PaymentFilterMenu value="unpaid" onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Select All'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
