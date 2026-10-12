import { fireEvent, render } from '@testing-library/react-native';

import { GuestReceiptCard } from '@/src/components/reservations/guest-receipt-card';
import { PatientVisitCard } from '@/src/components/reservations/patient-visit-card';
import {
  VisitRegistrationQr,
  VisitRegistrationQrModal,
} from '@/src/components/reservations/visit-registration-qr';
import { env } from '@/src/config/env';
import { lightColors as mockLightColors } from '@/src/theme/colors';
import type { PatientVisit } from '@/src/types/api';

const mockReceipt = {
  visitId: 27,
  orderId: null,
  submittedAtUtc: '2026-09-03T10:00:00Z',
  procedureId: null,
  procedureDisplayName: null,
};

jest.mock('@/src/providers/guest-receipt-provider', () => ({
  useGuestReceipt: () => ({ receipt: mockReceipt, saveReceipt: jest.fn() }),
}));
jest.mock('@/src/providers/theme-provider', () => ({
  useAppTheme: () => ({ mode: 'light', colors: mockLightColors, toggleTheme: jest.fn() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-qrcode-svg', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ value }: { value: string }) => React.createElement(
      Text,
      { accessibilityLabel: 'encoded-registration-url' },
      value,
    ),
  };
});

const visit: PatientVisit = {
  visitId: 91,
  visitNumber: 'RV91',
  orderId: null,
  procedureId: null,
  procedure: null,
  bookingSource: 'PatientPortal',
  status: 'Unscheduled',
  createdAtUtc: '2026-09-03T10:00:00Z',
  scheduledAtUtc: '2026-09-03T10:00:00Z',
  roomName: null,
  totalPrice: null,
  depositedAmount: null,
  currencyCode: null,
  currencySymbol: null,
  isPaid: null,
  paymentStatus: null,
};

describe('reservation QR presentation', () => {
  it('encodes the configured registration URL and visit id', () => {
    const screen = render(<VisitRegistrationQr visitId={27} />);
    const encodedUrl = new URL(screen.getByLabelText('encoded-registration-url').props.children);

    expect(`${encodedUrl.origin}${encodedUrl.pathname}`).toBe(env.risRegistrationUrl);
    expect(encodedUrl.searchParams.get('visitId')).toBe('27');
  });

  it('keeps the guest receipt visible without a dismiss action', () => {
    const screen = render(<GuestReceiptCard />);

    expect(screen.getByText('Request received')).toBeTruthy();
    expect(screen.getByText('Visit ID: 27')).toBeTruthy();
    expect(screen.queryByLabelText('Got it')).toBeNull();
  });

  it('exposes a QR action on every patient visit card', () => {
    const onShowQrCode = jest.fn();
    const screen = render(
      <PatientVisitCard visit={visit} onShowQrCode={onShowQrCode} />,
    );

    fireEvent.press(screen.getByLabelText('Show QR code'));
    expect(onShowQrCode).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Requested at')).toBeTruthy();
    expect(screen.queryByText('Scheduled at')).toBeNull();
  });

  it('labels only scheduled reservations with their scheduled time', () => {
    const screen = render(
      <PatientVisitCard
        visit={{ ...visit, orderId: 4, status: 'Scheduled' }}
        onShowQrCode={jest.fn()}
      />,
    );

    expect(screen.getByText('Scheduled at')).toBeTruthy();
    expect(screen.queryByText('Requested at')).toBeNull();
  });

  it('exposes a prerequisite action for a visit with a procedure', () => {
    const onShowPrerequisites = jest.fn();
    const screen = render(
      <PatientVisitCard
        visit={{ ...visit, orderId: 4, procedureId: 8, procedure: 'MRI Brain' }}
        onShowQrCode={jest.fn()}
        onShowPrerequisites={onShowPrerequisites}
      />,
    );

    fireEvent.press(screen.getByLabelText('Prerequisites'));
    expect(onShowPrerequisites).toHaveBeenCalledTimes(1);
  });

  it('shows stored total and zero deposit and hides missing financials', () => {
    const pricedScreen = render(
      <PatientVisitCard
        visit={{ ...visit, orderId: 4, totalPrice: 125, depositedAmount: 0, currencyCode: 'USD', currencySymbol: '$', isPaid: true }}
        onShowQrCode={jest.fn()}
      />,
    );

    expect(pricedScreen.getByText('Total price')).toBeTruthy();
    expect(pricedScreen.getByText('$ 125.00')).toBeTruthy();
    expect(pricedScreen.getByText('Deposited amount')).toBeTruthy();
    expect(pricedScreen.getByText('$ 0.00')).toBeTruthy();
    pricedScreen.unmount();

    const unpricedScreen = render(
      <PatientVisitCard visit={visit} onShowQrCode={jest.fn()} />,
    );
    expect(unpricedScreen.queryByText('Total price')).toBeNull();
    expect(unpricedScreen.queryByText('Deposited amount')).toBeNull();
  });

  it('shows the selected visit in the QR modal and closes it', () => {
    const onClose = jest.fn();
    const screen = render(<VisitRegistrationQrModal visitId={91} onClose={onClose} />);

    expect(screen.getByText('Visit ID: 91')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
