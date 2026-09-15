import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { BookingAttachmentsField } from '@/src/components/reservations/booking-attachments-field';
import { lightColors as mockLightColors } from '@/src/theme/colors';
import type { PendingBookingAttachment } from '@/src/types/api';

const mockRequestCameraPermissionsAsync = jest.fn();
const mockLaunchCameraAsync = jest.fn();
const mockGetDocumentAsync = jest.fn();

jest.mock('@/src/providers/theme-provider', () => ({
  useAppTheme: () => ({ mode: 'light', colors: mockLightColors, toggleTheme: jest.fn() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image-picker', () => ({
  CameraType: { back: 'back' },
  requestCameraPermissionsAsync: (...args: unknown[]) => mockRequestCameraPermissionsAsync(...args),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCameraAsync(...args),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
}));

function attachment(index: number): PendingBookingAttachment {
  return {
    id: `attachment-${index}`,
    uri: `file:///attachment-${index}.jpg`,
    fileName: `attachment-${index}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    source: 'camera',
    status: 'pending',
    error: null,
  };
}

describe('BookingAttachmentsField', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockLaunchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'file:///captured.jpg',
        fileName: 'captured.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2500,
      }],
    });
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
  });

  it('adds one camera image without editing', async () => {
    const onChange = jest.fn();
    const screen = render(<BookingAttachmentsField attachments={[]} onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Scan document'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        uri: 'file:///captured.jpg',
        fileName: 'captured.jpg',
        mimeType: 'image/jpeg',
        source: 'camera',
        status: 'pending',
      }),
    ]));
    expect(mockLaunchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsEditing: false,
    }));
  });

  it('explains a permanently denied camera permission', async () => {
    mockRequestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<BookingAttachmentsField attachments={[]} onChange={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('Scan document'));

    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'Camera permission required',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Open Settings' })]),
    ));
    expect(mockLaunchCameraAsync).not.toHaveBeenCalled();
  });

  it('removes a pending attachment and disables adding after five', () => {
    const onChange = jest.fn();
    const selected = [1, 2, 3, 4, 5].map(attachment);
    const screen = render(<BookingAttachmentsField attachments={selected} onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Scan document'));
    expect(mockRequestCameraPermissionsAsync).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Remove attachment-1.jpg'));
    expect(onChange).toHaveBeenCalledWith(selected.slice(1));
  });
});
