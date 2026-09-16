import type { PatientVisit } from '@/src/types/api';

export type ReservationPaymentFilter = '' | 'paid' | 'unpaid';

export function filterPatientVisitsByPayment(
  visits: PatientVisit[],
  filter: ReservationPaymentFilter,
) {
  if (!filter) return visits;

  const isPaid = filter === 'paid';
  return visits.filter((visit) => visit.isPaid === isPaid);
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
