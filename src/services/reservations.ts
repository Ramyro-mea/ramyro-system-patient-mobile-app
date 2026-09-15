import { env } from '@/src/config/env';
import { requestApiAt } from '@/src/lib/api-client';
import { File as ExpoFile } from 'expo-file-system';
import type {
  CreateMobileVisitRequest,
  GuestReservationReceipt,
  MobileProcedureOption,
  PendingBookingAttachment,
  PatientVisit,
  RisPrerequisite,
} from '@/src/types/api';

export const reservationsService = {
  createGuest(request: CreateMobileVisitRequest) {
    const { patientId: _patientId, ...guestRequest } = request;
    return requestApiAt<GuestReservationReceipt>(
      env.risApiUrl,
      `/api/patient/bookings/mobile-request/guest?tenantId=${encodeURIComponent(env.risTenantId)}`,
      { method: 'POST', body: JSON.stringify(guestRequest) },
      undefined,
      'The reservation request could not be submitted.',
    );
  },

  create(request: CreateMobileVisitRequest, token: string) {
    return requestApiAt<PatientVisit>(
      env.risApiUrl,
      '/api/patient/bookings/mobile-request',
      { method: 'POST', body: JSON.stringify(request) },
      token,
      'The reservation request could not be submitted.',
    );
  },

  getVisits(token: string) {
    return requestApiAt<PatientVisit[]>(
      env.risApiUrl,
      '/api/patient/bookings/visits',
      {},
      token,
      'Your reservations could not be loaded.',
    );
  },

  getProcedureOptions() {
    return requestApiAt<MobileProcedureOption[]>(
      env.risApiUrl,
      `/api/patient/bookings/procedure-options?branchId=${encodeURIComponent(env.risBranchId)}&tenantId=${encodeURIComponent(env.risTenantId)}`,
      {},
      undefined,
      'Procedures could not be loaded.',
    );
  },

  getProcedurePrerequisites(procedureId: number) {
    return requestApiAt<RisPrerequisite[]>(
      env.risApiUrl,
      `/api/ris/procedures/${encodeURIComponent(procedureId)}/prerequisites?tenantId=${encodeURIComponent(env.risTenantId)}`,
      {},
      undefined,
      'Prerequisites could not be loaded.',
    );
  },

  uploadDocument(
    visitId: number,
    orderId: number,
    attachment: PendingBookingAttachment,
    token?: string,
  ) {
    const form = new FormData();
    form.append('orderId', String(orderId));
    if (attachment.webFile) {
      const uploadBlob = attachment.webFile.type === attachment.mimeType
        ? attachment.webFile
        : new Blob([attachment.webFile], { type: attachment.mimeType });
      form.append('file', uploadBlob, attachment.fileName);
    } else {
      const nativeFile = new ExpoFile(attachment.uri);
      const uploadBlob = nativeFile.type === attachment.mimeType
        ? nativeFile
        : nativeFile.slice(0, nativeFile.size, attachment.mimeType);
      form.append('file', uploadBlob, attachment.fileName);
    }

    return requestApiAt<number>(
      env.risApiUrl,
      `/api/patient/bookings/visits/${encodeURIComponent(visitId)}/documents/upload?tenantId=${encodeURIComponent(env.risTenantId)}`,
      { method: 'POST', body: form, multipart: true },
      token,
      'The document could not be uploaded.',
    );
  },
};
