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

let mockAuthStatus: 'authenticated' | 'unauthenticated' = 'unauthenticated';

jest.mock('@/src/providers/auth-provider', () => ({
  useAuth: () => ({ status: mockAuthStatus }),
}));

const firstReceipt = {
  visitId: 26,
  orderId: null,
  submittedAtUtc: '2026-09-03T10:00:00Z',
  procedureId: null,
  procedureDisplayName: null,
};
const latestReceipt = {
  visitId: 27,
  orderId: 91,
  submittedAtUtc: '2026-09-03T11:00:00Z',
  procedureId: 8,
  procedureDisplayName: 'MRI Brain',
};

function Consumer() {
  const { receipt, saveReceipt } = useGuestReceipt();
  return <>
    <Text>{receipt ? `${receipt.visitId}-${receipt.submittedAtUtc}` : 'none'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="save" onPress={() => void saveReceipt(latestReceipt)} />
  </>;
}

describe('GuestReceiptProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthStatus = 'unauthenticated';
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(firstReceipt));
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('restores and replaces the latest receipt', async () => {
    const screen = render(<GuestReceiptProvider><Consumer /></GuestReceiptProvider>);
    await waitFor(() => expect(screen.getByText(`${firstReceipt.visitId}-${firstReceipt.submittedAtUtc}`)).toBeTruthy());

    fireEvent.press(screen.getByLabelText('save'));
    await waitFor(() => expect(screen.getByText(`${latestReceipt.visitId}-${latestReceipt.submittedAtUtc}`)).toBeTruthy());
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'patient_portal_guest_reservation_receipt',
      JSON.stringify(latestReceipt),
      expect.any(Object),
    );
  }, 10_000);

  it('clears the stored receipt when authentication becomes active', async () => {
    const screen = render(<GuestReceiptProvider><Consumer /></GuestReceiptProvider>);
    await waitFor(() => expect(screen.getByText(`${firstReceipt.visitId}-${firstReceipt.submittedAtUtc}`)).toBeTruthy());

    mockAuthStatus = 'authenticated';
    screen.rerender(<GuestReceiptProvider><Consumer /></GuestReceiptProvider>);

    await waitFor(() => expect(screen.getByText('none')).toBeTruthy());
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('patient_portal_guest_reservation_receipt');
  }, 10_000);

  it('deletes legacy receipts that do not contain a visit id', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ submittedAtUtc: firstReceipt.submittedAtUtc }),
    );

    const screen = render(<GuestReceiptProvider><Consumer /></GuestReceiptProvider>);

    await waitFor(() => expect(screen.getByText('none')).toBeTruthy());
    await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      'patient_portal_guest_reservation_receipt',
    ));
  });
});
