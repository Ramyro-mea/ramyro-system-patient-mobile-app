export const MAX_SUPPORT_ATTACHMENTS = 10;
export const MAX_SUPPORT_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
};

export const SUPPORT_ATTACHMENT_EXTENSIONS = Object.keys(MIME_TYPES_BY_EXTENSION);
export const SUPPORT_ATTACHMENT_DOCUMENT_TYPES = [
  ...new Set([...Object.values(MIME_TYPES_BY_EXTENSION), 'application/octet-stream']),
];

function extension(fileName: string) {
  return fileName.split('.').pop()?.trim().toLowerCase() ?? '';
}

export function supportAttachmentMimeType(fileName: string, mimeType?: string | null) {
  const inferred = MIME_TYPES_BY_EXTENSION[extension(fileName)];
  const normalized = mimeType?.split(';')[0].trim().toLowerCase();
  return inferred || normalized || 'application/octet-stream';
}

export function supportAttachmentError(
  fileName: string,
  _mimeType: string | null | undefined,
  sizeBytes: number | null | undefined,
) {
  if (!MIME_TYPES_BY_EXTENSION[extension(fileName)]) {
    return 'Choose a JPEG, PNG, WebP, PDF, DOC, DOCX, XLS, XLSX, TXT, or CSV file.';
  }
  if (typeof sizeBytes === 'number' && sizeBytes > MAX_SUPPORT_ATTACHMENT_SIZE_BYTES) {
    return 'Each support attachment must be 50 MiB or smaller.';
  }
  return null;
}
