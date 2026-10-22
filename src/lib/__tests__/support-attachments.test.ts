import {
  MAX_SUPPORT_ATTACHMENT_SIZE_BYTES,
  SUPPORT_ATTACHMENT_EXTENSIONS,
  supportAttachmentError,
  supportAttachmentMimeType,
} from '@/src/lib/support-attachments';

describe('support attachments', () => {
  it.each([
    ['scan.jpg', 'image/jpeg'],
    ['scan.jpeg', 'image/jpeg'],
    ['scan.png', 'image/png'],
    ['scan.webp', 'image/webp'],
    ['result.pdf', 'application/pdf'],
    ['letter.doc', 'application/msword'],
    ['letter.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['values.xls', 'application/vnd.ms-excel'],
    ['values.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['notes.txt', 'text/plain'],
    ['values.csv', 'text/csv'],
  ])('accepts %s and normalizes its MIME type', (fileName, expectedMimeType) => {
    expect(supportAttachmentError(fileName, null, 1)).toBeNull();
    expect(supportAttachmentMimeType(fileName, 'application/octet-stream')).toBe(expectedMimeType);
  });

  it('keeps the backend extension policy and 50 MiB boundary exact', () => {
    expect(SUPPORT_ATTACHMENT_EXTENSIONS).toHaveLength(11);
    expect(supportAttachmentError('malware.exe', 'application/octet-stream', 1)).toMatch(/JPEG/);
    expect(supportAttachmentError('maximum.pdf', 'application/pdf', MAX_SUPPORT_ATTACHMENT_SIZE_BYTES)).toBeNull();
    expect(supportAttachmentError('too-large.pdf', 'application/pdf', MAX_SUPPORT_ATTACHMENT_SIZE_BYTES + 1))
      .toBe('Each support attachment must be 50 MiB or smaller.');
  });

  it('uses the extension when camera and document pickers omit or generalize MIME types', () => {
    expect(supportAttachmentMimeType('camera-image.JPEG', null)).toBe('image/jpeg');
    expect(supportAttachmentMimeType('report.CSV', 'application/octet-stream')).toBe('text/csv');
  });
});
