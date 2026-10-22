import { AttachmentPickerField } from '@/src/components/ui/attachment-picker-field';
import {
  bookingAttachmentError,
  bookingAttachmentMimeType,
  BOOKING_ATTACHMENT_MIME_TYPES,
  MAX_BOOKING_ATTACHMENTS,
} from '@/src/lib/booking-attachments';
import type { PendingBookingAttachment } from '@/src/types/api';

interface Props {
  attachments: PendingBookingAttachment[];
  disabled?: boolean;
  onChange: (attachments: PendingBookingAttachment[]) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function BookingAttachmentsField(props: Props) {
  return (
    <AttachmentPickerField
      {...props}
      title="Documents (optional)"
      description="Attach up to five PDF, JPEG, or PNG files. Maximum 20 MB each."
      maxFiles={MAX_BOOKING_ATTACHMENTS}
      documentTypes={[...BOOKING_ATTACHMENT_MIME_TYPES]}
      cameraLabel="Scan document"
      limitMessage="You can attach up to five documents."
      uploadedLabel="Uploaded"
      canRemove={(attachment) => attachment.status === 'pending'}
      resolveMimeType={bookingAttachmentMimeType}
      validate={bookingAttachmentError}
    />
  );
}
