import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Pressable, Text } from 'react-native';

import { GuestReceiptProvider, useGuestReceipt } from '@/src/providers/guest-receipt-provider';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

const firstReceipt = { submittedAtUtc: '2026-09-03T10:00:00Z' };
const latestReceipt = { submittedAtUtc: '2026-09-03T11:00:00Z' };

function Consumer() {
  const { receipt, saveReceipt, dismissReceipt } = useGuestReceipt();
  return <>
    <Text>{receipt?.submittedAtUtc ?? 'none'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="save" onPress={() => void saveReceipt(latestReceipt)} />
    <Pressable accessibilityRole="button" accessibilityLabel="dismiss" onPress={() => void dismissReceipt()} />
  </>;
}

describe('GuestReceiptProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(firstReceipt));
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('restores, replaces, and dismisses the latest receipt', async () => {
    const screen = render(<GuestReceiptProvider><Consumer /></GuestReceiptProvider>);
    await waitFor(() => expect(screen.getByText(firstReceipt.submittedAtUtc)).toBeTruthy());

    fireEvent.press(screen.getByLabelText('save'));
    await waitFor(() => expect(screen.getByText(latestReceipt.submittedAtUtc)).toBeTruthy());
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'patient_portal_guest_reservation_receipt',
      JSON.stringify(latestReceipt),
      expect.any(Object),
    );

    fireEvent.press(screen.getByLabelText('dismiss'));
    await waitFor(() => expect(screen.getByText('none')).toBeTruthy());
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('patient_portal_guest_reservation_receipt');
  }, 10_000);
});
