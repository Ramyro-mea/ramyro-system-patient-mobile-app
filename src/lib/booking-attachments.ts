export const MAX_BOOKING_ATTACHMENTS = 5;
export const MAX_BOOKING_ATTACHMENT_SIZE_BYTES = 20_000_000;
export const BOOKING_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

const allowedExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

export function bookingAttachmentMimeType(fileName: string, mimeType?: string | null) {
  const normalizedMimeType = mimeType?.trim().toLowerCase();
  if (normalizedMimeType && BOOKING_ATTACHMENT_MIME_TYPES.includes(
    normalizedMimeType as (typeof BOOKING_ATTACHMENT_MIME_TYPES)[number],
  )) {
    return normalizedMimeType;
  }

  const dotIndex = fileName.lastIndexOf('.');
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  return normalizedMimeType || 'application/octet-stream';
}

export function isAllowedBookingAttachment(fileName: string, mimeType?: string | null) {
  const normalizedMimeType = mimeType?.trim().toLowerCase();
  if (normalizedMimeType && BOOKING_ATTACHMENT_MIME_TYPES.includes(
    normalizedMimeType as (typeof BOOKING_ATTACHMENT_MIME_TYPES)[number],
  )) {
    return true;
  }

  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 && allowedExtensions.has(fileName.slice(dotIndex).toLowerCase());
}

export function bookingAttachmentError(
  fileName: string,
  mimeType: string | null | undefined,
  sizeBytes: number | null | undefined,
) {
  if (!isAllowedBookingAttachment(fileName, mimeType)) {
    return 'Only PDF, JPEG, and PNG documents can be attached.';
  }
  if (typeof sizeBytes === 'number' && sizeBytes > MAX_BOOKING_ATTACHMENT_SIZE_BYTES) {
    return 'Each document must be 20 MB or smaller.';
  }
  return null;
}

export function formatAttachmentSize(sizeBytes: number | null) {
  if (sizeBytes === null) return 'Size unavailable';
  if (sizeBytes < 1_000_000) return `${Math.max(1, Math.round(sizeBytes / 1_000))} KB`;
  return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
}
