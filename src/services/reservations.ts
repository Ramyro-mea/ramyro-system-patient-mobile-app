import { env } from '@/src/config/env';
import { requestApiAt } from '@/src/lib/api-client';
import type {
  CreateMobileVisitRequest,
  GuestReservationReceipt,
  PatientVisit,
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
};
