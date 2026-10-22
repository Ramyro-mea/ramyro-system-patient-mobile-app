export type AttachmentSource = 'camera' | 'file';
export type AttachmentStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export interface PendingAttachment {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  source: AttachmentSource;
  status: AttachmentStatus;
  error: string | null;
  webFile?: Blob;
  remoteId?: number;
}
