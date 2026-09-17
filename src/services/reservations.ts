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

type RawPatientVisit = PatientVisit & {
  orderTotalPrice?: unknown;
  TotalPrice?: unknown;
  OrderTotalPrice?: unknown;
  DepositedAmount?: unknown;
  CurrencyCode?: unknown;
  CurrencySymbol?: unknown;
  PaymentStatus?: unknown;
};

function finiteAmount(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const amount = Number(value);
    if (Number.isFinite(amount)) return amount;
  }
  return null;
}

function optionalString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizePaymentStatus(
  rawStatus: unknown,
  totalPrice: number | null,
  depositedAmount: number | null,
  isPaid: boolean | null,
): PatientVisit['paymentStatus'] {
  if (typeof rawStatus === 'string') {
    const normalized = rawStatus.replace(/[\s_-]/g, '').toLowerCase();
    if (normalized === 'paid') return 'Paid';
    if (normalized === 'partiallypaid') return 'PartiallyPaid';
    if (normalized === 'unpaid') return 'Unpaid';
  }

  if (totalPrice !== null) {
    const deposit = depositedAmount ?? 0;
    if (totalPrice <= 0 || deposit >= totalPrice) return 'Paid';
    if (deposit > 0) return 'PartiallyPaid';
    return 'Unpaid';
  }

  if (isPaid === true) return 'Paid';
  if (isPaid === false) return 'Unpaid';
  return null;
}

function normalizePatientVisit(raw: RawPatientVisit): PatientVisit {
  const totalPrice = finiteAmount(
    raw.totalPrice,
    raw.orderTotalPrice,
    raw.TotalPrice,
    raw.OrderTotalPrice,
  );

  const depositedAmount = totalPrice === null
    ? null
    : finiteAmount(raw.depositedAmount, raw.DepositedAmount) ?? 0;

  return {
    ...raw,
    totalPrice,
    depositedAmount,
    currencyCode: optionalString(raw.currencyCode, raw.CurrencyCode),
    currencySymbol: optionalString(raw.currencySymbol, raw.CurrencySymbol),
    paymentStatus: normalizePaymentStatus(
      raw.paymentStatus ?? raw.PaymentStatus,
      totalPrice,
      depositedAmount,
      raw.isPaid,
    ),
  };
}

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

  async create(request: CreateMobileVisitRequest, token: string) {
    const visit = await requestApiAt<RawPatientVisit>(
      env.risApiUrl,
      '/api/patient/bookings/mobile-request',
      { method: 'POST', body: JSON.stringify(request) },
      token,
      'The reservation request could not be submitted.',
    );
    return normalizePatientVisit(visit);
  },

  async getVisits(token: string) {
    const visits = await requestApiAt<RawPatientVisit[]>(
      env.risApiUrl,
      '/api/patient/bookings/visits',
      {},
      token,
      'Your reservations could not be loaded.',
    );
    return visits.map(normalizePatientVisit);
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
    orderId: number | null,
    attachment: PendingBookingAttachment,
    token?: string,
  ) {
    const form = new FormData();
    if (orderId !== null) form.append('orderId', String(orderId));
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
