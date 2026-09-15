import {
  bookingAttachmentError,
  bookingAttachmentMimeType,
  formatAttachmentSize,
  isAllowedBookingAttachment,
  MAX_BOOKING_ATTACHMENT_SIZE_BYTES,
} from '@/src/lib/booking-attachments';

describe('booking attachments', () => {
  it('accepts supported PDF and image files', () => {
    expect(isAllowedBookingAttachment('referral.pdf', 'application/pdf')).toBe(true);
    expect(isAllowedBookingAttachment('scan.jpg', 'image/jpeg')).toBe(true);
    expect(isAllowedBookingAttachment('scan.png', 'image/png')).toBe(true);
    expect(bookingAttachmentMimeType('referral.pdf', null)).toBe('application/pdf');
  });

  it('rejects unsupported and oversized files', () => {
    expect(bookingAttachmentError('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100))
      .toBe('Only PDF, JPEG, and PNG documents can be attached.');
    expect(bookingAttachmentError('large.pdf', 'application/pdf', MAX_BOOKING_ATTACHMENT_SIZE_BYTES + 1))
      .toBe('Each document must be 20 MB or smaller.');
  });

  it('formats attachment sizes for the selected-file list', () => {
    expect(formatAttachmentSize(1_500)).toBe('2 KB');
    expect(formatAttachmentSize(2_500_000)).toBe('2.5 MB');
    expect(formatAttachmentSize(null)).toBe('Size unavailable');
  });
});
