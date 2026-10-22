import { render } from '@testing-library/react-native';

import { SupportMessageBubble } from '@/src/components/support/support-message-bubble';
import { supportAttachmentUrl } from '@/src/services/support';
import { lightColors as mockLightColors } from '@/src/theme/colors';
import type { SupportMessage } from '@/src/types/support';

jest.mock('@/src/providers/theme-provider', () => ({
  useAppTheme: () => ({ mode: 'light', colors: mockLightColors, toggleTheme: jest.fn() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({
  Image: jest.requireActual('react-native').Image,
}));

const baseMessage: SupportMessage = {
  id: 1,
  ticketId: 2,
  senderKind: 'Patient',
  senderId: 'patient-1',
  senderDisplayName: 'Patient',
  body: null,
  createdAtUtc: '2026-10-22T12:00:00Z',
  attachments: [],
};

describe('SupportMessageBubble attachments', () => {
  it('renders an authenticated inline preview for image attachments', () => {
    const message: SupportMessage = {
      ...baseMessage,
      attachments: [{
        id: 9,
        originalFileName: 'scan.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        url: '/api/chat/support/attachments/9',
      }],
    };

    const screen = render(
      <SupportMessageBubble message={message} authToken="patient-token" onOpenAttachment={jest.fn()} />,
    );

    expect(screen.getByLabelText('Preview scan.jpg')).toHaveProp('source', {
      uri: supportAttachmentUrl(9),
      headers: { Authorization: 'Bearer patient-token' },
    });
    expect(screen.getByText('scan.jpg')).toBeTruthy();
  });

  it('keeps non-image attachments as filename cards', () => {
    const message: SupportMessage = {
      ...baseMessage,
      attachments: [{
        id: 10,
        originalFileName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
        url: '/api/chat/support/attachments/10',
      }],
    };

    const screen = render(
      <SupportMessageBubble message={message} authToken="patient-token" onOpenAttachment={jest.fn()} />,
    );

    expect(screen.queryByLabelText('Preview report.pdf')).toBeNull();
    expect(screen.getByText('report.pdf')).toBeTruthy();
  });
});
