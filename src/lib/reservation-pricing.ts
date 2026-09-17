import type { PatientVisit } from '@/src/types/api';

export type ReservationPaymentFilter = '' | 'paid' | 'partially-paid' | 'unpaid';

export function getReservationPaymentFilterLabel(filter: ReservationPaymentFilter) {
  if (filter === 'paid') return 'Paid';
  if (filter === 'partially-paid') return 'Partially paid';
  if (filter === 'unpaid') return 'Unpaid';
  return 'All';
}

export function filterPatientVisitsByPayment(
  visits: PatientVisit[],
  filter: ReservationPaymentFilter,
) {
  if (!filter) return visits;

  const status = filter === 'paid'
    ? 'Paid'
    : filter === 'partially-paid'
      ? 'PartiallyPaid'
      : 'Unpaid';
  return visits.filter((visit) => visit.paymentStatus === status);
}

export function formatOrderPrice(
  totalPrice: number | string | null | undefined,
  currencySymbol: string | null,
  currencyCode: string | null,
) {
  const numericAmount = Number(totalPrice);
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  const formattedAmount = safeAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const currency = currencySymbol?.trim() || currencyCode?.trim();

  return currency ? `${currency} ${formattedAmount}` : formattedAmount;
}
